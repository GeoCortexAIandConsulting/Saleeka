import { config } from './config.js';
import { createApp } from './app.js';
import { createMemoryRepos, createMongoRepos } from './db/index.js';
import { createLlm } from './services/llm.js';
import { settingWarnings } from './settingsCheck.js';

async function main() {
  const repos = config.mongoUri
    ? await createMongoRepos(config.mongoUri, config.mongoDb)
    : createMemoryRepos();
  // Live: one plain warning per missing optional setting (none of them stops the server).
  if (config.isProd) for (const w of settingWarnings(process.env)) console.warn(w);
  else if (!config.mongoUri) console.warn('MONGODB_URI is not set: using the in-memory demo store. Data resets on restart.');
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
