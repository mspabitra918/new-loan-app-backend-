import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { DecisionService } from './decision.service';
import { StepValidators } from './step-validators';
import { ConsentsModule } from '../consents/consents.module';
import { LookupModule } from '../lookup/lookup.module';
import { QueueModule } from '../queue/queue.module';
import { MailModule } from '../mail/mail.module';
import { DripModule } from '../drip/drip.module';

@Module({
  imports: [ConsentsModule, LookupModule, QueueModule, MailModule, DripModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, DecisionService, StepValidators],
  exports: [ApplicationsService, DecisionService],
})
export class ApplicationsModule {}
