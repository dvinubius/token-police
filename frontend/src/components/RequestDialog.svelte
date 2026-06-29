<script>
  import { store, closeRequestDialog, toggleLlmCall, groupedHumanRequests } from '../store.svelte.js';
  import SortHeader from './SortHeader.svelte';
  import TokenCell from './TokenCell.svelte';
  import LlmCallInsights from './LlmCallInsights.svelte';
  import {
    fmtDate,
    fmtTokens,
    fmtTokensFull,
    fmtEstimatedCost,
    fmtPct,
    sessionRequestLabel,
    sortedRows,
    hotEstimatedCostThreshold,
    requestNumber,
    modelSummary,
    contextTokensForLlmCall,
    contextWindowForLlmCall,
    contextPctForLlmCall,
    cacheHitPctForLlmCall,
    totalTokensForLlmCall,
    timestampValue,
  } from '../lib/index.js';

  // Same chronological grouping the detail uses, so group identity and the
  // chrono request number agree across both surfaces.
  const groups = $derived(groupedHumanRequests());
  const group = $derived(
    store.activeRequestKey != null ? groups.find((g) => g.key === store.activeRequestKey) : null,
  );
  const open = $derived(group != null);
  const session = $derived(store.llmCallsCache?.session ?? {});
  const requestLabel = $derived(sessionRequestLabel(session));
  const chronologicalIndex = $derived(group ? groups.indexOf(group) : -1);
  const threshold = $derived(group ? hotEstimatedCostThreshold(group.calls, 5) : Infinity);
  const request = $derived(group ? group.human_request_full_text || group.human_request_text || '' : '');

  const sortedCalls = $derived.by(() => {
    if (!group) return [];
    store.tableSorts.llmCalls;
    return sortedRows(group.calls, 'llmCalls', (t, key) => {
      switch (key) {
        case 'time':
          return timestampValue(t.timestamp);
        case 'inputTokens':
          return t.input_tokens || 0;
        case 'totalTokens':
          return totalTokensForLlmCall(t);
        case 'cacheReadTokens':
          return t.cache_read_tokens || 0;
        case 'cacheWriteTokens':
          return t.cache_write_tokens || 0;
        case 'outputTokens':
          return t.output_tokens || 0;
        case 'estimatedCost':
          return t.estimated_cost_usd || 0;
        default:
          return timestampValue(t.timestamp);
      }
    });
  });

  function expandKey(t) {
    return `${store.selectedId || ''}:${store.activeRequestKey}:${t.llm_call_index}`;
  }

  let closeBtn = $state(null);
  let tableWrap = $state(null);
  let savedScroll = 0;
  let prevOpen = false;

  // Preserve the dialog table scroll position across re-renders (30s refresh or
  // a sort re-order), matching the former openRequestDialog() save/restore.
  $effect(() => {
    sortedCalls;
    if (tableWrap) tableWrap.scrollTop = savedScroll;
  });

  // Toggle the body modal-open class for the lifetime of the open dialog.
  $effect(() => {
    if (!open) return;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  });

  // Focus the close control once, on the open transition (not on every
  // same-data re-render driven by a later refresh).
  $effect(() => {
    if (open && !prevOpen && closeBtn) closeBtn.focus();
    prevOpen = open;
  });
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape' && store.activeRequestKey) closeRequestDialog();
  }}
/>

{#if open}
  <!-- Backdrop closes on click outside the dialog; Esc is handled on window. -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="dialog-backdrop"
    id="requestDialog"
    onclick={(e) => {
      if (e.target === e.currentTarget) closeRequestDialog();
    }}
  >
    <div class="request-dialog" role="dialog" aria-modal="true" aria-labelledby="requestDialogTitle">
      <div class="dialog-head">
        <div>
          <div class="dialog-kicker">{requestLabel}</div>
          <h2 id="requestDialogTitle">Request <span class="num">{requestNumber(group, chronologicalIndex)}</span></h2>
          <div class="dialog-model" id="requestDialogModel">{modelSummary(group.calls)}</div>
        </div>
        <button
          type="button"
          class="dialog-close"
          id="requestDialogClose"
          aria-label="Close dialog"
          bind:this={closeBtn}
          onclick={closeRequestDialog}
          ><svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg
          ></button
        >
      </div>
      <div class="dialog-body" id="requestDialogBody">
        <div class="prompt-title">{requestLabel} prompt</div>
        <div class="request-full" title={request}>
          <div class="request-full-text">
            {#if request}{request}{:else}<span class="dim">No {requestLabel.toLowerCase()} text captured.</span>{/if}
          </div>
        </div>
        <div class="dialog-stats">
          <div class="tstat">
            <div class="tstat-label">LLM calls</div>
            <div class="tstat-value"><span class="num">{fmtTokensFull(group.calls.length)}</span></div>
          </div>
          <div class="tstat">
            <div class="tstat-label">Fresh input</div>
            <div class="tstat-value"><span class="num">{fmtTokens(group.input_tokens)}</span></div>
          </div>
          <div class="tstat">
            <div class="tstat-label">Cache read</div>
            <div class="tstat-value"><span class="num">{fmtTokens(group.cache_read_tokens)}</span></div>
          </div>
          <div class="tstat">
            <div class="tstat-label">Output</div>
            <div class="tstat-value"><span class="num">{fmtTokens(group.output_tokens)}</span></div>
          </div>
          <div class="tstat estimated-cost">
            <div class="tstat-label">Estimated cost</div>
            <div class="tstat-value"><span class="num">{fmtEstimatedCost(group.estimated_cost_usd)}</span></div>
          </div>
        </div>
        <div
          class="dialog-table-wrap"
          bind:this={tableWrap}
          onscroll={(e) => (savedScroll = e.currentTarget.scrollTop)}
        >
          <table class="llm-calls">
            <colgroup>
              <col class="col-expand" />
              <col class="col-call" />
              <col class="col-time" />
              <col class="col-context" />
              <col class="col-context-pct" />
              <col class="col-cache-hit" />
              <col class="col-fresh" />
              <col class="col-cache-read" />
              <col class="col-cache-write" />
              <col class="col-output" />
              <col class="col-total" />
              <col class="col-cost" />
            </colgroup>
            <thead
              ><tr>
                <th class="l expand-head"></th><th class="l">LLM call #</th><SortHeader
                  table="llmCalls"
                  key="time"
                  label="Time"
                  alignClass="l"
                />
                <th>Context</th><th>Context %</th><th>Cache hit %</th>
                <SortHeader table="llmCalls" key="inputTokens" label="Fresh input" /><SortHeader
                  table="llmCalls"
                  key="cacheReadTokens"
                  label="Cache R"
                /><SortHeader table="llmCalls" key="cacheWriteTokens" label="Cache W" /><SortHeader
                  table="llmCalls"
                  key="outputTokens"
                  label="Output"
                /><SortHeader table="llmCalls" key="totalTokens" label="Total tokens" /><SortHeader
                  table="llmCalls"
                  key="estimatedCost"
                  label="Estimated cost"
                />
              </tr></thead
            >
            <tbody>
              {#each sortedCalls as t (t.llm_call_index)}
                {@const ek = expandKey(t)}
                {@const expanded = store.expandedLlmCalls.has(ek)}
                {@const hot =
                  isFinite(threshold) && t.estimated_cost_usd >= threshold && t.estimated_cost_usd > 0}
                {@const contextTokens = contextTokensForLlmCall(t)}
                {@const contextWindow = contextWindowForLlmCall(t)}
                {@const contextPctTitle = contextWindow
                  ? `${fmtTokensFull(contextTokens)} / ${fmtTokensFull(contextWindow)} context tokens`
                  : `${fmtTokensFull(contextTokens)} context tokens`}
                <tr
                  class="llm-call-row"
                  class:hot
                  tabindex="0"
                  role="button"
                  aria-expanded={expanded ? 'true' : 'false'}
                  aria-label="Toggle details for LLM call {t.llm_call_index + 1}"
                  onclick={() => toggleLlmCall(ek)}
                  onkeydown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleLlmCall(ek);
                    }
                  }}
                >
                  <td class="l expand-cell"
                    ><button
                      type="button"
                      class="expand-toggle"
                      aria-label="{expanded ? 'Collapse' : 'Expand'} LLM call {t.llm_call_index + 1}"
                      title={expanded ? 'Collapse details' : 'Expand details'}>{expanded ? '▾' : '▸'}</button
                    ></td
                  >
                  <td class="l">{t.llm_call_index + 1}</td>
                  <td class="l ts-cell">{fmtDate(t.timestamp)}</td>
                  <td title="{fmtTokensFull(contextTokens)} context tokens">{fmtTokens(contextTokens)}</td>
                  <td title={contextPctTitle}>{fmtPct(contextPctForLlmCall(t))}</td>
                  <td>{fmtPct(cacheHitPctForLlmCall(t))}</td>
                  <TokenCell n={t.input_tokens} />
                  <TokenCell n={t.cache_read_tokens} />
                  <TokenCell n={t.cache_write_tokens} />
                  <TokenCell n={t.output_tokens} />
                  <TokenCell n={totalTokensForLlmCall(t)} />
                  <td class="estimated-cost"
                    >{fmtEstimatedCost(t.estimated_cost_usd)}{#if hot}<span class="hot-flag">▲</span>{/if}</td
                  >
                </tr>
                {#if expanded}
                  <tr class="llm-call-detail-row" class:hot
                    ><td colspan="12"><LlmCallInsights call={t} {hot} /></td></tr
                  >
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
        <div class="legend-note">
          Rows highlighted in red are the top <span class="num">20%</span> most expensive LLM calls for
          this {requestLabel.toLowerCase()}.
        </div>
      </div>
    </div>
  </div>
{/if}
