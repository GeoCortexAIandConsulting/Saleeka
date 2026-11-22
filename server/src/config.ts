import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

/** A whole number from the environment; 0 means 0 (e.g. "previews off"), and empty or not a number means the default. */
export function envCount(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  isProd,
  jwtSecret: process.env.JWT_SECRET ?? (isProd ? '' : 'dev-secret-do-not-use-in-production'),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  adminKey: process.env.ADMIN_KEY ?? '',
  /**
   * Email confirmation for new players (EMAIL_CONFIRMATION=on). Off for now: sign-up signs the player in
   * at once, and nothing (sign-in, AI previews, trusted likes) waits for a confirmed email.
   */
  emailConfirmation: process.env.EMAIL_CONFIRMATION === 'on',
  /**
   * The admin portal's own sign-in (/admin), separate from player accounts. The portal is off until both
   * are set; in production the password must be at least 12 characters.
   */
  admin: {
    username: (process.env.ADMIN_USERNAME ?? '').trim(),
    password: process.env.ADMIN_PASSWORD ?? '',
  },
  mongoUri: process.env.MONGODB_URI ?? '',
  mongoDb: process.env.MONGODB_DB ?? 'saleeqa',
  llm: {
    provider: (process.env.LLM_PROVIDER ?? 'rules') as 'rules' | 'openai',
    baseUrl: process.env.LLM_BASE_URL ?? 'http://localhost:11434/v1',
    model: process.env.LLM_MODEL ?? 'qwen2.5:7b-instruct',
    apiKey: process.env.LLM_API_KEY ?? '',
    /** Slow local models need longer than a hosted one; past this, the rule composer takes over. */
    styleTimeoutMs: Number(process.env.LLM_STYLE_TIMEOUT_MS) || 25000,
  },
  /** AI preview of a Studio look on a model (Gemini on Vertex AI). Off while both project and API key are empty. */
  preview: {
    project: process.env.GOOGLE_CLOUD_PROJECT ?? '',
    /** A Google Cloud API key restricted to the Vertex AI API. When set, it is used instead of a gcloud sign-in. */
    apiKey: process.env.GOOGLE_API_KEY ?? '',
    location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    model: process.env.PREVIEW_MODEL || 'gemini-3-pro-image',
    /** New images a player may generate per 24 hours (a look already previewed is free). */
    dailyLimit: envCount('PREVIEW_DAILY_LIMIT', 10),
    /** Previews every account gets for life, before any are earned */
    free: envCount('PREVIEW_FREE', 1),
    /** One more preview for every this many friends who join from the player's share link and publish a look */
    friendsForCredit: Math.max(1, envCount('PREVIEW_FRIENDS_FOR_CREDIT', 3)),
    /** Most previews one player can ever earn from friends */
    friendCreditCap: envCount('PREVIEW_FRIEND_CREDIT_CAP', 5),
    /** New images across all players per 24 hours: one busy night cannot spend the Google credit (0 = none) */
    globalDailyCap: envCount('PREVIEW_GLOBAL_DAILY_CAP', 300),
    /** The emergency switch: PREVIEWS_OFF=true stops new previews for everyone (publishing still works) */
    off: process.env.PREVIEWS_OFF === 'true',
    /** A verified email is needed before the first preview (fake accounts cannot farm free previews) */
    requireVerifiedEmail: process.env.PREVIEW_REQUIRE_VERIFIED_EMAIL !== 'false',
    /** What one new preview image costs, in US dollars (for the admin portal's spending figures) */
    costUsd: Number(process.env.PREVIEW_COST_USD) || 0.13,
  },
  /** The launch challenges are featured first until this moment (default: a week after launch, 27 Nov 2026) */
  launchEnds: process.env.LAUNCH_ENDS || '2026-12-04T23:59:59+05:00',
  /**
   * Account emails (verification, password reset). resend or brevo with an API key; without one,
   * emails are printed to the server log (fine on a laptop, not for real players).
   */
  email: {
    provider: (process.env.EMAIL_PROVIDER || 'log') as 'resend' | 'brevo' | 'log',
    apiKey: process.env.EMAIL_API_KEY ?? '',
    /** "Saleeqa <hello@your-domain.com>": an address the provider has verified */
    from: process.env.EMAIL_FROM || 'Saleeqa <hello@saleeqa.pk>',
  },
};

if (isProd && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
}
