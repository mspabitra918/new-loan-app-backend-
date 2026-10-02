import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service';
import { QueueModule } from '../queue/queue.module';
import { DripModule } from '../drip/drip.module';

@Module({
  imports: [QueueModule, DripModule],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
