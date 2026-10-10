<script lang="ts">
	import type { PageProps } from './$types';
	import {
		closingResolutions,
		resolvingResolutions,
		ticketResolutionLabels,
		ticketStatusLabels
	} from '$lib/modules/tickets/ticket.constants';
	import { allowedTransitions } from '$lib/modules/tickets/ticket.transitions';
	import { resolve } from '$app/paths';
	import { checkStatusChange } from '$lib/modules/tickets/ticket.guard';
	import type { TicketResolution } from '$lib/modules/tickets/ticket.types';

	let { data, form }: PageProps = $props();

	const statusOptions = $derived([data.ticket.status, ...allowedTransitions(data.ticket.status)]);

	let selectedStatus = $derived(data.ticket.status);

	const needsResolution = $derived(
		selectedStatus === 'resolved' ||
			(selectedStatus === 'closed' && data.ticket.status !== 'resolved')
	);

	const resolutionOptions = $derived(
		selectedStatus === 'resolved' ? resolvingResolutions : closingResolutions
	);

	let selectedResolution = $state<TicketResolution | ''>('');
	let resolutionSummary = $state('');

	const guard = $derived(
		selectedStatus === data.ticket.status
			? null
			: checkStatusChange(
					{ status: data.ticket.status, reopenCount: data.ticket.reopenCount },
					{
						to: selectedStatus,
						resolution: selectedResolution || undefined,
						resolutionSummary
					}
				)
	);
</script>

<a href={resolve('/')}>Back to tickets</a>

<h1>{data.ticket.subject || '(No subject)'}</h1>

<p>Ticket Nr.: {data.ticket.ticketNumber}</p>
<p>Status: {ticketStatusLabels[data.ticket.status]}</p>

{#if data.ticket.resolution}
	<p>Resolution: {ticketResolutionLabels[data.ticket.resolution]}</p>
	{#if data.ticket.resolutionSummary}
		<p class="description">{data.ticket.resolutionSummary}</p>
	{/if}
{/if}

{#if statusOptions.length > 1}
	<form method="POST" action="?/updateStatus">
		<input type="hidden" name="expectedVersion" value={data.ticket.version} />

		<label for="status">Change status</label>

		<select id="status" name="status" bind:value={selectedStatus}>
			{#each statusOptions as status (status)}
				<option value={status}>{ticketStatusLabels[status]}</option>
			{/each}
		</select>

		<label for="reason">Reason (optional)</label>
		<input id="reason" name="reason" maxlength="500" />
		{#if needsResolution}
			<label for="resolution">Resolution</label>
			<select id="resolution" name="resolution" required bind:value={selectedResolution}>
				<option value="">Please choose</option>
				{#each resolutionOptions as resolution (resolution)}
					<option value={resolution}>{ticketResolutionLabels[resolution]}</option>
				{/each}
			</select>

			<label for="resolutionSummary">
				Summary{selectedStatus === 'resolved' ? '' : ' (optional)'}
			</label>

			<textarea
				id="resolutionSummary"
				name="resolutionSummary"
				maxlength="2000"
				required={selectedStatus === 'resolved'}
				bind:value={resolutionSummary}></textarea>
		{/if}

		{#if guard}
			{#each guard.blockers as blocker (blocker.code)}
				<p role="alert">{blocker.message}</p>
			{/each}

			{#each guard.warnings as warning (warning.code)}
				<p role="status">Warning: {warning.message}</p>
			{/each}
		{/if}

		<button type="submit" disabled={guard !== null && guard.blockers.length > 0}>Save status</button
		>
	</form>
{:else}
	<p>Closed tickets cannot be changed.</p>
{/if}

<section aria-labelledby="status-history-heading">
	<h2 id="status-history-heading">Status history</h2>

	{#if data.statusHistory.length === 0}
		<p>No status changes recorded yet.</p>
	{:else}
		<p>Showing up to 50 most recent changes. Times are in UTC.</p>

		<ol>
			{#each data.statusHistory as entry (entry.id)}
				<li>
					<span>
						{ticketStatusLabels[entry.previousStatus]}
						→
						{ticketStatusLabels[entry.newStatus]}
					</span>

					<span>by {entry.actorType}</span>

					<time datetime={entry.changedAt.toISOString()}>
						{entry.changedAt.toLocaleString('en-GB', {
							timeZone: 'UTC'
						})}
					</time>

					{#if entry.resolution}
						<p>Resolution: {ticketResolutionLabels[entry.resolution]}</p>
					{/if}

					{#if entry.resolutionSummary}
						<p class="description">{entry.resolutionSummary}</p>
					{/if}

					{#if entry.reason}
						<p>Reason: {entry.reason}</p>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</section>

{#if form?.message}
	<p role="status">{form.message}</p>
{/if}

<p>Version: {data.ticket.version}</p>

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
