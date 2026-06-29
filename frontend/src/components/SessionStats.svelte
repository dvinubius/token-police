<script>
  // Session stats block. For a subagent or a session with no subagents it is a
  // single simple totals grid; otherwise a breakdown with a labelled Total row,
  // the main-agent row, and one row per subagent. Mirrors the former
  // sessionStats() / statsRow() / statsBlock() / statsGrid() helpers.
  import { fmtTokens, fmtEstimatedCost, sessionTotals, totalTokensForTotals } from '../lib/index.js';

  let { session } = $props();

  const subagents = $derived(Array.isArray(session.subagent_sessions) ? session.subagent_sessions : []);
  const isSimple = $derived(session.is_subagent || !subagents.length);

  function subagentDisplayName(c) {
    return c.subagent_label || c.subagent_name || c.subagent_role || c.title || 'Subagent';
  }
</script>

{#snippet grid(t, labels)}
  {@const tokens = totalTokensForTotals(t)}
  <div class="totals-grid">
    <div class="tstat total">
      {#if labels}<div class="tstat-label">Total Tokens</div>{/if}
      <div class="tstat-value"><span class="num">{fmtTokens(tokens)}</span></div>
    </div>
    <div class="tstat fresh">
      {#if labels}<div class="tstat-label">Fresh input</div>{/if}
      <div class="tstat-value"><span class="num">{fmtTokens(t.input_tokens)}</span></div>
    </div>
    <div class="tstat output">
      {#if labels}<div class="tstat-label">Output</div>{/if}
      <div class="tstat-value"><span class="num">{fmtTokens(t.output_tokens)}</span></div>
    </div>
    <div class="tstat cache-read">
      {#if labels}<div class="tstat-label">Cache read</div>{/if}
      <div class="tstat-value"><span class="num">{fmtTokens(t.cache_read_tokens)}</span></div>
    </div>
    <div class="tstat cache-write">
      {#if labels}<div class="tstat-label">Cache write</div>{/if}
      <div class="tstat-value"><span class="num">{fmtTokens(t.cache_write_tokens)}</span></div>
    </div>
    <div class="tstat estimated-cost">
      {#if labels}<div class="tstat-label">Estimated cost</div>{/if}
      <div class="tstat-value"><span class="num">{fmtEstimatedCost(t.estimated_cost_usd)}</span></div>
    </div>
  </div>
{/snippet}

{#if isSimple}
  <div class="stats-breakdown simple-stats">
    <div class="stats-row stats-row-single">
      {@render grid(sessionTotals(session), true)}
    </div>
  </div>
{:else}
  <div class="stats-breakdown">
    <div class="stats-row total-row">
      <div class="stats-row-label">Total</div>
      {@render grid(sessionTotals(session, true), true)}
    </div>
    <div class="stats-row">
      <div class="stats-row-label">Main agent</div>
      {@render grid(sessionTotals(session), false)}
    </div>
    {#each subagents as s, i (s.id ?? i)}
      <div class="stats-row subagent-stats-row">
        <div class="stats-row-label">{subagentDisplayName(s)}</div>
        {@render grid(sessionTotals(s), false)}
      </div>
    {/each}
  </div>
{/if}
