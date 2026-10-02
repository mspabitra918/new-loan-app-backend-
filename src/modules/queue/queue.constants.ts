export const QUEUE_EMAIL = 'email';

/** Job names inside the email queue. */
export const JOB_SEND_EMAIL = 'send-email';

export interface SendEmailJobData {
  applicationUuid: string;
  templateKey: string;
  resumeToken?: string;
  bankVerifyToken?: string;
  context?: Record<string, unknown>;
}

/**
 * Deterministic job ids. Re-queuing the same email for the same application
 * is a no-op rather than a duplicate send.
 *
 * Colons are deliberately avoided: BullMQ reserves ':' in custom job ids for
 * its repeatable-job format and rejects any id that contains one without
 * splitting into exactly three segments. Using '_' keeps ids readable and
 * keeps an optional suffix from silently breaking the enqueue.
 */
const safeSegment = (value: string) => String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '-');

export const emailJobId = (applicationUuid: string, templateKey: string, suffix = '') =>
  `email_${safeSegment(applicationUuid)}_${safeSegment(templateKey)}` +
  (suffix ? `_${safeSegment(suffix)}` : '');
