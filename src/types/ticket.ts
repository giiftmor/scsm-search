export type TicketType = 'incident' | 'servicerequest';

export interface UserResult {
  id: string;
  displayName: string;
}

export interface TicketRow {
  Id: string;
  WorkItemId: string;
  Title: string;
  Status: string;
  Priority: string | null;
  CreatedDate: Date | string;
  AffectedUser: string | null;
  AffectedUserId: string | null;
  CreatedByUser: string | null;
  CreatedByUserId: string | null;
  AssignedUser: string | null;
  AssignedUserId: string | null;
}

export interface UserTicketRow extends TicketRow {
  TicketType: TicketType;
}

export interface TicketResult {
  id: string;
  workItemId: string;
  title: string;
  status: string;
  priority: string | null;
  createdDate: string;
  affectedUser: UserResult | null;
  createdByUser: UserResult | null;
  assignedUser: UserResult | null;
  ticketType?: TicketType;
}
