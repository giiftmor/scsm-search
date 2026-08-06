import type { PreparedQuery } from '../exec.js';
import { USER_TABLE, USERNAME_COL, UPN_COL } from './users.js';

export type TicketKind = 'incident' | 'servicerequest';

export interface SearchTicketsParams {
  q?: string;
  type: TicketKind;
  status?: string;
  priority?: string;
  affectedUserId?: string;
  createdByUserId?: string;
  assignedUserId?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

export function ticketTable(kind: TicketKind): string {
  return kind === 'incident'
    ? 'CiresonAnalytics.dbo.SM_WorkItem_Incident'
    : 'CiresonAnalytics.dbo.SM_WorkItem_ServiceRequest';
}

const TICKET_COLUMNS = `Id, WorkItemId, Title, Status, Priority, Created AS CreatedDate, AffectedUser, AffectedUserId`;

function roleFilter(role: string, param: string): string {
  return `EXISTS (SELECT 1 FROM ${USER_TABLE} u
    WHERE u.BaseManagedEntityId = ${role}
      AND (${USERNAME_COL} = @${param} OR ${UPN_COL} = @${param}))`;
}

export function sanitizeFtsTerm(q: string): string {
  return q
    .replace(/["()*]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token}"`)
    .join(' AND ');
}

export function buildTicketWhere(
  p: SearchTicketsParams,
  searchMode: 'fts' | 'like'
): { where: string[]; inputs: Record<string, string | number | Date> } {
  const where: string[] = [];
  const inputs: Record<string, string | number | Date> = {};
  if (p.status) {
    where.push('Status = @status');
    inputs.status = p.status;
  }
  if (p.priority) {
    where.push('Priority = @priority');
    inputs.priority = p.priority;
  }
  if (p.affectedUserId) {
    where.push(roleFilter('AffectedUserId', 'affectedUserId'));
    inputs.affectedUserId = p.affectedUserId;
  }
  if (p.createdByUserId) {
    where.push(roleFilter('CreatedByUserId', 'createdByUserId'));
    inputs.createdByUserId = p.createdByUserId;
  }
  if (p.assignedUserId) {
    where.push(roleFilter('AssignedUserId', 'assignedUserId'));
    inputs.assignedUserId = p.assignedUserId;
  }
  if (p.from) {
    where.push('Created >= @from');
    inputs.from = p.from;
  }
  if (p.to) {
    where.push('Created < DATEADD(DAY, 1, @to)');
    inputs.to = p.to;
  }
  if (p.q) {
    if (searchMode === 'fts') {
      const term = sanitizeFtsTerm(p.q);
      if (term) {
        where.push('CONTAINS((Title, Description, ResolutionDescription), @q)');
        inputs.q = term;
      }
    } else {
      where.push(
        `(Title LIKE '%' + @q + '%' OR Description LIKE '%' + @q + '%' OR ResolutionDescription LIKE '%' + @q + '%')`
      );
      inputs.q = p.q;
    }
  }
  return { where, inputs };
}

export function buildSearchTicketsQuery(
  p: SearchTicketsParams,
  searchMode: 'fts' | 'like'
): PreparedQuery {
  const { where, inputs } = buildTicketWhere(p, searchMode);
  inputs.offset = (p.page - 1) * p.pageSize;
  inputs.pageSize = p.pageSize;
  const whereSql = where.length ? `WHERE ${where.join('\n  AND ')}` : '';
  return {
    sql: `SELECT ${TICKET_COLUMNS}
FROM ${ticketTable(p.type)}
${whereSql}
ORDER BY Created DESC
OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`,
    inputs,
  };
}

export function buildCountTicketsQuery(
  p: SearchTicketsParams,
  searchMode: 'fts' | 'like'
): PreparedQuery {
  const { where, inputs } = buildTicketWhere(p, searchMode);
  const whereSql = where.length ? `WHERE ${where.join('\n  AND ')}` : '';
  return { sql: `SELECT COUNT(*) AS Total
FROM ${ticketTable(p.type)}
${whereSql};`, inputs };
}

export interface Pagination {
  page: number;
  pageSize: number;
}

export function buildUserTicketsQuery(userId: string, p: Pagination): PreparedQuery {
  return {
    sql: `SELECT 'incident' AS TicketType, ${TICKET_COLUMNS}
FROM CiresonAnalytics.dbo.SM_WorkItem_Incident
WHERE AffectedUserId = @userId
UNION ALL
SELECT 'servicerequest', ${TICKET_COLUMNS}
FROM CiresonAnalytics.dbo.SM_WorkItem_ServiceRequest
WHERE AffectedUserId = @userId
ORDER BY CreatedDate DESC
OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`,
    inputs: { userId, offset: (p.page - 1) * p.pageSize, pageSize: p.pageSize },
  };
}

export function buildCountUserTicketsQuery(userId: string): PreparedQuery {
  return {
    sql: `SELECT COUNT(*) AS Total FROM (
  SELECT Id FROM CiresonAnalytics.dbo.SM_WorkItem_Incident WHERE AffectedUserId = @userId
  UNION ALL
  SELECT Id FROM CiresonAnalytics.dbo.SM_WorkItem_ServiceRequest WHERE AffectedUserId = @userId
) t;`,
    inputs: { userId },
  };
}
