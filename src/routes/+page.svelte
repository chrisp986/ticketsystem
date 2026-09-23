<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';
	import { ticketStatuses, ticketStatusLabels } from '$lib/modules/tickets/ticket.constants';

	import { SvelteURLSearchParams } from 'svelte/reactivity';

	let { data }: PageProps = $props();

	function pageUrl(page: number): string {
		const params = new SvelteURLSearchParams();

		params.set('page', String(page));

		if (data.selectedStatus) {
			params.set('status', data.selectedStatus);
		}

		if (data.searchTerm) {
			params.set('q', data.searchTerm);
		}

		return `${resolve('/')}?${params.toString()}`;
	}
</script>

<h1>Tickets</h1>

<p>{data.tickets.length} tickets on this page.</p>

<h2>
	<a href={resolve('/tickets/new')}>Create ticket</a>
</h2>

<form method="GET" action="/">
	<label for="ticket-search">Subject</label>
	<input
		id="ticket-search"
		type="search"
		name="q"
		value={data.searchTerm}
		placeholder="Search ticket subjects"
		maxlength="200"
	/>

	<label for="status-filter">Status</label>
	<select id="status-filter" name="status">
		<option value="" selected={data.selectedStatus === ''}> All statuses </option>

		{#each ticketStatuses as status (status)}
			<option value={status} selected={data.selectedStatus === status}>
				{ticketStatusLabels[status]}
			</option>
		{/each}
	</select>

	<button type="submit">Search and filter</button>
	<a href={resolve('/')}>Clear search and filters</a>
</form>

{#each data.tickets as ticket (ticket.id)}
	<article>
		<h2>
			<a href={resolve('/tickets/[id]', { id: ticket.id })}>
				{ticket.subject || '(No subject)'}
			</a>
		</h2>
		<p>Created: {ticket.createdAt}</p>

		<p>Status: {ticketStatusLabels[ticket.status]} · Priority: {ticket.priority}</p>

		{#if ticket.description}
			<p>{ticket.description}</p>
		{/if}
	</article>
{:else}
	{#if data.page > 1}
		<p>No tickets on this page.</p>
		<a href={pageUrl(1)}>Go to the first page</a>
	{:else}
		<p>
			{data.selectedStatus || data.searchTerm
				? 'No tickets match your search and filters.'
				: 'No tickets yet.'}
		</p>
	{/if}
{/each}

<br />

<nav aria-label="Ticket pagination">
	{#if data.hasPreviousPage}
		<a href={pageUrl(data.page - 1)}>Previous</a>
	{/if}

	<span>Page {data.page}</span>

	{#if data.hasNextPage}
		<a href={pageUrl(data.page + 1)}>Next</a>
	{/if}
</nav>
