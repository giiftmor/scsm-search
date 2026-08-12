import { escapeLike } from '../escapeLike.js';
import type { PreparedQuery } from '../exec.js';

export const USER_TABLE = 'ServiceManager.dbo.MTV_System$Domain$User';
export const USERNAME_COL = 'u.UserName_6AF77E23_669B_123F_B392_323C17097BBD';
export const UPN_COL = 'u.UPN_7641DFF7_7A20_DC04_FC1C_B6FA8715DA02';

const USER_COLUMNS = `
  u.BaseManagedEntityId AS Id,
  ${USERNAME_COL} AS UserId,
  u.DisplayName,
  ${UPN_COL} AS UPN`;

export interface SearchUsersParams {
  q?: string;
  page: number;
  pageSize: number;
}

function userWhere(q?: string): { where: string[]; inputs: Record<string, string | number> } {
  const where: string[] = [];
  const inputs: Record<string, string> = {};
  if (q) {
    const tokens = q.trim().split(/\s+/).filter(Boolean);
    const groups = tokens.map((token, i) => {
      inputs[`uq${i}`] = escapeLike(token);
      return `(${USERNAME_COL} LIKE '%' + @uq${i} + '%' ESCAPE '\\' OR u.DisplayName LIKE '%' + @uq${i} + '%' ESCAPE '\\' OR ${UPN_COL} LIKE '%' + @uq${i} + '%' ESCAPE '\\')`;
    });
    if (groups.length) {
      where.push(groups.join('\n  AND '));
    }
  }
  return { where, inputs };
}

export function buildSearchUsersQuery(p: SearchUsersParams): PreparedQuery {
  const { where, inputs } = userWhere(p.q);
  inputs.offset = (p.page - 1) * p.pageSize;
  inputs.pageSize = p.pageSize;
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return {
    sql: `SELECT ${USER_COLUMNS}
FROM ${USER_TABLE} u
${whereSql}
ORDER BY u.DisplayName
OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`,
    inputs,
  };
}

export function buildCountUsersQuery(p: { q?: string }): PreparedQuery {
  const { where, inputs } = userWhere(p.q);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return { sql: `SELECT COUNT(*) AS Total
FROM ${USER_TABLE} u
${whereSql};`, inputs };
}

export function buildResolveUserQuery(id: string): PreparedQuery {
  return {
    sql: `SELECT TOP (2) u.BaseManagedEntityId AS Id
FROM ${USER_TABLE} u
WHERE u.BaseManagedEntityId = TRY_CONVERT(uniqueidentifier, @id)
   OR ${USERNAME_COL} = @id
   OR ${UPN_COL} = @id;`,
    inputs: { id },
  };
}
