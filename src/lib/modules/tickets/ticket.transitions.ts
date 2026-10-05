import type { TicketStatus } from './ticket.types';

export const ticketStatusTransitions: Record<TicketStatus, readonly TicketStatus[]> = {
	new: ['in_progress', 'waiting_customer', 'waiting_internal', 'resolved', 'closed'],
	in_progress: ['waiting_customer', 'waiting_internal', 'resolved', 'closed'],
	waiting_customer: ['in_progress', 'waiting_internal', 'resolved', 'closed'],
	waiting_internal: ['in_progress', 'waiting_customer', 'resolved', 'closed'],
	resolved: ['in_progress', 'closed'],
	closed: []
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
	return ticketStatusTransitions[from].includes(to);
}

export function allowedTransitions(from: TicketStatus): readonly TicketStatus[] {
	return ticketStatusTransitions[from];
}
