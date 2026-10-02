/**
 * "No sensitive data in logs, emails, URLs, analytics events, or session
 * replay tools." This is the last line of defence: anything that passes
 * through the logging interceptor or the exception filter is redacted here
 * first, by key name and by value shape.
 */
const SENSITIVE_KEYS = new Set([
  'ssn',
  'ssnconfirm',
  'confirmssn',
  'socialsecuritynumber',
  'ssnciphertext',
  'ssntoken',
  'ssnblindindex',
  'dlnumber',
  'driverslicensenumber',
  'dlnumberciphertext',
  'accountnumber',
  'accountnumberconfirm',
  'confirmaccountnumber',
  'accountnumberciphertext',
  'accountnumbertoken',
  'routingnumber',
  'routingnumberciphertext',
  'password',
  'passwordhash',
  'bankusername',
  'bankpassword',
  'bankusernameciphertext',
  'bankpasswordciphertext',
  'authorization',
  'cookie',
  'token',
  'accesstoken',
  'jwt',
]);

const SSN_SHAPE = /\b\d{3}-?\d{2}-?\d{4}\b/g;
const LONG_DIGITS = /\b\d{9,17}\b/g;

export const REDACTED = '[REDACTED]';

export function redactValue(value: string): string {
  return String(value ?? '')
    .replace(SSN_SHAPE, REDACTED)
    .replace(LONG_DIGITS, REDACTED);
}

/**
 * Keys whose sub-object is a field -> human-readable message map, not a map of
 * values. Redacting these by key name would blank the very validation message
 * the applicant needs to see beside the field, so only value-shape redaction
 * is applied inside them.
 */
const MESSAGE_MAP_KEYS = new Set(['errors', 'suggestions']);

/** Value-shape redaction only: never blanks a message because of its key. */
function redactMessageMap(input: unknown): unknown {
  if (input == null) return input;
  if (typeof input === 'string') return redactValue(input);
  if (Array.isArray(input)) return input.map(redactMessageMap);
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
      out[key] = redactMessageMap(val);
    }
    return out;
  }
  return input;
}

export function redact<T>(input: T, depth = 0): T {
  if (depth > 8 || input == null) return input;

  if (typeof input === 'string') return redactValue(input) as unknown as T;
  if (Array.isArray(input)) return input.map((v) => redact(v, depth + 1)) as unknown as T;

  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
      const normalised = key.toLowerCase().replace(/[_-]/g, '');
      if (MESSAGE_MAP_KEYS.has(normalised)) {
        out[key] = redactMessageMap(val);
      } else if (SENSITIVE_KEYS.has(normalised)) {
        out[key] = REDACTED;
      } else {
        out[key] = redact(val, depth + 1);
      }
    }
    return out as unknown as T;
  }

  return input;
}

/** Strips any sensitive query parameter that should never have been in a URL. */
export function redactUrl(url: string): string {
  if (!url) return url;
  return url.replace(
    /([?&])(ssn|account(_?number)?|routing(_?number)?|dl(_?number)?|token|password)=[^&#]*/gi,
    `$1$2=${REDACTED}`,
  );
}
