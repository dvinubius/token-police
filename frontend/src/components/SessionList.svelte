<script>
  import { store, growList } from '../store.svelte.js';
  import SessionRow from './SessionRow.svelte';
  import { applyFilters, visibleSessionRows, fmtEstimatedCost } from '../lib/index.js';

  // applyFilters / visibleSessionRows read the mirrored seam in lib/state.js;
  // we reference the corresponding store fields here so this derivation re-runs
  // when filters or subagent expansion change.
  const filtered = $derived.by(() => {
    store.filters;
    return applyFilters(store.sessions);
  });
  const visible = $derived.by(() => {
    store.expandedSessionIds;
    return visibleSessionRows(filtered);
  });
  const totalCost = $derived(filtered.reduce((s, c) => s + c.total_estimated_cost_usd, 0));
  const limit = $derived(Math.min(store.listLimit, visible.length));
  const shown = $derived(visible.slice(0, limit));
  const hasMore = $derived(limit < visible.length);

  let listEl = $state(null);
  let sentinelEl = $state(null);

  // Scroll the list back to the top when the result set changes underneath the
  // user (filter changes bump listResetNonce).
  $effect(() => {
    store.listResetNonce;
    if (listEl) listEl.scrollTop = 0;
  });

  // Infinite scroll: observe a sentinel below the render window; when it nears
  // view, grow the window. The observer is created against the current sentinel
  // node and torn down when that node goes away (window fully rendered) or
  // changes, so observers are never leaked across re-renders.
  $effect(() => {
    if (!sentinelEl || !listEl) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) growList();
      },
      { root: listEl, rootMargin: '200px' },
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  });
</script>

<div class="list-meta" id="listMeta">
  <span class="num">{visible.length}</span> visible / <span class="num">{filtered.length}</span>
  session{filtered.length === 1 ? '' : 's'} · <span class="num">{fmtEstimatedCost(totalCost)}</span>
</div>
<div class="session-list" id="sessionList" bind:this={listEl}>
  {#if !visible.length}
    <div class="dim" style="padding:16px">No sessions match the current filters.</div>
  {:else}
    {#each shown as session (session.id)}
      <SessionRow {session} />
    {/each}
    {#if hasMore}
      <div class="list-sentinel" bind:this={sentinelEl}></div>
    {/if}
  {/if}
</div>
