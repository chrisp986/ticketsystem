<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';

	let { data }: PageProps = $props();
</script>

<h1>Tickets</h1>

<p>{data.tickets.length} tickets</p>

{#each data.tickets as ticket (ticket.id)}
	<article>
		<h2>{ticket.subject || '(No subject)'}</h2>

		<p>Status: {ticket.status} · Priority: {ticket.priority}</p>

		{#if ticket.description}
			<p>{ticket.description}</p>
		{/if}
	</article>
{:else}
	<p>No tickets yet.</p>
{/each}
<br />

<a href={resolve('/tickets/new')}>Create ticket</a>
