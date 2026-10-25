/**
 * Creates a user who can sign in (ADR 0007).
 *
 * Usage: pnpm user:create --email agent@example.com --name "Alex Agent"
 * The password is asked for without echo, or read from stdin when it is not a terminal.
 */
import 'dotenv/config';

import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { createUserSchema } from '../src/lib/modules/auth/auth.validation';
import { createUser } from '../src/lib/server/auth/users';
import { parseServerConfig } from '../src/lib/server/config';
import { createDb } from '../src/lib/server/db/create-db';

async function readPassword(): Promise<string> {
	if (!process.stdin.isTTY) {
		const chunks: Buffer[] = [];

		for await (const chunk of process.stdin) {
			chunks.push(chunk as Buffer);
		}

		return Buffer.concat(chunks)
			.toString('utf8')
			.replace(/\r?\n$/, '');
	}

	let muted = false;

	const output = new Writable({
		write(chunk, encoding, callback) {
			if (!muted) {
				process.stdout.write(chunk, encoding);
			}

			callback();
		}
	});

	const prompt = createInterface({ input: process.stdin, output, terminal: true });

	try {
		const ask = async (question: string) => {
			process.stdout.write(question);
			muted = true;
			const answer = await prompt.question('');
			muted = false;
			process.stdout.write('\n');
			return answer;
		};

		const password = await ask('Password: ');
		const repeated = await ask('Repeat password: ');

		if (password !== repeated) {
			throw new Error('The passwords do not match.');
		}

		return password;
	} finally {
		prompt.close();
	}
}

async function main() {
	const { values } = parseArgs({
		options: { email: { type: 'string' }, name: { type: 'string' } }
	});

	const password = await readPassword();

	const input = createUserSchema.safeParse({ ...values, password });

	if (!input.success) {
		throw new Error(z.prettifyError(input.error));
	}

	const config = parseServerConfig(process.env);
	const { db, pool } = createDb(config.DATABASE_URL, 1);

	try {
		const user = await createUser(db, input.data);

		if (user === 'email_taken') {
			throw new Error('A user with this email already exists.');
		}

		console.log(`Created user ${user.email} (${user.id}).`);
	} finally {
		await pool.end();
	}
}

main().catch((err: unknown) => {
	console.error(err instanceof Error ? err.message : err);
	process.exitCode = 1;
});
