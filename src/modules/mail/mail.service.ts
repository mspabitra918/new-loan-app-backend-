import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Application, EmailLog } from '../../database/models';
import { MAIL_TRANSPORT, MailTransport } from './mail-transport';
import { renderTemplate, TemplateContext, TemplateKey } from './templates';
import { computeDerivedFields } from '../../common/utils/loan-rules';
import { ACCOUNT_AGE_LABELS, LOAN_PURPOSE_LABELS } from '../../common/utils/enums';

export interface SendOptions {
  /** Extra context that is not derivable from the application row. */
  context?: Partial<TemplateContext>;
  /** Single-use resume token, minted by ApplicationsService. */
  resumeToken?: string;
  /** Single-use bank-verification token, minted at Step 3. */
  bankVerifyToken?: string;
  jobId?: string;
  scheduledFor?: Date;
  attempt?: number;
}

export const SUPPORT_PHONE = '(800) 555-0143';

/** Fallback for a purpose the label table does not cover. */
const titleCaseEnum = (value: string) =>
  value.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(Application) private readonly applicationModel: typeof Application,
    @Inject(EmailLog) private readonly emailLogModel: typeof EmailLog,
    @Inject(MAIL_TRANSPORT) private readonly provider: MailTransport,
    private readonly config: ConfigService,
  ) {}

  /**
   * Builds template context from the application row.
   * Deliberately reads only masked/derived values - this method is the
   * boundary that keeps sensitive data out of email bodies.
   */
  buildContext(app: Application, opts: SendOptions = {}): TemplateContext {
    const webUrl = this.config.get<string>('publicWebUrl');
    const derived =
      app.derived ||
      computeDerivedFields(
        {
          netMonthlyIncome: app.netMonthlyIncome,
          additionalMonthlyIncome: app.additionalMonthlyIncome,
          monthlyHousingPayment: app.monthlyHousingPayment,
          loanAmount: app.approvedAmount ?? app.loanAmount,
          loanTermMonths: app.approvedTermMonths ?? app.loanTermMonths,
          apr: app.approvedApr,
        },
        this.config.get<number>('policy.defaultApr'),
      );

    return {
      brand: this.config.get<string>('appName'),
      supportPhone: SUPPORT_PHONE,
      applicationId: app.applicationId,
      firstName: app.firstName || 'there',
      lastName: app.lastName || undefined,
      email: app.email || undefined,
      loanPurpose: app.loanPurpose
        ? LOAN_PURPOSE_LABELS[app.loanPurpose] ?? titleCaseEnum(app.loanPurpose)
        : undefined,
      webUrl,
      resumeUrl: opts.resumeToken ? `${webUrl}/apply/resume/${opts.resumeToken}` : undefined,
      bankVerifyUrl: opts.bankVerifyToken
        ? `${webUrl}/apply/verify-bank/${opts.bankVerifyToken}`
        : undefined,
      bankName: app.bankName || undefined,
      accountLast4: app.accountNumberLast4 || undefined,
      accountType: app.accountType || undefined,
      loanAmount: app.approvedAmount ?? app.loanAmount ?? undefined,
      loanTermMonths: app.approvedTermMonths ?? app.loanTermMonths ?? undefined,
      estimatedInstallment: derived?.estimatedInstallment ?? undefined,
      apr: app.approvedApr ?? this.config.get<number>('policy.defaultApr'),
      ...opts.context,
    };
  }

  /**
   * Renders, logs and sends. Always writes an email_logs row first so a send
   * that dies mid-flight is still visible in the admin portal.
   */
  async sendToApplication(
    applicationUuid: string,
    templateKey: TemplateKey,
    opts: SendOptions = {},
  ): Promise<{ ok: boolean; retryable: boolean; logId: string | null }> {
    const app = await this.applicationModel.findByPk(applicationUuid);
    if (!app) {
      this.logger.warn(`Cannot send "${templateKey}" - application ${applicationUuid} not found.`);
      return { ok: false, retryable: false, logId: null };
    }
    if (!app.email) {
      this.logger.warn(`Cannot send "${templateKey}" - application ${app.applicationId} has no email.`);
      return { ok: false, retryable: false, logId: null };
    }

    const ctx = this.buildContext(app, opts);
    if (ctx.accountType) {
      ctx.accountType = ctx.accountType === 'savings' ? 'savings account' : 'checking account';
    }
    const rendered = renderTemplate(templateKey, ctx);

    const log = await this.emailLogModel.create({
      applicationId: app.id,
      templateKey,
      toEmail: app.email,
      subject: rendered.subject,
      status: 'sending',
      provider: this.provider.name,
      attempt: opts.attempt ?? 1,
      jobId: opts.jobId ?? null,
      scheduledFor: opts.scheduledFor ?? null,
    } as any);

    const result = await this.provider.send({
      to: app.email,
      toName: [app.firstName, app.lastName].filter(Boolean).join(' '),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tags: [...rendered.tags, app.applicationId],
    });

    await log.update({
      status: result.ok ? 'sent' : 'failed',
      providerMessageId: result.messageId ?? null,
      providerResponse: (result.raw as any) ?? null,
      errorMessage: result.error ?? null,
      sentAt: result.ok ? new Date() : null,
    });

    if (result.ok) {
      this.logger.log(`Sent "${templateKey}" for ${app.applicationId}`);
    }

    return { ok: result.ok, retryable: result.retryable, logId: log.id };
  }

  /** Account-age label for admin/email display. */
  accountAgeLabel(key?: string) {
    return key ? ACCOUNT_AGE_LABELS[key] ?? key : null;
  }
}
