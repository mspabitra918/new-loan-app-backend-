import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import configuration from './common/config/configuration';
import { CryptoModule } from './common/crypto/crypto.module';
import { DatabaseModule } from './database/database.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { ConsentsModule } from './modules/consents/consents.module';
import { LookupModule } from './modules/lookup/lookup.module';
import { MailModule } from './modules/mail/mail.module';
import { QueueModule } from './modules/queue/queue.module';
import { DripModule } from './modules/drip/drip.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { RetentionModule } from './modules/retention/retention.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], cache: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    CryptoModule,
    DatabaseModule,
    MailModule,
    QueueModule,
    DripModule,
    LookupModule,
    ConsentsModule,
    ApplicationsModule,
    AuthModule,
    AdminModule,
    RetentionModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    /**
     * Authentication and role checks are registered GLOBALLY, and routes opt
     * out with @Public(). The reverse - guarding each controller by hand -
     * shipped an unauthenticated POST /auth/users that let anyone mint an
     * admin account, because @Roles() is inert metadata unless RolesGuard is
     * actually attached. Defaulting to closed makes that class of mistake
     * impossible: forget the decorator and the route returns 401, not data.
     *
     * Order matters - JwtAuthGuard must populate req.user before RolesGuard
     * reads req.user.role.
     */
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
