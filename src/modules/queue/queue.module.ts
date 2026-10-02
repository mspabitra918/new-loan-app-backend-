import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUE_EMAIL } from './queue.constants';
import { QueueProducer } from './queue.producer';
import { EmailProcessor } from './processors/email.processor';
import { MailModule } from '../mail/mail.module';

/**
 * BullMQ wiring.
 *
 * The API process registers the queues (so it can enqueue) and also runs the
 * workers by default, which is fine for a single box. To scale, set
 * QUEUE_WORKERS=false on the API and run `npm run worker` separately - the
 * worker entrypoint boots the same module with the processors enabled.
 *
 * The bank-verification drip no longer lives here: its schedule is rows in
 * `bank_verification_emails`, driven by BankDripRunner, so the plan is
 * queryable and survives a Redis flush.
 */
const runWorkers = String(process.env.QUEUE_WORKERS ?? 'true') === 'true';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password') || undefined,
          db: config.get<number>('redis.db'),
          // BullMQ requires this for blocking commands.
          maxRetriesPerRequest: null,
        },
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: { age: 7 * 24 * 3600, count: 5000 },
          removeOnFail: { age: 30 * 24 * 3600 },
        },
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_EMAIL }),
    MailModule,
  ],
  providers: [QueueProducer, ...(runWorkers ? [EmailProcessor] : [])],
  exports: [QueueProducer, BullModule],
})
export class QueueModule {}
