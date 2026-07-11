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
    modelSummary,
    firstModelSummary,
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
  let copyState = $state('idle');
  let copyResetTimer;

  async function copySessionId(id) {
    if (!id) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(id);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = id;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      copyState = 'copied';
    } catch {
      copyState = 'failed';
    }

    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copyState = 'idle';
    }, 1400);
  }

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
        <h2 class="session-heading">
          <span>Session</span>
          <span class="session-id" title={c.id}>{c.id}</span>
          <button
            type="button"
            class="copy-session-id"
            aria-label="Copy session ID"
            title={copyState === 'copied'
              ? 'Copied'
              : copyState === 'failed'
                ? 'Copy failed'
                : 'Copy session ID'}
            onclick={() => copySessionId(c.id)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </h2>
        <div class="session-detail-models">
          <span class="session-detail-models-label">Models</span>
          <span title={(c.models || []).join(', ')}>{(c.models || []).join(', ') || 'Model not captured'}</span>
        </div>
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
              ><th class="l">Model</th><SortHeader table="humanRequests" key="llmCalls" label="LLM calls" />
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
                <td class="l model-cell" title={modelSummary(g.calls)}>{firstModelSummary(g.calls)}</td>
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
