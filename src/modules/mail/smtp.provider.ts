import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { redactValue } from '../../common/utils/redact';
import { MailTransport, SendEmailInput, SendEmailResult } from './mail-transport';

/**
 * SMTP sender (nodemailer).
 *
 * The transporter is created lazily and pooled - a drip tick can send several
 * messages in a row and re-handshaking TLS for each one is wasteful.
 *
 * Permanent vs retryable is decided from the SMTP reply code: 5xx is a
 * rejection that will be rejected again (bad recipient, blocked sender, auth
 * failure), 4xx and connection errors are worth another attempt.
 */
@Injectable()
export class SmtpProvider implements MailTransport, OnModuleDestroy {
  readonly name = 'smtp';

  private readonly logger = new Logger(SmtpProvider.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private get settings() {
    return this.config.get('mail');
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const { smtp } = this.settings;
    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
      ...(smtp.allowInvalidCerts ? { tls: { rejectUnauthorized: false } } : {}),
    });

    this.logger.log(`SMTP transport ready: ${smtp.host}:${smtp.port} (secure=${smtp.secure})`);
    return this.transporter;
  }

  /** Opens a connection and authenticates. Used by the health endpoint. */
  async verifyConnection(): Promise<{ ok: boolean; error?: string }> {
    const mail = this.settings;
    if (mail.dryRun) return { ok: true };
    if (!mail.smtp.host) return { ok: false, error: 'SMTP_HOST is not set' };
    try {
      await this.getTransporter().verify();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: String(err?.message || err).slice(0, 500) };
    }
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const mail = this.settings;

    if (mail.dryRun || !mail.smtp.host) {
      // Local development: the envelope only. Never the body - a template can
      // carry a masked account number and the applicant's name.
      this.logger.log(
        `[DRY RUN] -> ${redactValue(input.to)} | "${input.subject}" | tags=${(input.tags || []).join(',')}`,
      );
      return { ok: true, messageId: `dryrun-${Date.now()}`, retryable: false };
    }

    try {
      const info = await this.getTransporter().sendMail({
        from: { name: mail.fromName, address: mail.fromEmail },
        sender: mail.fromEmail,
        replyTo: mail.replyTo,
        to: input.toName ? { name: input.toName, address: input.to } : input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: (input.tags || []).length ? { 'X-Mail-Tags': input.tags.join(',') } : undefined,
      });

      // A message the server accepted for some recipients but rejected for
      // ours is not a success, however cheerful the transport looks.
      if (info.rejected?.length) {
        return {
          ok: false,
          error: `Recipient rejected by ${mail.smtp.host}`,
          raw: { rejected: info.rejected, response: info.response },
          retryable: false,
        };
      }

      return {
        ok: true,
        messageId: info.messageId,
        raw: { response: info.response, accepted: info.accepted },
        retryable: false,
      };
    } catch (err: any) {
      const code = Number(err?.responseCode);
      // 5xx is a hard rejection; 4xx and socket/DNS errors are worth a retry.
      const retryable = !Number.isFinite(code) || code < 500;
      const message = String(err?.message || 'SMTP send failed');

      this.logger.error(
        `SMTP send failed (code=${code || 'network'}, retryable=${retryable}): ${redactValue(message)}`,
      );
      return {
        ok: false,
        error: message.slice(0, 1000),
        raw: { code: err?.code, responseCode: code },
        retryable,
      };
    }
  }

  async onModuleDestroy() {
    this.transporter?.close();
  }
}
