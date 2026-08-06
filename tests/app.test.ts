import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
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

function countingPool(): { pool: ConnectionPool; queries: number; inputs: number } {
  const state = { queries: 0, inputs: 0 };
  const pool = {
    request() {
      return {
        input() {
          state.inputs += 1;
        },
        async query() {
          state.queries += 1;
          return { recordset: [] };
        },
      };
    },
  } as unknown as ConnectionPool;
  return { pool, get queries() { return state.queries; }, get inputs() { return state.inputs; } };
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

test('unknown v1 route requires auth then 404s with uniform shape', async () => {
  const noKey = await request(makeApp()).get('/v1/nope');
  assert.equal(noKey.status, 401);
  const withKey = await request(makeApp()).get('/v1/nope').set('x-api-key', 'n8n-secret');
  assert.equal(withKey.status, 404);
  assert.equal(withKey.body.error.code, 'NOT_FOUND');
});

test('a DB failure inside a router surfaces through errorHandler as 503', async () => {
  const pool = {
    request() {
      return {
        input() {},
        async query() {
          const err = new Error('connect ECONNREFUSED') as Error & { code: string };
          err.code = 'ECONNREFUSED';
          throw err;
        },
      };
    },
  } as unknown as ConnectionPool;
  const app = createApp({ pool, searchMode: 'fts', apiKeys: ['n8n-secret'] });
  const res = await request(app).get('/v1/search/users').set('x-api-key', 'n8n-secret');
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'DB_UNAVAILABLE');
});

test('authenticated routes actually hit the pool (query + input)', async () => {
  const c = countingPool();
  const app = createApp({ pool: c.pool, searchMode: 'fts', apiKeys: ['n8n-secret'] });
  await request(app).get('/v1/search/users').set('x-api-key', 'n8n-secret').query({ q: 'smith' });
  assert.ok(c.queries >= 2, 'search users runs count + list queries');
  assert.ok(c.inputs >= 2, 'each query binds at least one input');
});
