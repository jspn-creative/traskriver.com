<script lang="ts">
	import { Drawer as DrawerPrimitive } from 'vaul-svelte';

	let {
		shouldScaleBackground = false,
		open = $bindable(true),
		activeSnapPoint = $bindable(null),
		...restProps
	}: DrawerPrimitive.RootProps = $props();
</script>

<DrawerPrimitive.Root {shouldScaleBackground} bind:open bind:activeSnapPoint {...restProps} />
