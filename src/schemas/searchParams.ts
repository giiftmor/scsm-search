import { z } from 'zod';

const paginationSchema = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};

export const ticketSearchParamsSchema = z.object({
  q: z.string().trim().max(200).optional(),
  type: z.enum(['incident', 'servicerequest']),
  status: z.string().trim().max(100).optional(),
  priority: z.string().trim().max(100).optional(),
  affectedUserId: z.string().trim().max(256).optional(),
  createdByUserId: z.string().trim().max(256).optional(),
  assignedUserId: z.string().trim().max(256).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  ...paginationSchema,
});

export const userSearchParamsSchema = z.object({
  q: z.string().trim().max(200).optional(),
  ...paginationSchema,
});

export const userTicketsParamsSchema = z.object(paginationSchema);

export type TicketSearchParams = z.infer<typeof ticketSearchParamsSchema>;
export type UserSearchParams = z.infer<typeof userSearchParamsSchema>;
export type UserTicketsParams = z.infer<typeof userTicketsParamsSchema>;
