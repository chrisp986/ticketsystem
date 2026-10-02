import { z } from 'zod';

import { logLevels } from './logger';

const serverConfigSchema = z.object({
	DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
	LOG_LEVEL: z.enum(logLevels).default('info')
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

export function parseServerConfig(source: Record<string, string | undefined>): ServerConfig {
	const result = serverConfigSchema.safeParse(source);

	if (!result.success) {
		throw new Error(`Invalid server configuration:\n${z.prettifyError(result.error)}`);
	}

	return result.data;
}
