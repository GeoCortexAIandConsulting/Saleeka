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
  },
};

if (isProd && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
}
