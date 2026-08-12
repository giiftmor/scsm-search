import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchTicketsQuery,
  buildCountTicketsQuery,
  buildUserTicketsQuery,
  buildCountUserTicketsQuery,
  roleColumn,
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
  assert.ok(q.sql.includes("Title LIKE '%' + @tok0 + '%'"));
  assert.ok(!q.sql.includes('CONTAINS'));
});

test('search tickets: q also matches WorkItemId in fts mode', () => {
  const q = buildSearchTicketsQuery({ ...base, q: 'IR1660031' }, 'fts');
  assert.ok(q.sql.includes("WorkItemId LIKE '%' + @qId + '%'"));
  assert.equal(q.inputs.qId, 'IR1660031');
});

test('search tickets: q also matches WorkItemId in like mode', () => {
  const q = buildSearchTicketsQuery({ ...base, q: 'IR1660031' }, 'like');
  assert.ok(q.sql.includes("WorkItemId LIKE '%' + @tok0 + '%'"));
  assert.equal(q.inputs.tok0, 'IR1660031');
});

test('search tickets: like mode tokenizes q into per-word AND groups', () => {
  const q = buildSearchTicketsQuery({ ...base, q: 'printer jam' }, 'like');
  assert.ok(q.sql.includes('WorkItemId LIKE \'%\' + @tok0 + \'%\''));
  assert.ok(q.sql.includes('WorkItemId LIKE \'%\' + @tok1 + \'%\''));
  assert.equal(q.inputs.tok0, 'printer');
  assert.equal(q.inputs.tok1, 'jam');
  assert.ok(q.sql.split('\n  AND ').length >= 2, 'two token groups joined by AND');
});

test('search tickets: like mode matches Tier and Location columns per token', () => {
  const q = buildSearchTicketsQuery({ ...base, q: 'a21' }, 'like');
  assert.ok(q.sql.includes('Tier LIKE \'%\' + @tok0 + \'%\''));
  assert.ok(q.sql.includes('CurrentLocation_DC52702B_4C6C_AE3D_56FA_5ED1522FDE0A LIKE \'%\' + @tok0 + \'%\''));
  const sr = buildSearchTicketsQuery({ ...base, type: 'servicerequest', q: 'a21' }, 'like');
  assert.ok(sr.sql.includes('CurrentLocation_89125754_0643_0DA6_D2EB_50167E386A23 LIKE \'%\' + @tok0 + \'%\''));
});

test('search tickets: like mode escapes LIKE wildcards in tokens', () => {
  const q = buildSearchTicketsQuery({ ...base, q: '50%_ok' }, 'like');
  assert.ok(q.sql.includes("ESCAPE '\\'"));
  assert.equal(q.inputs.tok0, '50\\%\\_ok');
});

test('search tickets: projects tier and location columns', () => {
  const q = buildSearchTicketsQuery(base, 'fts');
  assert.ok(q.sql.includes('Tier'));
  assert.ok(q.sql.includes('CurrentLocation_DC52702B_4C6C_AE3D_56FA_5ED1522FDE0A AS Location'));
});

test('search tickets: WorkItemId and text matches share one OR group', () => {
  const q = buildSearchTicketsQuery({ ...base, q: 'printer IR1' }, 'fts');
  assert.match(
    q.sql,
    /\(\s*WorkItemId LIKE '%' \+ @qId \+ '%' OR CONTAINS\(\(Title, Description, ResolutionDescription\), @q\)\s*\)/
  );
});

test('search tickets: a q that sanitizes to empty still matches WorkItemId', () => {
  const q = buildSearchTicketsQuery({ ...base, q: '"' }, 'fts');
  assert.ok(q.sql.includes("WorkItemId LIKE '%' + @qId + '%'"));
  assert.equal(q.inputs.qId, '"');
  assert.ok(!('q' in q.inputs));
});

test('search tickets: all filters bind as parameters (servicerequest)', () => {
  const q = buildSearchTicketsQuery(
    {
      ...base,
      type: 'servicerequest',
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

test('search tickets: incident drops the priority filter and projects NULL Priority', () => {
  const q = buildSearchTicketsQuery({ ...base, priority: '2', status: 'Active' }, 'fts');
  assert.ok(!q.sql.includes('Priority = @priority'));
  assert.ok(!('priority' in q.inputs));
  assert.ok(q.sql.includes('NULL AS Priority'));
  const sr = buildSearchTicketsQuery(
    { ...base, type: 'servicerequest', priority: '2' },
    'fts'
  );
  assert.ok(sr.sql.includes('Priority = @priority'));
  assert.ok(!sr.sql.includes('NULL AS Priority'));
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

test('rowToTicket maps a null Priority (incident rows) to null', () => {
  const row = {
    Id: 'a',
    WorkItemId: 'IR1',
    Title: 't',
    Status: 'Active',
    Priority: null,
    CreatedDate: '2026-07-01',
    AffectedUser: null,
    AffectedUserId: null,
  };
  assert.equal(rowToTicket(row).priority, null);
});

test('search tickets: projects creator and assignee columns for both kinds', () => {
  const q = buildSearchTicketsQuery(base, 'fts');
  assert.ok(q.sql.includes('CreatedByUser, CreatedByUserId, AssignedUser, AssignedUserId'));
  const sr = buildSearchTicketsQuery({ ...base, type: 'servicerequest' }, 'fts');
  assert.ok(sr.sql.includes('CreatedByUser, CreatedByUserId, AssignedUser, AssignedUserId'));
});

test('search tickets: projects description/resolution/dates for both kinds', () => {
  const q = buildSearchTicketsQuery(base, 'fts');
  assert.ok(q.sql.includes('ResolvedDate, ClosedDate, Description, ResolutionDescription'));
  const sr = buildSearchTicketsQuery({ ...base, type: 'servicerequest' }, 'fts');
  assert.ok(sr.sql.includes('ResolvedDate, ClosedDate, Description, ResolutionDescription'));
});

test('user tickets: union projects description/resolution/dates for both kinds', () => {
  const q = buildUserTicketsQuery('GUID', { page: 1, pageSize: 25 });
  assert.ok(q.sql.includes('ResolvedDate, ClosedDate, Description, ResolutionDescription'));
});

test('rowToTicket maps description, resolution and dates', () => {
  const row = {
    Id: 'a',
    WorkItemId: 'IR1',
    Title: 't',
    Status: 'Active',
    Priority: '2',
    CreatedDate: new Date('2026-07-01T09:00:00Z'),
    ResolvedDate: new Date('2026-07-02T10:00:00Z'),
    ClosedDate: new Date('2026-07-03T11:00:00Z'),
    Description: 'the body',
    ResolutionDescription: 'the fix',
    AffectedUser: null,
    AffectedUserId: null,
  };
  const t = rowToTicket(row);
  assert.equal(t.description, 'the body');
  assert.equal(t.resolutionDescription, 'the fix');
  assert.equal(t.resolvedDate, '2026-07-02T10:00:00.000Z');
  assert.equal(t.closedDate, '2026-07-03T11:00:00.000Z');
});

test('rowToTicket maps null description, resolution and dates to null', () => {
  const row = {
    Id: 'a',
    WorkItemId: 'IR1',
    Title: 't',
    Status: 'Active',
    Priority: '2',
    CreatedDate: '2026-07-01',
    ResolvedDate: null,
    ClosedDate: null,
    Description: null,
    ResolutionDescription: null,
    AffectedUser: null,
    AffectedUserId: null,
  };
  const t = rowToTicket(row);
  assert.equal(t.description, null);
  assert.equal(t.resolutionDescription, null);
  assert.equal(t.resolvedDate, null);
  assert.equal(t.closedDate, null);
});

test('rowToTicket maps createdByUser and assignedUser', () => {
  const row = {
    Id: 'a',
    WorkItemId: 'IR1',
    Title: 't',
    Status: 'Active',
    Priority: '2',
    CreatedDate: new Date('2026-07-01T09:00:00Z'),
    AffectedUser: 'John Smith',
    AffectedUserId: 'g',
    CreatedByUser: 'Jane Doe',
    CreatedByUserId: 'h',
    AssignedUser: 'Bob Roe',
    AssignedUserId: 'i',
  };
  const t = rowToTicket(row);
  assert.deepEqual(t.createdByUser, { id: 'h', displayName: 'Jane Doe' });
  assert.deepEqual(t.assignedUser, { id: 'i', displayName: 'Bob Roe' });
});

test('user tickets: role selects the role column', () => {
  const q = buildUserTicketsQuery('GUID', { page: 1, pageSize: 25, role: 'created_by' });
  assert.ok(q.sql.includes('WHERE CreatedByUserId = @userId'));
  const a = buildUserTicketsQuery('GUID', { page: 1, pageSize: 25, role: 'assigned' });
  assert.ok(a.sql.includes('WHERE AssignedUserId = @userId'));
});

test('user tickets: role defaults to affected', () => {
  const q = buildUserTicketsQuery('GUID', { page: 1, pageSize: 25 });
  assert.ok(q.sql.includes('WHERE AffectedUserId = @userId'));
});

test('count user tickets: role selects the role column', () => {
  const q = buildCountUserTicketsQuery('GUID', 'assigned');
  assert.ok(q.sql.includes('WHERE AssignedUserId = @userId'));
  const d = buildCountUserTicketsQuery('GUID');
  assert.ok(d.sql.includes('WHERE AffectedUserId = @userId'));
});

test('roleColumn maps each role to its column', () => {
  assert.equal(roleColumn('affected'), 'AffectedUserId');
  assert.equal(roleColumn('created_by'), 'CreatedByUserId');
  assert.equal(roleColumn('assigned'), 'AssignedUserId');
});

test('rowToTicket maps null createdBy and assigned users', () => {
  const row = {
    Id: 'a',
    WorkItemId: 'IR1',
    Title: 't',
    Status: 'Active',
    Priority: '2',
    CreatedDate: '2026-07-01',
    AffectedUser: null,
    AffectedUserId: null,
    CreatedByUser: null,
    CreatedByUserId: null,
    AssignedUser: null,
    AssignedUserId: null,
  };
  const t = rowToTicket(row);
  assert.equal(t.createdByUser, null);
  assert.equal(t.assignedUser, null);
});

test('rowToTicket maps tier, location and relevance', () => {
  const row = {
    Id: 'a', WorkItemId: 'IR1', Title: 't', Status: 'Active', Priority: '2',
    CreatedDate: new Date('2026-07-01T09:00:00Z'), AffectedUser: null, AffectedUserId: null,
    Tier: 'Potch Staff Service Desk', Location: 'Vaal - VC - A21-105', Relevance: 3,
  };
  const t = rowToTicket(row);
  assert.equal(t.tier, 'Potch Staff Service Desk');
  assert.equal(t.location, 'Vaal - VC - A21-105');
  assert.equal(t.relevance, 3);
});

test('rowToTicket maps null tier/location and omits relevance when absent', () => {
  const row = {
    Id: 'a', WorkItemId: 'IR1', Title: 't', Status: 'Active', Priority: '2',
    CreatedDate: '2026-07-01', AffectedUser: null, AffectedUserId: null, Tier: null, Location: null,
  };
  const t = rowToTicket(row);
  assert.equal(t.tier, null);
  assert.equal(t.location, null);
  assert.ok(!('relevance' in t));
});
