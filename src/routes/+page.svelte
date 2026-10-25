<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';

	import { SvelteURLSearchParams } from 'svelte/reactivity';

	import {
		attentionReasonLabels,
		ticketStatuses,
		ticketStatusLabels,
		ticketViewLabels,
		ticketViews
	} from '$lib/modules/tickets/ticket.constants';
	import { isOverdue } from '$lib/modules/tickets/ticket.due';
	import { formatLocalDateTime } from '$lib/modules/time/local-datetime';

	let { data }: PageProps = $props();

	const now = new Date();

	function pageUrl(page: number): `?${string}` {
		const params = new SvelteURLSearchParams();

		if (data.view !== 'all') {
			params.set('view', data.view);
		}

		params.set('page', String(page));

		if (data.selectedStatus) {
			params.set('status', data.selectedStatus);
		}

		if (data.searchTerm) {
			params.set('q', data.searchTerm);
		}

		return `?${params.toString()}`;
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

	<label for="view-filter">Show</label>
	<select id="view-filter" name="view">
		{#each ticketViews as view (view)}
			<option value={view} selected={data.view === view}>{ticketViewLabels[view]}</option>
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

		{#if ticket.attentionReason}
			<p><strong>Needs attention:</strong> {attentionReasonLabels[ticket.attentionReason]}</p>
		{/if}

		<p>
			Status: {ticketStatusLabels[ticket.status]} · Priority: {ticket.priority} · Assignee: {ticket.assigneeId
				? (data.userNames[ticket.assigneeId] ?? '—')
				: 'Unassigned'}
		</p>

		{#if ticket.nextStepDue}
			<p>
				Next step: {ticket.nextStep ?? '—'} · due {formatLocalDateTime(ticket.nextStepDue)}
				{#if isOverdue(ticket, now)}
					<strong>Overdue</strong>
				{/if}
			</p>
		{/if}

		<p>Created: {formatLocalDateTime(ticket.createdAt)}</p>
	</article>
{:else}
	{#if data.page > 1}
		<p>No tickets on this page.</p>
		<a href={resolve(`/${pageUrl(1)}`)}>Go to the first page</a>
	{:else}
		<p>
			{data.selectedStatus || data.searchTerm || data.view !== 'all'
				? 'No tickets match your search and filters.'
				: 'No tickets yet.'}
		</p>
	{/if}
{/each}

<br />

<nav aria-label="Ticket pagination">
	{#if data.hasPreviousPage}
		<a href={resolve(`/${pageUrl(data.page - 1)}`)}>Previous</a>
	{/if}

	<span>Page {data.page}</span>

	{#if data.hasNextPage}
		<a href={resolve(`/${pageUrl(data.page + 1)}`)}>Next</a>
	{/if}
</nav>
