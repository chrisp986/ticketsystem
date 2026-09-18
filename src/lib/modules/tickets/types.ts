export type TicketStatus = 'new' | 'in_progress' | 'waiting' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type Ticket = {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: Date;
  updatedAt: Date;
  description?: string;
  assignee?: string;
  tags?: string[];
};