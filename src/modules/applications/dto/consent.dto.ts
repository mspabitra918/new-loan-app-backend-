import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CONSENT_TYPES, ConsentType } from '../../../common/utils/enums';

export class ConsentDto {
  @IsIn(CONSENT_TYPES as unknown as string[])
  type: ConsentType;

  /** The true state of the checkbox. Never defaulted to true. */
  @IsBoolean()
  accepted: boolean;

  /** Version the browser rendered; a mismatch forces a re-consent. */
  @IsOptional() @IsString() @MaxLength(20) versionId?: string;

  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
}
