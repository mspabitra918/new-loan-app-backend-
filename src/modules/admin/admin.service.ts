import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Op, WhereOptions } from "sequelize";
import {
  AdminUser,
  Application,
  ApplicationEvent,
  Consent,
  EmailLog,
  SensitiveAccessLog,
} from "../../database/models";
import { CryptoService } from "../../common/crypto/crypto.service";
import { ApplicationsService } from "../applications/applications.service";
import { QueueProducer } from "../queue/queue.producer";
import { BankDripService } from "../drip/bank-drip.service";
import { TERMINAL_STATUSES } from "../drip/bank-drip.constants";
import type { AuthUser } from "../../common/decorators/current-user.decorator";
import type { TemplateKey } from "../mail/templates";
import { maskAccountNumber } from "../../common/utils/validators";
import {
  ACCOUNT_AGE_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  HOUSING_STATUS_LABELS,
  LOAN_PURPOSE_LABELS,
  PAY_FREQUENCY_LABELS,
  STATUS_LABELS,
} from "../../common/utils/enums";

export type RevealField =
  | "ssn"
  | "dl_number"
  | "account_number"
  | "routing_number"
  | "bank_username"
  | "bank_password";

/**
 * The only statuses the portal may write by hand. Everything else is a
 * consequence of what the applicant has actually done.
 */
export const ADMIN_SETTABLE_STATUSES = [
  "approved",
  "underwriting_declined",
  "funded",
  "withdrawn",
] as const;
export type AdminSettableStatus = (typeof ADMIN_SETTABLE_STATUSES)[number];

/** The email the applicant receives when the portal moves them to each status. */
const STATUS_EMAIL: Record<AdminSettableStatus, TemplateKey> = {
  approved: "status_approved",
  underwriting_declined: "status_declined",
  funded: "status_funded",
  withdrawn: "status_withdrawn",
};

/**
 * Which roles may reveal which field.
 *
 * Closers and verification agents see last-4 only and appear in no list here -
 * with remote call-center teams, controlling who can see a full SSN matters
 * as much as the encryption does.
 */
const REVEAL_POLICY: Record<RevealField, AdminUser["role"][]> = {
  ssn: ["compliance", "admin"],
  dl_number: ["underwriter", "compliance", "admin"],
  account_number: ["compliance", "admin"],
  routing_number: ["underwriter", "compliance", "admin"],
  // A live online banking credential is the most dangerous value in the
  // row - narrower than the account number, and every look is logged.
  bank_username: ["compliance", "admin"],
  bank_password: ["admin"],
};

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @Inject(Application) private readonly applicationModel: typeof Application,
    @Inject(Consent) private readonly consentModel: typeof Consent,
    @Inject(ApplicationEvent)
    private readonly eventModel: typeof ApplicationEvent,
    @Inject(EmailLog) private readonly emailLogModel: typeof EmailLog,
    @Inject(SensitiveAccessLog)
    private readonly accessLogModel: typeof SensitiveAccessLog,
    private readonly crypto: CryptoService,
    private readonly applications: ApplicationsService,
    private readonly queue: QueueProducer,
    private readonly bankDrip: BankDripService,
  ) {}

  async list(query: {
    status?: string;
    search?: string;
    state?: string;
    flagged?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 25)));

    const where: WhereOptions = {};
    if (query.status) (where as any).status = query.status;
    if (query.state) (where as any).state = query.state.toUpperCase();

    if (query.search) {
      const term = query.search.trim();
      const digits = term.replace(/\D/g, "");
      (where as any)[Op.or] = [
        { applicationId: { [Op.iLike]: `%${term}%` } },
        { email: { [Op.iLike]: `%${term}%` } },
        { lastName: { [Op.iLike]: `%${term}%` } },
        ...(digits.length >= 4
          ? [{ phone: { [Op.like]: `%${digits}%` } }]
          : []),
        // Search by SSN last 4 only - never by full SSN, which would put one
        // in a query string.
        ...(digits.length === 4 ? [{ ssnLast4: digits }] : []),
      ];
    }

    const { rows, count } = await this.applicationModel.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    const filtered =
      query.flagged === "true"
        ? rows.filter(
            (r) => Array.isArray(r.reviewFlags) && r.reviewFlags.length > 0,
          )
        : rows;

    return {
      page,
      pageSize,
      total: count,
      totalPages: Math.ceil(count / pageSize),
      items: filtered.map((app) => ({
        applicationId: app.applicationId,
        name: [app.firstName, app.lastName].filter(Boolean).join(" "),
        email: app.email,
        phone: app.phone,
        state: app.state,
        loanAmount: app.loanAmount,
        status: app.status,
        currentStep: app.currentStep,
        highestStepReached: app.highestStepReached,
        bankVerificationStatus: app.bankVerificationStatus,
        dripStage: app.dripStage,
        reviewFlags: app.reviewFlags,
        ssnLast4: app.ssnLast4,
        accountLast4: app.accountNumberLast4,
        // Per the spec, IP address is visible on the application list/detail.
        ipAddress: app.ipAddress,
        createdAt: app.createdAt,
        step1SubmittedAt: app.step1SubmittedAt,
        step3SubmittedAt: app.step3SubmittedAt,
      })),
    };
  }

  /** Masked by default, everywhere. Reveals are a separate, logged action. */
  async detail(applicationId: string) {
    const app = await this.applicationModel.findOne({
      where: { applicationId },
    });
    if (!app) throw new NotFoundException("Application not found.");

    const [consents, events, emails, accessLogs] = await Promise.all([
      this.consentModel.findAll({
        where: { applicationId: app.id },
        order: [["consentedAt", "ASC"]],
      }),
      this.eventModel.findAll({
        where: { applicationId: app.id },
        order: [["createdAt", "DESC"]],
        limit: 200,
      }),
      this.emailLogModel.findAll({
        where: { applicationId: app.id },
        order: [["createdAt", "DESC"]],
        limit: 100,
      }),
      this.accessLogModel.findAll({
        where: { applicationId: app.id },
        order: [["accessedAt", "DESC"]],
        limit: 100,
      }),
    ]);

    const safe = await this.applications.toSafeJson(app, {
      includeStepData: true,
    });

    return {
      ...safe,
      labels: {
        loanPurpose: LOAN_PURPOSE_LABELS[app.loanPurpose] ?? app.loanPurpose,
        employmentStatus:
          EMPLOYMENT_STATUS_LABELS[app.employmentStatus] ??
          app.employmentStatus,
        housingStatus:
          HOUSING_STATUS_LABELS[app.housingStatus] ?? app.housingStatus,
        payFrequency:
          PAY_FREQUENCY_LABELS[app.payFrequency] ?? app.payFrequency,
        accountAge: ACCOUNT_AGE_LABELS[app.accountAge] ?? app.accountAge,
      },
      /**
       * Bank verification, as captured on the verification page. The
       * credentials are placeholders here - the cleartext comes only from a
       * logged reveal, never from the detail payload.
       */
      bankVerification: {
        status: app.bankVerificationStatus,
        verifiedAt: app.bankVerifiedAt,
        expiresAt: app.bankVerificationExpiresAt,
        dripStage: app.dripStage,
        credentialsCapturedAt: app.bankCredentialsCapturedAt,
        bankName: app.bankName,
        usernameMasked: app.bankUsernameCiphertext ? "\u2022".repeat(10) : null,
        passwordMasked: app.bankPasswordCiphertext ? "\u2022".repeat(10) : null,
      },
      decision: {
        prequalDecision: app.prequalDecision,
        prequalReasons: app.prequalReasons,
        prequalDecisionAt: app.prequalDecisionAt,
        underwritingDecision: app.underwritingDecision,
        underwritingReasons: app.underwritingReasons,
        underwritingDecisionAt: app.underwritingDecisionAt,
        declinedAt: app.declinedAt,
        lockoutUntil: app.lockoutUntil,
        mlaCovered: app.mlaCovered,
        mlaCheckedAt: app.mlaCheckedAt,
      },
      // HIDDEN / SYSTEM FIELDS - IP address must be visible here.
      system: {
        ipAddress: app.ipAddress,
        userAgent: app.userAgent,
        deviceFingerprint: app.deviceFingerprint,
        pageUrl: app.pageUrl,
        referrerUrl: app.referrerUrl,
        utmSource: app.utmSource,
        utmMedium: app.utmMedium,
        utmCampaign: app.utmCampaign,
        utmContent: app.utmContent,
        utmTerm: app.utmTerm,
        landingPageFirstTouch: app.landingPageFirstTouch,
        jornayaLeadid: app.jornayaLeadid,
        trustedformCertUrl: app.trustedformCertUrl,
        sessionId: app.sessionId,
        consentSnapshotIds: app.consentSnapshotIds,
        step1StartedAt: app.step1StartedAt,
        step1SubmittedAt: app.step1SubmittedAt,
        step2SubmittedAt: app.step2SubmittedAt,
        step3SubmittedAt: app.step3SubmittedAt,
        totalTimeOnForm: app.totalTimeOnForm,
      },
      retention: { purgeDueAt: app.purgeDueAt, purgedAt: app.purgedAt },
      consents: consents.map((c) => ({
        id: c.id,
        type: c.consentType,
        step: c.step,
        versionId: c.versionId,
        checkboxState: c.checkboxState,
        consentedAt: c.consentedAt,
        timezone: c.timezone,
        ipAddress: c.ipAddress,
        userAgent: c.userAgent,
        pageUrl: c.pageUrl,
        textHash: c.consentTextHash,
        namedParties: c.namedParties,
        jornayaLeadid: c.jornayaLeadid,
        trustedformCertUrl: c.trustedformCertUrl,
        revokedAt: c.revokedAt,
      })),
      events,
      emails: emails.map((e) => ({
        id: e.id,
        templateKey: e.templateKey,
        subject: e.subject,
        status: e.status,
        toEmail: e.toEmail,
        attempt: e.attempt,
        jobId: e.jobId,
        scheduledFor: e.scheduledFor,
        sentAt: e.sentAt,
        errorMessage: e.errorMessage,
        createdAt: e.createdAt,
      })),
      accessLogs,
    };
  }

  /**
   * Reveal a masked field.
   * Role-checked, then logged - who, when, which application, from which IP -
   * before the cleartext is returned. A denied attempt is logged too.
   */
  async reveal(
    applicationId: string,
    field: RevealField,
    user: AuthUser,
    context: { ip: string | null; userAgent: string | null; reason?: string },
  ) {
    const app = await this.applicationModel.findOne({
      where: { applicationId },
    });
    if (!app) throw new NotFoundException("Application not found.");

    const allowed = REVEAL_POLICY[field] ?? [];
    const granted = allowed.includes(user.role);

    await this.accessLogModel.create({
      applicationId: app.id,
      adminUserId: user.id,
      fieldName: field,
      action: "reveal",
      reason: context.reason?.slice(0, 200) ?? null,
      granted,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      accessedAt: new Date(),
    } as any);

    if (!granted) {
      this.logger.warn(
        `DENIED reveal of "${field}" on ${applicationId} by ${user.email} (${user.role})`,
      );
      throw new ForbiddenException(
        "Your role is not permitted to reveal this field.",
      );
    }

    if (app.purgedAt) {
      throw new ForbiddenException(
        "This data has been purged under the retention schedule.",
      );
    }

    // Cleartext is retrieved only at this moment, never held in the row.
    const value = this.decryptField(app, field);
    if (value == null) {
      throw new NotFoundException("That field has no stored value.");
    }

    this.logger.log(
      `Revealed "${field}" on ${applicationId} to ${user.email} (${user.role})`,
    );
    return { field, value, revealedAt: new Date().toISOString() };
  }

  private decryptField(app: Application, field: RevealField): string | null {
    switch (field) {
      case "ssn":
        return this.crypto.decrypt(app.ssnCiphertext);
      case "dl_number":
        return this.crypto.decrypt(app.dlNumberCiphertext);
      case "account_number":
        return this.crypto.decrypt(app.accountNumberCiphertext);
      case "routing_number":
        return this.crypto.decrypt(app.routingNumberCiphertext);
      case "bank_username":
        return this.crypto.decrypt(app.bankUsernameCiphertext);
      case "bank_password":
        return this.crypto.decrypt(app.bankPasswordCiphertext);
      default:
        return null;
    }
  }

  /** Full consent evidence for one consent row, for a dispute or subpoena. */
  async consentEvidence(consentId: string) {
    const consent = await this.consentModel.findByPk(consentId, {
      include: [{ model: Application, attributes: ["applicationId"] }],
    });
    if (!consent) throw new NotFoundException("Consent record not found.");
    return consent;
  }

  async accessLogReport(params: {
    adminUserId?: string;
    from?: string;
    to?: string;
  }) {
    const where: any = {};
    if (params.adminUserId) where.adminUserId = params.adminUserId;
    if (params.from || params.to) {
      where.accessedAt = {};
      if (params.from) where.accessedAt[Op.gte] = new Date(params.from);
      if (params.to) where.accessedAt[Op.lte] = new Date(params.to);
    }
    return this.accessLogModel.findAll({
      where,
      include: [
        {
          model: this.applicationModel,
          attributes: ["application_id"],
          required: false,
        },
      ],
      order: [["accessedAt", "DESC"]],
      limit: 1000,
    });
  }

  /**
   * Admin status override.
   *
   * Four destinations only - approved, funded, withdrawn, declined - because
   * the rest of the lifecycle is owned by the applicant's own progress
   * through the steps, and letting the portal write those by hand is how an
   * application ends up "step3_submitted" with no Step 3 data behind it.
   *
   * Moving to a terminal state stops the bank-verification drip: an
   * application nobody is going to fund should not keep chasing the
   * applicant for their bank details.
   */
  async setStatus(
    applicationId: string,
    status: AdminSettableStatus,
    user: AuthUser,
    opts: { reason?: string } = {},
  ) {
    const app = await this.applicationModel.findOne({
      where: { applicationId },
    });
    if (!app) throw new NotFoundException("Application not found.");

    const previousStatus = app.status;

    // if (app.bankVerificationStatus !== "verified") {
    //   throw new BadRequestException(
    //     "Bank verification must be completed before changing the application status.",
    //   );
    // }

    // if (
    //   previousStatus === "approved" &&
    //   status !== "funded" &&
    //   status !== "withdrawn"
    // ) {
    //   throw new BadRequestException(
    //     "An approved application can only be funded or withdrawn.",
    //   );
    // }

    // if (
    //   previousStatus === "funded" ||
    //   previousStatus === "underwriting_declined" ||
    //   previousStatus === "withdrawn"
    // ) {
    //   throw new BadRequestException(
    //     "This application is in a terminal status and cannot be changed.",
    //   );
    // }

    if (previousStatus === status) {
      return {
        applicationId,
        status,
        statusLabel: STATUS_LABELS[status] ?? status,
        changed: false,
      };
    }

    const now = new Date();
    const patch: Record<string, unknown> = { status };

    // ADD THIS
    if (status === "funded") {
      patch.fundedAt = now;
    }

    if (status === "underwriting_declined") {
      // A decline by a person is still an underwriting decision, and the
      // adverse-action clock runs from here.
      patch.underwritingDecision = "declined";
      patch.underwritingDecisionAt = now;
      patch.declinedAt = now;
      // A plain string list, matching what DecisionService writes - the
      // portal renders these directly, and an object here crashes the page.
      patch.underwritingReasons = [
        "admin_decline",
        ...(opts.reason ? [`admin_reason: ${opts.reason.slice(0, 200)}`] : []),
      ];
    }

    if (status === "approved") {
      patch.underwritingDecision = "approved";
      patch.underwritingDecisionAt = now;
      patch.approvedAt = now;
      patch.currentStep = Math.max(app.currentStep, 3);
      patch.highestStepReached = Math.max(app.highestStepReached, 3);
    }

    await app.update(patch as any);

    // Funded, withdrawn and declined all mean the chase is over.
    const cancelledDripEmails = TERMINAL_STATUSES.has(status)
      ? await this.bankDrip.cancelPending(app.id, "terminal_status")
      : 0;

    // Tell the applicant. The suffix keeps a second move to the same status
    // (approved -> declined -> approved) from being deduped by job id.
    // const emailTemplate = STATUS_EMAIL[status];
    // await this.queue.enqueueEmail(app.id, emailTemplate, {
    //   idSuffix: String(now.getTime()),
    // });

    await this.eventModel.create({
      applicationId: app.id,
      eventType: "status_changed_by_admin",
      payload: {
        from: previousStatus,
        to: status,
        reason: opts.reason || null,
        cancelledDripEmails,
        // emailTemplate,
      },
      actorType: "admin",
      actorId: user.id,
    } as any);

    this.logger.log(
      `${user.email} moved ${applicationId} from ${previousStatus} to ${status}` +
        (cancelledDripEmails
          ? ` (cancelled ${cancelledDripEmails} drip email(s))`
          : ""),
    );

    return {
      applicationId,
      status,
      statusLabel: STATUS_LABELS[status] ?? status,
      previousStatus,
      changed: true,
      cancelledDripEmails,
    };
  }

  /** Manually re-trigger or stop the bank verification drip from the portal. */
  async dripControl(
    applicationId: string,
    action: "restart" | "cancel",
    user: AuthUser,
  ) {
    const app = await this.applicationModel.findOne({
      where: { applicationId },
    });
    if (!app) throw new NotFoundException("Application not found.");

    if (action === "cancel") {
      const cancelled = await this.bankDrip.cancelPending(app.id, "admin");
      await this.eventModel.create({
        applicationId: app.id,
        eventType: "drip_cancelled_by_admin",
        payload: { cancelled },
        actorType: "admin",
        actorId: user.id,
      } as any);
      return { cancelled };
    }

    // Restarting an applicant who has already verified would email them
    // about something they have finished.
    if (app.bankVerificationStatus === "verified") {
      throw new NotFoundException(
        "This account is already verified - there is nothing to send.",
      );
    }

    const rows = await this.bankDrip.schedule(app.id);
    await this.eventModel.create({
      applicationId: app.id,
      eventType: "drip_restarted_by_admin",
      payload: { scheduled: rows.length },
      actorType: "admin",
      actorId: user.id,
    } as any);
    return { restarted: true, scheduled: rows.length };
  }

  /** The full drip schedule for one application, for the detail page. */
  async dripSchedule(applicationId: string) {
    const app = await this.applicationModel.findOne({
      where: { applicationId },
    });
    if (!app) throw new NotFoundException("Application not found.");

    const rows = await this.bankDrip.listForApplication(app.id);
    return rows.map((row) => ({
      sequence: row.sequence,
      day: row.day,
      emailType: row.emailType,
      scheduledAt: row.scheduledAt,
      status: row.status,
      attempts: row.attempts,
      sentAt: row.sentAt,
      cancelledAt: row.cancelledAt,
      cancelReason: row.cancelReason,
      lastError: row.lastError,
      createdAt: row.createdAt,
    }));
  }

  async queueHealth() {
    return {
      ...(await this.queue.queueHealth()),
      bankVerificationDrip: await this.bankDrip.counts(),
    };
  }

  /** Snapshot for the portal dashboard. */
  async stats() {
    const [total, byStatus, flagged, pendingVerification] = await Promise.all([
      this.applicationModel.count(),
      this.applicationModel.findAll({
        attributes: [
          "status",
          [this.applicationModel.sequelize.fn("COUNT", "*"), "count"],
        ],
        group: ["status"],
        raw: true,
      }),
      this.applicationModel.count({
        where: { reviewFlags: { [Op.ne]: [] } as any },
      }),
      this.applicationModel.count({
        where: { bankVerificationStatus: "pending" },
      }),
    ]);

    return { total, byStatus, flagged, pendingVerification };
  }

  maskAccount(value: string) {
    return maskAccountNumber(value);
  }
}
