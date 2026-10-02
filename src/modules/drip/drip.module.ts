import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { BankDripService } from './bank-drip.service';
import { BankDripSender } from './bank-drip.sender';
import { BankDripRunner } from './bank-drip.runner';

/**
 * The sender is always available - Step 3 uses it to push the first email
 * out with the submission. Only the interval that drives the rest of the
 * sequence is gated on QUEUE_WORKERS, so
 * `QUEUE_WORKERS=false npm run start:prod` gives an API that sends the first
 * email and schedules the other five, and `npm run worker` sends those.
 */
const runWorkers = String(process.env.QUEUE_WORKERS ?? 'true') === 'true';

@Module({
  imports: [MailModule],
  providers: [BankDripService, BankDripSender, ...(runWorkers ? [BankDripRunner] : [])],
  exports: [BankDripService, BankDripSender],
})
export class DripModule {}
