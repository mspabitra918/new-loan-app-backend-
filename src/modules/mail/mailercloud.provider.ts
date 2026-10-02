import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { redactValue } from '../../common/utils/redact';
import { MailTransport, SendEmailInput, SendEmailResult } from './mail-transport';

export type { SendEmailInput, SendEmailResult } from './mail-transport';

/**
 * MailerCloud transactional sender.
 *
 * NOTE ON THE ENDPOINT: MailerCloud exposes its transactional send under the
 * Cloud API base (default https://cloudapi.mailercloud.com/v1) and
 * authenticates with the raw API key in an `Authorization` header - not a
 * Bearer token. The send path is configurable via MAILERCLOUD_SEND_PATH so
 * this can be pointed at whatever path your account's API reference lists
 * without a code change. Verify it against your dashboard before go-live.
 */
@Injectable()
export class MailerCloudProvider implements MailTransport {
  readonly name = 'mailercloud';

  private readonly logger = new Logger(MailerCloudProvider.name);
  private readonly http: AxiosInstance;
  private readonly sendPath: string;

  constructor(private readonly config: ConfigService) {
    const mail = this.config.get('mail');
    this.sendPath = process.env.MAILERCLOUD_SEND_PATH || '/email/send';

    this.http = axios.create({
      baseURL: mail.apiUrl,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: mail.apiKey,
      },
    });
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const mail = this.config.get('mail');

    if (mail.dryRun || !mail.apiKey) {
      // Local development: log the envelope only. Never the body - templates
      // can contain a masked account number and an applicant's name.
      this.logger.log(
        `[DRY RUN] -> ${redactValue(input.to)} | "${input.subject}" | tags=${(input.tags || []).join(',')}`,
      );
      return { ok: true, messageId: `dryrun-${Date.now()}`, retryable: false };
    }

    const payload = {
      from_name: mail.fromName,
      from_email: mail.fromEmail,
      reply_to: mail.replyTo,
      subject: input.subject,
      content: input.html,
      plain_text: input.text,
      to: [{ email: input.to, name: input.toName || '' }],
      tags: input.tags || [],
    };

    try {
      const res = await this.http.post(this.sendPath, payload);
      const messageId =
        res.data?.message_id || res.data?.id || res.data?.data?.message_id || undefined;
      return { ok: true, messageId, raw: res.data, retryable: false };
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      // 4xx other than 429 will never succeed on retry; let BullMQ stop early.
      const retryable = !status || status === 429 || status >= 500;
      const message =
        body?.message || body?.error || err?.message || 'MailerCloud request failed';

      this.logger.error(
        `MailerCloud send failed (status=${status ?? 'network'}, retryable=${retryable}): ${redactValue(
          String(message),
        )}`,
      );
      return { ok: false, error: String(message).slice(0, 1000), raw: body, retryable };
    }
  }
}
