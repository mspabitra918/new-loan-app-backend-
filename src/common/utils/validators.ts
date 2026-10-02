/**
 * Pure validation helpers shared by DTO validators, the service layer and
 * the lookup endpoints the frontend calls on blur.
 * Nothing here logs, and nothing here echoes a sensitive value back.
 */

// ---------------------------------------------------------------- names

const NAME_RE = /^[A-Za-z][A-Za-zÀ-ɏ' .-]*$/;

/** Fields 5 / 7 - letters, space, hyphen, apostrophe, period. No digits, no emoji. */
export function isValidName(value: string, min = 2, max = 40): boolean {
  const v = (value || '').trim();
  if (v.length < min || v.length > max) return false;
  if (/\d/.test(v)) return false;
  if (/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(v)) return false;
  return NAME_RE.test(v);
}

/** Auto title-case, preserving hyphenated and O'Brien style names. */
export function toTitleCase(value: string): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])([a-zÀ-ɏ])/g, (_m, sep, ch) => sep + ch.toUpperCase());
}

// ---------------------------------------------------------------- email

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/** Field 9 - RFC 5322 shape check (MX lookup happens in EmailVerificationService). */
export function isValidEmailSyntax(email: string): boolean {
  const v = (email || '').trim();
  return v.length <= 254 && EMAIL_RE.test(v);
}

/** Disposable / throwaway domains - rejected outright. */
export const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com',
  '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org',
  'throwawaymail.com', 'yopmail.com', 'yopmail.fr', 'trashmail.com',
  'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc',
  'fakeinbox.com', 'mailnesia.com', 'mytemp.email', 'emailondeck.com',
  'spamgourmet.com', 'mohmal.com', 'tempr.email', 'discard.email',
  'grr.la', 'spam4.me', 'inboxbear.com', 'burnermail.io', 'moakt.com',
  'harakirimail.com', 'tempmailo.com', 'minuteinbox.com', 'mailcatch.com',
]);

export function isDisposableEmail(email: string): boolean {
  const domain = (email || '').split('@')[1]?.toLowerCase();
  return !!domain && DISPOSABLE_DOMAINS.has(domain);
}

/** Common typo domains -> the domain we suggest ("Did you mean gmail.com?"). */
const TYPO_DOMAINS: Record<string, string> = {
  'gmai.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmaill.com': 'gmail.com',
  'gmil.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.comm': 'gmail.com',
  'yahoo.co': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com',
  'yhaoo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com',
  'hotmai.com': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotmail.co': 'hotmail.com',
  'hotmail.con': 'hotmail.com', 'homail.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com', 'outlook.co': 'outlook.com',
  'icloud.co': 'icloud.com', 'iclod.com': 'icloud.com',
  'aol.co': 'aol.com', 'aoll.com': 'aol.com',
  'comcast.ne': 'comcast.net', 'verison.net': 'verizon.net',
};

/** Returns a corrected address to prompt with, or null when nothing looks wrong. */
export function suggestEmailCorrection(email: string): string | null {
  const [local, domain] = (email || '').toLowerCase().split('@');
  if (!local || !domain) return null;
  const fixed = TYPO_DOMAINS[domain];
  return fixed ? `${local}@${fixed}` : null;
}

// ---------------------------------------------------------------- phone

/** Invalid NPA (area code) rules: N11, 000, 555, 900, and 1/0 leading digit. */
export function isValidUsPhone(raw: string): boolean {
  const d = digitsOnly(raw);
  if (d.length !== 10) return false;
  const npa = d.slice(0, 3);
  const nxx = d.slice(3, 6);
  if (['000', '555', '900'].includes(npa)) return false;
  if (npa[0] === '0' || npa[0] === '1') return false;      // NPA cannot start 0/1
  if (npa[1] === '1' && npa[2] === '1') return false;       // N11 service codes
  if (nxx[0] === '0' || nxx[0] === '1') return false;       // NXX cannot start 0/1
  if (nxx === '555' && Number(d.slice(6)) >= 100 && Number(d.slice(6)) <= 199) return false;
  return true;
}

export function digitsOnly(value: string): string {
  return (value || '').replace(/\D/g, '');
}

export function formatUsPhone(raw: string): string {
  const d = digitsOnly(raw);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
}

// ---------------------------------------------------------------- DOB

export function ageFromDob(dob: Date | string): number {
  const d = typeof dob === 'string' ? new Date(`${dob}T00:00:00Z`) : dob;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

/** Field 12 - at least 18, at most 100, never in the future. */
export function isValidDob(dob: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob || '')) return false;
  const d = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  if (d.getTime() > Date.now()) return false;
  const age = ageFromDob(d);
  return age >= 18 && age <= 100;
}

// ---------------------------------------------------------------- SSN

/** Publicly voided / widely-publicised SSNs that must never be accepted. */
const PUBLICIZED_INVALID_SSNS = new Set([
  '078051120', '219099999', '457555462', '123456789', '111111111',
  '222222222', '333333333', '444444444', '555555555', '666666666',
  '777777777', '888888888', '999999999', '000000000', '987654320',
  '987654321', '987654322', '987654323', '987654324', '987654325',
  '987654326', '987654327', '987654328', '987654329',
]);

/**
 * Field 33. Never log the input, never echo it back, never put it in a URL.
 * Returns only a boolean - the caller reports "invalid", not which rule fired.
 */
export function isValidSsn(raw: string): boolean {
  const d = digitsOnly(raw);
  if (d.length !== 9) return false;
  const area = d.slice(0, 3);
  const group = d.slice(3, 5);
  const serial = d.slice(5);
  if (area === '000' || area === '666') return false;
  if (Number(area) >= 900) return false;
  if (group === '00') return false;
  if (serial === '0000') return false;
  if (PUBLICIZED_INVALID_SSNS.has(d)) return false;
  return true;
}

export function maskSsn(raw: string): string {
  const d = digitsOnly(raw);
  return d.length === 9 ? `XXX-XX-${d.slice(5)}` : 'XXX-XX-XXXX';
}

export function ssnLast4(raw: string): string {
  return digitsOnly(raw).slice(-4);
}

// ---------------------------------------------------------------- bank

/**
 * Field 43 - ABA routing checksum.
 * 3(d1+d4+d7) + 7(d2+d5+d8) + 1(d3+d6+d9) === 0 mod 10
 */
export function isValidRoutingNumber(raw: string): boolean {
  const d = digitsOnly(raw);
  if (d.length !== 9) return false;
  if (/^0{9}$/.test(d)) return false;
  const n = d.split('').map(Number);
  const sum =
    3 * (n[0] + n[3] + n[6]) +
    7 * (n[1] + n[4] + n[7]) +
    1 * (n[2] + n[5] + n[8]);
  return sum % 10 === 0;
}

/** Field 45 - 4 to 17 digits. */
export function isValidAccountNumber(raw: string): boolean {
  const d = digitsOnly(raw);
  return d.length >= 4 && d.length <= 17;
}

export function maskAccountNumber(raw: string): string {
  const d = digitsOnly(raw);
  if (d.length < 4) return '****';
  return `${'*'.repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}

export function accountLast4(raw: string): string {
  return digitsOnly(raw).slice(-4);
}

// ---------------------------------------------------------------- address

/** Field 13 - PO Boxes are not a primary residence. */
export function isPoBox(address: string): boolean {
  return /\b(p\.?\s*o\.?\s*box|post\s+office\s+box|postal\s+box|po\s*bin)\b/i.test(
    address || '',
  );
}

// ---------------------------------------------------------------- misc

export function isFutureDate(value: string): boolean {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
}

/** Field 29 - next pay date must be in the future and within 35 days. */
export function isWithinDays(value: string, days: number): boolean {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const limit = Date.now() + days * 24 * 60 * 60 * 1000;
  return d.getTime() <= limit;
}
