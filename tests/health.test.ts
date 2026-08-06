import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import type { ConnectionPool } from 'mssql';
import { healthRouter } from '../src/routes/health.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

function fakePool(fail = false): ConnectionPool {
  return {
    request() {
      return {
        input() {},
        async query() {
          if (fail) {
            const err = new Error('connect ECONNREFUSED') as Error & { code: string };
            err.code = 'ECONNREFUSED';
            throw err;
          }
          return { recordset: [{ ok: 1 }] };
        },
      };
    },
  } as unknown as ConnectionPool;
}

function makeApp(pool: ConnectionPool) {
  const app = express();
  app.use('/healthz', healthRouter({ pool }));
  app.use(errorHandler);
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
  return app;
}

test('healthz returns 200 when pool responds', async () => {
  const res = await request(makeApp(fakePool())).get('/healthz');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
});

test('healthz returns 503 when pool is unreachable', async () => {
  const res = await request(makeApp(fakePool(true))).get('/healthz');
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'DB_UNAVAILABLE');
});

test('unknown route falls through to 404 with uniform shape', async () => {
  const res = await request(makeApp(fakePool())).get('/nope');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.message, 'Not found');
});
