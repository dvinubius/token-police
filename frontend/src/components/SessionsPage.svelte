<script>
  import { store } from '../store.svelte.js';

  // Placeholder Sessions page. The filters, list, detail, and request dialog are
  // built in issue 3; this keeps the page shell and hash routing working so the
  // Stats ↔ Sessions navigation is exercisable now.
</script>

<main class="page main sessions-page" id="sessionsPage" data-page="sessions" hidden={store.page !== 'sessions'}>
  <section class="list-pane">
    <div class="dim" style="padding:16px">Sessions view is being rebuilt.</div>
  </section>
</main>
