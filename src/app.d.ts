// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
		interface Error {
			message: string;
			requestId?: string;
		}
		interface Locals {
			requestId: string;
		}
	}
}

export {};
