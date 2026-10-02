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
import { STATE_CODES } from '../../../common/utils/us-states';

/**
 * Step 2 - identity verification. Reachable only after a pre-qualification
 * pass, so applicants who fail Step 1 never have an SSN stored for them.
 *
 * Nothing on this DTO is ever logged, echoed back, or placed in a URL.
 * Military status is NOT collected - the MLA covered-borrower check runs
 * server-side against name + DOB + SSN.
 */
export class Step2Dto {
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

  /** Hard credit pull authorisation is required here. */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConsentDto)
  consents: ConsentDto[];

  @IsOptional() @ValidateNested() @Type(() => TrackingDto) tracking?: TrackingDto;
}
