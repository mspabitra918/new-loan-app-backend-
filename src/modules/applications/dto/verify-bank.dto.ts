import { IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TrackingDto } from './tracking.dto';

/**
 * Bank verification.
 *
 * The credentials are encrypted the moment they reach the service and are
 * never echoed back to any client. They are also matched by name in the log
 * redactor, so neither the request log nor an exception can carry them.
 */
export class VerifyBankDto {
  @IsString()
  @Length(2, 100)
  bankUsername: string;

  @IsString()
  @Length(4, 200)
  bankPassword: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TrackingDto)
  tracking?: TrackingDto;
}
