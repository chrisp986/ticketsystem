import { logger } from '../lib/server/logger';
import { raiseOverdueAttention } from '../lib/server/tickets/raise-overdue-attention';
import type { JobHandlers } from './worker';

export const jobHandlers: JobHandlers = {
	overdue_next_steps: async (_payload, { db }) => {
		const raised = await raiseOverdueAttention(db);

		logger.info('overdue next steps checked', { raised });
	}
};
