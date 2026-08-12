import { Router } from 'express';
import type { ConnectionPool } from 'mssql';
import { exec } from '../db/exec.js';
import { buildFiltersQuery, type FilterRow } from '../db/queries/meta.js';

export function metaRouter(opts: { pool: ConnectionPool }): Router {
  const router = Router();

  router.get('/filters', async (_req, res) => {
    const rows = await exec<FilterRow>(opts.pool, buildFiltersQuery());
    const tiers: string[] = [];
    const statuses: string[] = [];
    for (const row of rows) {
      if (row.FilterType === 'tier') tiers.push(row.Value);
      else statuses.push(row.Value);
    }
    res.json({ tiers, statuses });
  });

  return router;
}
