import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Sequelize } from 'sequelize-typescript';
import { SEQUELIZE } from './database/sequelize.provider';
import { Public } from './common/decorators/roles.decorator';
import { SmtpProvider } from './modules/mail/smtp.provider';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(SEQUELIZE) private readonly sequelize: Sequelize,
    private readonly smtp: SmtpProvider,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  async health() {
    let db = 'down';
    try {
      await this.sequelize.authenticate();
      db = 'up';
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Opens and authenticates an SMTP connection.
   *
   * Worth having as its own endpoint: an SMTP credential that has expired
   * fails silently from the outside - the drip rows just start turning up as
   * `failed` - and this answers "is it us or the mailbox provider" in one
   * call. Returns no credentials, only whether the handshake worked.
   */
  @Public()
  @Get('mail')
  async mail() {
    const mail = this.config.get('mail');
    if (mail.transport !== 'smtp') {
      return { transport: mail.transport, checked: false, from: mail.fromEmail };
    }

    const result = await this.smtp.verifyConnection();
    return {
      transport: 'smtp',
      checked: true,
      dryRun: mail.dryRun,
      host: `${mail.smtp.host}:${mail.smtp.port}`,
      from: `${mail.fromName} <${mail.fromEmail}>`,
      ok: result.ok,
      error: result.error ?? null,
    };
  }
}
