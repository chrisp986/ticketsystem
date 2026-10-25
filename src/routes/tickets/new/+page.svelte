<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';

	import type { SubmitFunction } from '@sveltejs/kit';

	let { data, form }: PageProps = $props();

	let submitting = $state(false);

	const handleSubmit: SubmitFunction = () => {
		submitting = true;

		return async ({ update }) => {
			try {
				await update();
			} finally {
				submitting = false;
			}
		};
	};
</script>

<h1>Create ticket</h1>

<form method="POST" use:enhance={handleSubmit} aria-busy={submitting}>
	<p>
		<label for="subject">Subject</label>
		<input id="subject" name="subject" type="text" value={form?.values.subject ?? ''} />
	</p>

	<p>
		<label for="description">Description</label>
		<textarea id="description" name="description" rows="5" value={form?.values.description ?? ''}
		></textarea>
	</p>

	<p>
		<label for="assigneeId">Assignee</label>
		<select id="assigneeId" name="assigneeId" value={form?.values.assigneeId ?? ''}>
			<option value="">Unassigned</option>
			{#each data.users as user (user.id)}
				<option value={user.id}>{user.name}</option>
			{/each}
		</select>
	</p>

	{#if form?.message}
		<p role="alert">{form.message}</p>
	{/if}

	<button type="submit" disabled={submitting}>
		{submitting ? 'Creating ticket…' : 'Create ticket'}
	</button>
</form>

<a href={resolve('/')}>Back to tickets</a>
