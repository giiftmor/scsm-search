import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import type { ConnectionPool } from 'mssql';
import { searchRouter } from '../src/routes/search.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

function fakePool(recordSets: unknown[][]): ConnectionPool {
  let call = 0;
  return {
    request() {
      return {
        input(name: string, value: unknown) {
          this.inputs = this.inputs ?? {};
          this.inputs[name] = value;
        },
        async query(_sql: string) {
          return { recordset: recordSets[Math.min(call++, recordSets.length - 1)] ?? [] };
        },
      };
    },
  } as unknown as ConnectionPool;
}

function makeApp(pool: ConnectionPool) {
  const app = express();
  app.use('/v1/search', searchRouter({ pool, searchMode: 'fts' }));
  app.use(errorHandler);
  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }));
  return app;
}

const ticketRow = {
  Id: 'a',
  WorkItemId: 'IR1',
  Title: 'Printer down',
  Status: 'Active',
  Priority: '2',
  CreatedDate: '2026-07-01T09:00:00Z',
  AffectedUser: 'John Smith',
  AffectedUserId: 'g',
};

test('GET /v1/search/tickets returns mapped results + pagination', async () => {
  const app = makeApp(fakePool([[ticketRow], [{ Total: 1 }]]));
  const res = await request(app).get('/v1/search/tickets').query({ type: 'incident', q: 'printer' });
  assert.equal(res.status, 200);
  assert.equal(res.body.results[0].workItemId, 'IR1');
  assert.equal(res.body.results[0].createdDate, '2026-07-01T09:00:00Z');
  assert.equal(res.body.total, 1);
  assert.equal(res.body.page, 1);
  assert.equal(res.body.pageSize, 25);
});

test('GET /v1/search/tickets without type -> 400 validation', async () => {
  const app = makeApp(fakePool([]));
  const res = await request(app).get('/v1/search/tickets').query({ q: 'x' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION');
});

test('GET /v1/search/users returns mapped users', async () => {
  const app = makeApp(
    fakePool([[{ Id: 'g', UserId: 'jsmith', DisplayName: 'John Smith', UPN: 'jsmith@nwu.ac.za' }], [{ Total: 1 }]])
  );
  const res = await request(app).get('/v1/search/users').query({ q: 'jsmith' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.results[0], {
    id: 'g',
    userId: 'jsmith',
    displayName: 'John Smith',
    upn: 'jsmith@nwu.ac.za',
  });
});
