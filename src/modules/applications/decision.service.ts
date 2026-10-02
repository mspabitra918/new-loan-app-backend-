import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Application } from '../../database/models';
import { computeDerivedFields, DerivedFields, requiresMlaCheck } from '../../common/utils/loan-rules';
import { getStateRule } from '../../common/utils/us-states';

export interface Decision {
  outcome: 'approved' | 'declined' | 'review';
  reasons: string[];
  /** Consumer-facing wording for the adverse action / decline email. */
  consumerReasons: string[];
  derived: DerivedFields;
  offer?: {
    amount: number;
    termMonths: number;
    apr: number;
    installment: number;
  };
}

/**
 * Decisioning.
 *
 * This is a deterministic rules engine standing in for the bureau integration.
 * `bureauMonthlyObligations` is 0 until a real soft/hard pull is wired in -
 * every formula that consumes it already accounts for it, so plugging in a
 * bureau response is a matter of populating that one input.
 */
@Injectable()
export class DecisionService {
  private readonly logger = new Logger(DecisionService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Temporary switch (ALLOW_ALL_TO_FINAL_STEP): nobody is declined, so every
   * applicant reaches Step 3 and submits their bank details.
   *
   * The rules below still run. What they found is kept on the application as
   * `decision_bypassed` plus each reason prefixed with `bypassed:`, so the
   * decision history survives and flipping the flag back restores the old
   * behaviour with nothing to undo.
   */
  private get bypassDeclines(): boolean {
    return this.config.get<boolean>('policy.allowAllToFinalStep') === true;
  }

  private markBypassed(reasons: string[]): string[] {
    return ['decision_bypassed', ...reasons.map((r) => `bypassed:${r}`)];
  }

  /** Soft-pull pre-qualification, run at the end of Step 1. */
  prequalify(app: Application, bureauMonthlyObligations = 0): Decision {
    const apr = this.aprFor(app.state);
    const derived = computeDerivedFields(
      {
        dateOfBirth: app.dateOfBirth,
        netMonthlyIncome: app.netMonthlyIncome,
        additionalMonthlyIncome: app.additionalMonthlyIncome,
        monthlyHousingPayment: app.monthlyHousingPayment,
        bureauMonthlyObligations,
        loanAmount: app.loanAmount,
        loanTermMonths: app.loanTermMonths,
        apr,
        jobTenure: app.timeAtCurrentJob,
        residenceTenure: app.timeAtCurrentAddress,
      },
      this.config.get<number>('policy.defaultApr'),
    );

    const reasons: string[] = [];
    const consumerReasons: string[] = [];

    const stateRule = getStateRule(app.state);
    if (!stateRule?.licensed) {
      reasons.push('state_not_licensed');
      consumerReasons.push('We are not currently licensed to lend in your state.');
    }

    if (derived.applicantAge != null && derived.applicantAge < 18) {
      reasons.push('under_18');
      consumerReasons.push('Applicants must be at least 18 years old.');
    }

    if (derived.totalMonthlyIncome < 1000) {
      reasons.push('income_below_minimum');
      consumerReasons.push('Your stated income is below our minimum for this product.');
    }

    if (derived.debtToIncomeRatio != null && derived.debtToIncomeRatio > 0.6) {
      reasons.push('dti_above_60');
      consumerReasons.push('Your existing obligations are high relative to your income.');
    }

    if (derived.disposableIncome != null && derived.disposableIncome < 400) {
      reasons.push('insufficient_disposable_income');
      consumerReasons.push('Your income after housing costs is below our threshold.');
    }

    const ptiMax = this.config.get<number>('policy.affordabilityPtiMax');
    if (derived.paymentToIncomeRatio != null && derived.paymentToIncomeRatio > ptiMax * 1.5) {
      reasons.push('payment_unaffordable');
      consumerReasons.push('The payment on the amount requested would be unaffordable.');
    }

    if (app.employmentStatus === 'not_currently_employed' && derived.totalMonthlyIncome < 1500) {
      reasons.push('no_verifiable_income_source');
      consumerReasons.push('We could not identify a verifiable source of repayment.');
    }

    const bypassed = reasons.length > 0 && this.bypassDeclines;
    if (bypassed) {
      this.logger.warn(
        `Pre-qualification decline bypassed for ${app.applicationId}: ` +
          `${reasons.join(', ')} (ALLOW_ALL_TO_FINAL_STEP).`,
      );
    }
    const outcome: Decision['outcome'] = reasons.length === 0 || bypassed ? 'approved' : 'declined';

    return {
      outcome,
      reasons: bypassed ? this.markBypassed(reasons) : reasons,
      // Suppressed with the decline itself - no adverse action is being taken.
      consumerReasons: bypassed ? [] : consumerReasons,
      derived,
      offer:
        outcome === 'approved'
          ? {
              amount: app.loanAmount,
              termMonths: app.loanTermMonths,
              apr,
              installment: derived.estimatedInstallment ?? 0,
            }
          : undefined,
    };
  }

  /**
   * Full underwriting, run after Step 2.
   * A 'review' outcome holds the application for a human rather than
   * declining it - soft signals must never hard-block.
   */
  underwrite(app: Application, bureauMonthlyObligations = 0): Decision {
    const base = this.prequalify(app, bureauMonthlyObligations);
    if (base.outcome === 'declined') return base;

    const reasons: string[] = [];
    const consumerReasons: string[] = [];

    // Identity checks that only become possible at Step 2.
    if (app.dlExpirationDate && new Date(app.dlExpirationDate) < new Date()) {
      reasons.push('expired_identification');
      consumerReasons.push('The identification provided has expired.');
    }

    if (app.mlaCovered === true && base.offer && base.offer.apr > 36) {
      // A covered borrower cannot be charged above 36% MAPR. Re-price rather
      // than decline - the applicant is not at fault.
      base.offer.apr = 35.99;
      reasons.push('mla_repriced_to_36_mapr_cap');
    }

    const flags: string[] = Array.isArray(app.reviewFlags) ? app.reviewFlags : [];
    const holdForReview =
      flags.includes('income_above_20000') ||
      flags.includes('income_below_1200') ||
      flags.includes('negative_account_status');

    const blocking = reasons.filter((r) => r !== 'mla_repriced_to_36_mapr_cap');
    if (blocking.length > 0) {
      if (!this.bypassDeclines) {
        return { ...base, outcome: 'declined', reasons, consumerReasons };
      }
      this.logger.warn(
        `Underwriting decline bypassed for ${app.applicationId}: ` +
          `${blocking.join(', ')} (ALLOW_ALL_TO_FINAL_STEP).`,
      );
      // Hold it for a human instead of declining. 'review' still opens Step 3.
      return {
        ...base,
        outcome: 'review',
        reasons: [...base.reasons, ...this.markBypassed(reasons), 'manual_review_required'],
        consumerReasons: [],
      };
    }

    return {
      ...base,
      outcome: holdForReview ? 'review' : 'approved',
      reasons: [...base.reasons, ...reasons, ...(holdForReview ? ['manual_review_required'] : [])],
      consumerReasons,
    };
  }

  private aprFor(state: string): number {
    const base = this.config.get<number>('policy.defaultApr');
    const rule = getStateRule(state);
    return rule ? Math.min(base, rule.maxApr) : base;
  }

  /**
   * MLA covered-borrower check.
   *
   * Never asked as a form field - an applicant's answer is unreliable, and a
   * wrong answer on a product that can price above 36% MAPR is a real problem.
   * Runs server-side against name + DOB + SSN. Required only where a product
   * can price above 36% MAPR; elsewhere we skip the lookup entirely.
   */
  async checkMlaCoveredBorrower(input: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    ssn: string;
    state: string;
  }): Promise<{ required: boolean; covered: boolean | null }> {
    const apr = this.aprFor(input.state);
    if (!requiresMlaCheck(input.state, apr)) {
      return { required: false, covered: null };
    }

    // Integration point for the DMDC MLA web service. Until it is wired,
    // return `covered: null` so underwriting treats it as "unknown" rather
    // than falsely asserting the applicant is not a covered borrower.
    this.logger.warn(
      'MLA covered-borrower check is required for this product but no DMDC ' +
        'integration is configured. Returning unknown.',
    );
    return { required: true, covered: null };
  }
}
