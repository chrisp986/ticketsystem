import type { LayoutServerLoad } from './$types';

export const load = (({ locals }) => {
	return { user: locals.user ? { name: locals.user.name } : null };
}) satisfies LayoutServerLoad;
