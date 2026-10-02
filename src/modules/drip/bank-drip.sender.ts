import { Inject, Injectable, Logger } from '@nestjs/common';
import { ApplicationEvent, BankVerificationEmail } from '../../database/models';
import { CryptoService } from '../../common/crypto/crypto.service';
import { MailService } from '../mail/mail.service';
import { BankDripService } from './bank-drip.service';
import type { TemplateKey } from '../mail/templates';

export interface DripSendTally {
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * Sends the rows that have come due.
 *
 * Separate from the runner because two callers need it: the interval, which
 * walks every application, and Step 3, which pushes that application's first
 * email out on the request itself rather than leaving the applicant waiting
 * up to a tick for the email they are expecting.
 *
 * Three things happen on every single row:
 *
 *  1. the row is claimed with a conditional update, so two callers cannot
 *     both send the same email;
 *  2. the application is re-read immediately before sending, so a
 *     verification that lands in between still stops the email - that
 *     guard, not the cancellation, is what actually holds the line;
 *  3. a fresh single-use verification token is minted, so an older email
 *     cannot be replayed and a forwarded link does not stay live.
 */
@Injectable()
export class BankDripSender {
  private readonly logger = new Logger(BankDripSender.name);

  constructor(
    @Inject(ApplicationEvent) private readonly eventModel: typeof ApplicationEvent,
    private readonly drip: BankDripService,
    private readonly mail: MailService,
    private readonly crypto: CryptoService,
  ) {}

  /** Every due row, up to `limit`. The interval's entry point. */
  async sendDueBatch(limit: number): Promise<DripSendTally> {
    return this.sendRows(await this.drip.findDue(limit));
  }

  /**
   * Due rows for one application, now. Called straight after Step 3 so the
   * first email goes with the submission.
   *
   * `bankVerifyToken` is the token Step 3 already minted and put in the
   * confirmation email. The first row sent reuses it instead of minting its
   * own, so the confirmation and the first drip email carry the same live
   * link rather than one silently killing the other.
   */
  async sendDueForApplication(
    applicationUuid: string,
    opts: { bankVerifyToken?: string } = {},
  ): Promise<DripSendTally> {
    return this.sendRows(
      await this.drip.findDueForApplication(applicationUuid),
      opts.bankVerifyToken,
    );
  }

  private async sendRows(
    rows: BankVerificationEmail[],
    initialToken?: string,
  ): Promise<DripSendTally> {
    const tally: DripSendTally = { sent: 0, skipped: 0, failed: 0 };
    for (const [i, row] of rows.entries()) {
      tally[await this.processRow(row, i === 0 ? initialToken : undefined)] += 1;
    }
    return tally;
  }

  private async processRow(
    row: BankVerificationEmail,
    existingToken?: string,
  ): Promise<'sent' | 'skipped' | 'failed'> {
    if (!(await this.drip.claim(row))) return 'skipped';

    // Re-read now, not when the row was scheduled. Everything in between -
    // verification, withdrawal, a purge - has to be able to stop this send.
    const { app, send, reason } = await this.drip.sendability(row.applicationId);
    if (!send || !app) {
      await this.drip.markCancelled(row, reason ?? 'terminal_status');
      // Whatever stopped this row stops the rest of the sequence too.
      await this.drip.cancelPending(row.applicationId, reason ?? 'terminal_status');
      return 'skipped';
    }

    if (!app.email) {
      await this.drip.markFailed(row, 'Application has no email address', { retryable: false });
      return 'failed';
    }

    const token = existingToken ?? this.crypto.randomToken();
    await app.update({
      ...(existingToken ? {} : { bankVerificationTokenHash: this.crypto.sha256(token) }),
      dripStage: row.sequence,
    });

    const result = await this.mail.sendToApplication(
      row.applicationId,
      row.emailType as TemplateKey,
      {
        bankVerifyToken: token,
        jobId: `drip-${row.id}`,
        attempt: row.attempts + 1,
        scheduledFor: row.scheduledAt,
        context: { dripDay: row.day },
      },
    );

    if (!result.ok) {
      await this.drip.markFailed(row, `Send failed for ${row.emailType}`, {
        retryable: result.retryable,
      });
      return 'failed';
    }

    await this.drip.markSent(row, result.logId);
    await this.eventModel.create({
      applicationId: app.id,
      eventType: 'bank_verification_drip_sent',
      payload: {
        sequence: row.sequence,
        day: row.day,
        emailType: row.emailType,
        scheduledAt: row.scheduledAt,
      },
      actorType: 'system',
    } as any);

    this.logger.log(
      `Drip ${row.emailType} (${row.sequence} of 6) sent for ${app.applicationId}`,
    );
    return 'sent';
  }
}
