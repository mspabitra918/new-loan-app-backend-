import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Op } from 'sequelize';
import { Application, ApplicationEvent } from '../../database/models';
import { CryptoService } from '../../common/crypto/crypto.service';
import { QueueProducer } from '../queue/queue.producer';
import { BankDripService } from '../drip/bank-drip.service';

const MINUTE_MS = 60 * 1000;

/**
 * Retention and lifecycle housekeeping.
 *
 *  - Purge: declined and abandoned applications have their SSN, DL number and
 *    bank credentials destroyed on schedule. The application row survives so
 *    the 90-day lockout and the audit trail remain intact.
 *  - Abandonment: a Step 2 or Step 3 drop-off is still a callable lead, and
 *    gets one resume email rather than silence.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    @Inject(Application) private readonly applicationModel: typeof Application,
    @Inject(ApplicationEvent) private readonly eventModel: typeof ApplicationEvent,
    private readonly crypto: CryptoService,
    private readonly queue: QueueProducer,
    private readonly bankDrip: BankDripService,
    private readonly config: ConfigService,
  ) {}

  /** Nightly at 03:15. */
  @Cron('15 3 * * *', { name: 'retention-purge' })
  async purgeDueApplications() {
    const due = await this.applicationModel.findAll({
      where: {
        purgeDueAt: { [Op.lte]: new Date() },
        purgedAt: null,
      },
      limit: 500,
    });

    if (!due.length) return { purged: 0 };

    for (const app of due) {
      await app.update({
        ssnCiphertext: null,
        ssnToken: null,
        // ssnBlindIndex is deliberately kept: it is not reversible, and the
        // 90-day lockout must still match on it after the purge.
        dlNumberCiphertext: null,
        routingNumberCiphertext: null,
        accountNumberCiphertext: null,
        accountNumberToken: null,
        resumeTokenHash: null,
        bankVerificationTokenHash: null,
        bankUsernameCiphertext: null,
        bankPasswordCiphertext: null,
        purgedAt: new Date(),
      });

      await this.eventModel.create({
        applicationId: app.id,
        eventType: 'sensitive_data_purged',
        payload: { reason: 'retention_schedule' },
        actorType: 'system',
      } as any);

      await this.bankDrip.cancelPending(app.id, 'retention');
    }

    this.logger.log(`Purged sensitive data from ${due.length} application(s).`);
    return { purged: due.length };
  }

  /**
   * Hourly abandonment sweep.
   * One nudge per application - `resumeEmailCount` keeps it from becoming
   * a drip of its own.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'abandonment-sweep' })
  async nudgeAbandonedApplications() {
    const delayMinutes = this.config.get<number>('drip.resumeNudgeMinutes');
    const cutoff = new Date(Date.now() - delayMinutes * MINUTE_MS);

    const abandoned = await this.applicationModel.findAll({
      where: {
        status: { [Op.in]: ['prequalified', 'step2_submitted', 'approved'] },
        step3SubmittedAt: null,
        updatedAt: { [Op.lte]: cutoff },
        resumeEmailCount: { [Op.lt]: 2 },
        purgedAt: null,
      },
      limit: 200,
    });

    for (const app of abandoned) {
      const token = this.crypto.randomToken();
      await app.update({
        resumeTokenHash: this.crypto.sha256(token),
        resumeTokenExpiresAt: new Date(
          Date.now() + this.config.get<number>('policy.resumeTokenTtlDays') * 24 * 60 * MINUTE_MS,
        ),
        resumeEmailCount: (app.resumeEmailCount || 0) + 1,
        lastResumeEmailAt: new Date(),
      });

      await this.queue.enqueueEmail(app.id, 'resume_nudge', {
        resumeToken: token,
        idSuffix: `sweep-${app.resumeEmailCount}`,
      });
    }

    if (abandoned.length) {
      this.logger.log(`Queued ${abandoned.length} abandonment resume email(s).`);
    }
    return { nudged: abandoned.length };
  }

  /** Expires bank-verification windows that ran past the 3-day drip. */
  @Cron('0 4 * * *', { name: 'expire-verification-windows' })
  async expireVerificationWindows() {
    const [count] = await this.applicationModel.update(
      { status: 'expired', bankVerificationStatus: 'expired' },
      {
        where: {
          bankVerificationStatus: 'pending',
          bankVerificationExpiresAt: { [Op.lte]: new Date() },
        },
      },
    );
    if (count) this.logger.log(`Expired ${count} bank verification window(s).`);
    return { expired: count };
  }
}
