import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Op } from 'sequelize';
import { Application, BankVerificationEmail } from '../../database/models';
import {
  CancelReason,
  dayForOffset,
  DRIP_SEQUENCE,
  TERMINAL_STATUSES,
} from './bank-drip.constants';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Owns the bank-verification drip schedule.
 *
 * Step 3 writes the whole sequence up front - six rows, the first due
 * immediately and one every twelve hours after that - and verification
 * cancels whatever is left. Nothing here sends: BankDripSender does that,
 * reading the rows this service wrote.
 *
 * Keeping the schedule in the database rather than only as delayed queue
 * jobs means the plan is queryable ("what is still going out, and when"),
 * survives a Redis flush, and leaves an auditable trail of what was sent,
 * what failed and what was cancelled the moment the applicant verified.
 */
@Injectable()
export class BankDripService {
  private readonly logger = new Logger(BankDripService.name);

  constructor(
    @Inject(BankVerificationEmail)
    private readonly dripModel: typeof BankVerificationEmail,
    @Inject(Application) private readonly applicationModel: typeof Application,
    private readonly config: ConfigService,
  ) {}

  /**
   * Offsets from Step 3 submission, one per email, in order. The default
   * sends the first immediately and one every twelve hours after that.
   */
  private get offsetHours(): number[] {
    const configured = this.config.get<number[]>('drip.bankOffsetHours') || [];
    return configured.length ? configured : [0, 12, 24, 36, 48, 60];
  }

  /**
   * Writes the sequence for an application, replacing anything still
   * outstanding from a previous Step 3 submission (the applicant went back
   * and corrected their bank details).
   */
  async schedule(
    applicationUuid: string,
    opts: { from?: Date; reasonForReplacing?: CancelReason } = {},
  ): Promise<BankVerificationEmail[]> {
    const from = opts.from ?? new Date();
    const offsets = this.offsetHours;
    const count = Math.min(DRIP_SEQUENCE.length, offsets.length);

    await this.cancelPending(applicationUuid, opts.reasonForReplacing ?? 'resubmitted');

    const rows = await this.dripModel.bulkCreate(
      DRIP_SEQUENCE.slice(0, count).map((templateKey, i) => ({
        applicationId: applicationUuid,
        sequence: i + 1,
        day: dayForOffset(offsets[i]),
        emailType: templateKey,
        scheduledAt: new Date(from.getTime() + offsets[i] * HOUR_MS),
        status: 'scheduled',
        attempts: 0,
      })) as any,
    );

    this.logger.log(
      `Scheduled ${rows.length} bank verification email(s) for ${applicationUuid} ` +
        `(+${offsets.slice(0, count).join('h, +')}h)`,
    );
    return rows;
  }

  /**
   * Stops every email that has not gone out yet.
   *
   * Called the moment the account is verified. A row already picked up by
   * the runner is in 'sending' and is deliberately left alone - the runner
   * re-reads the application immediately before handing the message to the
   * transport, so it will not send to a verified applicant either way.
   */
  async cancelPending(applicationUuid: string, reason: CancelReason): Promise<number> {
    const [cancelled] = await this.dripModel.update(
      { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason } as any,
      { where: { applicationId: applicationUuid, status: 'scheduled' } },
    );

    if (cancelled) {
      this.logger.log(
        `Cancelled ${cancelled} scheduled bank verification email(s) for ` +
          `${applicationUuid} (${reason})`,
      );
    }
    return cancelled;
  }

  /** The full schedule for one application, oldest first. */
  async listForApplication(applicationUuid: string): Promise<BankVerificationEmail[]> {
    return this.dripModel.findAll({
      where: { applicationId: applicationUuid },
      order: [['scheduledAt', 'ASC']],
    });
  }

  /** Rows that are due to go out now, oldest first. */
  async findDue(limit: number): Promise<BankVerificationEmail[]> {
    return this.dripModel.findAll({
      where: { status: 'scheduled', scheduledAt: { [Op.lte]: new Date() } },
      order: [['scheduledAt', 'ASC']],
      limit,
    });
  }

  /**
   * Due rows for one application. Used to push the first email out on the
   * Step 3 request itself rather than waiting for the next runner tick.
   */
  async findDueForApplication(applicationUuid: string): Promise<BankVerificationEmail[]> {
    return this.dripModel.findAll({
      where: {
        applicationId: applicationUuid,
        status: 'scheduled',
        scheduledAt: { [Op.lte]: new Date() },
      },
      order: [['scheduledAt', 'ASC']],
    });
  }

  /**
   * Claims a due row for this process.
   *
   * The conditional update is what makes two runners safe: exactly one of
   * them flips 'scheduled' to 'sending', and the loser sees 0 rows affected
   * and moves on rather than sending the same email twice.
   */
  async claim(row: BankVerificationEmail): Promise<boolean> {
    const [claimed] = await this.dripModel.update(
      { status: 'sending', attempts: row.attempts + 1 } as any,
      { where: { id: row.id, status: 'scheduled' } },
    );
    return claimed === 1;
  }

  async markSent(row: BankVerificationEmail, emailLogId: string | null) {
    await this.dripModel.update(
      { status: 'sent', sentAt: new Date(), emailLogId, lastError: null } as any,
      { where: { id: row.id } },
    );
  }

  /**
   * A send that did not land. Retryable failures go back into the queue
   * behind a short delay until the attempt budget runs out; anything else -
   * a rejected recipient, a missing template - is failed immediately, since
   * repeating it just burns the sending reputation.
   */
  async markFailed(
    row: BankVerificationEmail,
    error: string,
    opts: { retryable: boolean } = { retryable: false },
  ) {
    const maxAttempts = this.config.get<number>('drip.maxAttempts') ?? 3;
    const retryDelayMinutes = this.config.get<number>('drip.retryDelayMinutes') ?? 15;
    const attempts = row.attempts + 1;
    const willRetry = opts.retryable && attempts < maxAttempts;

    await this.dripModel.update(
      {
        status: willRetry ? 'scheduled' : 'failed',
        lastError: String(error).slice(0, 2000),
        ...(willRetry
          ? { scheduledAt: new Date(Date.now() + retryDelayMinutes * 60 * 1000) }
          : {}),
      } as any,
      { where: { id: row.id } },
    );

    this.logger.warn(
      `Drip email ${row.emailType} (seq ${row.sequence}) for ${row.applicationId} ` +
        (willRetry
          ? `failed on attempt ${attempts}; retrying in ${retryDelayMinutes}m`
          : `failed permanently after ${attempts} attempt(s)`),
    );
  }

  async markCancelled(row: BankVerificationEmail, reason: CancelReason) {
    await this.dripModel.update(
      { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason } as any,
      { where: { id: row.id } },
    );
  }

  /**
   * Whether this application should still be chased, and if not, why.
   * Read immediately before every send, so a verification that lands while
   * the runner is mid-tick still stops the email.
   */
  async sendability(
    applicationUuid: string,
  ): Promise<{ app: Application | null; send: boolean; reason?: CancelReason }> {
    const app = await this.applicationModel.findByPk(applicationUuid);

    if (!app) return { app: null, send: false, reason: 'purged' };
    if (app.purgedAt) return { app, send: false, reason: 'purged' };
    if (app.bankVerificationStatus === 'verified') {
      return { app, send: false, reason: 'bank_verified' };
    }
    if (TERMINAL_STATUSES.has(app.status)) {
      return { app, send: false, reason: 'terminal_status' };
    }
    if (app.bankVerificationExpiresAt && app.bankVerificationExpiresAt < new Date()) {
      return { app, send: false, reason: 'window_expired' };
    }
    return { app, send: true };
  }

  /** Counts by status, for the admin dashboard and the health endpoint. */
  async counts(): Promise<Record<string, number>> {
    const rows = (await this.dripModel.findAll({
      attributes: [
        'status',
        [this.dripModel.sequelize.fn('COUNT', this.dripModel.sequelize.col('id')), 'count'],
      ],
      group: ['status'],
      raw: true,
    })) as unknown as Array<{ status: string; count: string }>;

    return rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = Number(r.count);
      return acc;
    }, {});
  }
}
