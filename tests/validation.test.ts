import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
import {
  ticketSearchParamsSchema,
  userSearchParamsSchema,
  userTicketsParamsSchema,
} from '../src/schemas/searchParams.js';

test('ticket search: requires type', () => {
  assert.throws(
    () => ticketSearchParamsSchema.parse({}),
    (err: unknown) => err instanceof ZodError && err.issues[0].path[0] === 'type'
  );
});

test('ticket search: rejects unknown type', () => {
  assert.throws(() => ticketSearchParamsSchema.parse({ type: 'change' }));
});

test('ticket search: coerces page params to numbers', () => {
  const p = ticketSearchParamsSchema.parse({ type: 'incident', page: '3', pageSize: '50' });
  assert.equal(p.page, 3);
  assert.equal(p.pageSize, 50);
});

test('ticket search: defaults page/pageSize', () => {
  const p = ticketSearchParamsSchema.parse({ type: 'incident' });
  assert.equal(p.page, 1);
  assert.equal(p.pageSize, 25);
});

test('ticket search: parses ISO dates', () => {
  const p = ticketSearchParamsSchema.parse({ type: 'incident', from: '2026-07-01', to: '2026-07-31T00:00:00Z' });
  assert.ok(p.from instanceof Date);
  assert.ok(p.to instanceof Date);
});

test('ticket search: rejects invalid page values', () => {
  assert.throws(() => ticketSearchParamsSchema.parse({ type: 'incident', page: '0' }));
  assert.throws(() => ticketSearchParamsSchema.parse({ type: 'incident', pageSize: '101' }));
});

test('ticket search: rejects invalid date', () => {
  assert.throws(() => ticketSearchParamsSchema.parse({ type: 'incident', from: 'not-a-date' }));
});

test('user search: defaults applied', () => {
  const p = userSearchParamsSchema.parse({});
  assert.equal(p.page, 1);
  assert.equal(p.pageSize, 25);
});

test('user tickets: defaults applied', () => {
  const p = userTicketsParamsSchema.parse({});
  assert.equal(p.page, 1);
  assert.equal(p.pageSize, 25);
});
