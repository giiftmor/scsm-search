import type { PreparedQuery } from '../exec.js';
import { USER_TABLE, USERNAME_COL, UPN_COL } from './users.js';
import { escapeLike } from '../escapeLike.js';

export type TicketKind = 'incident' | 'servicerequest';

const LOCATION_COL: Record<TicketKind, string> = {
  incident: 'CurrentLocation_DC52702B_4C6C_AE3D_56FA_5ED1522FDE0A',
  servicerequest: 'CurrentLocation_89125754_0643_0DA6_D2EB_50167E386A23',
};

export function locationColumn(kind: TicketKind): string {
  return LOCATION_COL[kind];
}

export interface SearchTicketsParams {
  q?: string;
  type: TicketKind;
  status?: string;
  priority?: string;
  tier?: string;
  location?: string;
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

function ticketColumns(kind: TicketKind): string {
  const base =
    kind === 'servicerequest'
      ? `Id, WorkItemId, Title, Status, Priority, Created AS CreatedDate, ResolvedDate, ClosedDate, Description, ResolutionDescription, Tier, ${locationColumn(kind)} AS Location`
      : `Id, WorkItemId, Title, Status, NULL AS Priority, Created AS CreatedDate, ResolvedDate, ClosedDate, Description, ResolutionDescription, Tier, ${locationColumn(kind)} AS Location`;
  return `${base}, AffectedUser, AffectedUserId, CreatedByUser, CreatedByUserId, AssignedUser, AssignedUserId`;
}

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
  if (p.priority && p.type === 'servicerequest') {
    where.push('Priority = @priority');
    inputs.priority = p.priority;
  }
  if (p.tier) {
    where.push('Tier = @tier');
    inputs.tier = p.tier;
  }
  if (p.location) {
    where.push(`${locationColumn(p.type)} LIKE '%' + @location + '%' ESCAPE '\\'`);
    inputs.location = escapeLike(p.location);
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
    const workItemIdCond = `WorkItemId LIKE '%' + @qId + '%'`;
    if (searchMode === 'fts') {
      const term = sanitizeFtsTerm(p.q);
      if (term) {
        where.push(
          `(WorkItemId LIKE '%' + @qId + '%' OR CONTAINS((Title, Description, ResolutionDescription), @q))`
        );
        inputs.q = term;
        inputs.qId = p.q;
      } else {
        where.push(workItemIdCond);
        inputs.qId = p.q;
      }
    } else {
      const tokens = p.q.trim().split(/\s+/).filter(Boolean);
      if (tokens.length) {
        const groups = tokens.map((token, i) => {
          inputs[`tok${i}`] = escapeLike(token);
          return `(WorkItemId LIKE '%' + @tok${i} + '%' ESCAPE '\\'
  OR Title LIKE '%' + @tok${i} + '%' ESCAPE '\\'
  OR Description LIKE '%' + @tok${i} + '%' ESCAPE '\\'
  OR ResolutionDescription LIKE '%' + @tok${i} + '%' ESCAPE '\\'
  OR Tier LIKE '%' + @tok${i} + '%' ESCAPE '\\'
  OR ${locationColumn(p.type)} LIKE '%' + @tok${i} + '%' ESCAPE '\\')`;
        });
        where.push(groups.join('\n  AND '));
      }
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
    sql: `SELECT ${ticketColumns(p.type)}
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

export type UserTicketsRole = 'affected' | 'created_by' | 'assigned';

export function roleColumn(role: UserTicketsRole): string {
  switch (role) {
    case 'created_by':
      return 'CreatedByUserId';
    case 'assigned':
      return 'AssignedUserId';
    default:
      return 'AffectedUserId';
  }
}

export interface UserTicketsQueryParams extends Pagination {
  role?: UserTicketsRole;
}

export function buildUserTicketsQuery(userId: string, p: UserTicketsQueryParams): PreparedQuery {
  const col = roleColumn(p.role ?? 'affected');
  return {
    sql: `SELECT 'incident' AS TicketType, ${ticketColumns('incident')}
FROM CiresonAnalytics.dbo.SM_WorkItem_Incident
WHERE ${col} = @userId
UNION ALL
SELECT 'servicerequest', ${ticketColumns('servicerequest')}
FROM CiresonAnalytics.dbo.SM_WorkItem_ServiceRequest
WHERE ${col} = @userId
ORDER BY CreatedDate DESC
OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`,
    inputs: { userId, offset: (p.page - 1) * p.pageSize, pageSize: p.pageSize },
  };
}

export function buildCountUserTicketsQuery(
  userId: string,
  role: UserTicketsRole = 'affected'
): PreparedQuery {
  const col = roleColumn(role);
  return {
    sql: `SELECT COUNT(*) AS Total FROM (
  SELECT Id FROM CiresonAnalytics.dbo.SM_WorkItem_Incident WHERE ${col} = @userId
  UNION ALL
  SELECT Id FROM CiresonAnalytics.dbo.SM_WorkItem_ServiceRequest WHERE ${col} = @userId
) t;`,
    inputs: { userId },
  };
}
