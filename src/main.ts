import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Behind a load balancer; needed so X-Forwarded-For gives the real client IP.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false, // API only; the Next.js app sets its own CSP.
      // TLS 1.2+ is terminated at the load balancer; HSTS is asserted here too.
      hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    }),
  );

  app.enableCors({
    origin: config.get<string[]>('corsOrigins'),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      // The form renders each message beside its field and never clears it.
      exceptionFactory: (errors) => {
        const map: Record<string, string> = {};
        const walk = (list: any[], prefix = '') => {
          for (const e of list) {
            const path = prefix ? `${prefix}.${e.property}` : e.property;
            if (e.constraints) map[path] = Object.values(e.constraints)[0] as string;
            if (e.children?.length) walk(e.children, path);
          }
        };
        walk(errors as any[]);
        const { BadRequestException } = require('@nestjs/common');
        return new BadRequestException({
          message: 'Please correct the highlighted fields.',
          errors: map,
        });
      },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const port = config.get<number>('port');
  await app.listen(port, '0.0.0.0');
  logger.log(`${config.get('appName')} API listening on http://localhost:${port}/api`);
  logger.log(`Mail dry-run: ${config.get('mail.dryRun')}`);
}

bootstrap();
