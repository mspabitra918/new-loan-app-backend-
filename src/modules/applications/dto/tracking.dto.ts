import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * HIDDEN / SYSTEM FIELDS posted alongside every step.
 * IP and user agent are taken from the request, not from here.
 */
export class TrackingDto {
  @IsOptional() @IsString() @MaxLength(128) deviceFingerprint?: string;
  @IsOptional() @IsString() @MaxLength(2000) pageUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) referrerUrl?: string;
  @IsOptional() @IsString() @MaxLength(120) utmSource?: string;
  @IsOptional() @IsString() @MaxLength(120) utmMedium?: string;
  @IsOptional() @IsString() @MaxLength(120) utmCampaign?: string;
  @IsOptional() @IsString() @MaxLength(120) utmContent?: string;
  @IsOptional() @IsString() @MaxLength(120) utmTerm?: string;
  @IsOptional() @IsString() @MaxLength(2000) landingPageFirstTouch?: string;

  /** Jornaya LeadiD certificate - required evidence for a TCPA defence. */
  @IsOptional() @IsString() @MaxLength(64) jornayaLeadid?: string;
  /** TrustedForm certificate URL. */
  @IsOptional() @IsString() @MaxLength(2000) trustedformCertUrl?: string;

  @IsOptional() @IsString() @MaxLength(64) sessionId?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;

  @IsOptional() @IsInt() @Min(0) @Max(86_400) timeOnForm?: number;
}
