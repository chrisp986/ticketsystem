<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';
	import { ticketStatuses } from '$lib/modules/tickets/ticket.constants';

	let { data }: PageProps = $props();
</script>

<h1>Tickets</h1>

<p>{data.tickets.length} tickets</p>

<form method="GET" action="/">
	<label for="status-filter">Status</label>

	<select id="status-filter" name="status">
		<option value="" selected={data.selectedStatus === ''}> All statuses </option>

		{#each ticketStatuses as status (status)}
			<option value={status} selected={data.selectedStatus === status}>
				{status}
			</option>
		{/each}
	</select>

	<button type="submit">Apply filter</button>
	<a href={resolve('/')}>Clear filter</a>
</form>

{#each data.tickets as ticket (ticket.id)}
	<article>
		<h2>
			<a href="/tickets/{ticket.id}">{ticket.subject || '(No subject)'}</a>
		</h2>
		<p>Created: {ticket.createdAt}</p>

		<p>Status: {ticket.status} · Priority: {ticket.priority}</p>

		{#if ticket.description}
			<p>{ticket.description}</p>
		{/if}
	</article>
{:else}
	<p>
		{data.selectedStatus ? 'No tickets match this status.' : 'No tickets yet.'}
	</p>
{/each}
<br />

<a href={resolve('/tickets/new')}>Create ticket</a>
