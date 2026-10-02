/**
 * Every enumerated field in the application spec.
 * Option order here is the option order rendered in the UI (the frontend
 * pulls these from GET /lookup/options so the two can never drift).
 */

/** Field 2 — 17 options, fixed order. */
export const LOAN_PURPOSES = [
  'debt_consolidation',
  'emergency_expenses',
  'medical_expenses',
  'dental_expenses',
  'home_improvement',
  'auto_repair',
  'moving_expenses',
  'wedding_expenses',
  'vacation',
  'education',
  'rent_or_utilities',
  'major_purchase',
  'childcare_expenses',
  'funeral_expenses',
  'tax_payments',
  'business_expenses',
  'other_personal_expenses',
] as const;
export type LoanPurpose = (typeof LOAN_PURPOSES)[number];

export const LOAN_PURPOSE_LABELS: Record<LoanPurpose, string> = {
  debt_consolidation: 'Debt Consolidation',
  emergency_expenses: 'Emergency Expenses',
  medical_expenses: 'Medical Expenses',
  dental_expenses: 'Dental Expenses',
  home_improvement: 'Home Improvement',
  auto_repair: 'Auto Repair',
  moving_expenses: 'Moving Expenses',
  wedding_expenses: 'Wedding Expenses',
  vacation: 'Vacation',
  education: 'Education',
  rent_or_utilities: 'Rent or Utilities',
  major_purchase: 'Major Purchase',
  childcare_expenses: 'Childcare Expenses',
  funeral_expenses: 'Funeral Expenses',
  tax_payments: 'Tax Payments',
  business_expenses: 'Business Expenses',
  other_personal_expenses: 'Other Personal Expenses',
};

/** Field 4 */
export const LOAN_TERMS = [12, 24, 36, 48] as const;

/** Field 8 */
export const SUFFIXES = ['none', 'jr', 'sr', 'ii', 'iii', 'iv'] as const;
export const SUFFIX_LABELS: Record<string, string> = {
  none: 'None',
  jr: 'Jr',
  sr: 'Sr',
  ii: 'II',
  iii: 'III',
  iv: 'IV',
};

/** Field 18 — bucket -> midpoint in months lives in loan-rules.ts */
export const RESIDENCE_TENURE = [
  'under_6_months',
  '6_11_months',
  '1_2_years',
  '3_5_years',
  '5_plus_years',
] as const;
export const RESIDENCE_TENURE_LABELS: Record<string, string> = {
  under_6_months: 'Under 6 months',
  '6_11_months': '6-11 months',
  '1_2_years': '1-2 years',
  '3_5_years': '3-5 years',
  '5_plus_years': '5+ years',
};

/** Field 19 */
export const HOUSING_STATUSES = [
  'rent',
  'own_with_mortgage',
  'own_outright',
  'living_with_family_or_friends',
  'military_housing',
  'other',
] as const;
export const HOUSING_STATUS_LABELS: Record<string, string> = {
  rent: 'Rent',
  own_with_mortgage: 'Own with mortgage',
  own_outright: 'Own outright',
  living_with_family_or_friends: 'Living with family or friends',
  military_housing: 'Military housing',
  other: 'Other',
};

/** Field 20 is required only for these two. */
export const HOUSING_STATUSES_REQUIRING_PAYMENT = ['rent', 'own_with_mortgage'];

/** Field 21 */
export const EMPLOYMENT_STATUSES = [
  'employed_full_time',
  'employed_part_time',
  'self_employed',
  'active_military',
  'retired',
  'disability',
  'social_security',
  'unemployment_benefits',
  'other_benefits',
  'student',
  'not_currently_employed',
] as const;
export const EMPLOYMENT_STATUS_LABELS: Record<string, string> = {
  employed_full_time: 'Employed - Full Time',
  employed_part_time: 'Employed - Part Time',
  self_employed: 'Self-Employed',
  active_military: 'Active Military',
  retired: 'Retired',
  disability: 'Disability',
  social_security: 'Social Security',
  unemployment_benefits: 'Unemployment Benefits',
  other_benefits: 'Other Benefits',
  student: 'Student',
  not_currently_employed: 'Not Currently Employed',
};

/**
 * Fields 23-26 render only for these statuses. For everyone else the employer
 * block is hidden entirely - we do not show fields someone cannot answer.
 */
export const EMPLOYER_FIELD_STATUSES = [
  'employed_full_time',
  'employed_part_time',
  'self_employed',
  'active_military',
];

/** Field 22 */
export const INCOME_TYPES = [
  'employment',
  'self_employment',
  'retirement_or_pension',
  'social_security',
  'disability',
  'unemployment',
  'other',
] as const;
export const INCOME_TYPE_LABELS: Record<string, string> = {
  employment: 'Employment',
  self_employment: 'Self-Employment',
  retirement_or_pension: 'Retirement or Pension',
  social_security: 'Social Security',
  disability: 'Disability',
  unemployment: 'Unemployment',
  other: 'Other',
};

/**
 * Field 22 is auto-derived where employment status makes it unambiguous,
 * and only rendered where it does not.
 */
export const DERIVED_INCOME_TYPE: Record<string, string | null> = {
  employed_full_time: 'employment',
  employed_part_time: 'employment',
  self_employed: 'self_employment',
  active_military: 'employment',
  retired: 'retirement_or_pension',
  disability: 'disability',
  social_security: 'social_security',
  unemployment_benefits: 'unemployment',
  other_benefits: null,
  student: null,
  not_currently_employed: null,
};

/** Field 26 */
export const JOB_TENURE = [
  'under_3_months',
  '3_5_months',
  '6_11_months',
  '1_2_years',
  '3_5_years',
  '5_plus_years',
] as const;
export const JOB_TENURE_LABELS: Record<string, string> = {
  under_3_months: 'Under 3 months',
  '3_5_months': '3-5 months',
  '6_11_months': '6-11 months',
  '1_2_years': '1-2 years',
  '3_5_years': '3-5 years',
  '5_plus_years': '5+ years',
};

/** Field 28 */
export const PAY_FREQUENCIES = [
  'weekly',
  'every_two_weeks',
  'twice_a_month',
  'monthly',
  'irregular',
] as const;
export const PAY_FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  every_two_weeks: 'Every two weeks',
  twice_a_month: 'Twice a month',
  monthly: 'Monthly',
  irregular: 'Irregular',
};

/** Field 36 / 16 */
export const ACCOUNT_TYPES = ['checking', 'savings'] as const;

/** Field 48 - self-reported account status */
export const ACCOUNT_STATUSES = ['positive', 'negative'] as const;
export const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  positive: 'Positive',
  negative: 'Negative',
};

/** Field 49 */
export const ACCOUNT_AGES = [
  'under_6_months',
  '1_year',
  '2_years',
  '3_years',
  '4_years',
  '5_plus_years',
] as const;
export const ACCOUNT_AGE_LABELS: Record<string, string> = {
  under_6_months: 'Under 6 months',
  '1_year': '1 Year',
  '2_years': '2 Years',
  '3_years': '3 Years',
  '4_years': '4 Years',
  '5_plus_years': '5 Years +',
};

/** Consent kinds (fields 48-53 of the consent block). */
export const CONSENT_TYPES = [
  'tcpa',
  'esign',
  'credit_pull_soft',
  'credit_pull_hard',
  'privacy_glba',
  'terms_of_use',
  'ach_authorization',
] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const STEP1_REQUIRED_CONSENTS: ConsentType[] = [
  'tcpa',
  'esign',
  'credit_pull_soft',
  'privacy_glba',
  'terms_of_use',
];
export const STEP2_REQUIRED_CONSENTS: ConsentType[] = ['credit_pull_hard'];
export const STEP3_REQUIRED_CONSENTS: ConsentType[] = ['ach_authorization'];

/** Application lifecycle. */
export const APPLICATION_STATUSES = [
  'step1_started',
  'step1_submitted',
  'prequalified',
  'prequal_declined',
  'step2_submitted',
  'approved',
  'underwriting_declined',
  'step3_submitted',
  'bank_verification_pending',
  'bank_verified',
  'funded',
  'withdrawn',
  'expired',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * Display names for each lifecycle state, used by the applicant-facing
 * status panel and the admin list. `bank_verified` is the stored value for
 * what the product calls "Bank Verification Completed" - the column is not
 * renamed because a status already written to thousands of rows, events and
 * email logs is not worth rewriting for a label.
 */
export const STATUS_LABELS: Record<string, string> = {
  step1_started: 'Started',
  step1_submitted: 'In Progress',
  prequalified: 'Pre-Qualified',
  prequal_declined: 'Not Approved',
  step2_submitted: 'In Underwriting',
  approved: 'Approved',
  underwriting_declined: 'Not Approved',
  step3_submitted: 'Bank Verification Pending',
  bank_verification_pending: 'Bank Verification Pending',
  bank_verified: 'Bank Verification Completed',
  funded: 'Funded',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
};

export const DECLINED_STATUSES: ApplicationStatus[] = [
  'prequal_declined',
  'underwriting_declined',
];

/** Reg B notice - rendered immediately above the income section. */
export const REG_B_NOTICE =
  'Alimony, child support, or separate maintenance income need not be revealed if you do not wish to have it considered as a basis for repaying this obligation.';
