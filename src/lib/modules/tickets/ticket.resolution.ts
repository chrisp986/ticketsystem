import { closingResolutions, resolvingResolutions } from './ticket.constants';
import type { TicketResolution, TicketStatus } from './ticket.types';

export function isResolutionValid(
	to: TicketStatus,
	resolution: TicketResolution | undefined,
	summary: string | undefined
): boolean {
	if (to === 'resolved') {
		return (
			resolution !== undefined &&
			(resolvingResolutions as readonly string[]).includes(resolution) &&
			Boolean(summary?.trim())
		);
	}

	if (to === 'closed') {
		return (
			resolution !== undefined && (closingResolutions as readonly string[]).includes(resolution)
		);
	}

	return true;
}
