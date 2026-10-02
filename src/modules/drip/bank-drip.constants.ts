import type { TemplateKey } from '../mail/templates';

/** A schedule row's lifecycle. */
export const DRIP_STATUSES = ['scheduled', 'sending', 'sent', 'failed', 'cancelled'] as const;
export type DripStatus = (typeof DRIP_STATUSES)[number];

/**
 * The sequence, in order. Position N here is paired with offset N in
 * `drip.bankOffsetHours` - by default 0, 12, 24, 36, 48 and 60 hours, so the
 * first goes out the moment Step 3 is submitted and one follows every twelve
 * hours after that.
 *
 * The templates are named by position rather than by day precisely because
 * the offsets are configurable: change the timing and nothing here has to be
 * renamed. The scheduler writes `min(templates, offsets)` rows, so the two
 * lists cannot drift into sending a template at an undefined time.
 */
export const DRIP_SEQUENCE: TemplateKey[] = [
  'bank_verification_1_initial',
  'bank_verification_2_reminder',
  'bank_verification_3_followup',
  'bank_verification_4_holding',
  'bank_verification_5_urgent',
  'bank_verification_6_final',
];

/**
 * Which day of the sequence an offset falls on. Derived rather than stored
 * so it always agrees with the configured timing: at the default offsets
 * this gives two emails on each of days 1, 2 and 3.
 */
export const dayForOffset = (offsetHours: number) => Math.floor(offsetHours / 24) + 1;

/**
 * Statuses at which the drip has nothing left to chase. Reaching one of
 * these cancels every row that has not gone out yet.
 */
export const TERMINAL_STATUSES = new Set([
  'bank_verified',
  'funded',
  'withdrawn',
  'expired',
  'underwriting_declined',
  'prequal_declined',
]);

/** Why a row stopped. Stored on the row so the portal can explain itself. */
export type CancelReason =
  | 'bank_verified'
  | 'resubmitted'
  | 'purged'
  | 'terminal_status'
  | 'window_expired'
  | 'admin'
  | 'retention';
