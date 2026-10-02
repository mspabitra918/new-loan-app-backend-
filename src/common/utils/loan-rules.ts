/**
 * Loan product rules and the DERIVED FIELDS block from the spec.
 * Nothing in here is ever collected from the applicant - it is all computed.
 */
import { getStateRule } from './us-states';
import { ageFromDob } from './validators';

export const AMOUNT_MIN = 2000;
export const AMOUNT_MAX = 50000;
export const AMOUNT_STEP = 500;
export const AMOUNT_DEFAULT = 10000;

/** Below this principal the 48-month term is suppressed. */
export const LONG_TERM_MIN_AMOUNT = 5000;

/**
 * Fixed product APR. Single rate for every approved applicant, in every
 * state, regardless of credit tier. The decision service still takes the
 * lower of this and the state's regulatory ceiling.
 */
export const DEFAULT_APR = 10;

/** Bucket -> midpoint in months (derived fields: job tenure, residence tenure). */
export const RESIDENCE_TENURE_MONTHS: Record<string, number> = {
  under_6_months: 3,
  '6_11_months': 9,
  '1_2_years': 18,
  '3_5_years': 48,
  '5_plus_years': 78,
};

export const JOB_TENURE_MONTHS: Record<string, number> = {
  under_3_months: 1.5,
  '3_5_months': 4,
  '6_11_months': 9,
  '1_2_years': 18,
  '3_5_years': 48,
  '5_plus_years': 78,
};

export const ACCOUNT_AGE_MONTHS: Record<string, number> = {
  under_6_months: 3,
  '1_year': 12,
  '2_years': 24,
  '3_years': 36,
  '4_years': 48,
  '5_plus_years': 66,
};

/** Pay periods per year, used to normalise pay frequency to a monthly figure. */
export const PAY_PERIODS_PER_YEAR: Record<string, number> = {
  weekly: 52,
  every_two_weeks: 26,
  twice_a_month: 24,
  monthly: 12,
  irregular: 12,
};

/** Effective gross-up factor applied to net pay to estimate gross annual income. */
const GROSS_UP_FACTOR = 1.25;

export function clampAmount(amount: number, state?: string): number {
  const rule = state ? getStateRule(state) : null;
  const max = rule?.licensed ? Math.min(AMOUNT_MAX, rule.maxAmount) : AMOUNT_MAX;
  const min = rule?.licensed ? Math.max(AMOUNT_MIN, rule.minAmount) : AMOUNT_MIN;
  const stepped = Math.round(amount / AMOUNT_STEP) * AMOUNT_STEP;
  return Math.min(max, Math.max(min, stepped));
}

export function isValidAmount(amount: number, state?: string): boolean {
  if (!Number.isInteger(amount)) return false;
  if (amount % AMOUNT_STEP !== 0) return false;
  const rule = state ? getStateRule(state) : null;
  const max = rule?.licensed ? Math.min(AMOUNT_MAX, rule.maxAmount) : AMOUNT_MAX;
  const min = rule?.licensed ? Math.max(AMOUNT_MIN, rule.minAmount) : AMOUNT_MIN;
  return amount >= min && amount <= max;
}

/**
 * Standard amortised installment.
 * f(amount, term, APR) from the derived-fields table.
 */
export function estimatedInstallment(amount: number, termMonths: number, apr: number): number {
  if (!amount || !termMonths) return 0;
  const r = apr / 100 / 12;
  if (r === 0) return round2(amount / termMonths);
  const factor = Math.pow(1 + r, termMonths);
  return round2((amount * r * factor) / (factor - 1));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Field 4 - term options filtered by amount, state and affordability.
 *  - 48-month suppressed under $3,000
 *  - 12-month suppressed where the installment breaches the affordability floor
 *
 * `totalMonthlyIncome` is optional: Step 1 renders the term dropdown before
 * income is known, so we filter on amount/state first and re-filter on change.
 */
export function availableTerms(
  amount: number,
  state: string,
  totalMonthlyIncome?: number,
  apr = DEFAULT_APR,
  ptiMax = 0.15,
): number[] {
  const rule = getStateRule(state);
  let terms = rule?.licensed ? [...rule.allowedTerms] : [12, 24, 36, 48];

  if (amount < LONG_TERM_MIN_AMOUNT) terms = terms.filter((t) => t !== 48);

  if (totalMonthlyIncome && totalMonthlyIncome > 0) {
    terms = terms.filter((t) => {
      const installment = estimatedInstallment(amount, t, apr);
      return installment / totalMonthlyIncome <= ptiMax;
    });
    // Never return an empty dropdown: keep the longest (cheapest) term so the
    // applicant can still submit and be reviewed rather than dead-ended.
    if (terms.length === 0) {
      const fallback = rule?.licensed ? rule.allowedTerms : [12, 24, 36, 48];
      terms = [Math.max(...fallback.filter((t) => (amount < LONG_TERM_MIN_AMOUNT ? t !== 48 : true)))];
    }
  }

  return terms.sort((a, b) => a - b);
}

// ------------------------------------------------------------ derived fields

export interface DerivedFields {
  applicantAge: number | null;
  totalMonthlyIncome: number;
  grossAnnualIncomeEstimate: number;
  debtToIncomeRatio: number | null;
  paymentToIncomeRatio: number | null;
  disposableIncome: number | null;
  jobTenureMonths: number | null;
  residenceTenureMonths: number | null;
  accountAgeMonths: number | null;
  estimatedInstallment: number | null;
  estimatedApr: number;
}

export interface DerivedInput {
  dateOfBirth?: string | Date | null;
  netMonthlyIncome?: number | null;
  additionalMonthlyIncome?: number | null;
  monthlyHousingPayment?: number | null;
  /** From the bureau pull; 0 until a pull has happened. */
  bureauMonthlyObligations?: number | null;
  loanAmount?: number | null;
  loanTermMonths?: number | null;
  apr?: number | null;
  jobTenure?: string | null;
  residenceTenure?: string | null;
  accountAge?: string | null;
}

export function computeDerivedFields(input: DerivedInput, defaultApr = DEFAULT_APR): DerivedFields {
  const net = num(input.netMonthlyIncome);
  const additional = num(input.additionalMonthlyIncome);
  const housing = num(input.monthlyHousingPayment);
  const obligations = num(input.bureauMonthlyObligations);
  const apr = input.apr != null ? Number(input.apr) : defaultApr;

  const totalMonthlyIncome = round2(net + additional);
  const grossAnnual = round2(totalMonthlyIncome * 12 * GROSS_UP_FACTOR);

  const installment =
    input.loanAmount && input.loanTermMonths
      ? estimatedInstallment(Number(input.loanAmount), Number(input.loanTermMonths), apr)
      : null;

  return {
    applicantAge: input.dateOfBirth ? ageFromDob(input.dateOfBirth as any) : null,
    totalMonthlyIncome,
    grossAnnualIncomeEstimate: grossAnnual,
    debtToIncomeRatio:
      totalMonthlyIncome > 0 ? round4((housing + obligations) / totalMonthlyIncome) : null,
    paymentToIncomeRatio:
      totalMonthlyIncome > 0 && installment != null
        ? round4(installment / totalMonthlyIncome)
        : null,
    disposableIncome:
      totalMonthlyIncome > 0 ? round2(totalMonthlyIncome - housing - obligations) : null,
    jobTenureMonths: input.jobTenure ? JOB_TENURE_MONTHS[input.jobTenure] ?? null : null,
    residenceTenureMonths: input.residenceTenure
      ? RESIDENCE_TENURE_MONTHS[input.residenceTenure] ?? null
      : null,
    accountAgeMonths: input.accountAge ? ACCOUNT_AGE_MONTHS[input.accountAge] ?? null : null,
    estimatedInstallment: installment,
    estimatedApr: apr,
  };
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * MLA covered-borrower check is only required when a product can price above
 * 36% MAPR. We never ask the applicant for military status.
 */
export function requiresMlaCheck(state: string, apr: number): boolean {
  const rule = getStateRule(state);
  const effective = rule ? Math.min(apr, rule.maxApr) : apr;
  return effective > 36;
}
