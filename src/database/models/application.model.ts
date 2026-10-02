import {
  Column,
  DataType,
  Default,
  HasMany,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";
import { Consent } from "./consent.model";
import { ApplicationEvent } from "./application-event.model";
import { EmailLog } from "./email-log.model";
import { BankVerificationEmail } from "./bank-verification-email.model";

/**
 * Sensitive columns hold ciphertext only. Anything read out of this model and
 * sent to a client must go through ApplicationsService.toSafeJson(), which
 * emits masked values and last-4 only.
 */
@Table({ tableName: "applications", underscored: true, timestamps: true })
export class Application extends Model<Application> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @Column({ type: DataType.STRING(24), allowNull: false, unique: true })
  applicationId: string;

  @Default("step1_started")
  @Column({ type: DataType.STRING(40), allowNull: false })
  status: string;

  @Default(1)
  @Column({ type: DataType.SMALLINT, allowNull: false })
  currentStep: number;

  @Default(1)
  @Column({ type: DataType.SMALLINT, allowNull: false })
  highestStepReached: number;

  // ---------------- Loan request
  @Column(DataType.INTEGER) loanAmount: number;
  @Column(DataType.STRING(40)) loanPurpose: string;
  @Column(DataType.STRING(120)) loanPurposeOther: string;
  @Column(DataType.SMALLINT) loanTermMonths: number;

  // ---------------- Identity
  @Column(DataType.STRING(40)) firstName: string;
  @Column(DataType.STRING(1)) middleInitial: string;
  @Column(DataType.STRING(40)) lastName: string;
  @Column(DataType.STRING(8)) suffix: string;
  @Column(DataType.STRING(254)) email: string;
  @Column(DataType.STRING(10)) phone: string;
  @Column(DataType.STRING(12)) phoneLineType: string;
  @Column(DataType.DATEONLY) dateOfBirth: string;

  // ---------------- Residence
  @Column(DataType.STRING(100)) streetAddress: string;
  @Column(DataType.STRING(20)) aptUnit: string;
  @Column(DataType.STRING(50)) city: string;
  @Column(DataType.STRING(2)) state: string;
  @Column(DataType.STRING(5)) zipCode: string;
  @Column(DataType.STRING(100)) mailingStreetAddress: string;
  @Column(DataType.STRING(20)) mailingAptUnit: string;
  @Column(DataType.STRING(50)) mailingCity: string;
  @Column(DataType.STRING(2)) mailingState: string;
  @Column(DataType.STRING(5)) mailingZipCode: string;
  @Column(DataType.STRING(20)) timeAtCurrentAddress: string;
  @Column(DataType.STRING(40)) housingStatus: string;
  @Column(DataType.DECIMAL(10, 2)) monthlyHousingPayment: number;

  // ---------------- Employment & income
  @Column(DataType.STRING(40)) employmentStatus: string;
  @Column(DataType.STRING(40)) primaryIncomeType: string;
  @Column(DataType.STRING(60)) employerName: string;
  @Column(DataType.STRING(50)) jobTitle: string;
  @Column(DataType.STRING(10)) employerPhone: string;
  @Column(DataType.STRING(20)) timeAtCurrentJob: string;
  @Column(DataType.DECIMAL(10, 2)) netMonthlyIncome: number;
  @Column(DataType.STRING(20)) payFrequency: string;
  @Column(DataType.DATEONLY) nextPayDate: string;
  @Column(DataType.BOOLEAN) directDeposit: boolean;
  @Column(DataType.DECIMAL(10, 2)) additionalMonthlyIncome: number;
  @Column(DataType.STRING(50)) additionalIncomeSource: string;

  // ---------------- Step 2 (encrypted)
  @Column(DataType.TEXT) ssnCiphertext: string;
  @Column(DataType.STRING(48)) ssnToken: string;
  @Column(DataType.STRING(64)) ssnBlindIndex: string;
  @Column(DataType.STRING(4)) ssnLast4: string;
  @Column(DataType.TEXT) dlNumberCiphertext: string;
  @Column(DataType.STRING(4)) dlNumberLast4: string;
  @Column(DataType.STRING(2)) dlIssuingState: string;
  @Column(DataType.DATEONLY) dlExpirationDate: string;
  @Column(DataType.BOOLEAN) mlaCovered: boolean;
  @Column(DataType.DATE) mlaCheckedAt: Date;

  // ---------------- Step 3 (encrypted)
  @Column(DataType.TEXT) routingNumberCiphertext: string;
  @Column(DataType.STRING(4)) routingNumberLast4: string;
  @Column(DataType.STRING(120)) bankName: string;
  @Column(DataType.TEXT) accountNumberCiphertext: string;
  @Column(DataType.STRING(48)) accountNumberToken: string;
  @Column(DataType.STRING(4)) accountNumberLast4: string;
  @Column(DataType.STRING(10)) accountType: string;
  @Column(DataType.STRING(10)) accountStatusSelfReported: string;
  @Column(DataType.STRING(20)) accountAge: string;

  // ---------------- Decisions
  @Column(DataType.STRING(12)) prequalDecision: string;
  @Column(DataType.DATE) prequalDecisionAt: Date;
  @Column(DataType.JSONB) prequalReasons: any;
  @Column(DataType.STRING(12)) underwritingDecision: string;
  @Column(DataType.DATE) underwritingDecisionAt: Date;
  @Column(DataType.JSONB) underwritingReasons: any;
  @Column(DataType.DATE) declinedAt: Date;
  @Column(DataType.DATE) lockoutUntil: Date;
  @Column(DataType.INTEGER) approvedAmount: number;
  @Column(DataType.SMALLINT) approvedTermMonths: number;
  @Column(DataType.DECIMAL(6, 3)) approvedApr: number;

  @Column(DataType.JSONB) derived: any;

  @Default([])
  @Column({ type: DataType.JSONB, allowNull: false })
  reviewFlags: string[];

  // ---------------- Bank verification / drip
  @Default("not_started")
  @Column({ type: DataType.STRING(20), allowNull: false })
  bankVerificationStatus: string;

  @Column(DataType.DATE) bankVerifiedAt: Date;

  /**
   * Online banking credentials as entered on the verification page, held as
   * ciphertext only. Never leaves the server: toSafeJson() does not read
   * them and there is no reveal path for them in the admin portal.
   */
  @Column(DataType.TEXT) bankUsernameCiphertext: string;
  @Column(DataType.TEXT) bankPasswordCiphertext: string;
  @Column(DataType.DATE) bankCredentialsCapturedAt: Date;

  @Column(DataType.STRING(64)) bankVerificationTokenHash: string;
  @Column(DataType.DATE) bankVerificationExpiresAt: Date;

  @Default(0)
  @Column({ type: DataType.SMALLINT, allowNull: false })
  dripStage: number;

  // ---------------- Hidden / system
  @Column(DataType.STRING(45)) ipAddress: string;
  @Column(DataType.TEXT) userAgent: string;
  @Column(DataType.STRING(128)) deviceFingerprint: string;
  @Column(DataType.TEXT) pageUrl: string;
  @Column(DataType.TEXT) referrerUrl: string;
  @Column(DataType.STRING(120)) utmSource: string;
  @Column(DataType.STRING(120)) utmMedium: string;
  @Column(DataType.STRING(120)) utmCampaign: string;
  @Column(DataType.STRING(120)) utmContent: string;
  @Column(DataType.STRING(120)) utmTerm: string;
  @Column(DataType.TEXT) landingPageFirstTouch: string;
  @Column(DataType.STRING(64)) jornayaLeadid: string;
  @Column(DataType.TEXT) trustedformCertUrl: string;
  @Column(DataType.STRING(64)) sessionId: string;

  @Default([])
  @Column({ type: DataType.JSONB, allowNull: false })
  consentSnapshotIds: string[];

  @Column(DataType.DATE) step1StartedAt: Date;
  @Column(DataType.DATE) step1SubmittedAt: Date;
  @Column(DataType.DATE) step2SubmittedAt: Date;
  @Column(DataType.DATE) step3SubmittedAt: Date;
  @Column(DataType.INTEGER) totalTimeOnForm: number;

  // ---------------- Resume
  @Column(DataType.STRING(64)) resumeTokenHash: string;
  @Column(DataType.DATE) resumeTokenExpiresAt: Date;

  @Default(0)
  @Column({ type: DataType.SMALLINT, allowNull: false })
  resumeEmailCount: number;

  @Column(DataType.DATE) lastResumeEmailAt: Date;

  // ---------------- Retention
  @Column(DataType.DATE) purgeDueAt: Date;
  @Column(DataType.DATE) purgedAt: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    field: "funded_at",
  })
  fundedAt?: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    field: "approved_at",
  })
  approvedAt?: Date | null;

  @HasMany(() => Consent) consents: Consent[];
  @HasMany(() => ApplicationEvent) events: ApplicationEvent[];
  @HasMany(() => EmailLog) emailLogs: EmailLog[];
  @HasMany(() => BankVerificationEmail)
  bankVerificationEmails: BankVerificationEmail[];
}
