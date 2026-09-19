<script lang="ts">
</script>

<h1>Tickets</h1>

<p>{tickets.length} Tickets vorhanden</p>

{#each tickets as ticket (ticket.id)}
	<article>
		<h2>{ticket.subject}</h2>

		<p>
			{ticket.id} . Status: {ticket.status} . Priorität: {ticket.priority}
		</p>

		{#if ticket.description}
			<p>{ticket.description}</p>
		{/if}

		<p>Bearbeiter: {ticket.assignee}</p>

		<button
			type="button"
			onclick={() => changeStatus(ticket, 'in_progress')}
			disabled={ticket.status === 'in_progress'}
		>
			Bearbeitung starten
		</button>

		<button
			type="button"
			onclick={() => changeStatus(ticket, 'closed')}
			disabled={ticket.status === 'closed'}
		>
			Abschließen
		</button>
	</article>
{/each}
