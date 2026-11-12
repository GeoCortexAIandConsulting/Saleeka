import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  isProd,
  jwtSecret: process.env.JWT_SECRET ?? (isProd ? '' : 'dev-secret-do-not-use-in-production'),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  adminKey: process.env.ADMIN_KEY ?? '',
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
  /** AI preview of a Studio look on a model (Gemini on Vertex AI). Off while the project is empty. */
  preview: {
    project: process.env.GOOGLE_CLOUD_PROJECT ?? '',
    location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    model: process.env.PREVIEW_MODEL || 'gemini-3-pro-image',
    /** New images a player may generate per 24 hours (a look already previewed is free). */
    dailyLimit: Number(process.env.PREVIEW_DAILY_LIMIT) || 10,
  },
};

if (isProd && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
}
