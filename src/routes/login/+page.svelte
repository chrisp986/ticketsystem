<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';

	import type { SubmitFunction } from '@sveltejs/kit';

	let { form }: PageProps = $props();

	let submitting = $state(false);

	const handleSubmit: SubmitFunction = () => {
		submitting = true;

		return async ({ update }) => {
			try {
				await update({ reset: false });
			} finally {
				submitting = false;
			}
		};
	};
</script>

<h1>Sign in</h1>

<form method="POST" use:enhance={handleSubmit} aria-busy={submitting}>
	<p>
		<label for="email">Email</label>
		<input
			id="email"
			name="email"
			type="email"
			autocomplete="username"
			required
			value={form?.email ?? ''}
		/>
	</p>

	<p>
		<label for="password">Password</label>
		<input id="password" name="password" type="password" autocomplete="current-password" required />
	</p>

	{#if form?.message}
		<p role="alert">{form.message}</p>
	{/if}

	<button type="submit" disabled={submitting}>
		{submitting ? 'Signing in…' : 'Sign in'}
	</button>
</form>
