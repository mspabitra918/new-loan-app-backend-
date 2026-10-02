import { Injectable, Logger } from '@nestjs/common';
import * as dns from 'dns';
import { FEDACH_SAMPLE } from './routing-numbers.data';
import {
  isValidRoutingNumber,
  isValidEmailSyntax,
  isDisposableEmail,
  suggestEmailCorrection,
  isValidUsPhone,
  digitsOnly,
} from '../../common/utils/validators';
import {
  isZipValidForState,
  stateForZip,
  getStateRule,
  STATE_OPTIONS,
} from '../../common/utils/us-states';
import {
  AMOUNT_DEFAULT,
  AMOUNT_MAX,
  AMOUNT_MIN,
  DEFAULT_APR,
  availableTerms,
  clampAmount,
} from '../../common/utils/loan-rules';

export interface EmailCheckResult {
  valid: boolean;
  reason?: 'syntax' | 'disposable' | 'no_mx';
  suggestion?: string | null;
  /** Soft signals never hard-block - they flag for review. */
  flag?: string | null;
}

export interface PhoneCheckResult {
  valid: boolean;
  formatted?: string;
  lineType?: 'mobile' | 'landline' | 'voip' | 'unknown';
  /** VOIP is a soft signal: flag for review, do not block. */
  flag?: string | null;
}

@Injectable()
export class LookupService {
  private readonly logger = new Logger(LookupService.name);
  private mxCache = new Map<string, { ok: boolean; at: number }>();
  private static readonly MX_TTL_MS = 6 * 60 * 60 * 1000;

  /** Field 9 - syntax + MX + disposable blocklist + typo prompt. */
  async checkEmail(email: string): Promise<EmailCheckResult> {
    const value = (email || '').trim().toLowerCase();
    const suggestion = suggestEmailCorrection(value);

    if (!isValidEmailSyntax(value)) {
      return { valid: false, reason: 'syntax', suggestion };
    }
    if (isDisposableEmail(value)) {
      return { valid: false, reason: 'disposable', suggestion };
    }

    const domain = value.split('@')[1];
    const hasMx = await this.hasMxRecord(domain);
    if (!hasMx) {
      return { valid: false, reason: 'no_mx', suggestion };
    }
    return { valid: true, suggestion };
  }

  private async hasMxRecord(domain: string): Promise<boolean> {
    const cached = this.mxCache.get(domain);
    if (cached && Date.now() - cached.at < LookupService.MX_TTL_MS) return cached.ok;

    let ok = false;
    try {
      const records = await dns.promises.resolveMx(domain);
      ok = Array.isArray(records) && records.length > 0;
      if (!ok) {
        // Some domains accept mail on the A record with no MX.
        const a = await dns.promises.resolve4(domain).catch(() => []);
        ok = a.length > 0;
      }
    } catch {
      ok = false;
    }
    this.mxCache.set(domain, { ok, at: Date.now() });
    return ok;
  }

  /**
   * Field 11 - format + NPA/NXX rules + line-type lookup.
   * The line-type carrier API (Twilio Lookup / Telnyx) plugs in here; until it
   * is wired we return 'unknown' and flag nothing, because a soft signal must
   * never hard-block (validation rule 2).
   */
  async checkPhone(phone: string): Promise<PhoneCheckResult> {
    const d = digitsOnly(phone);
    if (!isValidUsPhone(d)) return { valid: false };

    const lineType = await this.lookupLineType(d);
    return {
      valid: true,
      formatted: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`,
      lineType,
      flag: lineType === 'voip' ? 'voip_phone' : null,
    };
  }

  private async lookupLineType(
    digits: string,
  ): Promise<'mobile' | 'landline' | 'voip' | 'unknown'> {
    // Placeholder for the carrier lookup provider. Returning 'unknown' keeps
    // the application flowing; the underwriting screen shows the flag when a
    // real provider later reports VOIP.
    void digits;
    return 'unknown';
  }

  /** Field 17 */
  checkZip(zip: string, state: string) {
    const valid = isZipValidForState(zip, state);
    return {
      valid,
      zip,
      state,
      suggestedState: valid ? state : stateForZip(zip),
    };
  }

  /** Fields 43 + 44 - checksum, then FedACH participant lookup for the bank name. */
  lookupRoutingNumber(routing: string) {
    const d = digitsOnly(routing);
    if (!isValidRoutingNumber(d)) {
      return { valid: false, reason: 'checksum', bankName: null as string | null };
    }
    const bankName = FEDACH_SAMPLE[d] || null;
    return {
      valid: true,
      // Not in the participant file: flag for review rather than block.
      inFedachFile: !!bankName,
      bankName,
      flag: bankName ? null : 'routing_not_in_fedach_file',
    };
  }

  /**
   * Product rules the Step 1 form needs on every amount/state change.
   * Bounds come from the shared product constants, never from literals, so a
   * change to the product envelope cannot leave the slider on stale limits.
   */
  productRules(amount: number, state: string, totalMonthlyIncome?: number, apr = DEFAULT_APR) {
    const rule = getStateRule(state);
    const licensed = !!rule?.licensed;
    return {
      state,
      licensed,
      minAmount: licensed ? Math.max(AMOUNT_MIN, rule.minAmount) : AMOUNT_MIN,
      maxAmount: licensed ? Math.min(AMOUNT_MAX, rule.maxAmount) : AMOUNT_MAX,
      defaultAmount: AMOUNT_DEFAULT,
      clampedAmount: clampAmount(amount, state),
      terms: availableTerms(amount, state, totalMonthlyIncome, apr),
    };
  }

  states() {
    return STATE_OPTIONS;
  }
}
