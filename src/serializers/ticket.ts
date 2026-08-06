import type { TicketResult, TicketRow } from '../types/ticket.js';

export function rowToTicket(row: TicketRow): TicketResult {
  const createdDate =
    row.CreatedDate instanceof Date ? row.CreatedDate.toISOString() : String(row.CreatedDate);
  const result: TicketResult = {
    id: row.Id,
    workItemId: row.WorkItemId,
    title: row.Title,
    status: row.Status,
    priority: row.Priority ?? null,
    createdDate,
    affectedUser: row.AffectedUser
      ? { id: row.AffectedUserId ?? '', displayName: row.AffectedUser }
      : null,
  };
  if ('TicketType' in row && (row as { TicketType?: string }).TicketType) {
    result.ticketType = (row as { TicketType: TicketResult['ticketType'] }).TicketType;
  }
  return result;
}
