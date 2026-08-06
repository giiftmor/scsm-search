import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import { createAuthMiddleware } from '../src/middleware/auth.js';

function makeApp() {
  const app = express();
  app.use(createAuthMiddleware(['n8n-secret', 'compass-secret']));
  app.get('/protected', (_req, res) => res.json({ ok: true }));
  return app;
}

test('rejects missing API key with 401', async () => {
  const res = await request(makeApp()).get('/protected');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('rejects wrong API key', async () => {
  const res = await request(makeApp()).get('/protected').set('x-api-key', 'wrong');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('accepts a valid API key', async () => {
  const res = await request(makeApp()).get('/protected').set('x-api-key', 'n8n-secret');
  assert.equal(res.status, 200);
});

test('accepts any configured key', async () => {
  const res = await request(makeApp()).get('/protected').set('x-api-key', 'compass-secret');
  assert.equal(res.status, 200);
});

test('empty key list rejects everything', async () => {
  const app = express();
  app.use(createAuthMiddleware([]));
  app.get('/x', (_req, res) => res.json({}));
  const res = await request(app).get('/x').set('x-api-key', 'anything');
  assert.equal(res.status, 401);
});
