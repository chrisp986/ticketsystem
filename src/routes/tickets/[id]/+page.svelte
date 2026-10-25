<script lang="ts">
	import type { PageProps } from './$types';
	import {
		closingResolutions,
		resolvingResolutions,
		ticketResolutionLabels,
		ticketStatusLabels,
		attentionReasonLabels
	} from '$lib/modules/tickets/ticket.constants';
	import { allowedTransitions } from '$lib/modules/tickets/ticket.transitions';
	import { resolve } from '$app/paths';
	import { checkStatusChange } from '$lib/modules/tickets/ticket.guard';
	import type { TicketResolution } from '$lib/modules/tickets/ticket.types';
	import { defaultNextStepDue, defaultNextSteps, isOverdue } from '$lib/modules/tickets/ticket.due';
	import { ownershipAfterStatusChange } from '$lib/modules/tickets/ticket.ownership';
	import {
		formatLocalDateTime,
		fromLocalInputValue,
		toLocalInputValue
	} from '$lib/modules/time/local-datetime';

	let { data, form }: PageProps = $props();

	function userName(id: string | null): string {
		const user = data.users.find((candidate) => candidate.id === id);

		if (!user) {
			return '—';
		}

		return user.active ? user.name : `${user.name} (inactive)`;
	}

	// Active users, plus inactive users who still hold this ticket (ADR 0008).
	const assignableUsers = $derived(
		data.users.filter(
			(user) =>
				user.active || user.id === data.ticket.assigneeId || user.id === data.ticket.nextStepOwnerId
		)
	);

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

	let nextStep = $derived(defaultNextSteps[selectedStatus] ?? '');

	let nextStepDue = $derived.by(() => {
		const due = defaultNextStepDue(selectedStatus, data.ticket.priority, new Date());
		return due ? toLocalInputValue(due) : '';
	});

	let nextStepOwnerId = $derived(
		ownershipAfterStatusChange(
			{ assigneeId: data.ticket.assigneeId, nextStepOwnerId: data.ticket.nextStepOwnerId },
			{ from: data.ticket.status, to: selectedStatus },
			{ type: 'user', id: data.currentUserId }
		).nextStepOwnerId ?? ''
	);

	const guard = $derived(
		selectedStatus === data.ticket.status
			? null
			: checkStatusChange(
					{ status: data.ticket.status, reopenCount: data.ticket.reopenCount },
					{
						to: selectedStatus,
						resolution: selectedResolution || undefined,
						resolutionSummary,
						nextStep,
						nextStepDue: fromLocalInputValue(nextStepDue) ?? undefined,
						actorType: 'user'
					}
				)
	);
</script>

<a href={resolve('/')}>Back to tickets</a>

<h1>{data.ticket.subject || '(No subject)'}</h1>

<p>Ticket Nr.: {data.ticket.ticketNumber}</p>
<p>Status: {ticketStatusLabels[data.ticket.status]}</p>

<p>Assignee: {data.ticket.assigneeId ? userName(data.ticket.assigneeId) : 'Unassigned'}</p>

{#if data.ticket.nextStepDue}
	<p>
		Next step: {data.ticket.nextStep ?? '—'}, due {formatLocalDateTime(data.ticket.nextStepDue)}
		· owner {data.ticket.nextStepOwnerId ? userName(data.ticket.nextStepOwnerId) : 'nobody'}
		{#if isOverdue(data.ticket)}
			<strong>Overdue</strong>
		{/if}
	</p>
{/if}

{#if data.ticket.status !== 'closed'}
	<section aria-labelledby="assignment-heading">
		<h2 id="assignment-heading">Assignment</h2>

		{#if data.ticket.assigneeId !== data.currentUserId}
			<form method="POST" action="?/assign">
				<input type="hidden" name="expectedVersion" value={data.ticket.version} />
				<button type="submit" name="assignToMe" value="1">Assign to me</button>
			</form>
		{/if}

		<form method="POST" action="?/assign">
			<input type="hidden" name="expectedVersion" value={data.ticket.version} />

			<label for="assigneeId">Assignee</label>
			<select id="assigneeId" name="assigneeId" value={data.ticket.assigneeId ?? ''}>
				<option value="">Unassigned</option>
				{#each assignableUsers as user (user.id)}
					<option value={user.id}>{userName(user.id)}</option>
				{/each}
			</select>

			<label for="assignmentNextStepOwnerId">Next-step owner</label>
			<select
				id="assignmentNextStepOwnerId"
				name="nextStepOwnerId"
				value={data.ticket.nextStepOwnerId ?? ''}
			>
				<option value="">Nobody</option>
				{#each assignableUsers as user (user.id)}
					<option value={user.id}>{userName(user.id)}</option>
				{/each}
			</select>

			<button type="submit">Save assignment</button>
		</form>
	</section>
{/if}

{#if data.ticket.attentionSince && data.ticket.attentionReason}
	<section aria-labelledby="attention-heading">
		<h2 id="attention-heading">Needs attention</h2>

		<p>
			{attentionReasonLabels[data.ticket.attentionReason]} since
			{formatLocalDateTime(data.ticket.attentionSince)}
		</p>

		<form method="POST" action="?/markHandled">
			<input type="hidden" name="expectedVersion" value={data.ticket.version} />
			<button type="submit">Mark as handled</button>
		</form>
	</section>
{/if}

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

		{#if selectedStatus !== data.ticket.status && selectedStatus !== 'closed'}
			<label for="nextStep">Next step</label>
			<input id="nextStep" name="nextStep" maxlength="500" bind:value={nextStep} />

			<label for="nextStepDue">Due (Berlin time)</label>
			<input id="nextStepDue" name="nextStepDue" type="datetime-local" bind:value={nextStepDue} />

			<label for="nextStepOwnerId">Next-step owner</label>
			<select id="nextStepOwnerId" name="nextStepOwnerId" bind:value={nextStepOwnerId}>
				<option value="">Nobody</option>
				{#each assignableUsers as user (user.id)}
					<option value={user.id}>{userName(user.id)}</option>
				{/each}
			</select>
		{/if}

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
