import type { ConnectionPool } from 'mssql';
import { exec } from './exec.js';

export async function checkFtsCatalog(pool: ConnectionPool): Promise<boolean> {
  try {
    const rows = await exec<{ n: number }>(pool, {
      sql: 'SELECT COUNT(*) AS n FROM sys.fulltext_catalogs',
      inputs: {},
    });
    return rows.length > 0 && Number(rows[0].n) > 0;
  } catch {
    return false;
  }
}
