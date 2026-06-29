<script>
  import { store, toggleSubagent } from '../store.svelte.js';
  import { srcClass, srcLabel } from '../lib/index.js';

  let { session, showChevron = true } = $props();

  const expanded = $derived(store.expandedSessionIds.has(session.id));
  const subCount = $derived(session.subagent_session_count || 0);
</script>

<div class="session-badges">
  <span class="badge {srcClass(session.source)}">{srcLabel(session.source)}</span>
  {#if session.is_subagent}
    <span class="badge subagent">SUB</span>
  {:else if showChevron && subCount > 0}
    <button
      type="button"
      class="session-chevron"
      aria-label="{expanded ? 'Collapse' : 'Expand'} subagent sessions"
      aria-expanded={expanded ? 'true' : 'false'}
      onclick={(e) => {
        e.stopPropagation();
        toggleSubagent(session.id);
      }}>{expanded ? '▴' : '▾'}</button
    >
  {/if}
</div>
