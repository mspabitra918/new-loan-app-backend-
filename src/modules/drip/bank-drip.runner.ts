import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { BankDripSender } from './bank-drip.sender';

const INTERVAL_NAME = 'bank-verification-drip-runner';

/**
 * The clock behind the drip: wakes on an interval and hands whatever has
 * come due to BankDripSender. The sending itself lives there, because Step 3
 * calls it directly to push the first email out with the submission.
 *
 * Registered only where queue workers run (QUEUE_WORKERS), so the API and a
 * separate worker process do not both drive the schedule. They would not
 * double-send if they did - rows are claimed - but two processes racing for
 * the same rows is wasted work.
 */
@Injectable()
export class BankDripRunner implements OnModuleInit {
  private readonly logger = new Logger(BankDripRunner.name);
  private running = false;

  constructor(
    private readonly sender: BankDripSender,
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onModuleInit() {
    const seconds = Math.max(5, this.config.get<number>('drip.runnerIntervalSeconds') ?? 60);
    const handle = setInterval(() => {
      this.tick().catch((err) =>
        this.logger.error(`Drip runner tick failed: ${err?.message}`, err?.stack),
      );
    }, seconds * 1000);

    this.scheduler.addInterval(INTERVAL_NAME, handle);
    this.logger.log(`Bank verification drip runner started (every ${seconds}s).`);
  }

  /**
   * One pass over the due rows.
   *
   * Overlapping ticks are skipped rather than queued: a tick that is still
   * working has its rows claimed anyway, and piling up passes behind a slow
   * SMTP server helps nobody.
   */
  async tick() {
    if (this.running) return { sent: 0, skipped: 0, failed: 0 };
    this.running = true;

    try {
      const batchSize = this.config.get<number>('drip.runnerBatchSize') ?? 25;
      const result = await this.sender.sendDueBatch(batchSize);

      if (result.sent || result.failed) {
        this.logger.log(
          `Drip tick: ${result.sent} sent, ${result.skipped} skipped, ${result.failed} failed.`,
        );
      }
      return result;
    } finally {
      this.running = false;
    }
  }
}
