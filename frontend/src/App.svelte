<script>
  import { onMount } from 'svelte';
  import { store, applyTheme, setPage, pageFromHash, startPolling } from './store.svelte.js';
  import Topbar from './components/Topbar.svelte';
  import StatsPage from './components/StatsPage.svelte';
  import SessionsPage from './components/SessionsPage.svelte';

  // Re-assert the stored theme on <html> (the anti-FOUC inline script already
  // applied it before paint; this keeps the attribute in sync without
  // re-persisting) and start the initial + 30s data refresh loop.
  applyTheme(store.theme, false);

  onMount(startPolling);
</script>

<svelte:window onhashchange={() => setPage(pageFromHash(), false)} />

<Topbar />
<StatsPage />
<SessionsPage />
