import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import type { ConnectionPool } from 'mssql';
import { metaRouter } from '../src/routes/meta.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

function fakePool(recordSets: unknown[][]): ConnectionPool {
  let call = 0;
  return {
    request() {
      return {
        input() {},
        async query() {
          return { recordset: recordSets[Math.min(call++, recordSets.length - 1)] ?? [] };
        },
      };
    },
  } as unknown as ConnectionPool;
}

test('GET /v1/meta/filters groups distinct tiers and statuses', async () => {
  const rows = [
    { FilterType: 'tier', Value: 'Potch Staff Service Desk' },
    { FilterType: 'tier', Value: 'Operations' },
    { FilterType: 'status', Value: 'Closed' },
  ];
  const app = express();
  app.use('/v1/meta', metaRouter({ pool: fakePool([rows]) }));
  app.use(errorHandler);
  const res = await request(app).get('/v1/meta/filters');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    tiers: ['Potch Staff Service Desk', 'Operations'],
    statuses: ['Closed'],
  });
});
