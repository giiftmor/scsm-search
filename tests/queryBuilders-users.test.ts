import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchUsersQuery,
  buildCountUsersQuery,
  buildResolveUserQuery,
} from '../src/db/queries/users.js';

test('search users: no q -> no WHERE clause, correct pagination', () => {
  const q = buildSearchUsersQuery({ page: 2, pageSize: 25 });
  assert.ok(!q.sql.includes('WHERE'));
  assert.deepEqual(q.inputs, { offset: 25, pageSize: 25 });
  assert.ok(q.sql.includes('ORDER BY u.DisplayName'));
  assert.ok(q.sql.includes('OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY'));
});

test('search users: q matches username, displayname, or upn per word', () => {
  const q = buildSearchUsersQuery({ q: 'john smith', page: 1, pageSize: 25 });
  assert.ok(q.sql.includes('@uq0'));
  assert.ok(q.sql.includes('@uq1'));
  assert.equal(q.inputs.uq0, 'john');
  assert.equal(q.inputs.uq1, 'smith');
  assert.ok(q.sql.includes('UserName_6AF77E23_669B_123F_B392_323C17097BBD'));
  assert.ok(q.sql.includes('UPN_7641DFF7_7A20_DC04_FC1C_B6FA8715DA02'));
  assert.ok(q.sql.includes('ServiceManager.dbo.MTV_System$Domain$User'));
  assert.ok(q.sql.includes('ESCAPE'));
});

test('search users: value is parameterized, never inlined', () => {
  const q = buildSearchUsersQuery({ q: "x' OR 1=1 --", page: 1, pageSize: 25 });
  assert.ok(q.sql.includes('@uq0'));
  assert.ok(!q.sql.includes("x'"));
});

test('count users mirrors the where clause', () => {
  const q = buildCountUsersQuery({ q: 'smith' });
  assert.ok(q.sql.startsWith('SELECT COUNT(*) AS Total'));
  assert.ok(q.sql.includes('@uq0'));
});

test('resolve user: matches guid, username, or upn', () => {
  const q = buildResolveUserQuery('jsmith');
  assert.ok(q.sql.includes('BaseManagedEntityId = TRY_CONVERT(uniqueidentifier, @id)'));
  assert.ok(q.sql.includes('UserName_6AF77E23_669B_123F_B392_323C17097BBD = @id'));
  assert.ok(q.sql.includes('UPN_7641DFF7_7A20_DC04_FC1C_B6FA8715DA02 = @id'));
  assert.deepEqual(q.inputs, { id: 'jsmith' });
});

test('resolve user: non-guid id never binds a bare uniqueidentifier comparison', () => {
  const q = buildResolveUserQuery('jsmith@nwu.ac.za');
  assert.ok(q.sql.includes('TRY_CONVERT(uniqueidentifier, @id)'));
  assert.ok(!q.sql.includes('BaseManagedEntityId = @id'));
});
