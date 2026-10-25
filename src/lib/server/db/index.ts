import { serverConfig } from '$lib/server/env';

import { createDb } from './create-db';

export const { db } = createDb(serverConfig.DATABASE_URL);
