<script>
  import { store, selectSession } from '../store.svelte.js';
  import SessionBadges from './SessionBadges.svelte';
  import { fmtTokens, fmtEstimatedCost, relDay, displayTotals, totalTokensForTotals } from '../lib/index.js';

  let { session } = $props();

  const displayed = $derived(displayTotals(session));
  const tokens = $derived(totalTokensForTotals(displayed));
  const subCount = $derived(session.subagent_session_count || 0);
  const hasSubagents = $derived(subCount > 0 && !session.is_subagent);
  const expanded = $derived(store.expandedSessionIds.has(session.id));
  const selected = $derived(session.id === store.selectedId);
  const models = $derived(Array.isArray(session.models) ? session.models : []);
</script>

<!-- Click-only, matching the former sessionRow(); the original list rows had no
     keyboard handler. -->
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="session-row"
  class:subagent-row={session.is_subagent}
  class:has-subagents={hasSubagents}
  class:selected
  aria-expanded={hasSubagents ? (expanded ? 'true' : 'false') : undefined}
  style={session.is_subagent
    ? `--subagent-indent:${Math.max(1, session.subagent_depth || 1) * 18}px`
    : undefined}
  onclick={() => selectSession(session.id)}
>
  <SessionBadges {session} />
  <div class="session-main">
    <div class="session-title">{session.title}</div>
    <div class="session-sub">
      <span class="proj">{session.project}</span><span
        ><span class="num">{session.human_request_count || 0}</span>
        {session.is_subagent ? 'tasks' : 'human req'}</span
      >{#if hasSubagents}<span><span class="num">{subCount}</span> subagents</span>{/if}<span
        ><span class="num">{displayed.llm_call_count}</span> LLM calls</span
      ><span><span class="num">{fmtTokens(tokens)}</span> tok</span>
      {#if models.length}
        <span class="session-models" title={models.join(', ')}><span class="session-models-label">Models:</span>
          {models.join(', ')}</span
        >
      {/if}
    </div>
  </div>
  <div class="session-right">
    <div class="session-estimated-cost">
      <span class="num">{fmtEstimatedCost(displayed.estimated_cost_usd)}</span>
    </div>
    <div class="session-meta">{relDay(displayed.last_active_at)}</div>
  </div>
</div>
