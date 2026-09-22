<script lang="ts">
	import type { PageProps } from './$types';
	import { ticketStatuses, ticketStatusLabels } from '$lib/modules/tickets/ticket.constants';
	import { resolve } from '$app/paths';

	let { data, form }: PageProps = $props();
</script>

<a href={resolve('/')}>Back to tickets</a>

<h1>{data.ticket.subject || '(No subject)'}</h1>

<p>Ticket Nr.: {data.ticket.ticketNumber}</p>
<p>Status: {ticketStatusLabels[data.ticket.status]}</p>

<form method="POST" action="?/updateStatus">
	<input type="hidden" name="expectedVersion" value={data.ticket.version} />

	<label for="status">Change status</label>

	<select id="status" name="status">
		{#each ticketStatuses as status (status)}
			<option value={status} selected={status === data.ticket.status}>
				{ticketStatusLabels[status]}
			</option>
		{/each}
	</select>

	<button type="submit">Save status</button>
</form>

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
