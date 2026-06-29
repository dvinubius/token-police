<script>
  import { store } from '../store.svelte.js';
  import Filters from './Filters.svelte';
  import SessionList from './SessionList.svelte';
  import SessionDetail from './SessionDetail.svelte';
  import RequestDialog from './RequestDialog.svelte';
</script>

<main class="page main sessions-page" id="sessionsPage" data-page="sessions" hidden={store.page !== 'sessions'}>
  <section class="list-pane">
    <Filters />
    <SessionList />
  </section>
  <SessionDetail />
</main>
<RequestDialog />
