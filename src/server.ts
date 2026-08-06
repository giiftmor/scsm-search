import { pino } from 'pino';
import { loadConfig } from './config.js';
import { makePool } from './db/pool.js';
import { checkFtsCatalog } from './db/fts.js';
import { createApp } from './app.js';

const logger = pino();

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.dbServer || config.apiKeys.length === 0) {
    throw new Error('DB_SERVER and API_KEYS must be set (see .env.example)');
  }
  const pool = makePool(config);
  await pool.connect();
  if (config.searchMode === 'fts') {
    const ftsAvailable = await checkFtsCatalog(pool);
    if (!ftsAvailable) {
      logger.warn('FTS catalog not found on CiresonAnalytics — SEARCH_MODE=fts searches will fail; set SEARCH_MODE=like until the DW admin provisions it');
    }
  }
  const app = createApp({ pool, searchMode: config.searchMode, apiKeys: config.apiKeys });
  app.listen(config.port, () => {
    logger.info({ port: config.port, searchMode: config.searchMode }, 'scsm-search listening');
  });
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
