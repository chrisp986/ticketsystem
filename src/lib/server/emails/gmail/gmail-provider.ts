import type { StoreEmailInput } from '../../../modules/emails/email.validation';
import { parseRawEmail } from '../parse-raw-email';
import { EmailProviderAuthError, EmailProviderTemporaryError } from '../provider';
import type { EmailChanges, EmailProvider } from '../provider';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const REQUEST_TIMEOUT_MS = 30_000;
const TOKEN_EXPIRY_MARGIN_MS = 60_000;
const DEFAULT_RECENT_LIMIT = 100;

export const GMAIL_PROVIDER = 'gmail';

export type GmailCredentials = {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
	mailbox: string;
};

type GmailOptions = GmailCredentials & {
	fetch?: typeof fetch;
	/** How many recent inbox messages a first sync or a full resync lists. */
	recentLimit?: number;
};

type HistoryPage = {
	history?: { messagesAdded?: { message: { id: string } }[] }[];
	nextPageToken?: string;
	historyId: string;
};

type MessageListPage = {
	messages?: { id: string }[];
	nextPageToken?: string;
};

const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded']);

/**
 * Gmail's error reason, such as `rateLimitExceeded`. Never the message, which could echo input.
 */
async function errorReason(response: Response): Promise<string | undefined> {
	try {
		const body = (await response.json()) as {
			error?: string | { errors?: { reason?: string }[] };
		};

		return typeof body.error === 'string' ? body.error : body.error?.errors?.[0]?.reason;
	} catch {
		return undefined;
	}
}

/**
 * Reads a Gmail mailbox through the Gmail API with an OAuth refresh token (ADR 0013).
 */
export function createGmailProvider(options: GmailOptions): EmailProvider {
	const fetchFn = options.fetch ?? fetch;
	const recentLimit = options.recentLimit ?? DEFAULT_RECENT_LIMIT;

	let accessToken: { value: string; expiresAt: number } | undefined;

	async function send(url: string, init: RequestInit = {}): Promise<Response> {
		try {
			return await fetchFn(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
		} catch (err) {
			throw new EmailProviderTemporaryError('Gmail could not be reached.', { cause: err });
		}
	}

	async function token(): Promise<string> {
		if (accessToken && accessToken.expiresAt > Date.now()) {
			return accessToken.value;
		}

		const response = await send(TOKEN_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				client_id: options.clientId,
				client_secret: options.clientSecret,
				refresh_token: options.refreshToken,
				grant_type: 'refresh_token'
			})
		});

		if (!response.ok) {
			const reason = await errorReason(response);

			if (response.status === 400 || response.status === 401) {
				throw new EmailProviderAuthError(
					`Gmail refused the refresh token (${reason ?? response.status}). Run pnpm gmail:authorize again.`
				);
			}

			throw new EmailProviderTemporaryError(`Gmail token request failed with ${response.status}.`);
		}

		const body = (await response.json()) as { access_token: string; expires_in: number };

		accessToken = {
			value: body.access_token,
			expiresAt: Date.now() + body.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS
		};

		return accessToken.value;
	}

	/**
	 * Calls the API. Returns null for 404, which callers interpret.
	 */
	async function api<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
		const url = `${API_URL}${path}?${new URLSearchParams(params)}`;

		for (let attempt = 1; ; attempt++) {
			const response = await send(url, { headers: { authorization: `Bearer ${await token()}` } });

			if (response.ok) {
				return (await response.json()) as T;
			}

			if (response.status === 404) {
				return null;
			}

			if (response.status === 401 && attempt === 1) {
				// The access token may have expired early; get a new one once.
				accessToken = undefined;
				continue;
			}

			const reason = await errorReason(response);

			if (
				response.status === 429 ||
				response.status >= 500 ||
				RATE_LIMIT_REASONS.has(reason ?? '')
			) {
				throw new EmailProviderTemporaryError(
					`Gmail request failed with ${response.status} (${reason ?? 'no reason'}).`
				);
			}

			if (response.status === 401 || response.status === 403) {
				throw new EmailProviderAuthError(
					`Gmail refused access (${reason ?? response.status}). Run pnpm gmail:authorize again.`
				);
			}

			throw new Error(`Gmail request failed with ${response.status} (${reason ?? 'no reason'}).`);
		}
	}

	async function recentMessages(): Promise<EmailChanges> {
		// The position is taken first, so a message arriving during the listing is not missed.
		const profile = await api<{ historyId: string }>('/profile');

		if (!profile) {
			throw new Error('The Gmail profile was not found.');
		}

		const ids: string[] = [];
		let pageToken: string | undefined;

		do {
			const page: MessageListPage | null = await api<MessageListPage>('/messages', {
				labelIds: 'INBOX',
				maxResults: String(Math.min(recentLimit - ids.length, 500)),
				...(pageToken ? { pageToken } : {})
			});

			ids.push(...(page?.messages ?? []).map((message) => message.id));
			pageToken = page?.nextPageToken;
		} while (pageToken && ids.length < recentLimit);

		// Oldest first, as history lists them.
		return { providerMessageIds: ids.reverse(), cursor: profile.historyId, fullResync: true };
	}

	return {
		provider: GMAIL_PROVIDER,
		mailbox: options.mailbox,

		async listChanges(cursor) {
			if (cursor === null) {
				return recentMessages();
			}

			const ids = new Set<string>();
			let pageToken: string | undefined;
			let historyId: string;

			do {
				const page: HistoryPage | null = await api<HistoryPage>('/history', {
					startHistoryId: cursor,
					historyTypes: 'messageAdded',
					labelId: 'INBOX',
					...(pageToken ? { pageToken } : {})
				});

				if (!page) {
					// Gmail keeps history for a limited time; an old position is gone.
					return recentMessages();
				}

				for (const record of page.history ?? []) {
					for (const added of record.messagesAdded ?? []) {
						ids.add(added.message.id);
					}
				}

				pageToken = page.nextPageToken;
				historyId = page.historyId;
			} while (pageToken);

			return { providerMessageIds: [...ids], cursor: historyId, fullResync: false };
		},

		async fetchMessage(providerMessageId): Promise<StoreEmailInput | null> {
			const message = await api<{ raw: string; internalDate: string }>(
				`/messages/${encodeURIComponent(providerMessageId)}`,
				{ format: 'raw' }
			);

			if (!message) {
				return null;
			}

			return parseRawEmail(Buffer.from(message.raw, 'base64url'), {
				provider: GMAIL_PROVIDER,
				providerMessageId,
				mailbox: options.mailbox,
				receivedAt: new Date(Number(message.internalDate))
			});
		}
	};
}
