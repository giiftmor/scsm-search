import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import { ZodError } from 'zod';
import { errorHandler } from '../src/middleware/errorHandler.js';

function makeApp(boom: (() => never) | null) {
  const app = express();
  if (boom) {
    app.use('/boom', () => {
      boom();
    });
  }
  app.use(errorHandler);
  return app;
}

test('connection errors map to 503 DB_UNAVAILABLE', async () => {
  for (const code of ['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ECONNABORTED', 'ENOTFOUND', 'ETIMEOUT', 'ESOCKET']) {
    const res = await request(
      makeApp(() => {
        const err = new Error('db failed') as Error & { code: string };
        err.code = code;
        throw err;
      }),
    ).get('/boom');
    assert.equal(res.status, 503, `${code} -> 503`);
    assert.equal(res.body.error.code, 'DB_UNAVAILABLE', `${code} -> DB_UNAVAILABLE`);
  }
});

test('zod validation errors map to 400 VALIDATION with locked shape (no extra fields)', async () => {
  const res = await request(
    makeApp(() => {
      throw new ZodError([{ path: ['page'], message: 'must be a number', code: 'invalid_type', expected: 'number', received: 'string' }]);
    }),
  ).get('/boom');
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: { code: 'VALIDATION', message: 'Invalid query parameters' } });
});
