/**
 * Signs in to Gmail once and prints a refresh token for GMAIL_REFRESH_TOKEN (ADR 0013).
 *
 * Usage: pnpm gmail:authorize
 * Needs GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET of a "Desktop app" OAuth client in .env.
 */
import 'dotenv/config';

import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

function base64url(bytes: Buffer): string {
	return bytes.toString('base64url');
}

async function main() {
	const clientId = process.env.GMAIL_CLIENT_ID;
	const clientSecret = process.env.GMAIL_CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		throw new Error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first.');
	}

	const state = base64url(randomBytes(16));
	const verifier = base64url(randomBytes(32));
	const challenge = base64url(createHash('sha256').update(verifier).digest());

	// Google allows any port on the loopback address for desktop clients.
	const code = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
		const server = createServer((request, response) => {
			const url = new URL(request.url ?? '/', 'http://127.0.0.1');
			const error = url.searchParams.get('error');
			const received = url.searchParams.get('code');

			if (url.searchParams.get('state') !== state || (!received && !error)) {
				response.writeHead(400).end('Unexpected request.');
				return;
			}

			response
				.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
				.end(error ? 'Sign-in failed. See the terminal.' : 'Signed in. You can close this tab.');
			server.close();

			if (error) {
				reject(new Error(`Google refused the sign-in: ${error}`));
			} else if (received) {
				resolve({ code: received, redirectUri });
			}
		});

		let redirectUri = '';

		server.listen(0, '127.0.0.1', () => {
			redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

			const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
			authUrl.search = new URLSearchParams({
				client_id: clientId,
				redirect_uri: redirectUri,
				response_type: 'code',
				scope: SCOPE,
				access_type: 'offline',
				prompt: 'consent',
				state,
				code_challenge: challenge,
				code_challenge_method: 'S256'
			}).toString();

			console.log('Open this address in a browser and sign in with the support mailbox:\n');
			console.log(`${authUrl}\n`);
		});
	});

	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			code: code.code,
			code_verifier: verifier,
			redirect_uri: code.redirectUri,
			grant_type: 'authorization_code'
		})
	});

	const body = (await response.json()) as { refresh_token?: string; error?: string };

	if (!response.ok || !body.refresh_token) {
		throw new Error(`Google did not issue a refresh token (${body.error ?? response.status}).`);
	}

	console.log('Add this line to .env. It grants read access to the mailbox; keep it secret:\n');
	console.log(`GMAIL_REFRESH_TOKEN=${body.refresh_token}`);
}

main().catch((err: unknown) => {
	console.error(err instanceof Error ? err.message : err);
	process.exitCode = 1;
});
