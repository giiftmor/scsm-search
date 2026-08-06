import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { ConnectionPool } from 'mssql';
import { createApp } from '../src/app.js';

function fakePool(): ConnectionPool {
  return {
    request() {
      return {
        input() {},
        async query() {
          return { recordset: [] };
        },
      };
    },
  } as unknown as ConnectionPool;
}

function makeApp() {
  return createApp({ pool: fakePool(), searchMode: 'fts', apiKeys: ['n8n-secret'] });
}

test('healthz is unauthenticated', async () => {
  const res = await request(makeApp()).get('/healthz');
  assert.equal(res.status, 200);
});

test('v1 routes require an api key', async () => {
  const res = await request(makeApp()).get('/v1/search/users');
  assert.equal(res.status, 401);
});

test('v1 routes accept a valid api key', async () => {
  const res = await request(makeApp()).get('/v1/search/users').set('x-api-key', 'n8n-secret');
  assert.equal(res.status, 200);
});

test('unknown route -> 404 JSON', async () => {
  const res = await request(makeApp()).get('/nope');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});
