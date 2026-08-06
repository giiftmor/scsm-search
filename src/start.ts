import type { Server } from 'node:http';
import { pino, type Logger } from 'pino';
import type { ConnectionPool } from 'mssql';
import type { AppConfig } from './config.js';
import { makePool } from './db/pool.js';
import { checkFtsCatalog } from './db/fts.js';
import { createApp } from './app.js';

export interface StartDeps {
  logger?: Logger;
  pool?: ConnectionPool;
}

export async function start(config: AppConfig, deps: StartDeps = {}): Promise<Server> {
  const logger = deps.logger ?? pino();
  if (!config.dbServer || config.apiKeys.length === 0) {
    throw new Error('DB_SERVER and API_KEYS must be set (see .env.example)');
  }
  const pool = deps.pool ?? makePool(config);
  if (!deps.pool) {
    await pool.connect();
  }
  if (config.searchMode === 'fts') {
    try {
      const ftsAvailable = await checkFtsCatalog(pool);
      if (!ftsAvailable) {
        logger.warn('FTS catalog not found on CiresonAnalytics — SEARCH_MODE=fts searches will fail; set SEARCH_MODE=like until the DW admin provisions it');
      }
    } catch (err) {
      logger.warn({ err }, 'FTS catalog probe failed — SEARCH_MODE=fts searches may fail');
    }
  }
  const app = createApp({ pool, searchMode: config.searchMode, apiKeys: config.apiKeys });
  return app.listen(config.port, () => {
    logger.info({ port: config.port, searchMode: config.searchMode }, 'scsm-search listening');
  });
}
