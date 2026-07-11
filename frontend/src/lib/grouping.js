// Pure derivation/aggregation helpers for Human requests and LLM calls.
// Framework-agnostic: no DOM, no network. Bodies moved verbatim from the legacy
// vanilla frontend during the Svelte + Vite migration.

export function contextTokensForLlmCall(t) {
  return t.context_input_tokens != null
    ? t.context_input_tokens
    : (t.input_tokens || 0) + (t.cache_read_tokens || 0) + (t.cache_write_tokens || 0);
}

export function contextWindowForLlmCall(t) {
  return t.model_context_window_tokens || 0;
}

export function contextPctForLlmCall(t) {
  const contextTokens = contextTokensForLlmCall(t);
  const contextWindow = contextWindowForLlmCall(t);
  return contextWindow > 0 ? contextTokens / contextWindow : 0;
}

export function cacheHitPctForLlmCall(t) {
  const contextTokens = contextTokensForLlmCall(t);
  return contextTokens > 0 ? (t.cache_read_tokens || 0) / contextTokens : 0;
}

export function latestContextLlmCall(group) {
  return group.calls[group.calls.length - 1] || null;
}

export function totalTokensForGroup(group) {
  return (group.input_tokens || 0) + (group.output_tokens || 0) +
    (group.cache_read_tokens || 0) + (group.cache_write_tokens || 0);
}

export function totalTokensForLlmCall(t) {
  return (t.input_tokens || 0) + (t.output_tokens || 0) +
    (t.cache_read_tokens || 0) + (t.cache_write_tokens || 0);
}

export function timestampValue(ts) {
  const time = Date.parse(ts || '');
  return Number.isFinite(time) ? time : 0;
}

// 80th-percentile estimated-cost threshold: rows at/above it are the top 20%.
export function hotEstimatedCostThreshold(items, minItems = 1) {
  const costs = items.map((item) => item.estimated_cost_usd).filter((c) => c > 0).sort((a, b) => a - b);
  if (costs.length < minItems) return Infinity;
  const idx = Math.ceil(costs.length * 0.8) - 1;
  return costs[Math.max(0, Math.min(idx, costs.length - 1))];
}

export function humanRequestKey(t) {
  if (t.human_request_index != null) return String(t.human_request_index);
  const request = t.human_request_text || '';
  return request ? `human-request:${request}` : `llm-call:${t.llm_call_index}`;
}

export function newHumanRequestGroup(key, index, text, fullText, timestamp) {
  return {
    key,
    human_request_index: index,
    human_request_text: text || '',
    human_request_full_text: fullText || text || '',
    started_at: timestamp,
    last_active_at: timestamp,
    calls: [],
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    estimated_cost_usd: 0,
  };
}

// Build one group per Human request. When the session provides a Human request
// list (Claude Code), seed groups from it in chronological order so requests
// with zero LLM calls still get a row; LLM calls then attach by request key.
// Sessions without the list (e.g. Codex) fall back to call-derived grouping.
export function groupHumanRequests(llmCalls, humanRequests) {
  const groups = new Map();
  if (Array.isArray(humanRequests)) {
    for (const r of humanRequests) {
      const key = String(r.human_request_index);
      if (!groups.has(key)) {
        groups.set(key, newHumanRequestGroup(
          key, r.human_request_index, r.human_request_text, r.human_request_full_text, r.timestamp
        ));
      }
    }
  }
  for (const t of llmCalls) {
    const key = humanRequestKey(t);
    let g = groups.get(key);
    if (!g) {
      g = newHumanRequestGroup(
        key, t.human_request_index, t.human_request_text, t.human_request_full_text, t.timestamp
      );
      groups.set(key, g);
    }
    g.calls.push(t);
    if (!g.human_request_full_text && t.human_request_full_text) g.human_request_full_text = t.human_request_full_text;
    if (!g.started_at || String(t.timestamp).localeCompare(String(g.started_at)) < 0) g.started_at = t.timestamp;
    if (!g.last_active_at || String(t.timestamp).localeCompare(String(g.last_active_at)) > 0) g.last_active_at = t.timestamp;
    g.input_tokens += t.input_tokens || 0;
    g.output_tokens += t.output_tokens || 0;
    g.cache_read_tokens += t.cache_read_tokens || 0;
    g.cache_write_tokens += t.cache_write_tokens || 0;
    g.estimated_cost_usd += t.estimated_cost_usd || 0;
  }
  return [...groups.values()];
}

export function requestNumber(_g, groupIndex) {
  return groupIndex + 1;
}

export function requestPreview(text, n) {
  const request = text || '';
  return request.length > n ? request.slice(0, n).trimEnd() + '…' : request;
}

export function modelSummary(calls) {
  const models = [...new Set(calls.map((t) => t.model).filter(Boolean))];
  if (!models.length) return 'Model not captured';
  if (models.length === 1) return models[0];
  const shown = models.slice(0, 3).join(', ');
  return `Mixed models: ${shown}${models.length > 3 ? ` +${models.length - 3}` : ''}`;
}

export function firstModelSummary(calls) {
  const models = [...new Set(calls.map((t) => t.model).filter(Boolean))];
  const firstModel = calls[0]?.model;
  if (!firstModel) return 'Model not captured';
  return `${firstModel}${models.length > 1 ? ' et. al.' : ''}`;
}

export function sessionTotals(c, inclusive = false) {
  return {
    input_tokens: inclusive ? c.inclusive_total_input_tokens : c.total_input_tokens,
    output_tokens: inclusive ? c.inclusive_total_output_tokens : c.total_output_tokens,
    cache_read_tokens: inclusive ? c.inclusive_total_cache_read_tokens : c.total_cache_read_tokens,
    cache_write_tokens: inclusive ? c.inclusive_total_cache_write_tokens : c.total_cache_write_tokens,
    estimated_cost_usd: inclusive ? c.inclusive_total_estimated_cost_usd : c.total_estimated_cost_usd,
    llm_call_count: inclusive ? c.inclusive_llm_call_count : c.llm_call_count,
    last_active_at: inclusive ? c.inclusive_last_active_at : c.last_active_at,
  };
}

export function displayTotals(c) {
  return sessionTotals(c, !c.is_subagent && (c.subagent_session_count || 0) > 0);
}

export function totalTokensForTotals(t) {
  return (t.input_tokens || 0) + (t.output_tokens || 0) +
    (t.cache_read_tokens || 0) + (t.cache_write_tokens || 0);
}
