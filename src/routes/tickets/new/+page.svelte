<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';

	let { form }: PageProps = $props();
</script>

<h1>Create ticket</h1>

<form method="POST">
	<p>
		<label for="subject">Subject</label>
		<input id="subject" name="subject" type="text" />
	</p>

	<p>
		<label for="description">Description</label>
		<textarea id="description" name="description" rows="5"></textarea>
	</p>

	{#if form?.message}
		<p role="alert">{form.message}</p>
	{/if}

	<button type="submit">Create ticket</button>
</form>

<a href={resolve('/')}>Back to tickets</a>
