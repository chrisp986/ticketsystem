<script lang="ts">
    import { exampleTickets } from '$lib/modules/tickets/example';
</script>

<h1>Tickets</h1>

<p>{exampleTickets.length} Tickets vorhanden</p>

{#each exampleTickets as ticket (ticket.id)}
    <article>
        <h2>{ticket.subject}</h2>

        <p>
            {ticket.id} . Status: {ticket.status} . Priorität: {ticket.priority}
        </p>

        {#if ticket.description}
            <p>{ticket.description}</p>
        {/if}

        <p>Bearbeiter: {ticket.assignee}</p>
    </article>
{/each}