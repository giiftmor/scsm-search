import { pino } from 'pino';
import { loadConfig } from './config.js';
import { makePool } from './db/pool.js';
import { createApp } from './app.js';

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.dbServer || config.apiKeys.length === 0) {
    throw new Error('DB_SERVER and API_KEYS must be set (see .env.example)');
  }
  const logger = pino();
  const pool = makePool(config);
  await pool.connect();
  const app = createApp({ pool, searchMode: config.searchMode, apiKeys: config.apiKeys });
  app.listen(config.port, () => {
    logger.info({ port: config.port, searchMode: config.searchMode }, 'scsm-search listening');
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
