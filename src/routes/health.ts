import { Router } from 'express';
import type { ConnectionPool } from 'mssql';
import { exec } from '../db/exec.js';

export function healthRouter(opts: { pool: ConnectionPool }): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    await exec(opts.pool, { sql: 'SELECT 1 AS ok', inputs: {} });
    res.json({ status: 'ok' });
  });
  return router;
}
