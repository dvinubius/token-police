<script>
  import { store, selectSession } from '../store.svelte.js';
  import { fmtTokens, fmtEstimatedCost, srcClass, srcLabel, srcFullLabel } from '../lib/index.js';

  const top = $derived(store.summary?.top_sessions ?? []);
</script>

<ol id="topList" class="top-list">
  {#if !top.length}
    <li class="dim">No data yet.</li>
  {:else}
    {#each top as c, i (c.id)}
      {@const tokens = fmtTokens(c.total_tokens)}
      <!-- Click-only, matching the former renderTop(); the original list had no keyboard handler. -->
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <li onclick={() => selectSession(c.id)}>
        <span class="top-rank"><span class="num">{i + 1}</span></span>
        <span class="top-source"><span class="badge {srcClass(c.source)}">{srcFullLabel(c.source)}</span></span>
        <span class="top-main"
          ><span class="top-title">{c.title}</span><span class="top-sub"
            ><span class="badge {srcClass(c.source)}">{srcLabel(c.source)}</span><span class="top-project"
              >{c.project}</span
            > · <span class="num">{tokens}</span> tok</span
          ></span
        >
        <span class="top-summary"
          ><span class="top-project">{c.project}</span> <span class="top-token-count"
            ><span class="num">{tokens}</span> tok</span
          ></span
        >
        <span class="top-estimated-cost"><span class="num">{fmtEstimatedCost(c.total_estimated_cost_usd)}</span></span>
      </li>
    {/each}
  {/if}
</ol>
