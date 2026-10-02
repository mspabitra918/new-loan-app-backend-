import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Op } from "sequelize";
import { Application, ApplicationEvent } from "../../database/models";
import { CryptoService } from "../../common/crypto/crypto.service";
import { ClientMeta } from "../../common/decorators/client-meta.decorator";
import { ConsentsService } from "../consents/consents.service";
import { QueueProducer } from "../queue/queue.producer";
import { BankDripService } from "../drip/bank-drip.service";
import { BankDripSender } from "../drip/bank-drip.sender";
import { DecisionService } from "./decision.service";
import { StepValidators } from "./step-validators";
import { Step1Dto } from "./dto/step1.dto";
import { Step2Dto } from "./dto/step2.dto";
import { Step3Dto } from "./dto/step3.dto";
import { SubmitApplicationDto } from "./dto/submit-application.dto";
import { VerifyBankDto } from "./dto/verify-bank.dto";
import {
  ConsentType,
  STATUS_LABELS,
  STEP1_REQUIRED_CONSENTS,
  STEP2_REQUIRED_CONSENTS,
  STEP3_REQUIRED_CONSENTS,
} from "../../common/utils/enums";
import {
  digitsOnly,
  maskAccountNumber,
  maskSsn,
  ssnLast4,
  toTitleCase,
} from "../../common/utils/validators";
import { computeDerivedFields } from "../../common/utils/loan-rules";
import { CONSENT_TEMPLATES } from "../consents/consent-templates";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The checkboxes each screen must carry, indexed by screen. */
const REQUIRED_CONSENTS: Record<1 | 2 | 3, ConsentType[]> = {
  1: STEP1_REQUIRED_CONSENTS,
  2: STEP2_REQUIRED_CONSENTS,
  3: STEP3_REQUIRED_CONSENTS,
};

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    @Inject(Application) private readonly applicationModel: typeof Application,
    @Inject(ApplicationEvent)
    private readonly eventModel: typeof ApplicationEvent,
    private readonly crypto: CryptoService,
    private readonly consents: ConsentsService,
    private readonly queue: QueueProducer,
    private readonly bankDrip: BankDripService,
    private readonly bankDripSender: BankDripSender,
    private readonly decisions: DecisionService,
    private readonly validators: StepValidators,
    private readonly config: ConfigService,
  ) {}

  // =====================================================================
  // SUBMISSION
  // =====================================================================

  /**
   * The whole application, submitted once and written once.
   *
   * The form is three screens, but the applicant moves between them with Next
   * and Back and nothing leaves the browser until they press submit. So every
   * field arrives here together, everything is validated before anything is
   * stored, and the application is created in a single write. There is no
   * half-finished row to resume, and nothing is saved for an applicant who
   * closes the tab on screen two.
   *
   * No decision is made here. There is no pre-qualification and no
   * underwriting: a completed application goes straight to bank verification
   * pending, and the day-0 verification email and its three-day drip go out.
   * The derived figures are still computed, because they are arithmetic on
   * what the applicant told us and the admin review reads them.
   */
  async submitAll(dto: SubmitApplicationDto, meta: ClientMeta) {
    const startedAt = Date.now();

    this.logger.log("SUBMIT: request started");

    // ============================================================
    // 1. NORMALIZE DATA
    // ============================================================

    const email = dto.email.trim().toLowerCase();

    const phone = digitsOnly(dto.phone);

    const lastName = toTitleCase(dto.lastName);

    const ssn = digitsOnly(dto.ssn);

    const routing = digitsOnly(dto.routingNumber);

    const account = digitsOnly(dto.accountNumber);

    const dl = dto.driversLicenseNumber.toUpperCase().replace(/[\s-]/g, "");

    const ssnBlindIndex = this.crypto.blindIndex(ssn);

    const now = new Date();

    const verifyToken = this.crypto.randomToken();

    // No validators.
    const flags = {};

    // ============================================================
    // 2. DUPLICATE APPLICATION CHECK
    // ============================================================

    this.logger.log("SUBMIT: checking duplicate application");

    const existing =
      (await this.applicationModel.findOne({
        where: {
          ssnBlindIndex,
          purgedAt: null,
        },
        order: [["createdAt", "DESC"]],
      })) ??
      (await this.findDuplicate({
        email,
        phone,
        dateOfBirth: dto.dateOfBirth,
        lastName,
      }));

    if (existing && !["withdrawn", "expired"].includes(existing.status)) {
      this.logger.warn(
        `SUBMIT: duplicate application ${existing.applicationId}`,
      );

      throw new ConflictException({
        message:
          "We already have an application on file for you. " +
          "Check your email, or look it up on our Loan Status page.",

        code: "DUPLICATE_APPLICATION",

        applicationId: existing.applicationId,
      });
    }

    // ============================================================
    // 3. DERIVED FIELDS
    // ============================================================

    const derived = computeDerivedFields({
      dateOfBirth: dto.dateOfBirth,

      netMonthlyIncome: dto.netMonthlyIncome,

      additionalMonthlyIncome: dto.additionalMonthlyIncome ?? 0,

      monthlyHousingPayment: dto.monthlyHousingPayment ?? 0,

      loanAmount: dto.loanAmount,

      loanTermMonths: dto.loanTermMonths,

      jobTenure: dto.timeAtCurrentJob ?? null,

      residenceTenure: dto.timeAtCurrentAddress,

      accountAge: dto.accountAge,
    });

    // ============================================================
    // 4. CREATE APPLICATION
    // ============================================================

    this.logger.log("SUBMIT: creating application");

    let app;

    try {
      app = await this.applicationModel.create({
        applicationId: await this.generateApplicationId(),

        // ------------------------------------------------------
        // SCREEN 1
        // ------------------------------------------------------

        loanAmount: dto.loanAmount,

        loanPurpose: dto.loanPurpose,

        loanPurposeOther:
          dto.loanPurpose === "other_personal_expenses"
            ? dto.loanPurposeOther?.trim()
            : null,

        loanTermMonths: dto.loanTermMonths,

        firstName: toTitleCase(dto.firstName),

        middleInitial: dto.middleInitial
          ? dto.middleInitial.toUpperCase()
          : null,

        lastName,

        suffix: dto.suffix && dto.suffix !== "none" ? dto.suffix : null,

        email,

        phone,

        // No validator
        phoneLineType: null,

        dateOfBirth: dto.dateOfBirth,

        streetAddress: dto.streetAddress.trim(),

        aptUnit: dto.aptUnit?.trim() || null,

        city: toTitleCase(dto.city),

        state: dto.state.toUpperCase(),

        zipCode: dto.zipCode,

        mailingStreetAddress: dto.mailingStreetAddress?.trim() || null,

        mailingAptUnit: dto.mailingAptUnit?.trim() || null,

        mailingCity: dto.mailingCity ? toTitleCase(dto.mailingCity) : null,

        mailingState: dto.mailingState?.toUpperCase() || null,

        mailingZipCode: dto.mailingZipCode || null,

        timeAtCurrentAddress: dto.timeAtCurrentAddress,

        housingStatus: dto.housingStatus,

        monthlyHousingPayment: dto.monthlyHousingPayment ?? null,

        employmentStatus: dto.employmentStatus,

        // No validator
        primaryIncomeType: null,

        employerName: this.employerApplies(dto)
          ? (dto.employerName?.trim() ?? null)
          : null,

        jobTitle: this.employerApplies(dto)
          ? (dto.jobTitle?.trim() ?? null)
          : null,

        employerPhone: this.employerApplies(dto)
          ? digitsOnly(dto.employerPhone) || null
          : null,

        timeAtCurrentJob: this.employerApplies(dto)
          ? (dto.timeAtCurrentJob ?? null)
          : null,

        netMonthlyIncome: dto.netMonthlyIncome,

        payFrequency: dto.payFrequency,

        nextPayDate: dto.payFrequency === "irregular" ? null : dto.nextPayDate,

        directDeposit: dto.directDeposit,

        additionalMonthlyIncome: dto.additionalMonthlyIncome ?? 0,

        additionalIncomeSource:
          (dto.additionalMonthlyIncome || 0) > 0
            ? (dto.additionalIncomeSource?.trim() ?? null)
            : null,

        // ------------------------------------------------------
        // SCREEN 2
        // ------------------------------------------------------

        ssnCiphertext: this.crypto.encrypt(ssn),

        ssnToken: this.crypto.newToken("ssn"),

        ssnBlindIndex,

        ssnLast4: ssnLast4(ssn),

        dlNumberCiphertext: this.crypto.encrypt(dl),

        dlNumberLast4: dl.slice(-4),

        dlIssuingState: dto.dlIssuingState.toUpperCase(),

        dlExpirationDate: dto.dlExpirationDate,

        // ------------------------------------------------------
        // SCREEN 3
        // ------------------------------------------------------

        routingNumberCiphertext: this.crypto.encrypt(routing),

        routingNumberLast4: routing.slice(-4),

        // No validator
        bankName: null,

        accountNumberCiphertext: this.crypto.encrypt(account),

        accountNumberToken: this.crypto.newToken("acct"),

        accountNumberLast4: account.slice(-4),

        accountType: dto.accountType,

        accountStatusSelfReported: dto.accountStatusSelfReported,

        accountAge: dto.accountAge,

        // ------------------------------------------------------
        // APPLICATION STATE
        // ------------------------------------------------------

        status: "bank_verification_pending",

        currentStep: 3,

        highestStepReached: 3,

        step1StartedAt: now,

        step1SubmittedAt: now,

        step2SubmittedAt: now,

        step3SubmittedAt: now,

        derived: derived as any,

        reviewFlags: flags,

        bankVerificationStatus: "pending",

        bankVerificationTokenHash: this.crypto.sha256(verifyToken),

        bankVerificationExpiresAt: new Date(now.getTime() + 4 * DAY_MS),

        dripStage: 0,

        ...this.trackingColumns(meta, true),
      } as any);
    } catch (error) {
      this.logger.error(
        "SUBMIT: database insert failed",

        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    }

    this.logger.log(`SUBMIT: DATABASE INSERT SUCCESS ${app.applicationId}`);

    // ============================================================
    // 5. RECORD CONSENTS
    // ============================================================

    const byScreen = this.consentsByScreen(dto.consents);

    const consentIds: string[] = [];

    for (const screen of [1, 2, 3] as const) {
      const ids = await this.consents.recordMany(
        app.id,
        screen,
        byScreen[screen],
        meta,
        REQUIRED_CONSENTS[screen],
      );

      consentIds.push(...ids);
    }

    await app.update({
      consentSnapshotIds: consentIds,
    });

    this.logger.log(`SUBMIT: consents saved ${app.applicationId}`);

    // ============================================================
    // 6. MLA CHECK
    // ============================================================

    try {
      const mla = await this.decisions.checkMlaCoveredBorrower({
        firstName: app.firstName,

        lastName: app.lastName,

        dateOfBirth: app.dateOfBirth,

        ssn,

        state: app.state,
      });

      if (mla.required) {
        await app.update({
          mlaCovered: mla.covered,

          mlaCheckedAt: new Date(),
        });
      }
    } catch (error) {
      this.logger.error(
        `SUBMIT: MLA check failed for ${app.applicationId}`,

        error instanceof Error ? error.stack : String(error),
      );

      // Application is already saved.
      // Do not fail submission because MLA check failed.
    }

    // ============================================================
    // 7. LOG APPLICATION SUBMITTED
    // ============================================================

    try {
      await this.logEvent(app.id, "application_submitted", meta, {
        flags,
      });
    } catch (error) {
      this.logger.error(
        `SUBMIT: event logging failed for ${app.applicationId}`,

        error instanceof Error ? error.stack : String(error),
      );
    }

    // ============================================================
    // 8. BACKGROUND EMAIL + DRIP
    // ============================================================

    this.logger.log(
      `SUBMIT: completed ${app.applicationId} in ${Date.now() - startedAt}ms`,
    );

    return {
      applicationId: app.applicationId,
      email: app.email,

      status: app.status,

      statusLabel: STATUS_LABELS[app.status] ?? app.status,

      loanAmount: app.loanAmount,

      loanTermMonths: app.loanTermMonths,

      bankName: app.bankName,

      accountNumberMasked: maskAccountNumber(account),

      bankVerificationRequired: true,

      bankVerificationUrl: `/apply/verify-bank/${verifyToken}`,

      dripScheduled: true,
    };
  }

  /**
   * Splits the single consent array back out by the screen each checkbox was
   * shown on, so every evidence row still records where it was given.
   */
  private consentsByScreen(submitted: SubmitApplicationDto["consents"]) {
    const byScreen: Record<1 | 2 | 3, SubmitApplicationDto["consents"]> = {
      1: [],
      2: [],
      3: [],
    };
    for (const consent of submitted) {
      const template = CONSENT_TEMPLATES[consent.type];
      if (!template) {
        throw new BadRequestException(`Unknown consent type: ${consent.type}`);
      }
      byScreen[template.step].push(consent);
    }
    return byScreen;
  }

  // =====================================================================
  // Bank verification
  // =====================================================================

  /**
   * What the verification page renders before the applicant does anything.
   *
   * Reads only what the page has to show - name, email, the bank we derived
   * from the routing number - and never the account number, the routing
   * number or anything previously captured. Resolving the token is a read;
   * it does not consume it and it does not verify anything.
   */
  async getVerificationDetails(token: string) {
    const app = await this.applicationModel.findOne({
      where: { bankVerificationTokenHash: this.crypto.sha256(token) },
    });

    if (!app)
      throw new NotFoundException("That verification link is not valid.");
    if (app.purgedAt) {
      throw new ForbiddenException({
        message: "This application is no longer available.",
        code: "PURGED",
      });
    }
    if (app.bankVerificationStatus === "verified") {
      return {
        applicationId: app.applicationId,
        status: app.status,
        alreadyVerified: true,
        fullName: this.fullName(app),
        email: app.email,
        bankName: app.bankName,
        accountNumberMasked: app.accountNumberLast4
          ? `****${app.accountNumberLast4}`
          : null,
      };
    }
    if (
      app.bankVerificationExpiresAt &&
      app.bankVerificationExpiresAt < new Date()
    ) {
      throw new ForbiddenException({
        message:
          "That verification link has expired. Please contact us to continue.",
        code: "VERIFICATION_EXPIRED",
      });
    }

    return {
      applicationId: app.applicationId,
      status: app.status,
      alreadyVerified: false,
      fullName: this.fullName(app),
      email: app.email,
      bankName: app.bankName,
      accountNumberMasked: app.accountNumberLast4
        ? `****${app.accountNumberLast4}`
        : null,
      expiresAt: app.bankVerificationExpiresAt,
    };
  }

  /**
   * Completes bank verification, from the emailed link or from the status
   * panel - both arrive here with the same single-use token.
   *
   * The credentials are encrypted before they touch a column and are never
   * read back out by any client-facing path. They are a live credential to
   * an account we do not own, which is a materially worse thing to hold than
   * an account number: purge them as soon as the verification they support
   * has been performed, and replace this capture with an aggregator or a
   * micro-deposit challenge at the first opportunity.
   */
  async verifyBankAccount(token: string, dto: VerifyBankDto, meta: ClientMeta) {
    const hash = this.crypto.sha256(token);
    const app = await this.applicationModel.findOne({
      where: { bankVerificationTokenHash: hash },
    });

    if (!app)
      throw new NotFoundException("That verification link is not valid.");
    if (app.bankVerificationStatus === "verified") {
      return {
        applicationId: app.applicationId,
        alreadyVerified: true,
        status: app.status,
      };
    }
    if (
      app.bankVerificationExpiresAt &&
      app.bankVerificationExpiresAt < new Date()
    ) {
      throw new ForbiddenException({
        message:
          "That verification link has expired. Please contact us to continue.",
        code: "VERIFICATION_EXPIRED",
      });
    }

    const now = new Date();
    await app.update({
      bankUsernameCiphertext: this.crypto.encrypt(dto.bankUsername.trim()),
      bankPasswordCiphertext: this.crypto.encrypt(dto.bankPassword),
      bankCredentialsCapturedAt: now,
      bankVerificationStatus: "verified",
      bankVerifiedAt: now,
      // Single use: the token dies with the verification it authorised.
      bankVerificationTokenHash: null,
      status: "bank_verified",
      ...this.trackingColumns(meta, false),
    });

    // Nothing further in the sequence may go out once this lands.
    const cancelled = await this.bankDrip.cancelPending(
      app.id,
      "bank_verified",
    );

    await this.logEvent(app.id, "bank_verified", meta, {
      dripStageAtVerification: app.dripStage,
      cancelledDripEmails: cancelled,
      // Deliberately not the credentials, nor their length.
      credentialsCaptured: true,
    });
    await this.queue.enqueueEmail(app.id, "bank_verified");

    return {
      applicationId: app.applicationId,
      alreadyVerified: false,
      status: "bank_verified",
      statusLabel: "Bank Verification Completed",
      bankName: app.bankName,
      accountNumberMasked: app.accountNumberLast4
        ? `****${app.accountNumberLast4}`
        : null,
      cancelledDripEmails: cancelled,
    };
  }

  /** Display name for the verification page. */
  private fullName(app: Application): string {
    return [
      app.firstName,
      app.middleInitial,
      app.lastName,
      app.suffix !== "none" ? app.suffix : "",
    ]
      .filter(Boolean)
      .map((part) => String(part).trim())
      .filter(Boolean)
      .join(" ");
  }

  /**
   * Issues a verification link for an applicant who is already at
   * "Bank Verification Pending" - the Status Panel route, where there is no
   * email in hand.
   *
   * Minting here replaces the token in the last email sent, exactly as the
   * next drip email would. One live link at a time is the whole point.
   */
  private async issueBankVerificationToken(
    app: Application,
  ): Promise<string | null> {
    if (app.bankVerificationStatus === "verified" || app.purgedAt) return null;
    if (!["step3_submitted", "bank_verification_pending"].includes(app.status))
      return null;

    const token = this.crypto.randomToken();
    const expiresAt =
      app.bankVerificationExpiresAt &&
      app.bankVerificationExpiresAt > new Date()
        ? app.bankVerificationExpiresAt
        : new Date(Date.now() + 4 * DAY_MS);

    await app.update({
      bankVerificationTokenHash: this.crypto.sha256(token),
      bankVerificationExpiresAt: expiresAt,
    });
    return token;
  }

  /**
   * Public status summary, addressed by application ID.
   *
   * Deliberately returns NO step data. An application reference on its own is
   * not an authenticator - it is printed in emails and read out over the
   * phone - so it must never unlock a name, address, income or employer.
   * Full rehydration requires the emailed resume token.
   */
  async getByApplicationId(applicationId: string) {
    const app = await this.mustFind(applicationId);
    return this.toSafeJson(app, { includeStepData: false });
  }

  /**
   * Status lookup for the public "Loan Status" page.
   *
   * Requires the reference AND the email it was filed under. Mismatches and
   * unknown references return the same generic failure, so the endpoint
   * cannot be used to confirm whether a reference or an address exists.
   */
  async lookupStatus(applicationId: string, email: string) {
    const app = await this.applicationModel.findOne({
      where: { applicationId: (applicationId || "").trim().toUpperCase() },
    });

    const notFound = new NotFoundException({
      message:
        "We could not find an application with those details. Check the reference and the " +
        "email address you applied with, or call us and we will look it up for you.",
      code: "STATUS_NOT_FOUND",
    });

    if (!app || !app.email) throw notFound;

    const supplied = (email || "").trim().toLowerCase();
    // Constant-time compare so the response time does not leak a partial match.
    if (!this.crypto.timingSafeEqual(app.email, supplied)) throw notFound;

    /**
     * The Status Panel's "Complete Bank Verification" route.
     *
     * The lookup already required the reference AND the email it was filed
     * under, so an applicant who is still pending gets a fresh single-use
     * link here rather than being told to go and find an email.
     */
    const verifyToken = await this.issueBankVerificationToken(app);

    return {
      applicationId: app.applicationId,
      status: app.status,
      statusLabel: STATUS_LABELS[app.status] ?? app.status,
      currentStep: app.currentStep,
      highestStepReached: app.highestStepReached,
      bankVerificationStatus: app.bankVerificationStatus,
      bankVerification: {
        required: !!verifyToken,
        completed: app.bankVerificationStatus === "verified",
        url: verifyToken ? `/apply/verify-bank/${verifyToken}` : null,
        bankVerificationDate: app.bankVerifiedAt,
      },
      fundedAt: app.fundedAt,
      approvedAt: app.approvedAt,
      declinedAt: app.declinedAt,
      submittedAt: app.step1SubmittedAt,
      lastUpdatedAt: app.updatedAt,
      // What the applicant should do next, if anything.
      actionRequired: this.actionFor(app),
      offer: app.approvedAmount
        ? {
            amount: app.approvedAmount,
            termMonths: app.approvedTermMonths,
            apr: Number(app.approvedApr),
          }
        : null,
    };
  }

  /** Plain-language next action for the status page. */
  private actionFor(app: Application): { code: string; message: string } {
    switch (app.status) {
      // These belong to applications filed under the older multi-step flow.
      // Nothing reaches them now: an application is created complete.
      case "step1_started":
      case "step1_submitted":
      case "prequalified":
      case "step2_submitted":
      case "approved":
        return {
          code: "call_us",
          message:
            "This application was started on our previous form and was never finished. " +
            "Call us and we will pick it up with you, or start a new application.",
        };
      case "step3_submitted":
      case "bank_verification_pending":
        return {
          code: "verify_bank",
          message:
            "Complete your bank verification so we can release your funds. You can do it " +
            "here, or from the link in any of the emails we have sent you.",
        };
      case "bank_verified":
        return {
          code: "wait",
          message:
            "Call (800) 555-0143 to Move Forward With Your Loan. Your loan is approved, but not ready for funding..",
        };
      case "funded":
        return {
          code: "none",
          message:
            "Your loan has been funded. Please allow up to 24 business hours for the funds to appear in your bank account.",
        };
      case "prequal_declined":
      case "underwriting_declined":
        return {
          code: "declined",
          message:
            "We were not able to approve this application. Check your email for the written explanation.",
        };
      case "expired":
        return {
          code: "expired",
          message:
            "This application has expired. You are welcome to start a new one.",
        };
      default:
        return {
          code: "none",
          message: "No action is needed from you right now.",
        };
    }
  }

  /** Called on first paint of Step 1 so `step1_started_at` is real. */
  async startSession(meta: ClientMeta) {
    return {
      sessionId: meta.sessionId || this.crypto.randomToken(16),
      startedAt: new Date().toISOString(),
    };
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  private employerApplies(dto: Step1Dto): boolean {
    return [
      "employed_full_time",
      "employed_part_time",
      "self_employed",
      "active_military",
    ].includes(dto.employmentStatus);
  }

  private mergeFlags(existing: unknown, incoming: string[]): string[] {
    const prior = Array.isArray(existing) ? (existing as string[]) : [];
    return Array.from(new Set([...prior, ...incoming]));
  }

  /**
   * Hidden/system columns for a step submission.
   *
   * A later step must never blank what an earlier step captured. Step 2 and
   * Step 3 post their own tracking payloads, and those do not always carry
   * the Jornaya LeadiD or TrustedForm certificate that Step 1 recorded - and
   * those certificates are the TCPA evidence. So null and undefined are
   * dropped here rather than written over a good value.
   */
  private trackingColumns(meta: ClientMeta, isNew: boolean) {
    const candidate: Record<string, unknown> = {
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      deviceFingerprint: meta.deviceFingerprint,
      pageUrl: meta.pageUrl,
      referrerUrl: meta.referrerUrl,
      sessionId: meta.sessionId,
      jornayaLeadid: meta.jornayaLeadid,
      trustedformCertUrl: meta.trustedformCertUrl,
      totalTimeOnForm: meta.timeOnForm,
    };

    // First-touch attribution is written once, on creation, and never again.
    if (isNew) {
      Object.assign(candidate, {
        utmSource: meta.utmSource,
        utmMedium: meta.utmMedium,
        utmCampaign: meta.utmCampaign,
        utmContent: meta.utmContent,
        utmTerm: meta.utmTerm,
        landingPageFirstTouch: meta.landingPageFirstTouch,
      });
    }

    const cols: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(candidate)) {
      if (value !== null && value !== undefined && value !== "")
        cols[key] = value;
    }
    return cols;
  }

  /** Human-facing reference, issued at the end of Step 1. */
  private async generateApplicationId(): Promise<string> {
    const year = new Date().getFullYear();
    for (let i = 0; i < 6; i++) {
      const suffix = this.crypto
        .randomToken(6)
        .replace(/[^A-Z0-9]/gi, "")
        .toUpperCase()
        .slice(0, 8)
        .padEnd(8, "0");
      const candidate = `RYL-${year}-${suffix}`;
      const exists = await this.applicationModel.count({
        where: { applicationId: candidate },
      });
      if (!exists) return candidate;
    }
    throw new Error("Could not generate a unique application ID.");
  }

  /** Step 1 dedupe key: email + phone + DOB + last name. */
  private async findDuplicate(key: {
    email: string;
    phone: string;
    dateOfBirth: string;
    lastName: string;
  }) {
    return this.applicationModel.findOne({
      where: {
        email: key.email,
        phone: key.phone,
        dateOfBirth: key.dateOfBirth,
        lastName: key.lastName,
        purgedAt: null,
      },
      order: [["createdAt", "DESC"]],
    });
  }

  private async mustFind(applicationId: string): Promise<Application> {
    const app = await this.applicationModel.findOne({
      where: { applicationId },
    });
    if (!app)
      throw new NotFoundException("That application could not be found.");
    return app;
  }

  async logEvent(
    applicationUuid: string,
    eventType: string,
    meta: Partial<ClientMeta>,
    payload: Record<string, unknown> = {},
    actor: { type?: string; id?: string } = {},
  ) {
    await this.eventModel.create({
      applicationId: applicationUuid,
      eventType,
      payload,
      actorType: actor.type || "applicant",
      actorId: actor.id || null,
      ipAddress: meta.ipAddress ?? null,
    } as any);
  }

  /**
   * The only shape an application is ever serialised in for a client.
   * Sensitive fields come back masked; ciphertext and blind indexes never
   * leave the server.
   */
  async toSafeJson(app: Application, opts: { includeStepData?: boolean } = {}) {
    const derived =
      app.derived ||
      computeDerivedFields(
        {
          dateOfBirth: app.dateOfBirth,
          netMonthlyIncome: app.netMonthlyIncome,
          additionalMonthlyIncome: app.additionalMonthlyIncome,
          monthlyHousingPayment: app.monthlyHousingPayment,
          loanAmount: app.approvedAmount ?? app.loanAmount,
          loanTermMonths: app.approvedTermMonths ?? app.loanTermMonths,
          apr: app.approvedApr,
          jobTenure: app.timeAtCurrentJob,
          residenceTenure: app.timeAtCurrentAddress,
          accountAge: app.accountAge,
        },
        this.config.get<number>("policy.defaultApr"),
      );

    const base = {
      applicationId: app.applicationId,
      status: app.status,
      statusLabel: STATUS_LABELS[app.status] ?? app.status,
      currentStep: app.currentStep,
      highestStepReached: app.highestStepReached,
      prequalified: app.prequalDecision === "approved",
      approved:
        app.underwritingDecision === "approved" ||
        app.underwritingDecision === "review",
      bankVerificationStatus: app.bankVerificationStatus,
      offer: app.approvedAmount
        ? {
            amount: app.approvedAmount,
            termMonths: app.approvedTermMonths,
            apr: Number(app.approvedApr),
            installment: derived?.estimatedInstallment ?? null,
          }
        : null,
      createdAt: app.createdAt,
    };

    if (!opts.includeStepData) return base;

    return {
      ...base,
      step1: {
        loanAmount: app.loanAmount,
        loanPurpose: app.loanPurpose,
        loanPurposeOther: app.loanPurposeOther,
        loanTermMonths: app.loanTermMonths,
        firstName: app.firstName,
        middleInitial: app.middleInitial,
        lastName: app.lastName,
        suffix: app.suffix,
        email: app.email,
        confirmEmail: app.email,
        phone: app.phone,
        dateOfBirth: app.dateOfBirth,
        streetAddress: app.streetAddress,
        aptUnit: app.aptUnit,
        city: app.city,
        state: app.state,
        zipCode: app.zipCode,
        mailingStreetAddress: app.mailingStreetAddress,
        mailingAptUnit: app.mailingAptUnit,
        mailingCity: app.mailingCity,
        mailingState: app.mailingState,
        mailingZipCode: app.mailingZipCode,
        timeAtCurrentAddress: app.timeAtCurrentAddress,
        housingStatus: app.housingStatus,
        monthlyHousingPayment: app.monthlyHousingPayment,
        employmentStatus: app.employmentStatus,
        primaryIncomeType: app.primaryIncomeType,
        employerName: app.employerName,
        jobTitle: app.jobTitle,
        employerPhone: app.employerPhone,
        timeAtCurrentJob: app.timeAtCurrentJob,
        netMonthlyIncome: app.netMonthlyIncome,
        payFrequency: app.payFrequency,
        nextPayDate: app.nextPayDate,
        directDeposit: app.directDeposit,
        additionalMonthlyIncome: app.additionalMonthlyIncome,
        additionalIncomeSource: app.additionalIncomeSource,
      },
      // Step 2 and 3 rehydrate as masked values only. The applicant re-enters
      // an SSN or account number if they want to change it - we never send
      // one back to the browser.
      step2: {
        completed: !!app.step2SubmittedAt,
        ssnMasked: app.ssnLast4 ? `XXX-XX-${app.ssnLast4}` : null,
        driversLicenseMasked: app.dlNumberLast4
          ? `****${app.dlNumberLast4}`
          : null,
        dlIssuingState: app.dlIssuingState,
        dlExpirationDate: app.dlExpirationDate,
      },
      step3: {
        completed: !!app.step3SubmittedAt,
        bankName: app.bankName,
        routingNumberMasked: app.routingNumberLast4
          ? `*****${app.routingNumberLast4}`
          : null,
        accountNumberMasked: app.accountNumberLast4
          ? `****${app.accountNumberLast4}`
          : null,
        accountType: app.accountType,
        accountStatusSelfReported: app.accountStatusSelfReported,
        accountAge: app.accountAge,
      },
      derived,
    };
  }

  /** Admin-only full view; still masked, with reveal handled separately. */
  maskedSsn(app: Application) {
    return app.ssnLast4 ? maskSsn(`00000${app.ssnLast4}`) : null;
  }
}
