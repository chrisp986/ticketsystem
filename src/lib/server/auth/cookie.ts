/**
 * Cookie options for the session token (ADR 0007).
 *
 * `Secure` follows the request protocol, because the development server is also
 * opened over plain HTTP from other machines on the local network. Deleting the
 * cookie needs the same options, or the browser may ignore the deletion.
 */
export function sessionCookieOptions(url: URL, expiresAt?: Date) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		...(expiresAt ? { expires: expiresAt } : {})
	} as const;
}
