<script>
  import { store, openRequestDialog, groupedHumanRequests } from '../store.svelte.js';
  import SessionBadges from './SessionBadges.svelte';
  import SessionStats from './SessionStats.svelte';
  import SortHeader from './SortHeader.svelte';
  import TokenCell from './TokenCell.svelte';
  import {
    fmtDate,
    fmtDateShort,
    fmtTokens,
    fmtTokensFull,
    fmtEstimatedCost,
    sessionRequestLabel,
    sortedRows,
    hotEstimatedCostThreshold,
    requestNumber,
    requestPreview,
    latestContextLlmCall,
    contextTokensForLlmCall,
    totalTokensForGroup,
    timestampValue,
    displayTotals,
  } from '../lib/index.js';

  // Only render detail once the selected session's LLM calls have loaded.
  const c = $derived(
    store.llmCallsCache && store.llmCallsCache.id === store.selectedId
      ? store.llmCallsCache.session
      : null,
  );

  // Chronological grouping (used for the chrono request number and dialog lookup).
  const requests = $derived(groupedHumanRequests());
  const requestLabel = $derived(c ? sessionRequestLabel(c) : 'Human request');
  const subagentCount = $derived(c ? c.subagent_session_count || 0 : 0);
  const displayed = $derived(c ? displayTotals(c) : null);
  const requestHotThreshold = $derived(hotEstimatedCostThreshold(requests, 1));

  const sortedRequests = $derived.by(() => {
    store.tableSorts.humanRequests;
    return sortedRows(requests, 'humanRequests', (g, key) => {
      switch (key) {
        case 'time':
          return timestampValue(g.started_at);
        case 'llmCalls':
          return g.calls.length;
        case 'totalTokens':
          return totalTokensForGroup(g);
        case 'inputTokens':
          return g.input_tokens || 0;
        case 'cacheReadTokens':
          return g.cache_read_tokens || 0;
        case 'cacheWriteTokens':
          return g.cache_write_tokens || 0;
        case 'outputTokens':
          return g.output_tokens || 0;
        case 'estimatedCost':
          return g.estimated_cost_usd || 0;
        default:
          return timestampValue(g.started_at);
      }
    });
  });

  const sessionTitle = $derived(
    c
      ? c.session_title ||
          (requests.find((g) => g.human_request_text) || {}).human_request_text ||
          c.title
      : '',
  );

  // Preserve the requests-pane scroll position across re-renders (e.g. the 30s
  // auto-refresh re-deriving the same rows, or a sort re-order), matching the
  // former renderDetail() save/restore. savedScroll is a plain variable so
  // writing it never re-triggers the restore effect.
  let requestsWrap = $state(null);
  let savedScroll = 0;
  $effect(() => {
    sortedRequests;
    if (requestsWrap) requestsWrap.scrollTop = savedScroll;
  });
</script>

<section class="detail-pane" id="detailPane">
  {#if !c}
    <div class="empty-detail" id="emptyDetail">
      <p>No session selected.</p>
    </div>
  {:else}
    <div class="detail-content" id="detailContent">
      <div class="detail-header">
        <h2>Session</h2>
        <div class="prompt-title">{c.is_subagent ? 'Initial subagent task' : 'Initial session prompt'}</div>
        <div class="session-title-card" title={sessionTitle}>
          <div class="session-title-text">{sessionTitle}</div>
        </div>
        <div class="detail-sub">
          <SessionBadges session={c} showChevron={false} />
          <span>{c.project}</span>
          <span>·</span><span
            ><span class="num">{c.human_request_count || requests.length}</span>
            {c.is_subagent ? 'subagent tasks' : 'human requests'}</span
          >
          {#if subagentCount && !c.is_subagent}<span>·</span><span
              ><span class="num">{subagentCount}</span> subagents</span
            >{/if}
          <span>·</span><span><span class="num">{displayed.llm_call_count}</span> LLM calls</span>
          <span>·</span><span
            ><span class="num">{fmtDateShort(c.started_at)}</span> → <span class="num"
              >{fmtDateShort(displayed.last_active_at)}</span
            ></span
          >
        </div>
      </div>
      <SessionStats session={c} />
      <div
        class="requests-wrap"
        bind:this={requestsWrap}
        onscroll={(e) => (savedScroll = e.currentTarget.scrollTop)}
      >
        <table class="requests">
          <thead
            ><tr>
              <th class="l">#</th><SortHeader table="humanRequests" key="time" label="Time" alignClass="l" /><th
                class="l">{requestLabel}</th
              ><SortHeader table="humanRequests" key="llmCalls" label="LLM calls" />
              <th>Context</th><SortHeader table="humanRequests" key="inputTokens" label="Fresh input" /><SortHeader
                table="humanRequests"
                key="cacheReadTokens"
                label="Cache R"
              /><SortHeader table="humanRequests" key="cacheWriteTokens" label="Cache W" /><SortHeader
                table="humanRequests"
                key="outputTokens"
                label="Output"
              /><SortHeader table="humanRequests" key="totalTokens" label="Total tokens" /><SortHeader
                table="humanRequests"
                key="estimatedCost"
                label="Estimated cost"
              />
            </tr></thead
          >
          <tbody>
            {#each sortedRequests as g (g.key)}
              {@const chronologicalIndex = requests.indexOf(g)}
              {@const request = g.human_request_text || ''}
              {@const requestFull = g.human_request_full_text || request}
              {@const requestShort = requestPreview(request, 68)}
              {@const latestLlmCall = latestContextLlmCall(g)}
              {@const latestContextTokens = latestLlmCall ? contextTokensForLlmCall(latestLlmCall) : 0}
              {@const totalTokens = totalTokensForGroup(g)}
              {@const hot =
                isFinite(requestHotThreshold) &&
                g.estimated_cost_usd >= requestHotThreshold &&
                g.estimated_cost_usd > 0}
              <tr
                class="request-row"
                class:hot
                tabindex="0"
                role="button"
                aria-label="Open LLM calls for {requestLabel.toLowerCase()} {requestNumber(
                  g,
                  chronologicalIndex,
                )}"
                onclick={() => openRequestDialog(g.key)}
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openRequestDialog(g.key);
                  }
                }}
              >
                <td class="l">{requestNumber(g, chronologicalIndex)}</td>
                <td class="l ts-cell">{fmtDate(g.started_at)}</td>
                <td class="l request-cell" title={requestFull}
                  >{#if requestShort}{requestShort}{:else}<span class="dim">—</span>{/if}</td
                >
                <td>{fmtTokensFull(g.calls.length)}</td>
                <td title="{fmtTokensFull(latestContextTokens)} context tokens">{fmtTokens(latestContextTokens)}</td>
                <TokenCell n={g.input_tokens} />
                <TokenCell n={g.cache_read_tokens} />
                <TokenCell n={g.cache_write_tokens} />
                <TokenCell n={g.output_tokens} />
                <TokenCell n={totalTokens} />
                <td class="estimated-cost"
                  >{fmtEstimatedCost(g.estimated_cost_usd)}{#if hot}<span class="hot-flag">▲</span>{/if}</td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="legend-note">
        Click a {requestLabel.toLowerCase()} to inspect the individual LLM calls that it triggered. Rows
        highlighted in red are the highest-cost {requestLabel.toLowerCase()}s.
      </div>
    </div>
  {/if}
</section>
