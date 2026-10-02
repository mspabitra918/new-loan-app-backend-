/**
 * Shared HTML shell. Table-based and inline-styled because email clients are
 * what they are. Nothing here ever interpolates an SSN, a full account number,
 * a routing number or a DL number - the templates only receive last-4.
 */
export interface LayoutInput {
  brand: string;
  preheader: string;
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}

const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function renderLayout(input: LayoutInput): string {
  const cta =
    input.ctaUrl && input.ctaLabel
      ? `<tr><td style="padding:8px 32px 28px 32px;">
           <a href="${esc(input.ctaUrl)}"
              style="display:inline-block;background:#1c5d3a;color:#ffffff;text-decoration:none;
                     font-weight:600;font-size:16px;padding:14px 28px;border-radius:8px;">
             ${esc(input.ctaLabel)}
           </a>
         </td></tr>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(input.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${esc(input.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;
                  box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <tr>
        <td style="background:#0f3d28;padding:20px 32px;">
          <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">${esc(input.brand)}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 32px 8px 32px;">
          <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;color:#10261c;">${esc(input.heading)}</h1>
          <div style="font-size:15px;line-height:1.6;color:#39493f;">${input.bodyHtml}</div>
        </td>
      </tr>
      ${cta}
      <tr>
        <td style="padding:0 32px 28px 32px;font-size:12px;line-height:1.6;color:#7b8a81;border-top:1px solid #e7ebe8;padding-top:20px;">
          ${input.footerNote ? `<p style="margin:0 0 10px 0;">${input.footerNote}</p>` : ""}
          <p style="margin:0 0 10px 0;">
            For your security we never ask for your Social Security number, full bank
            account number or bank sign-in <em>by email, phone or text</em> - only on the
            secure pages our links open. If a message claiming to be from us asks you to
            reply with those, do not - forward it to security@newloans.com.
          </p>
          <p style="margin:0;">
            ${esc(input.brand)} &middot; 1200 Market Street, Suite 400, Wilmington, DE 19801<br>
            <a href="{{unsubscribe_url}}" style="color:#7b8a81;">Unsubscribe</a> &middot;
            <a href="${esc(process.env.PUBLIC_WEB_URL || "")}/legal/privacy" style="color:#7b8a81;">Privacy Policy</a>
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Crude but reliable HTML -> text for the plain-text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h1|h2|h3|li)>/gi, "\n")
    .replace(/<li>/gi, " - ")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}
