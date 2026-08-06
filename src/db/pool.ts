import sql from 'mssql';
import type { AppConfig } from '../config.js';

export function makePool(config: AppConfig): sql.ConnectionPool {
  return new sql.ConnectionPool({
    server: config.dbServer,
    user: config.dbUser,
    password: config.dbPassword,
    database: 'CiresonAnalytics',
    options: { encrypt: true, trustServerCertificate: true },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  });
}
