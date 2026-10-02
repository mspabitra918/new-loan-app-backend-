/**
 * The contract every sender implements. MailService talks to this and never
 * to a concrete provider, so switching between SMTP and the MailerCloud HTTP
 * API is a config change rather than a code change.
 */
export interface SendEmailInput {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  /** Surfaced in provider reporting; contains no applicant data. */
  tags?: string[];
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  raw?: unknown;
  error?: string;
  /** False for anything a retry cannot fix (bad address, 4xx, auth). */
  retryable: boolean;
}

export interface MailTransport {
  /** Short name written to email_logs.provider. */
  readonly name: string;
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

/** DI token for the configured transport. */
export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');
