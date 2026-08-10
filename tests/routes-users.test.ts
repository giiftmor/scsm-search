import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import type { ConnectionPool } from 'mssql';
import { usersRouter } from '../src/routes/users.js';
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
  app.use('/v1/users', usersRouter({ pool }));
  app.use(errorHandler);
  return app;
}

function capturingPool(recordSets: unknown[][]): { pool: ConnectionPool; calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  let call = 0;
  const pool = {
    request() {
      return {
        input(name: string, value: unknown) {
          this.inputs = this.inputs ?? {};
          this.inputs[name] = value;
        },
        async query(_sql: string) {
          const req = this as unknown as { inputs: Record<string, unknown> };
          calls.push(req.inputs ?? {});
          return { recordset: recordSets[Math.min(call++, recordSets.length - 1)] ?? [] };
        },
      };
    },
  } as unknown as ConnectionPool;
  return { pool, calls };
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
  TicketType: 'incident',
};

test('resolves user id then returns merged tickets', async () => {
  const pool = fakePool([[{ Id: 'GUID' }], [ticketRow], [{ Total: 1 }]]);
  const res = await request(makeApp(pool)).get('/v1/users/jsmith/tickets');
  assert.equal(res.status, 200);
  assert.equal(res.body.results[0].ticketType, 'incident');
  assert.equal(res.body.total, 1);
  assert.equal(res.body.page, 1);
  assert.equal(res.body.pageSize, 25);
});

test('resolves user id then returns merged tickets with envelope', async () => {
  const pool = fakePool([[{ Id: 'GUID' }], [ticketRow], [{ Total: 1 }]]);
  const res = await request(makeApp(pool)).get('/v1/users/jsmith/tickets').query({ page: 2, pageSize: 5 });
  assert.equal(res.status, 200);
  assert.equal(res.body.page, 2);
  assert.equal(res.body.pageSize, 5);
  assert.equal(res.body.total, 1);
});

test('binds the id and resolved user id as inputs', async () => {
  const { pool, calls } = capturingPool([[{ Id: 'GUID' }], [ticketRow], [{ Total: 1 }]]);
  const res = await request(makeApp(pool)).get('/v1/users/jsmith/tickets').query({ page: 2, pageSize: 5 });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0], { id: 'jsmith' });
  assert.deepEqual(calls[1], { userId: 'GUID', offset: 5, pageSize: 5 });
  assert.deepEqual(calls[2], { userId: 'GUID' });
});

test('unknown user -> 404', async () => {
  const res = await request(makeApp(fakePool([[]]))).get('/v1/users/nobody/tickets');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});

test('ambiguous user -> 400', async () => {
  const res = await request(makeApp(fakePool([[{ Id: 'a' }, { Id: 'b' }]]))).get('/v1/users/x/tickets');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'AMBIGUOUS');
});

test('validates pagination params', async () => {
  const res = await request(makeApp(fakePool([[]]))).get('/v1/users/jsmith/tickets').query({ page: '0' });
  assert.equal(res.status, 400);
});

test('role is forwarded to the count query', async () => {
  const { pool, calls } = capturingPool([[{ Id: 'GUID' }], [ticketRow], [{ Total: 1 }]]);
  const res = await request(makeApp(pool)).get('/v1/users/jsmith/tickets').query({ role: 'assigned' });
  assert.equal(res.status, 200);
  assert.deepEqual(calls[2], { userId: 'GUID' });
});

test('invalid role -> 400', async () => {
  const res = await request(makeApp(fakePool([[]]))).get('/v1/users/jsmith/tickets').query({ role: 'bogus' });
  assert.equal(res.status, 400);
});
