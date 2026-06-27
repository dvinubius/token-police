<script>
  import { store, applyTheme, setPage, pageFromHash, refresh } from './store.svelte.js';
  import Topbar from './components/Topbar.svelte';
  import StatsPage from './components/StatsPage.svelte';
  import SessionsPage from './components/SessionsPage.svelte';

  // Re-assert the stored theme on <html> (the anti-FOUC inline script already
  // applied it before paint; this keeps the attribute in sync without
  // re-persisting) and load the initial data so Stats renders on boot.
  applyTheme(store.theme, false);
  refresh();
</script>

<svelte:window onhashchange={() => setPage(pageFromHash(), false)} />

<Topbar />
<StatsPage />
<SessionsPage />
