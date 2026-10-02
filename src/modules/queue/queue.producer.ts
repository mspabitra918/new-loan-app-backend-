import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { emailJobId, JOB_SEND_EMAIL, QUEUE_EMAIL, SendEmailJobData } from './queue.constants';
import type { TemplateKey } from '../mail/templates';

@Injectable()
export class QueueProducer {
  private readonly logger = new Logger(QueueProducer.name);

  constructor(
    @InjectQueue(QUEUE_EMAIL) private readonly emailQueue: Queue,
    private readonly config: ConfigService,
  ) {}

  /** Fire-and-forget transactional email. */
  async enqueueEmail(
    applicationUuid: string,
    templateKey: TemplateKey,
    opts: {
      resumeToken?: string;
      bankVerifyToken?: string;
      delayMs?: number;
      /** Distinguishes repeat sends of the same template (e.g. resume nudges). */
      idSuffix?: string;
      context?: Record<string, unknown>;
    } = {},
  ) {
    const data: SendEmailJobData = {
      applicationUuid,
      templateKey,
      resumeToken: opts.resumeToken,
      bankVerifyToken: opts.bankVerifyToken,
      context: opts.context,
    };

    const job = await this.emailQueue.add(JOB_SEND_EMAIL, data, {
      jobId: emailJobId(applicationUuid, templateKey, opts.idSuffix),
      delay: opts.delayMs ?? 0,
    });

    this.logger.log(
      `Queued email "${templateKey}" for ${applicationUuid}` +
        (opts.delayMs ? ` in ${Math.round(opts.delayMs / 60000)}m` : ''),
    );
    return job.id;
  }

  async queueHealth() {
    return { email: await this.emailQueue.getJobCounts() };
  }
}
