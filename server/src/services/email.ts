/**
 * Account emails: verify an address, reset a password. Sent through Resend or Brevo (both have free
 * tiers) by a plain HTTPS call; with no provider set, the email is printed to the server log so the
 * links can be followed on a laptop.
 */
import { config } from '../config.js';
import { AppError } from '../errors.js';

export interface Email {
  to: string;
  subject: string;
  /** Plain-text version (also what the log shows) */
  text: string;
  html: string;
}

/** The emails this app sends, in tests: the last one is easy to read back. */
export const sentInTests: Email[] = [];

function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || 'Saleeqa', email: m[2] } : { name: 'Saleeqa', email: from.trim() };
}

export async function sendEmail(email: Email): Promise<void> {
  const { provider, apiKey, from } = config.email;
  if (process.env.VITEST) {
    sentInTests.push(email);
    return;
  }
  if (provider === 'log' || !apiKey) {
    // The email holds a sign-in link: on a laptop it is printed so the link can be followed, but a
    // live server's logs are read by other people and tools, so there only the fact is logged.
    if (config.isProd) {
      console.warn(`Email is not set up (EMAIL_PROVIDER / EMAIL_API_KEY): "${email.subject}" was not sent.`);
      return;
    }
    console.log(`\n--- email to ${email.to}: ${email.subject} ---\n${email.text}\n---\n`);
    return;
  }
  const sender = parseFrom(from);
  const res =
    provider === 'resend'
      ? await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
          signal: AbortSignal.timeout(15_000),
        })
      : await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ sender, to: [{ email: email.to }], subject: email.subject, textContent: email.text, htmlContent: email.html }),
          signal: AbortSignal.timeout(15_000),
        });
  if (!res.ok) {
    console.warn(`Email (${provider}) failed:`, res.status, (await res.text().catch(() => '')).slice(0, 300));
    throw new AppError(502, 'We could not send the email just now. Please try again in a minute.');
  }
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** One simple, readable email: a greeting, a line, a button, the link written out, a note. */
function layout(name: string, line: string, button: string, link: string, note: string): Pick<Email, 'text' | 'html'> {
  const first = (name.trim().split(/\s+/)[0] || 'there').slice(0, 40);
  const text = `Hi ${first},\n\n${line}\n\n${button}: ${link}\n\n${note}\n\nSaleeqa`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#2a2230;line-height:1.5">
  <p style="font-size:20px;color:#6B2D5C;margin:0 0 16px">Saleeqa</p>
  <p>Hi ${escape(first)},</p>
  <p>${escape(line)}</p>
  <p style="margin:24px 0"><a href="${escape(link)}" style="background:#6B2D5C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;display:inline-block;font-weight:bold">${escape(button)}</a></p>
  <p style="font-size:13px;color:#6b6070">Or open this link: <br><a href="${escape(link)}" style="color:#6B2D5C;word-break:break-all">${escape(link)}</a></p>
  <p style="font-size:13px;color:#6b6070">${escape(note)}</p>
</div>`;
  return { text, html };
}

export function verifyEmail(to: string, name: string, link: string): Email {
  return {
    to,
    subject: 'Confirm your email to finish signing up',
    ...layout(name, 'One last step: confirm your email to finish creating your Saleeqa account. The link works for 7 days.', 'Confirm my email', link, 'If you did not sign up for Saleeqa, you can ignore this email.'),
  };
}

/** Brand portal: the admin approved or turned down an application, or a brand asked for a new password. */
export function brandApprovedEmail(to: string, name: string, brand: string, link: string): Email {
  return {
    to,
    subject: `${brand} is approved on Saleeqa`,
    ...layout(name, `Good news: ${brand} is approved. Sign in to your brand dashboard to add your pieces and see how players style them.`, 'Open my brand dashboard', link, 'Every piece you add is checked by our team before players see it.'),
  };
}

export function brandRejectedEmail(to: string, name: string, brand: string, reason: string, link: string): Email {
  return {
    to,
    subject: `About your Saleeqa application for ${brand}`,
    ...layout(name, `Thank you for applying. We cannot approve ${brand} just now.${reason ? ` Reason: ${reason}` : ''}`, 'Visit Saleeqa', link, 'Reply to this email if you have questions.'),
  };
}

export function resetEmail(to: string, name: string, link: string): Email {
  return {
    to,
    subject: 'Reset your Saleeqa password',
    ...layout(name, 'Someone (hopefully you) asked to reset your Saleeqa password. The link works for one hour.', 'Choose a new password', link, 'If you did not ask for this, ignore this email: your password stays the same.'),
  };
}
