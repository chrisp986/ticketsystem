<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<a href="/">Back to tickets</a>

<h1>{data.ticket.subject || '(No subject)'}</h1>

<p>Status: {data.ticket.status}</p>
<p>Priority: {data.ticket.priority}</p>

<h2>Description</h2>

{#if data.ticket.description}
	<p class="description">{data.ticket.description}</p>
{:else}
	<p>No description provided.</p>
{/if}

<style>
	.description {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
