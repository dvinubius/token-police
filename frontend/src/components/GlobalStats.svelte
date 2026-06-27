<script>
  import { store } from '../store.svelte.js';
  import { fmtTokens, fmtEstimatedCost } from '../lib/index.js';

  const totals = $derived(store.summary?.totals ?? null);
  const tokens = $derived(
    totals
      ? totals.input_tokens + totals.output_tokens + totals.cache_read_tokens + totals.cache_write_tokens
      : 0,
  );
</script>

<div class="global-stats" id="globalStats">
  <div class="gstat card">
    <span class="gstat-label">Estimated cost</span>
    <span class="gstat-value estimated-cost" id="gsEstimatedCost"
      >{totals ? fmtEstimatedCost(totals.estimated_cost_usd) : '—'}</span
    >
  </div>
  <div class="gstat card">
    <span class="gstat-label">Total tokens</span>
    <span class="gstat-value tokens" id="gsTokens">{totals ? fmtTokens(tokens) : '—'}</span>
  </div>
  <div class="gstat card">
    <span class="gstat-label">Sessions</span>
    <span class="gstat-value" id="gsSessions">{totals ? totals.session_count : '—'}</span>
  </div>
  <div class="gstat card">
    <span class="gstat-label">LLM calls</span>
    <span class="gstat-value" id="gsLlmCalls">{totals ? fmtTokens(totals.llm_call_count) : '—'}</span>
  </div>
</div>
