import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  Matches,
  ValidateNested,
  IsEmail,
} from 'class-validator';
import { TrackingDto } from './tracking.dto';
import { ConsentDto } from './consent.dto';
import {
  EMPLOYMENT_STATUSES,
  HOUSING_STATUSES,
  INCOME_TYPES,
  JOB_TENURE,
  LOAN_PURPOSES,
  LOAN_TERMS,
  PAY_FREQUENCIES,
  RESIDENCE_TENURE,
  SUFFIXES,
} from '../../../common/utils/enums';
import { STATE_CODES } from '../../../common/utils/us-states';

/**
 * Step 1 - loan request, contact, residence, income.
 * Everything needed for a soft-pull pre-qualification. No SSN, no DL,
 * no bank credentials on this step.
 *
 * Cross-field and conditional rules (fields 3, 20, 23-26, 29, 32, plus
 * ZIP/state and term/amount) are enforced in Step1Validator, which produces
 * a field-keyed error map the form renders inline.
 */
export class Step1Dto {
  // ---------------- 1.1 Loan request
  @IsInt() @Min(2000) @Max(50000) loanAmount: number;

  @IsIn(LOAN_PURPOSES as unknown as string[]) loanPurpose: string;

  /** Field 3 - required only when purpose = other_personal_expenses. */
  @IsOptional() @IsString() @Length(3, 120) loanPurposeOther?: string;

  @IsIn(LOAN_TERMS as unknown as number[]) loanTermMonths: number;

  // ---------------- 1.2 Identity
  @IsString() @Length(2, 40) firstName: string;

  @IsOptional() @Matches(/^[A-Za-z]$/, { message: 'Middle initial must be a single letter.' })
  middleInitial?: string;

  @IsString() @Length(2, 40) lastName: string;

  @IsOptional() @IsIn(SUFFIXES as unknown as string[]) suffix?: string;

  @IsEmail({}, { message: 'Enter a valid email address.' }) @Length(5, 254) email: string;

  /** Field 10 - must match email. Paste is disabled client-side. */
  @IsString() @Length(5, 254) confirmEmail: string;

  @IsString() @Length(10, 20) phone: string;

  /** Field 12 - MM/DD/YYYY in the UI, ISO on the wire. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Enter your date of birth as MM/DD/YYYY.' })
  dateOfBirth: string;

  // ---------------- 1.3 Residence
  @IsString() @Length(5, 100) streetAddress: string;
  @IsOptional() @IsString() @Length(1, 20) aptUnit?: string;
  @IsString() @Length(2, 50) city: string;
  @IsIn(STATE_CODES) state: string;
  @Matches(/^\d{5}$/, { message: 'Enter a 5-digit ZIP code.' }) zipCode: string;

  /** Optional mailing address - the only place a PO Box is accepted. */
  @IsOptional() @IsString() @Length(5, 100) mailingStreetAddress?: string;
  @IsOptional() @IsString() @Length(1, 20) mailingAptUnit?: string;
  @IsOptional() @IsString() @Length(2, 50) mailingCity?: string;
  @IsOptional() @IsIn(STATE_CODES) mailingState?: string;
  @IsOptional() @Matches(/^\d{5}$/) mailingZipCode?: string;

  @IsIn(RESIDENCE_TENURE as unknown as string[]) timeAtCurrentAddress: string;
  @IsIn(HOUSING_STATUSES as unknown as string[]) housingStatus: string;

  /** Field 20 - required when housing status is rent or own_with_mortgage. */
  @IsOptional() @IsInt() @Min(0) @Max(15000) monthlyHousingPayment?: number;

  // ---------------- 1.4 Employment & income
  @IsIn(EMPLOYMENT_STATUSES as unknown as string[]) employmentStatus: string;

  /** Field 22 - auto-derived where unambiguous, sent only where it is not. */
  @IsOptional() @IsIn(INCOME_TYPES as unknown as string[]) primaryIncomeType?: string;

  @IsOptional() @IsString() @Length(2, 60) employerName?: string;
  @IsOptional() @IsString() @Length(2, 50) jobTitle?: string;
  @IsOptional() @IsString() @Length(10, 20) employerPhone?: string;
  @IsOptional() @IsIn(JOB_TENURE as unknown as string[]) timeAtCurrentJob?: string;

  /** Field 27 - take-home pay after taxes. */
  @IsInt() @Min(500) @Max(50000) netMonthlyIncome: number;

  @IsIn(PAY_FREQUENCIES as unknown as string[]) payFrequency: string;

  /** Field 29 - required unless pay frequency is irregular. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) nextPayDate?: string;

  @IsBoolean() directDeposit: boolean;

  /** Field 31 - optional by design. This is where the Reg B notice earns its place. */
  @IsOptional() @IsInt() @Min(0) @Max(20000) additionalMonthlyIncome?: number;

  /** Field 32 - required when additional income > 0. */
  @IsOptional() @IsString() @Length(2, 50) additionalIncomeSource?: string;

  // ---------------- Consents & tracking
  @IsArray()
  @ArrayMinSize(5)
  @ValidateNested({ each: true })
  @Type(() => ConsentDto)
  consents: ConsentDto[];

  @IsOptional() @ValidateNested() @Type(() => TrackingDto) tracking?: TrackingDto;
}
