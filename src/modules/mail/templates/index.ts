import { htmlToText, renderLayout } from './layout';

/**
 * Every email the platform can send.
 *
 * Context carries only non-sensitive values: an application reference, a
 * first name, masked last-4s, and signed single-use URLs. No SSN, no DL
 * number, no full account or routing number ever enters a template - and no
 * sensitive value is ever placed in a URL.
 */
export interface TemplateContext {
  brand: string;
  supportPhone: string;
  applicationId: string;
  firstName: string;
  lastName?: string;
  /** Only used to prefill the Loan Status lookup link. */
  email?: string;
  /** Display label, e.g. "Debt Consolidation" - never the raw enum. */
  loanPurpose?: string;
  webUrl: string;
  resumeUrl?: string;
  bankVerifyUrl?: string;
  bankName?: string;
  accountLast4?: string;
  accountType?: string;
  loanAmount?: number;
  loanTermMonths?: number;
  estimatedInstallment?: number;
  apr?: number;
  declineReasons?: string[];
  lockoutUntil?: string;
  nextStepUrl?: string;
  /** 1, 2 or 3 - which day of the bank-verification drip this is. */
  dripDay?: number;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  tags: string[];
}

export type TemplateKey =
  | 'bank_verification_0_initial'
  | 'status_approved'
  | 'status_declined'
  | 'status_funded'
  | 'status_withdrawn'
  | 'step1_resume_link'
  | 'prequal_approved'
  | 'prequal_declined'
  | 'step2_received'
  | 'underwriting_approved'
  | 'underwriting_declined'
  | 'bank_verification_1_initial'
  | 'bank_verification_2_reminder'
  | 'bank_verification_3_followup'
  | 'bank_verification_4_holding'
  | 'bank_verification_5_urgent'
  | 'bank_verification_6_final'
  | 'bank_verified'
  | 'resume_nudge';

/** Everything interpolated into raw HTML goes through this first. */
const esc = (value?: string | number | null) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (n?: number) =>
  n == null ? '' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

const money2 = (n?: number) =>
  n == null ? '' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ref = (c: TemplateContext) =>
  `<p style="margin:0 0 16px 0;padding:12px 16px;background:#f4f6f5;border-radius:8px;font-size:14px;">
     Your application reference: <strong>${c.applicationId}</strong>
   </p>`;

const build = (
  c: TemplateContext,
  subject: string,
  preheader: string,
  heading: string,
  bodyHtml: string,
  cta?: { label: string; url?: string },
  tags: string[] = [],
  footerNote?: string,
): RenderedEmail => {
  const html = renderLayout({
    brand: c.brand,
    preheader,
    heading,
    bodyHtml,
    ctaLabel: cta?.url ? cta.label : undefined,
    ctaUrl: cta?.url,
    footerNote,
  });
  return { subject, html, text: htmlToText(html), tags };
};

/**
 * Sender identity for the branded status emails (the submission
 * confirmation and every admin status change), which are branded
 * independently of the shared layout. The number is written once so the
 * dialled number and the printed number cannot drift apart.
 */
const CONFIRMATION_BRAND = {
  name: process.env.CONFIRMATION_BRAND_NAME || 'Creek Lend',
  phoneDisplay: process.env.CONFIRMATION_BRAND_PHONE || '(747) 208-3657',
  get phoneHref() {
    return `+1${this.phoneDisplay.replace(/\D/g, '')}`;
  },
  websiteUrl: process.env.CONFIRMATION_BRAND_URL || 'https://www.creeklend.com',
  get websiteLabel() {
    return this.websiteUrl.replace(/^https?:\/\//, '');
  },
};

/** Callout box colours: amber for "action needed", green for good news, grey for neutral. */
const CALLOUT_STYLES = {
  warning: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  success: { bg: '#dcfce7', border: '#22c55e', text: '#14532d' },
  neutral: { bg: '#f3f4f6', border: '#d1d5db', text: '#374151' },
} as const;

const detailRow = (label: string, value: string, bold = false) => `
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">${label}</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; ${
                bold ? 'font-weight: bold; ' : ''
              }text-align: right;">${value}</td>
            </tr>`;

const statusUrl = (c: TemplateContext) =>
  `${c.webUrl}/loan-status?ref=${encodeURIComponent(c.applicationId)}` +
  (c.email ? `&email=${encodeURIComponent(c.email)}` : '');

/**
 * The branded shell shared by the submission confirmation and the status
 * emails. Standalone markup rather than the shared layout: this design is
 * fixed by the brief, so it carries its own header and its own footer.
 *
 * `paragraphs` and `callout.html` are raw HTML - escape anything
 * applicant-supplied before passing it in.
 */
const branded = (
  c: TemplateContext,
  opts: {
    subject: string;
    heading: string;
    paragraphs: string[];
    details?: string;
    callout?: { tone: keyof typeof CALLOUT_STYLES; html: string };
    cta?: { label: string; url: string };
    footerNote?: string;
    tags: string[];
  },
): RenderedEmail => {
  const p = (html: string) => `
        <p style="color: #374151; font-size: 16px;">
          ${html}
        </p>`;
  const tone = opts.callout ? CALLOUT_STYLES[opts.callout.tone] : null;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #F0FFF4; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1
          style="
            margin: 0;
            font-size: 32px;
            font-weight: 700;
            color: #14532d;
            font-family: Arial, Helvetica, sans-serif;
            letter-spacing: 0.5px;
          "
        >
          ${esc(CONFIRMATION_BRAND.name)}
        </h1>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 30px; border-radius: 0 0 8px 8px;">
        <h2 style="color: #111827; margin-top: 0;">${esc(opts.heading)}</h2>${p(
          `Hi ${esc(c.firstName)},`,
        )}${opts.paragraphs.map(p).join('')}${
          opts.details
            ? `
        <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="color: #111827; margin-top: 0;">Application Details</h3>
          <table style="width: 100%; border-collapse: collapse;">${opts.details}
          </table>
        </div>`
            : ''
        }${
          opts.callout && tone
            ? `
        <div style="background: ${tone.bg}; border: 1px solid ${tone.border}; border-radius: 8px; padding: 15px; margin: 20px 0;">
          <p style="color: ${tone.text}; font-size: 14px; margin: 0;">
            ${opts.callout.html}
          </p>
        </div>`
            : ''
        }
        <p style="color: #374151; font-size: 14px;">
          Please save your Application ID <strong>${esc(c.applicationId)}</strong> for future reference. You can use it to check your application status at any time.
        </p>${
          opts.cta
            ? `
        <div style="text-align: center; margin: 25px 0;">
          <a href="${esc(opts.cta.url)}"
             style="display: inline-block; background: #14532d; color: #ffffff; text-decoration: none;
                    font-weight: 600; font-size: 16px; padding: 14px 28px; border-radius: 8px;">
            ${esc(opts.cta.label)}
          </a>
        </div>`
            : ''
        }
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <div style="text-align: center; padding: 10px 0;">
          <p style="color: #374151; font-size: 14px; margin: 5px 0;">
            <strong>Phone:</strong> <a href="tel:${esc(
              CONFIRMATION_BRAND.phoneHref,
            )}" style="color: #1a56db; text-decoration: none;">${esc(
              CONFIRMATION_BRAND.phoneDisplay,
            )}</a>
          </p>
          <p style="color: #374151; font-size: 14px; margin: 5px 0;">
            <strong>Website:</strong> <a href="${esc(
              CONFIRMATION_BRAND.websiteUrl,
            )}" style="color: #1a56db; text-decoration: none;">${esc(
              CONFIRMATION_BRAND.websiteLabel,
            )}</a>
          </p>
        </div>${
          opts.footerNote
            ? `
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">
          ${esc(opts.footerNote)}
        </p>`
            : ''
        }
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">
          This is an automated email from ${esc(
            CONFIRMATION_BRAND.name,
          )}. Please do not reply to this email.
        </p>
      </div>
    </div>
  `;

  return {
    subject: `${opts.subject} - ID: ${c.applicationId} | ${CONFIRMATION_BRAND.name}`,
    html,
    text: htmlToText(html),
    tags: [...opts.tags, c.applicationId],
  };
};

const TEMPLATES: Record<TemplateKey, (c: TemplateContext) => RenderedEmail> = {
  /**
   * The confirmation, sent the moment the application is submitted. It opens
   * the bank-verification series (hence position 0), but it is queued
   * directly rather than written to bank_verification_emails, so the six
   * drip rows and DRIP_OFFSET_HOURS are untouched.
   */
  bank_verification_0_initial: (c) =>
    branded(c, {
      subject: 'Application Received',
      heading: 'Application Received!',
      paragraphs: [
        'Thank you for submitting your loan application. We have received your application and it is now being processed.',
      ],
      details: `${detailRow('Application ID', esc(c.applicationId), true)}${detailRow(
        'Applicant Name',
        esc([c.firstName, c.lastName].filter(Boolean).join(' ')),
      )}${detailRow('Loan Amount', esc(money2(c.loanAmount)), true)}${detailRow(
        'Loan Purpose',
        esc(c.loanPurpose || '-'),
      )}${detailRow('Loan Term', `${esc(c.loanTermMonths)} months`)}`,
      callout: {
        tone: 'warning',
        html: '<strong>Next Step:</strong> Please complete the bank verification process to proceed with your application.',
      },
      cta: { label: 'Verify My Bank Account', url: c.bankVerifyUrl || statusUrl(c) },
      tags: ['bank-verification', 'seq0', 'confirmation'],
    }),

  // ---------------------------------------------------------------------
  // Admin status changes. One email per destination the portal can set
  // (ADMIN_SETTABLE_STATUSES), queued by AdminService.setStatus.
  // ---------------------------------------------------------------------

  status_approved: (c) =>
    branded(c, {
      subject: 'Your Loan Is Approved',
      heading: 'Congratulations - You Are Approved!',
      paragraphs: [
        'Good news: your loan application has been approved.',
      ],
      details: `${detailRow('Application ID', esc(c.applicationId), true)}${detailRow(
        'Approved Amount',
        esc(money2(c.loanAmount)),
        true,
      )}${detailRow('Loan Term', `${esc(c.loanTermMonths)} months`)}${
        c.apr != null ? detailRow('APR', `${esc(Number(c.apr))}%`) : ''
      }${
        c.estimatedInstallment != null
          ? detailRow('Monthly Payment', esc(money2(c.estimatedInstallment)), true)
          : ''
      }`,
      callout: {
        tone: 'success',
        html: '<strong>What happens next:</strong> Our team is preparing your funds. We will email you again as soon as your loan has been funded.',
      },
      cta: { label: 'Check My Application Status', url: statusUrl(c) },
      tags: ['status', 'approved'],
    }),

  status_declined: (c) =>
    branded(c, {
      subject: 'An Update on Your Application',
      heading: 'An Update on Your Application',
      paragraphs: [
        `Thank you for considering ${esc(CONFIRMATION_BRAND.name)}. After carefully reviewing your application, we are not able to approve your loan at this time.`,
        'You will receive a written adverse action notice with the specific reasons for this decision and details of any consumer report we used.',
      ],
      callout: {
        tone: 'neutral',
        html: `<strong>Questions?</strong> Call us on ${esc(
          CONFIRMATION_BRAND.phoneDisplay,
        )} and we will be happy to help.${
          c.lockoutUntil
            ? ` You may apply again on or after <strong>${esc(c.lockoutUntil)}</strong>.`
            : ''
        }`,
      },
      footerNote:
        'This notice is provided under the Equal Credit Opportunity Act and the Fair Credit Reporting Act.',
      tags: ['status', 'declined'],
    }),

  status_funded: (c) =>
    branded(c, {
      subject: 'Your Loan Has Been Funded',
      heading: 'Your Loan Has Been Funded!',
      paragraphs: [
        `Your loan of <strong>${esc(money2(c.loanAmount))}</strong> has been funded and sent to your bank account.`,
        'Most deposits arrive within one business day, depending on your bank.',
      ],
      details: `${detailRow('Application ID', esc(c.applicationId), true)}${detailRow(
        'Funded Amount',
        esc(money2(c.loanAmount)),
        true,
      )}${detailRow(
        'Deposit Account',
        esc(
          `${c.bankName || 'Your bank'} ${c.accountLast4 ? `ending ${c.accountLast4}` : ''}`.trim(),
        ),
      )}${detailRow('Loan Term', `${esc(c.loanTermMonths)} months`)}${
        c.estimatedInstallment != null
          ? detailRow('Monthly Payment', esc(money2(c.estimatedInstallment)), true)
          : ''
      }`,
      callout: {
        tone: 'success',
        html: '<strong>Repayment:</strong> Your payments will be debited from this account per the ACH authorization you signed.',
      },
      cta: { label: 'Check My Application Status', url: statusUrl(c) },
      tags: ['status', 'funded'],
    }),

  status_withdrawn: (c) =>
    branded(c, {
      subject: 'Your Application Has Been Withdrawn',
      heading: 'Your Application Has Been Withdrawn',
      paragraphs: [
        'Your loan application has been withdrawn and is now closed. No funds will be sent and no further action is needed from you.',
        'If you did not request this, or you would like to apply again, you are welcome to start a new application at any time.',
      ],
      callout: {
        tone: 'neutral',
        html: `<strong>Questions?</strong> Call us on ${esc(
          CONFIRMATION_BRAND.phoneDisplay,
        )} and we will be happy to help.`,
      },
      cta: { label: 'Start a New Application', url: `${c.webUrl}/apply` },
      tags: ['status', 'withdrawn'],
    }),

  /** Autosave + resume link, emailed after Step 1. */
  step1_resume_link: (c) =>
    build(
      c,
      `Pick up where you left off - ${c.applicationId}`,
      'Your progress is saved. Continue any time.',
      'Your progress is saved',
      `${ref(c)}
       <p>Everything you entered has been saved. Use the link below to continue on any
          device - you will not have to start over.</p>
       <p style="font-size:13px;color:#7b8a81;">This link is personal to you. Do not
          forward it. It expires in 30 days.</p>`,
      { label: 'Resume my application', url: c.resumeUrl },
      ['resume'],
    ),

  prequal_approved: (c) =>
    build(
      c,
      `Good news - you pre-qualify. Next step inside.`,
      'You pre-qualified. One short step to go.',
      `You pre-qualify, ${c.firstName}`,
      `${ref(c)}
       <p>Based on what you have told us, you pre-qualify for up to
          <strong>${money(c.loanAmount)}</strong> over ${c.loanTermMonths} months, with an
          estimated payment of <strong>${money2(c.estimatedInstallment)}</strong>.</p>
       <p>This is a pre-qualification, not a final offer. To continue we need to verify
          your identity - it takes about a minute.</p>`,
      { label: 'Verify my identity', url: c.nextStepUrl || c.resumeUrl },
      ['prequal', 'approved'],
    ),

  prequal_declined: (c) =>
    build(
      c,
      `An update on your application - ${c.applicationId}`,
      'An update on your loan application.',
      'We are not able to move forward right now',
      `${ref(c)}
       <p>Thank you for considering ${c.brand}. After reviewing the information you
          provided, we are not able to offer you a loan at this time.</p>
       ${
         c.declineReasons?.length
           ? `<p>The main reasons were:</p><ul>${c.declineReasons
               .map((r) => `<li>${r}</li>`)
               .join('')}</ul>`
           : ''
       }
       <p>You will receive a separate written statement of specific reasons, as required
          by the Equal Credit Opportunity Act. ${
            c.lockoutUntil
              ? `You are welcome to apply again on or after <strong>${c.lockoutUntil}</strong>.`
              : ''
          }</p>`,
      undefined,
      ['prequal', 'declined'],
      'This notice is provided under the Equal Credit Opportunity Act (15 U.S.C. 1691 et seq.).',
    ),

  step2_received: (c) =>
    build(
      c,
      `Identity verification received - ${c.applicationId}`,
      'We have your identity details and are underwriting now.',
      'Thanks - we are underwriting your loan',
      `${ref(c)}
       <p>We received your identity details and our team is completing underwriting now.
          Most decisions land within a few minutes.</p>`,
      undefined,
      ['step2'],
    ),

  underwriting_approved: (c) =>
    build(
      c,
      `You're approved for ${money(c.loanAmount)} - add your bank details`,
      'Approved. Add your bank details to get funded.',
      `You're approved, ${c.firstName}`,
      `${ref(c)}
       <p>You have been approved for <strong>${money(c.loanAmount)}</strong> over
          ${c.loanTermMonths} months at ${c.apr}% APR, with a payment of
          <strong>${money2(c.estimatedInstallment)}</strong>.</p>
       <p>The last step is telling us where to send the money.</p>`,
      { label: 'Add my bank details', url: c.nextStepUrl || c.resumeUrl },
      ['underwriting', 'approved'],
    ),

  underwriting_declined: (c) =>
    build(
      c,
      `An update on your application - ${c.applicationId}`,
      'An update on your loan application.',
      'We are not able to approve your loan',
      `${ref(c)}
       <p>After completing our review, we are not able to approve your application at
          this time.</p>
       ${
         c.declineReasons?.length
           ? `<p>The main reasons were:</p><ul>${c.declineReasons
               .map((r) => `<li>${r}</li>`)
               .join('')}</ul>`
           : ''
       }
       <p>You will receive a written adverse action notice with the specific reasons and
          details of the consumer report we used. ${
            c.lockoutUntil
              ? `You may apply again on or after <strong>${c.lockoutUntil}</strong>.`
              : ''
          }</p>`,
      undefined,
      ['underwriting', 'declined'],
      'This notice is provided under the Equal Credit Opportunity Act and the Fair Credit Reporting Act.',
    ),

  // ---------------------------------------------------------------------
  // Bank verification drip.
  //
  // Six rows in bank_verification_emails: the first goes out the moment
  // Step 3 is submitted, then one every twelve hours. Named by position
  // rather than by day, because the offsets are configurable and a
  // template called "day2" that sends on day 3 is worse than no name.
  // The copy escalates - confirm, remind, chase, hold, urge, close.
  // ---------------------------------------------------------------------

  bank_verification_1_initial: (c) =>
    build(
      c,
      `Verify your bank account to get funded - ${c.applicationId}`,
      'One last step: confirm your bank account.',
      'Confirm your bank account',
      `${ref(c)}
       <p>We have your funding details:
          <strong>${c.bankName || 'your bank'}</strong>,
          ${c.accountType || 'account'} ending <strong>${c.accountLast4 || '****'}</strong>.</p>
       <p>Before we can release ${money(c.loanAmount)}, we need you to confirm this
          account belongs to you. Confirming takes under a minute.</p>`,
      { label: 'Verify my bank account', url: c.bankVerifyUrl },
      ['bank-verification', 'seq1', 'initial'],
      'Enter your bank sign-in only on the verification page this button opens. '
        + 'We never ask for it by reply, over the phone or by text.',
    ),

  bank_verification_2_reminder: (c) =>
    build(
      c,
      `Reminder: verify your bank account - ${c.applicationId}`,
      'Your funds are waiting on one confirmation.',
      `Your funds are ready, ${c.firstName}`,
      `${ref(c)}
       <p>Your loan of <strong>${money(c.loanAmount)}</strong> is approved and waiting.
          We just need you to confirm the account ending
          <strong>${c.accountLast4 || '****'}</strong> at ${c.bankName || 'your bank'}.</p>
       <p>Verify today and funds are typically deposited on the next business day.</p>`,
      { label: 'Verify my bank account', url: c.bankVerifyUrl },
      ['bank-verification', 'seq2', 'reminder'],
    ),

  bank_verification_3_followup: (c) =>
    build(
      c,
      `Still to do: confirm your bank account - ${c.applicationId}`,
      'It takes under a minute to confirm your account.',
      'One minute is all it takes',
      `${ref(c)}
       <p>We have not seen your confirmation yet. Until the account ending
          <strong>${c.accountLast4 || '****'}</strong> at ${c.bankName || 'your bank'} is
          confirmed, we cannot release your funds.</p>
       <p>You will be asked to confirm your details on the secure page below. We will
          never ask for this information by reply, over the phone or by text.</p>`,
      { label: 'Confirm my bank account', url: c.bankVerifyUrl },
      ['bank-verification', 'seq3', 'followup'],
    ),

  bank_verification_4_holding: (c) =>
    build(
      c,
      `Second reminder: your ${money(c.loanAmount)} is on hold`,
      'We are holding your approved funds for one more day.',
      'We are holding your funds',
      `${ref(c)}
       <p>We have not been able to verify the account ending
          <strong>${c.accountLast4 || '****'}</strong> yet, so your
          <strong>${money(c.loanAmount)}</strong> is still on hold.</p>
       <p>If the account details are wrong, you can correct them from the same link.
          If you would rather talk it through, call us on ${c.supportPhone}.</p>`,
      { label: 'Verify or correct my details', url: c.bankVerifyUrl },
      ['bank-verification', 'seq4', 'holding'],
    ),

  bank_verification_5_urgent: (c) =>
    build(
      c,
      `Your ${money(c.loanAmount)} is still waiting on you`,
      'Your approved funds are held until you confirm your account.',
      `Still holding your funds, ${c.firstName}`,
      `${ref(c)}
       <p>Your approval for <strong>${money(c.loanAmount)}</strong> is good for a limited
          time. We are holding it while we wait for you to confirm the account ending
          <strong>${c.accountLast4 || '****'}</strong>.</p>
       <p>If something is wrong with the details you gave us, the same page lets you fix
          them - or call ${c.supportPhone} and we will sort it out with you.</p>`,
      { label: 'Confirm my bank account', url: c.bankVerifyUrl },
      ['bank-verification', 'seq5', 'urgent'],
    ),

  bank_verification_6_final: (c) =>
    build(
      c,
      `Final reminder - your approval expires soon`,
      'Last chance to verify before your approval expires.',
      'Last reminder before your approval expires',
      `${ref(c)}
       <p>This is the final reminder about your approved loan of
          <strong>${money(c.loanAmount)}</strong>.</p>
       <p>If we do not hear from you, we will close the application and you will need to
          start again. Verifying the account ending
          <strong>${c.accountLast4 || '****'}</strong> takes under a minute.</p>
       <p>Need help? Call ${c.supportPhone} and we will finish it with you on the phone.</p>`,
      { label: 'Verify my bank account', url: c.bankVerifyUrl },
      ['bank-verification', 'seq6', 'final'],
    ),

  bank_verified: (c) =>
    build(
      c,
      `Verified - your funds are on the way`,
      'Your bank account is verified and funding is scheduled.',
      `All set, ${c.firstName}`,
      `${ref(c)}
       <p>Your account ending <strong>${c.accountLast4 || '****'}</strong> at
          ${c.bankName || 'your bank'} is verified.</p>
       <p>We are scheduling <strong>${money(c.loanAmount)}</strong> for deposit. Most
          deposits arrive within one business day.</p>
       <p>Your first payment of <strong>${money2(c.estimatedInstallment)}</strong> will be
          debited from this account per the ACH authorisation you signed.</p>`,
      undefined,
      ['bank-verification', 'verified'],
    ),

  /** Sent when someone navigates back or drops off - their data is kept. */
  resume_nudge: (c) =>
    build(
      c,
      `Your application is saved - continue when you're ready`,
      'Nothing is lost. Continue where you left off.',
      'We saved your place',
      `${ref(c)}
       <p>You stepped away from your application, and everything you entered is still
          saved. Continue from exactly where you stopped - no re-typing.</p>`,
      { label: 'Continue my application', url: c.resumeUrl },
      ['resume', 'nudge'],
    ),
};

export function renderTemplate(key: TemplateKey, ctx: TemplateContext): RenderedEmail {
  const fn = TEMPLATES[key];
  if (!fn) throw new Error(`Unknown email template: ${key}`);
  return fn(ctx);
}

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];
