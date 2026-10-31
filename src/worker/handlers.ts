import { logger } from '../lib/server/logger';
import type { JobHandlers } from './worker';

export const jobHandlers: JobHandlers = {
	// Placeholder until step 3.5 raises attention on overdue next steps.
	overdue_next_steps: async () => {
		logger.info('overdue next steps job has no work yet');
	}
};
