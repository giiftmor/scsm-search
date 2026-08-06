import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchTicketsQuery,
  buildCountTicketsQuery,
  buildUserTicketsQuery,
  buildCountUserTicketsQuery,
} from '../src/db/queries/tickets.js';
import { rowToTicket } from '../src/serializers/ticket.js';

const base = { type: 'incident', page: 1, pageSize: 25 } as const;

test('search tickets: selects the incident table', () => {
  const q = buildSearchTicketsQuery(base, 'fts');
  assert.ok(q.sql.includes('FROM CiresonAnalytics.dbo.SM_WorkItem_Incident'));
  assert.ok(!q.sql.includes('ServiceRequest'));
});

test('search tickets: selects the servicerequest table', () => {
  const q = buildSearchTicketsQuery({ ...base, type: 'servicerequest' }, 'fts');
  assert.ok(q.sql.includes('FROM CiresonAnalytics.dbo.SM_WorkItem_ServiceRequest'));
});

test('search tickets: fts mode uses CONTAINS with a neutralized term', () => {
  const q = buildSearchTicketsQuery({ ...base, q: 'printer "HP"' }, 'fts');
  assert.ok(q.sql.includes('CONTAINS((Title, Description, ResolutionDescription), @q)'));
  assert.equal(q.inputs.q, '"printer" AND "HP"');
});

test('search tickets: fts mode quotes each token so reserved words are literal', () => {
  const q = buildSearchTicketsQuery({ ...base, q: 'printer OR AND NOT NEAR FORMSOF * ()' }, 'fts');
  assert.equal(q.inputs.q, '"printer" AND "OR" AND "AND" AND "NOT" AND "NEAR" AND "FORMSOF"');
  assert.ok(!q.sql.includes('*'));
});

test('search tickets: fts mode drops a term that sanitizes to empty (no CONTAINS, no 500)', () => {
  const q = buildSearchTicketsQuery({ ...base, q: '"' }, 'fts');
  assert.ok(!q.sql.includes('CONTAINS'));
  assert.ok(!('q' in q.inputs));
});

test('search tickets: like mode uses LIKE', () => {
  const q = buildSearchTicketsQuery({ ...base, q: 'printer' }, 'like');
  assert.ok(q.sql.includes("Title LIKE '%' + @q + '%'"));
  assert.ok(!q.sql.includes('CONTAINS'));
});

test('search tickets: all filters bind as parameters', () => {
  const q = buildSearchTicketsQuery(
    {
      ...base,
      status: 'Active',
      priority: '2',
      affectedUserId: 'jsmith',
      createdByUserId: 'jbloggs',
      assignedUserId: 'jdoe',
      from: new Date('2026-07-01'),
      to: new Date('2026-07-31'),
    },
    'fts'
  );
  assert.ok(q.sql.includes('Status = @status'));
  assert.ok(q.sql.includes('Priority = @priority'));
  assert.ok(q.sql.includes('AffectedUserId'));
  assert.ok(q.sql.includes('CreatedByUserId'));
  assert.ok(q.sql.includes('AssignedUserId'));
  assert.ok(q.sql.includes('Created >= @from'));
  assert.ok(q.sql.includes('DATEADD(DAY, 1, @to)'));
  assert.equal(q.inputs.status, 'Active');
  assert.equal(q.inputs.affectedUserId, 'jsmith');
  assert.ok(q.inputs.from instanceof Date);
  assert.ok(q.inputs.to instanceof Date);
  assert.equal(q.inputs.to.toISOString(), new Date('2026-07-31').toISOString());
});

test('search tickets: value is parameterized, never inlined', () => {
  const q = buildSearchTicketsQuery({ ...base, q: "'; DROP TABLE x; --" }, 'fts');
  assert.ok(q.sql.includes('@q'));
  assert.ok(!q.sql.includes('DROP'));
});

test('search tickets: pagination params', () => {
  const q = buildSearchTicketsQuery({ ...base, page: 3, pageSize: 50 }, 'fts');
  assert.deepEqual(q.inputs.offset, 100);
  assert.deepEqual(q.inputs.pageSize, 50);
  assert.ok(q.sql.includes('OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY'));
});

test('count tickets shares the where clause', () => {
  const q = buildCountTicketsQuery({ ...base, status: 'Active' }, 'fts');
  assert.ok(q.sql.startsWith('SELECT COUNT(*) AS Total'));
  assert.ok(q.sql.includes('Status = @status'));
});

test('user tickets: union all with discriminator and pagination', () => {
  const q = buildUserTicketsQuery('GUID', { page: 2, pageSize: 25 });
  assert.ok(q.sql.includes("'incident' AS TicketType"));
  assert.ok(q.sql.includes("SELECT 'servicerequest'"));
  assert.ok(q.sql.includes('UNION ALL'));
  assert.ok(q.sql.includes('ORDER BY CreatedDate DESC'));
  assert.deepEqual(q.inputs, { userId: 'GUID', offset: 25, pageSize: 25 });
});

test('count user tickets: subquery union', () => {
  const q = buildCountUserTicketsQuery('GUID');
  assert.ok(q.sql.includes('UNION ALL'));
  assert.ok(q.sql.includes('COUNT(*)'));
});

test('rowToTicket maps a row to the API shape', () => {
  const row = {
    Id: 'a',
    WorkItemId: 'IR1',
    Title: 't',
    Status: 'Active',
    Priority: '2',
    CreatedDate: new Date('2026-07-01T09:00:00Z'),
    AffectedUser: 'John Smith',
    AffectedUserId: 'g',
  };
  const t = rowToTicket(row);
  assert.equal(t.workItemId, 'IR1');
  assert.equal(t.createdDate, '2026-07-01T09:00:00.000Z');
  assert.deepEqual(t.affectedUser, { id: 'g', displayName: 'John Smith' });
});

test('rowToTicket handles a null affected user', () => {
  const row = {
    Id: 'a',
    WorkItemId: 'IR1',
    Title: 't',
    Status: 'Active',
    Priority: '2',
    CreatedDate: '2026-07-01',
    AffectedUser: null,
    AffectedUserId: null,
  };
  assert.equal(rowToTicket(row).affectedUser, null);
});

test('rowToTicket keeps ticketType when present', () => {
  const row = {
    Id: 'a',
    WorkItemId: 'IR1',
    Title: 't',
    Status: 'Active',
    Priority: '2',
    CreatedDate: '2026-07-01',
    AffectedUser: null,
    AffectedUserId: null,
    TicketType: 'incident',
  };
  assert.equal(rowToTicket(row).ticketType, 'incident');
});
