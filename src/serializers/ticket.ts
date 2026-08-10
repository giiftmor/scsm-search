import type { TicketResult, TicketRow, UserResult } from '../types/ticket.js';

function toUserResult(
  name: string | null | undefined,
  id: string | null | undefined
): UserResult | null {
  return name ? { id: id ?? '', displayName: name } : null;
}

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
    affectedUser: toUserResult(row.AffectedUser, row.AffectedUserId),
    createdByUser: toUserResult(row.CreatedByUser, row.CreatedByUserId),
    assignedUser: toUserResult(row.AssignedUser, row.AssignedUserId),
  };
  if ('TicketType' in row && (row as { TicketType?: string }).TicketType) {
    result.ticketType = (row as { TicketType: TicketResult['ticketType'] }).TicketType;
  }
  return result;
}
