import { Router } from 'express';
import type { ConnectionPool } from 'mssql';
import { exec } from '../db/exec.js';
import { buildResolveUserQuery } from '../db/queries/users.js';
import { buildUserTicketsQuery, buildCountUserTicketsQuery } from '../db/queries/tickets.js';
import { userTicketsParamsSchema } from '../schemas/searchParams.js';
import { rowToTicket } from '../serializers/ticket.js';
import type { UserTicketRow } from '../types/ticket.js';

export function usersRouter(opts: { pool: ConnectionPool }): Router {
  const router = Router();

  router.get('/:id/tickets', async (req, res) => {
    const p = userTicketsParamsSchema.parse(req.query);
    const resolved = await exec<{ Id: string }>(opts.pool, buildResolveUserQuery(String(req.params.id)));
    if (resolved.length === 0) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }
    if (resolved.length > 1) {
      res.status(400).json({ error: { code: 'AMBIGUOUS', message: 'User id matches multiple users' } });
      return;
    }
    const userId = resolved[0].Id;
    const [rows, total] = await Promise.all([
      exec<UserTicketRow>(opts.pool, buildUserTicketsQuery(userId, p)),
      exec<{ Total: number }>(opts.pool, buildCountUserTicketsQuery(userId)),
    ]);
    res.json({
      results: rows.map(rowToTicket),
      page: p.page,
      pageSize: p.pageSize,
      total: total[0]?.Total ?? 0,
    });
  });

  return router;
}
