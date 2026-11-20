import { config } from './config.js';
import { createApp } from './app.js';
import { createMemoryRepos, createMongoRepos } from './db/index.js';
import { createLlm } from './services/llm.js';

async function main() {
  const repos = config.mongoUri
    ? await createMongoRepos(config.mongoUri, config.mongoDb)
    : createMemoryRepos();
  if (!config.mongoUri) {
    console.warn('MONGODB_URI is not set: using the in-memory demo store. Data resets on restart.');
  }
  if (config.isProd && (config.email.provider === 'log' || !config.email.apiKey)) {
    console.warn(
      'EMAIL IS NOT SET UP: set EMAIL_PROVIDER, EMAIL_API_KEY and EMAIL_FROM. Until then no verification or ' +
        'password-reset email is sent, so players cannot confirm their email or make AI previews.',
    );
  }
  if (config.preview.off) console.warn('AI previews are switched off for everyone (PREVIEWS_OFF=true).');
  const llm = createLlm();
  const app = await createApp({ repos, llm });
  const server = app.listen(config.port, () => {
    console.log(`Saleeqa API on http://localhost:${config.port} (store: ${config.mongoUri ? 'mongodb' : 'memory'}, llm: ${llm.name})`);
  });
  const shutdown = async () => {
    server.close();
    await repos.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
