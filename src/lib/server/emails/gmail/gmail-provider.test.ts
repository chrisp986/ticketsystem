import { describe, expect, test, vi } from 'vitest';

import { EmailProviderAuthError, EmailProviderTemporaryError } from '../provider';
import { createGmailProvider } from './gmail-provider';

const credentials = {
	clientId: 'client',
	clientSecret: 'secret',
	refreshToken: 'refresh',
	mailbox: 'support@example.com'
};

const raw = Buffer.from(
	'From: jo@example.com\r\nSubject: Hi\r\nMessage-ID: <m1@example.com>\r\n\r\nHello\r\n'
).toString('base64url');

type Route = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function gmailError(status: number, reason: string) {
	return json({ error: { code: status, errors: [{ reason }], message: 'secret detail' } }, status);
}

const tokenRoute: Route = () => json({ access_token: 'access-1', expires_in: 3600 });

function fakeGmail(routes: Record<string, Route | Route[]>) {
	const calls: { path: string; params: URLSearchParams; auth: string | null }[] = [];
	const queues = new Map(
		Object.entries({ token: tokenRoute, ...routes }).map(([key, value]) => [
			key,
			Array.isArray(value) ? [...value] : value
		])
	);

	const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
		const url = new URL(String(input));
		const key =
			url.hostname === 'oauth2.googleapis.com' ? 'token' : url.pathname.split('/users/me')[1];
		const headers = new Headers(init?.headers);

		calls.push({ path: key ?? '', params: url.searchParams, auth: headers.get('authorization') });

		const route = queues.get(key ?? '');
		const handler = Array.isArray(route) ? route.shift() : route;

		if (!handler) {
			throw new Error(`Unexpected request to ${key}`);
		}

		return handler(url, init);
	});

	return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

describe('listing changes', () => {
	test('lists recent inbox messages oldest first on a first sync', async () => {
		const gmail = fakeGmail({
			'/profile': () => json({ historyId: '500' }),
			'/messages': [
				() => json({ messages: [{ id: 'c' }, { id: 'b' }], nextPageToken: 'p2' }),
				() => json({ messages: [{ id: 'a' }] })
			]
		});
		const provider = createGmailProvider({ ...credentials, fetch: gmail.fetch });

		expect(await provider.listChanges(null)).toEqual({
			providerMessageIds: ['a', 'b', 'c'],
			cursor: '500',
			fullResync: true
		});
		expect(gmail.calls.find((call) => call.path === '/messages')?.params.get('labelIds')).toBe(
			'INBOX'
		);
	});

	test('stops listing recent messages at the limit', async () => {
		const gmail = fakeGmail({
			'/profile': () => json({ historyId: '500' }),
			'/messages': () => json({ messages: [{ id: 'b' }, { id: 'a' }], nextPageToken: 'more' })
		});
		const provider = createGmailProvider({ ...credentials, fetch: gmail.fetch, recentLimit: 2 });

		expect((await provider.listChanges(null)).providerMessageIds).toEqual(['a', 'b']);
		expect(gmail.calls.filter((call) => call.path === '/messages')).toHaveLength(1);
	});

	test('pages through history and returns each new message once', async () => {
		const gmail = fakeGmail({
			'/history': [
				() =>
					json({
						history: [
							{ messagesAdded: [{ message: { id: 'a' } }] },
							{ messagesAdded: [{ message: { id: 'b' } }, { message: { id: 'a' } }] }
						],
						nextPageToken: 'p2',
						historyId: '510'
					}),
				() => json({ history: [{ messagesAdded: [{ message: { id: 'c' } }] }], historyId: '520' })
			]
		});
		const provider = createGmailProvider({ ...credentials, fetch: gmail.fetch });

		expect(await provider.listChanges('500')).toEqual({
			providerMessageIds: ['a', 'b', 'c'],
			cursor: '520',
			fullResync: false
		});

		const historyCall = gmail.calls.find((call) => call.path === '/history');

		expect(historyCall?.params.get('startHistoryId')).toBe('500');
		expect(historyCall?.params.get('labelId')).toBe('INBOX');
	});

	test('keeps the position when nothing is new', async () => {
		const gmail = fakeGmail({ '/history': () => json({ historyId: '500' }) });
		const provider = createGmailProvider({ ...credentials, fetch: gmail.fetch });

		expect(await provider.listChanges('500')).toEqual({
			providerMessageIds: [],
			cursor: '500',
			fullResync: false
		});
	});

	test('lists recent messages instead when the position has expired', async () => {
		const gmail = fakeGmail({
			'/history': () => gmailError(404, 'notFound'),
			'/profile': () => json({ historyId: '900' }),
			'/messages': () => json({ messages: [{ id: 'x' }] })
		});
		const provider = createGmailProvider({ ...credentials, fetch: gmail.fetch });

		expect(await provider.listChanges('1')).toEqual({
			providerMessageIds: ['x'],
			cursor: '900',
			fullResync: true
		});
	});
});

describe('fetching a message', () => {
	test('parses the raw message with the time Gmail received it', async () => {
		const gmail = fakeGmail({
			'/messages/m-1': () => json({ raw, internalDate: '1793620800000' })
		});
		const provider = createGmailProvider({ ...credentials, fetch: gmail.fetch });

		expect(await provider.fetchMessage('m-1')).toMatchObject({
			provider: 'gmail',
			providerMessageId: 'm-1',
			mailbox: 'support@example.com',
			messageId: '<m1@example.com>',
			fromAddress: 'jo@example.com',
			subject: 'Hi',
			receivedAt: new Date(1793620800000)
		});
		expect(gmail.calls.at(-1)?.params.get('format')).toBe('raw');
	});

	test('returns null for a message that no longer exists', async () => {
		const gmail = fakeGmail({ '/messages/gone': () => gmailError(404, 'notFound') });
		const provider = createGmailProvider({ ...credentials, fetch: gmail.fetch });

		expect(await provider.fetchMessage('gone')).toBeNull();
	});
});

describe('signing in', () => {
	test('sends the refresh token and reuses the access token', async () => {
		let tokenBody = '';
		const gmail = fakeGmail({
			token: (_url, init) => {
				tokenBody = String(init?.body);
				return json({ access_token: 'access-1', expires_in: 3600 });
			},
			'/history': () => json({ historyId: '500' })
		});
		const provider = createGmailProvider({ ...credentials, fetch: gmail.fetch });

		await provider.listChanges('500');
		await provider.listChanges('500');

		expect(new URLSearchParams(tokenBody).get('refresh_token')).toBe('refresh');
		expect(new URLSearchParams(tokenBody).get('grant_type')).toBe('refresh_token');
		expect(gmail.calls.filter((call) => call.path === 'token')).toHaveLength(1);
		expect(gmail.calls.filter((call) => call.path === '/history').map((c) => c.auth)).toEqual([
			'Bearer access-1',
			'Bearer access-1'
		]);
	});

	test('gets a new access token once when Gmail rejects the current one', async () => {
		const gmail = fakeGmail({
			token: [
				() => json({ access_token: 'access-1', expires_in: 3600 }),
				() => json({ access_token: 'access-2', expires_in: 3600 })
			],
			'/history': [() => gmailError(401, 'authError'), () => json({ historyId: '500' })]
		});
		const provider = createGmailProvider({ ...credentials, fetch: gmail.fetch });

		await provider.listChanges('500');

		expect(gmail.calls.filter((call) => call.path === '/history').map((c) => c.auth)).toEqual([
			'Bearer access-1',
			'Bearer access-2'
		]);
	});

	test('asks for a new sign-in when the refresh token is revoked or expired', async () => {
		const gmail = fakeGmail({ token: () => json({ error: 'invalid_grant' }, 400) });
		const provider = createGmailProvider({ ...credentials, fetch: gmail.fetch });

		const error = await provider.listChanges('500').catch((err: unknown) => err);

		expect(error).toBeInstanceOf(EmailProviderAuthError);
		expect(String(error)).toContain('invalid_grant');
		expect(String(error)).toContain('pnpm gmail:authorize');
	});

	test('asks for a new sign-in when access is still refused with a new token', async () => {
		const gmail = fakeGmail({ '/history': () => gmailError(401, 'authError') });
		const provider = createGmailProvider({ ...credentials, fetch: gmail.fetch });

		await expect(provider.listChanges('500')).rejects.toBeInstanceOf(EmailProviderAuthError);
	});
});

describe('temporary failures', () => {
	test.each([
		['a 429', () => gmailError(429, 'rateLimitExceeded')],
		['a rate limit sent as 403', () => gmailError(403, 'userRateLimitExceeded')],
		['a server error', () => gmailError(503, 'backendError')],
		[
			'a network failure',
			() => {
				throw new TypeError('fetch failed');
			}
		]
	])('treats %s as worth retrying', async (_name, route: Route) => {
		const gmail = fakeGmail({ '/history': route });
		const provider = createGmailProvider({ ...credentials, fetch: gmail.fetch });

		await expect(provider.listChanges('500')).rejects.toBeInstanceOf(EmailProviderTemporaryError);
	});

	test('never puts Gmail’s error message in its own', async () => {
		const gmail = fakeGmail({ '/history': () => gmailError(400, 'invalidArgument') });
		const provider = createGmailProvider({ ...credentials, fetch: gmail.fetch });

		const error = await provider.listChanges('500').catch((err: unknown) => err);

		expect(String(error)).toContain('invalidArgument');
		expect(String(error)).not.toContain('secret detail');
	});
});
