<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';

	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if data.user}
	<header>
		<span>Signed in as {data.user.name}</span>
		<form method="POST" action={resolve('/logout')}>
			<button type="submit">Sign out</button>
		</form>
	</header>
{/if}

{@render children()}
