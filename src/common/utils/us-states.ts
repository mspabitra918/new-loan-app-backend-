/**
 * Single source of truth for state-level rules.
 * Used by: loan amount cap, term filtering, ZIP -> state validation,
 * driver's licence format validation, and licensing/eligibility checks.
 */

export interface StateRule {
  code: string;
  name: string;
  /**
   * Whether the brand is licensed to lend in this state at all.
   * Currently true for all 50 states and DC. Flip a single row to false to
   * withdraw from a state - every amount, term and eligibility check reads
   * this table, so nothing else needs to change.
   */
  licensed: boolean;
  /** Hard cap on principal for this state (USD). */
  maxAmount: number;
  minAmount: number;
  /** Terms the state permits, before amount/affordability filtering. */
  allowedTerms: number[];
  /**
   * Max APR the state permits. This is the regulatory ceiling, not our price:
   * the product rate is fixed (see DEFAULT_APR) and the decision service
   * charges the lower of the two. It also drives the MLA 36% MAPR check.
   */
  maxApr: number;
}

const ALL_TERMS = [12, 24, 36, 48];

export const STATE_RULES: Record<string, StateRule> = {
  AL: { code: 'AL', name: 'Alabama', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  AK: { code: 'AK', name: 'Alaska', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  AZ: { code: 'AZ', name: 'Arizona', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  AR: { code: 'AR', name: 'Arkansas', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 17 },
  CA: { code: 'CA', name: 'California', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  CO: { code: 'CO', name: 'Colorado', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  CT: { code: 'CT', name: 'Connecticut', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 12 },
  DE: { code: 'DE', name: 'Delaware', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  DC: { code: 'DC', name: 'District of Columbia', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 24 },
  FL: { code: 'FL', name: 'Florida', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 30.99 },
  GA: { code: 'GA', name: 'Georgia', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  HI: { code: 'HI', name: 'Hawaii', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  ID: { code: 'ID', name: 'Idaho', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  IL: { code: 'IL', name: 'Illinois', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  IN: { code: 'IN', name: 'Indiana', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  IA: { code: 'IA', name: 'Iowa', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 30.99 },
  KS: { code: 'KS', name: 'Kansas', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  KY: { code: 'KY', name: 'Kentucky', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  LA: { code: 'LA', name: 'Louisiana', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  ME: { code: 'ME', name: 'Maine', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 29.99 },
  MD: { code: 'MD', name: 'Maryland', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 24 },
  MA: { code: 'MA', name: 'Massachusetts', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 23 },
  MI: { code: 'MI', name: 'Michigan', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 25 },
  MN: { code: 'MN', name: 'Minnesota', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 33 },
  MS: { code: 'MS', name: 'Mississippi', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  MO: { code: 'MO', name: 'Missouri', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  MT: { code: 'MT', name: 'Montana', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  NE: { code: 'NE', name: 'Nebraska', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 29 },
  NV: { code: 'NV', name: 'Nevada', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  NH: { code: 'NH', name: 'New Hampshire', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  NJ: { code: 'NJ', name: 'New Jersey', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 30 },
  NM: { code: 'NM', name: 'New Mexico', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  NY: { code: 'NY', name: 'New York', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 25 },
  NC: { code: 'NC', name: 'North Carolina', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 30 },
  ND: { code: 'ND', name: 'North Dakota', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  OH: { code: 'OH', name: 'Ohio', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 27.99 },
  OK: { code: 'OK', name: 'Oklahoma', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  OR: { code: 'OR', name: 'Oregon', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  PA: { code: 'PA', name: 'Pennsylvania', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 24 },
  RI: { code: 'RI', name: 'Rhode Island', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  SC: { code: 'SC', name: 'South Carolina', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  SD: { code: 'SD', name: 'South Dakota', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  TN: { code: 'TN', name: 'Tennessee', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 30 },
  TX: { code: 'TX', name: 'Texas', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  UT: { code: 'UT', name: 'Utah', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  VT: { code: 'VT', name: 'Vermont', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 18 },
  VA: { code: 'VA', name: 'Virginia', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  WA: { code: 'WA', name: 'Washington', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  WV: { code: 'WV', name: 'West Virginia', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 31 },
  WI: { code: 'WI', name: 'Wisconsin', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
  WY: { code: 'WY', name: 'Wyoming', licensed: true, maxAmount: 50000, minAmount: 2000, allowedTerms: ALL_TERMS, maxApr: 35.99 },
};

export const STATE_CODES = Object.keys(STATE_RULES);

export const STATE_OPTIONS = STATE_CODES.map((code) => ({
  value: code,
  label: STATE_RULES[code].name,
}));

/** ZIP prefix ranges per state, inclusive. Rejects ZIP+4 by construction (5 digits only). */
const ZIP_RANGES: Record<string, Array<[number, number]>> = {
  AL: [[35000, 36999]],
  AK: [[99500, 99999]],
  AZ: [[85000, 86599]],
  AR: [[71600, 72999], [75502, 75502]],
  CA: [[90000, 96199]],
  CO: [[80000, 81699]],
  CT: [[6000, 6999]],
  DE: [[19700, 19999]],
  DC: [[20000, 20099], [20200, 20599], [56900, 56999]],
  FL: [[32000, 34999]],
  GA: [[30000, 31999], [39800, 39999]],
  HI: [[96700, 96899]],
  ID: [[83200, 83899]],
  IL: [[60000, 62999]],
  IN: [[46000, 47999]],
  IA: [[50000, 52899]],
  KS: [[66000, 67999]],
  KY: [[40000, 42799]],
  LA: [[70000, 71499]],
  ME: [[3900, 4999]],
  MD: [[20600, 21999]],
  MA: [[1000, 2799], [5501, 5544]],
  MI: [[48000, 49999]],
  MN: [[55000, 56799]],
  MS: [[38600, 39799]],
  MO: [[63000, 65899]],
  MT: [[59000, 59999]],
  NE: [[68000, 69399]],
  NV: [[88900, 89899]],
  NH: [[3000, 3899]],
  NJ: [[7000, 8999]],
  NM: [[87000, 88499]],
  NY: [[10000, 14999], [501, 544], [6390, 6390]],
  NC: [[27000, 28999]],
  ND: [[58000, 58899]],
  OH: [[43000, 45999]],
  OK: [[73000, 73199], [73400, 74999]],
  OR: [[97000, 97999]],
  PA: [[15000, 19699]],
  RI: [[2800, 2999]],
  SC: [[29000, 29999]],
  SD: [[57000, 57799]],
  TN: [[37000, 38599]],
  TX: [[75000, 79999], [88500, 88599], [73301, 73301], [73344, 73344]],
  UT: [[84000, 84799]],
  VT: [[5000, 5999]],
  VA: [[20100, 20199], [22000, 24699]],
  WA: [[98000, 99499]],
  WV: [[24700, 26899]],
  WI: [[53000, 54999]],
  WY: [[82000, 83199]],
};

/** Field 17 — ZIP must be 5 digits AND valid for the selected state. */
export function isZipValidForState(zip: string, state: string): boolean {
  if (!/^\d{5}$/.test(zip || '')) return false;
  const ranges = ZIP_RANGES[(state || '').toUpperCase()];
  if (!ranges) return false;
  const n = Number(zip);
  return ranges.some(([lo, hi]) => n >= lo && n <= hi);
}

export function stateForZip(zip: string): string | null {
  if (!/^\d{5}$/.test(zip || '')) return null;
  const n = Number(zip);
  for (const [code, ranges] of Object.entries(ZIP_RANGES)) {
    if (ranges.some(([lo, hi]) => n >= lo && n <= hi)) return code;
  }
  return null;
}

/** Field 35 — per-state driver's licence format patterns. */
const DL_PATTERNS: Record<string, RegExp> = {
  AL: /^\d{1,8}$/,
  AK: /^\d{1,7}$/,
  AZ: /^([A-Z]\d{8}|\d{9})$/,
  AR: /^\d{4,9}$/,
  CA: /^[A-Z]\d{7}$/,
  CO: /^(\d{9}|[A-Z]\d{3,6}|[A-Z]{2}\d{2,5})$/,
  CT: /^\d{9}$/,
  DE: /^\d{1,7}$/,
  DC: /^(\d{7}|\d{9})$/,
  FL: /^[A-Z]\d{12}$/,
  GA: /^\d{7,9}$/,
  HI: /^([A-Z]\d{8}|\d{9})$/,
  ID: /^([A-Z]{2}\d{6}[A-Z]|\d{9})$/,
  IL: /^[A-Z]\d{11,12}$/,
  IN: /^([A-Z]\d{9}|\d{9,10})$/,
  IA: /^(\d{9}|\d{3}[A-Z]{2}\d{4})$/,
  KS: /^([A-Z]\d[A-Z]\d[A-Z]|[A-Z]\d{8}|\d{9})$/,
  KY: /^([A-Z]\d{8,9}|\d{9})$/,
  LA: /^\d{1,9}$/,
  ME: /^(\d{7,8}|\d{7}[A-Z])$/,
  MD: /^[A-Z]\d{12}$/,
  MA: /^([A-Z]\d{8}|\d{9})$/,
  MI: /^([A-Z]\d{10,12})$/,
  MN: /^[A-Z]\d{12}$/,
  MS: /^\d{9}$/,
  MO: /^([A-Z]\d{5,9}|[A-Z]\d{6}R|\d{8}[A-Z]{2}|\d{9}[A-Z]|\d{9})$/,
  MT: /^([A-Z]\d{8}|\d{9}|\d{13,14})$/,
  NE: /^[A-Z]\d{6,8}$/,
  NV: /^(\d{9,10}|\d{12}|X\d{8})$/,
  NH: /^\d{2}[A-Z]{3}\d{5}$/,
  NJ: /^[A-Z]\d{14}$/,
  NM: /^\d{8,9}$/,
  NY: /^([A-Z]\d{7}|[A-Z]\d{18}|\d{8,9}|\d{16}|[A-Z]{8})$/,
  NC: /^\d{1,12}$/,
  ND: /^([A-Z]{3}\d{6}|\d{9})$/,
  OH: /^([A-Z]\d{4,8}|[A-Z]{2}\d{3,7}|\d{8})$/,
  OK: /^([A-Z]\d{9}|\d{9})$/,
  OR: /^(\d{1,9}|[A-Z]\d{6})$/,
  PA: /^\d{8}$/,
  RI: /^([A-Z]\d{6}|\d{7})$/,
  SC: /^\d{5,11}$/,
  SD: /^(\d{6,10}|\d{12})$/,
  TN: /^\d{7,9}$/,
  TX: /^\d{7,8}$/,
  UT: /^\d{4,10}$/,
  VT: /^(\d{8}|\d{7}A)$/,
  VA: /^([A-Z]\d{8,11}|\d{9})$/,
  WA: /^([A-Z0-9*]{7,12})$/,
  WV: /^(\d{7}|[A-Z]{1,2}\d{5,6})$/,
  WI: /^[A-Z]\d{13}$/,
  WY: /^\d{9,10}$/,
};

/** Returns true when the DL number matches the issuing state's documented format. */
export function isDriverLicenseValid(dl: string, state: string): boolean {
  const value = (dl || '').toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z0-9]{1,20}$/.test(value)) return false;
  const pattern = DL_PATTERNS[(state || '').toUpperCase()];
  // Unknown state pattern: fall back to the generic 1-20 alphanumeric rule
  // rather than hard-blocking a real applicant on a table gap.
  return pattern ? pattern.test(value) : true;
}

export function getStateRule(state: string): StateRule | null {
  return STATE_RULES[(state || '').toUpperCase()] || null;
}
