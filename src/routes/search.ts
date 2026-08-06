import { Router } from 'express';
import type { ConnectionPool } from 'mssql';
import { exec } from '../db/exec.js';
import { buildSearchTicketsQuery, buildCountTicketsQuery } from '../db/queries/tickets.js';
import { buildSearchUsersQuery, buildCountUsersQuery } from '../db/queries/users.js';
import { ticketSearchParamsSchema, userSearchParamsSchema } from '../schemas/searchParams.js';
import { rowToTicket } from '../serializers/ticket.js';
import type { TicketRow } from '../types/ticket.js';
import type { DomainUserRow } from '../types/domainUser.js';

export function searchRouter(opts: { pool: ConnectionPool; searchMode: 'fts' | 'like' }): Router {
  const router = Router();

  router.get('/tickets', async (req, res) => {
    const p = ticketSearchParamsSchema.parse(req.query);
    const [rows, total] = await Promise.all([
      exec<TicketRow>(opts.pool, buildSearchTicketsQuery(p, opts.searchMode)),
      exec<{ Total: number }>(opts.pool, buildCountTicketsQuery(p, opts.searchMode)),
    ]);
    res.json({
      results: rows.map(rowToTicket),
      page: p.page,
      pageSize: p.pageSize,
      total: total[0]?.Total ?? 0,
    });
  });

  router.get('/users', async (req, res) => {
    const p = userSearchParamsSchema.parse(req.query);
    const [rows, total] = await Promise.all([
      exec<DomainUserRow>(opts.pool, buildSearchUsersQuery(p)),
      exec<{ Total: number }>(opts.pool, buildCountUsersQuery(p)),
    ]);
    res.json({
      results: rows.map((r) => ({ id: r.Id, userId: r.UserId, displayName: r.DisplayName, upn: r.UPN })),
      page: p.page,
      pageSize: p.pageSize,
      total: total[0]?.Total ?? 0,
    });
  });

  return router;
}
