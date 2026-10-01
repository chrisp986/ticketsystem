<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
</script>

<h1>{page.status}</h1>
<p>{page.error?.message}</p>

{#if page.error?.requestId}
	<p>Request ID: <code>{page.error.requestId}</code></p>
{/if}

<a href={resolve('/')}>Back to tickets</a>
