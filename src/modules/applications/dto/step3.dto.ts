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
import { TrackingDto } from './tracking.dto';
import { ConsentDto } from './consent.dto';
import { ACCOUNT_AGES, ACCOUNT_STATUSES, ACCOUNT_TYPES } from '../../../common/utils/enums';

/**
 * Step 3 - bank & funding. Reached only after underwriting approval, so
 * declined applicants never have bank credentials in the database.
 *
 * Instant Account Verification (Plaid / MX / Finicity) is intentionally NOT
 * used on this build - these manual fields are the only path.
 */
export class Step3Dto {
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

  /** ACH authorisation is required here and nowhere else. */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConsentDto)
  consents: ConsentDto[];

  @IsOptional() @ValidateNested() @Type(() => TrackingDto) tracking?: TrackingDto;
}
