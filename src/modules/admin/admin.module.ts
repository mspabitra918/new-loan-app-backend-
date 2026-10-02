import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ApplicationsModule } from '../applications/applications.module';
import { QueueModule } from '../queue/queue.module';
import { DripModule } from '../drip/drip.module';

@Module({
  imports: [ApplicationsModule, QueueModule, DripModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
