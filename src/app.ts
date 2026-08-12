import express from 'express';
import { pinoHttp } from 'pino-http';
import type { ConnectionPool } from 'mssql';
import { createAuthMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { metaRouter } from './routes/meta.js';
import { searchRouter } from './routes/search.js';
import { usersRouter } from './routes/users.js';

export interface AppDeps {
  pool: ConnectionPool;
  searchMode: 'fts' | 'like';
  apiKeys: string[];
}

export function createApp({ pool, searchMode, apiKeys }: AppDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(pinoHttp({ level: process.env.LOG_LEVEL ?? 'info', redact: ['req.headers["x-api-key"]'] }));

  app.use('/healthz', healthRouter({ pool }));
  app.use('/v1', createAuthMiddleware(apiKeys));
  app.use('/v1/meta', metaRouter({ pool }));
  app.use('/v1/search', searchRouter({ pool, searchMode }));
  app.use('/v1/users', usersRouter({ pool }));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
  app.use(errorHandler);
  return app;
}
