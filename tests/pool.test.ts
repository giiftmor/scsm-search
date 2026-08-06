import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePool } from '../src/db/pool.js';

const cfg = {
  dbServer: 'srv',
  dbUser: 'user',
  dbPassword: 'pw',
  apiKeys: [],
  port: 3000,
  searchMode: 'like' as const,
};

test('pool: targets CiresonAnalytics and trusts the self-signed NWU warehouse cert', () => {
  const pool = makePool(cfg);
  assert.equal(pool.config.server, 'srv');
  assert.equal(pool.config.user, 'user');
  assert.equal(pool.config.password, 'pw');
  assert.equal(pool.config.database, 'CiresonAnalytics');
  assert.equal(pool.config.options?.encrypt, true);
  assert.equal(pool.config.options?.trustServerCertificate, true);
});
