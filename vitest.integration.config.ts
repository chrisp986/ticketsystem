import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url))
		}
	},
	test: {
		environment: 'node',
		include: ['tests/integration/**/*.test.ts'],
		// One shared database: a worker test must not claim another file's jobs.
		fileParallelism: false
	}
});
