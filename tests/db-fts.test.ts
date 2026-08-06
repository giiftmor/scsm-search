import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ConnectionPool } from 'mssql';
import { checkFtsCatalog } from '../src/db/fts.js';

function fakePool(recordset: unknown[], fail = false): ConnectionPool {
  return {
    request() {
      return {
        input() {},
        async query() {
          if (fail) {
            const err = new Error('db unavailable') as Error & { code: string };
            err.code = 'ECONNREFUSED';
            throw err;
          }
          return { recordset };
        },
      };
    },
  } as unknown as ConnectionPool;
}

test('checkFtsCatalog returns true when a catalog exists', async () => {
  const ok = await checkFtsCatalog(fakePool([{ n: 1 }]));
  assert.equal(ok, true);
});

test('checkFtsCatalog returns false when no catalog exists', async () => {
  const ok = await checkFtsCatalog(fakePool([{ n: 0 }]));
  assert.equal(ok, false);
});

test('checkFtsCatalog throws when the probe query fails', async () => {
  await assert.rejects(checkFtsCatalog(fakePool([], true)));
});
