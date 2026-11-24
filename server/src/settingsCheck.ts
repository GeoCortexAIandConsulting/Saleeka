/**
 * Optional settings the live server should have. Each missing one gets one plain warning in the
 * log at start-up (production only); none of them stops the server. Required ones (JWT_SECRET) are
 * checked in config.ts and do stop it.
 */
type Env = Record<string, string | undefined>;
const empty = (v: string | undefined) => !v?.trim();

export function settingWarnings(env: Env): string[] {
  const out: string[] = [];
  const warn = (name: string, what: string) => out.push(`Setting ${name}: ${what}`);

  if (empty(env.MONGODB_URI)) warn('MONGODB_URI', 'not set, so the in-memory store is used and every account and look is lost on restart.');
  if (empty(env.WEB_ORIGIN)) warn('WEB_ORIGIN', 'not set, so email links point to localhost and the website cannot call the API.');
  if (empty(env.ADMIN_KEY)) warn('ADMIN_KEY', 'not set, so the /admin page (brands, reports) refuses everyone.');

  const provider = env.EMAIL_PROVIDER?.trim() || 'log';
  if (provider === 'log') warn('EMAIL_PROVIDER', 'not set to resend or brevo, so no confirmation or password-reset email is sent.');
  else if (empty(env.EMAIL_API_KEY)) warn('EMAIL_API_KEY', `not set, so ${provider} cannot send confirmation or password-reset emails.`);
  if (provider !== 'log' && empty(env.EMAIL_FROM)) warn('EMAIL_FROM', 'not set, so emails come from hello@saleeqa.pk, which your email provider may refuse.');

  if (empty(env.GOOGLE_API_KEY) && empty(env.GOOGLE_CLOUD_PROJECT)) warn('GOOGLE_API_KEY', 'not set (nor GOOGLE_CLOUD_PROJECT), so AI previews are hidden.');
  if (env.PREVIEWS_OFF === 'true') warn('PREVIEWS_OFF', 'is true, so new AI previews are switched off for everyone.');
  if (empty(env.LAUNCH_ENDS)) warn('LAUNCH_ENDS', 'not set, so the launch contest ends at the default (end of 3 Dec 2026, Pakistan time).');
  return out;
}
