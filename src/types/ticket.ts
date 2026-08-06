export type TicketType = 'incident' | 'servicerequest';

export interface TicketRow {
  Id: string;
  WorkItemId: string;
  Title: string;
  Status: string;
  Priority: string;
  CreatedDate: Date | string;
  AffectedUser: string | null;
  AffectedUserId: string | null;
}

export interface UserTicketRow extends TicketRow {
  TicketType: TicketType;
}

export interface AffectedUserResult {
  id: string;
  displayName: string;
}

export interface TicketResult {
  id: string;
  workItemId: string;
  title: string;
  status: string;
  priority: string;
  createdDate: string;
  affectedUser: AffectedUserResult | null;
  ticketType?: TicketType;
}
