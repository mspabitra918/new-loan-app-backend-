import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Step1Dto } from './step1.dto';
import { ConsentDto } from './consent.dto';
import { STATE_CODES } from '../../../common/utils/us-states';
import { ACCOUNT_AGES, ACCOUNT_STATUSES, ACCOUNT_TYPES } from '../../../common/utils/enums';

/**
 * The whole application in one payload.
 *
 * The form is still three screens, but they are three screens of one form:
 * the applicant moves through them with Next and Back and nothing leaves the
 * browser until they press submit. Everything below is therefore posted
 * together to POST /applications/submit.
 *
 * Inherits every screen 1 field and rule unchanged, then adds the identity
 * and banking fields that used to arrive on their own requests. The consents
 * from all three screens come up in one array and are split back out by the
 * step recorded on each consent template, so each evidence row still carries
 * the screen it was shown on.
 *
 * There is no application id on the way in: an application is created by this
 * request or not at all.
 */
export class SubmitApplicationDto extends Step1Dto {
  // ---------------- Identity (was Step 2)

  /** Field 33. Digits or XXX-XX-XXXX; validated by rule, not by regex alone. */
  @IsString() @Length(9, 11) ssn: string;

  /** Field 34 - must match. Paste disabled client-side. */
  @IsString() @Length(9, 11) confirmSsn: string;

  /** Field 35 - 1-20 alphanumeric, checked against the per-state pattern table. */
  @IsString() @Length(1, 20) driversLicenseNumber: string;

  /** Field 36 - defaults to residence state client-side, override allowed. */
  @IsIn(STATE_CODES) dlIssuingState: string;

  /** Field 37 - must be a future date. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/) dlExpirationDate: string;

  // ---------------- Bank & funding (was Step 3)

  /** Field 43 - 9 digits, ABA checksum, FedACH participant lookup. */
  @Matches(/^\d{9}$/, { message: 'Enter the 9-digit routing number.' }) routingNumber: string;

  /**
   * Field 44 - typed by the applicant. If it is left out, the server falls
   * back to the FedACH name for the routing number.
   */
  @IsOptional() @IsString() @Length(2, 120) bankName?: string;

  /** Field 45 - 4 to 17 digits. */
  @Matches(/^\d{4,17}$/, { message: 'Enter your account number (4-17 digits).' })
  accountNumber: string;

  /** Field 46 - must match. Paste disabled client-side. */
  @Matches(/^\d{4,17}$/) confirmAccountNumber: string;

  /** Field 47 */
  @IsIn(ACCOUNT_TYPES as unknown as string[]) accountType: string;

  /** Field 48 - self-reported. */
  @IsIn(ACCOUNT_STATUSES as unknown as string[]) accountStatusSelfReported: string;

  /** Field 49 */
  @IsIn(ACCOUNT_AGES as unknown as string[]) accountAge: string;

  // ---------------- Consents

  /**
   * Every checkbox from all three screens. Five are required on the loan
   * request, one authorises the hard pull and one authorises ACH - seven is
   * the floor, and the exact required set is still enforced per step when the
   * evidence rows are written.
   */
  @IsArray()
  @ArrayMinSize(7)
  @ValidateNested({ each: true })
  @Type(() => ConsentDto)
  consents: ConsentDto[];
}
