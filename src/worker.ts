import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Standalone background worker.
 *
 * Run this when you want queue processing off the API box:
 *   API:    QUEUE_WORKERS=false npm run start:prod
 *   Worker: QUEUE_WORKERS=true  npm run worker
 *
 * It boots the same module graph without the HTTP listener, so the BullMQ
 * email processor registers and the bank-verification drip runner starts
 * walking `bank_verification_emails` for rows that have come due.
 */
async function bootstrap() {
  process.env.QUEUE_WORKERS = 'true';
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  new Logger('Worker').log('Worker started (BullMQ email queue + bank-verification drip runner).');
}

bootstrap();
