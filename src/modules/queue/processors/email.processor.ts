import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { MailService } from '../../mail/mail.service';
import { QUEUE_EMAIL, SendEmailJobData } from '../queue.constants';
import type { TemplateKey } from '../../mail/templates';

@Processor(QUEUE_EMAIL, { concurrency: 5 })
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly mail: MailService) {
    super();
  }

  async process(job: Job<SendEmailJobData>): Promise<{ sent: boolean }> {
    const { applicationUuid, templateKey, resumeToken, bankVerifyToken, context } = job.data;

    const result = await this.mail.sendToApplication(
      applicationUuid,
      templateKey as TemplateKey,
      {
        resumeToken,
        bankVerifyToken,
        context: context as any,
        jobId: String(job.id),
        attempt: job.attemptsMade + 1,
      },
    );

    if (!result.ok) {
      if (!result.retryable) {
        // A bad address or a 4xx will never succeed - stop burning attempts.
        throw new UnrecoverableError(
          `Permanent failure sending "${templateKey}" for ${applicationUuid}`,
        );
      }
      throw new Error(`Retryable failure sending "${templateKey}" for ${applicationUuid}`);
    }

    return { sent: true };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<SendEmailJobData>, err: Error) {
    this.logger.error(
      `Email job ${job?.id} failed on attempt ${job?.attemptsMade}: ${err?.message}`,
    );
  }
}
