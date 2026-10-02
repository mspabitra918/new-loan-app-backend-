import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { MailerCloudProvider } from './mailercloud.provider';
import { SmtpProvider } from './smtp.provider';
import { MAIL_TRANSPORT, MailTransport } from './mail-transport';

/**
 * Both senders are constructed; MAIL_TRANSPORT decides which one MailService
 * actually talks to. Keeping the unused one in the graph costs nothing (each
 * connects lazily) and makes switching a restart rather than a deploy.
 */
@Module({
  providers: [
    MailerCloudProvider,
    SmtpProvider,
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService, SmtpProvider, MailerCloudProvider],
      useFactory: (
        config: ConfigService,
        smtp: SmtpProvider,
        mailercloud: MailerCloudProvider,
      ): MailTransport =>
        config.get<string>('mail.transport') === 'smtp' ? smtp : mailercloud,
    },
    MailService,
  ],
  exports: [MailService, MailerCloudProvider, SmtpProvider, MAIL_TRANSPORT],
})
export class MailModule {}
