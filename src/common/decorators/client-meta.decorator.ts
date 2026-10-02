import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * The HIDDEN / SYSTEM FIELDS block from the spec.
 * Captured silently on every step submission. Values the browser cannot know
 * (IP, user agent) are read from the request; the rest come from the tracking
 * payload the form posts alongside the step data.
 */
export interface ClientMeta {
  ipAddress: string | null;
  userAgent: string | null;
  deviceFingerprint: string | null;
  pageUrl: string | null;
  referrerUrl: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  landingPageFirstTouch: string | null;
  jornayaLeadid: string | null;
  trustedformCertUrl: string | null;
  sessionId: string | null;
  timezone: string | null;
  /** Seconds spent on the form so far, reported by the client. */
  timeOnForm: number | null;
}

/** Honours X-Forwarded-For only because the app runs behind a trusted proxy. */
export function extractIp(req: Request): string | null {
  const xff = (req.headers['x-forwarded-for'] as string) || '';
  const first = xff.split(',')[0]?.trim();
  const ip = first || req.ip || req.socket?.remoteAddress || null;
  // Normalise IPv4-mapped IPv6 (::ffff:1.2.3.4) for readable admin display.
  return ip ? ip.replace(/^::ffff:/, '') : null;
}

const str = (v: unknown, max = 500): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

export const GetClientMeta = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientMeta => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const t = (req.body?.tracking ?? {}) as Record<string, unknown>;

    return {
      ipAddress: extractIp(req),
      userAgent: str(req.headers['user-agent'], 1000),
      deviceFingerprint: str(t.deviceFingerprint, 128),
      pageUrl: str(t.pageUrl, 2000),
      referrerUrl: str(t.referrerUrl ?? req.headers['referer'], 2000),
      utmSource: str(t.utmSource, 120),
      utmMedium: str(t.utmMedium, 120),
      utmCampaign: str(t.utmCampaign, 120),
      utmContent: str(t.utmContent, 120),
      utmTerm: str(t.utmTerm, 120),
      landingPageFirstTouch: str(t.landingPageFirstTouch, 2000),
      jornayaLeadid: str(t.jornayaLeadid, 64),
      trustedformCertUrl: str(t.trustedformCertUrl, 2000),
      sessionId: str(t.sessionId, 64),
      timezone: str(t.timezone, 64),
      timeOnForm: Number.isFinite(Number(t.timeOnForm)) ? Number(t.timeOnForm) : null,
    };
  },
);
