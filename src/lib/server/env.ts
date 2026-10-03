import { building } from '$app/environment';
import { env } from '$env/dynamic/private';

import { parseServerConfig, type ServerConfig } from './config';

// `vite build` imports server modules without runtime environment variables.
const buildConfig: ServerConfig = {
	DATABASE_URL: 'postgresql://build:build@localhost:5432/build',
	LOG_LEVEL: 'info'
};

export const serverConfig: ServerConfig = building ? buildConfig : parseServerConfig(env);
