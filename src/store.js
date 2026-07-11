'use strict';

/*
 * In-memory store of all parsed Sessions. Each Session is keyed by id;
 * re-parsing a file replaces its record wholesale (simple and robust for a
 * local tool — transcripts are not large enough to need incremental tailing).
 */

const path = require('path');
const { parseClaudeFile } = require('./parseClaude');
const { parseCodexFile } = require('./parseCodex');

const TITLE_MAX = 60;
const SUMMARY_DAY_COUNT = 30;

function truncate(str, n) {
  if (!str) return str;
  return str.length > n ? str.slice(0, n - 1).trimEnd() + '…' : str;
}

// Local-time YYYY-MM-DD bucket for a timestamp.
function dayKey(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function costDriver(llmCall) {
  const drivers = [];
  const context = llmCall.context_input_tokens || 0;
  const window = llmCall.model_context_window_tokens || 0;
  const contextPct = llmCall.context_window_used_pct || 0;
  const cacheHitPct = llmCall.cache_hit_pct || 0;
  const output = llmCall.output_tokens || 0;
  const reasoning = llmCall.reasoning_output_tokens || 0;
  const cacheWrite = llmCall.cache_write_tokens || 0;
  const toolResultChars = llmCall.tool_result_chars || 0;

  if (window > 0 && contextPct >= 0.5) drivers.push('large context window use');
  else if (context >= 100000) drivers.push('large context');

  if (context >= 10000 && cacheHitPct < 0.25) drivers.push('low cache hit');
  if (output >= 8000) drivers.push('high output');
  if (reasoning >= 2000 || (reasoning > 0 && output > 0 && reasoning / output >= 0.5)) drivers.push('reasoning-heavy output');
  if (cacheWrite >= 20000) drivers.push('cache write spike');
  if (toolResultChars >= 20000) drivers.push('large tool result nearby');

  return drivers.slice(0, 3).join(', ');
}

function sessionTotals(session) {
  return {
    total_input_tokens: session.total_input_tokens || 0,
    total_output_tokens: session.total_output_tokens || 0,
    total_cache_read_tokens: session.total_cache_read_tokens || 0,
    total_cache_write_tokens: session.total_cache_write_tokens || 0,
    total_estimated_cost_usd: session.total_estimated_cost_usd || 0,
    llm_call_count: session.llm_call_count || 0,
  };
}

function addSessionTotals(totals, session) {
  totals.total_input_tokens += session.total_input_tokens || 0;
  totals.total_output_tokens += session.total_output_tokens || 0;
  totals.total_cache_read_tokens += session.total_cache_read_tokens || 0;
  totals.total_cache_write_tokens += session.total_cache_write_tokens || 0;
  totals.total_estimated_cost_usd += session.total_estimated_cost_usd || 0;
  totals.llm_call_count += session.llm_call_count || 0;
}

function timestampMax(a, b) {
  if (!a) return b || '';
  if (!b) return a || '';
  return String(a).localeCompare(String(b)) >= 0 ? a : b;
}

function sessionModels(session) {
  return [...new Set(session.llm_calls.map((llmCall) => llmCall.model).filter(Boolean))];
}

class Store {
  constructor(pricing) {
    this.pricing = pricing;
    this.sessions = new Map(); // id -> enriched Session
    this.fileToId = new Map(); // filePath -> id
  }

  /** Parse (or re-parse) a file and upsert the resulting Session. */
  upsertFromFile(source, filePath) {
    let session;
    try {
      session = source === 'codex' ? parseCodexFile(filePath) : parseClaudeFile(filePath);
    } catch (err) {
      console.warn(`[store] Failed to parse ${filePath}: ${err.message}`);
      return;
    }
    if (!session) return;

    // Drop empty Sessions (no billable LLM calls) to keep the list meaningful.
    if (!session.llm_calls.length) {
      this.removeFile(filePath);
      return;
    }

    this._enrich(session);

    // If this file previously mapped to a different id, clean that up.
    const prevId = this.fileToId.get(filePath);
    if (prevId && prevId !== session.id) this.sessions.delete(prevId);

    this.fileToId.set(filePath, session.id);
    this.sessions.set(session.id, session);
  }

  removeFile(filePath) {
    const id = this.fileToId.get(filePath);
    if (id) {
      this.sessions.delete(id);
      this.fileToId.delete(filePath);
    }
  }

  /** Compute per-LLM-call estimated cost and Session-level totals. */
  _enrich(session) {
    let tin = 0;
    let tout = 0;
    let tread = 0;
    let twrite = 0;
    let totalEstimatedCost = 0;
    const requests = new Set();
    for (const llmCall of session.llm_calls) {
      llmCall.estimated_cost_usd = this.pricing.estimatedCost(llmCall.model, llmCall);
      llmCall.context_input_tokens =
        (llmCall.input_tokens || 0) + (llmCall.cache_read_tokens || 0) + (llmCall.cache_write_tokens || 0);
      llmCall.model_context_window_tokens = this.pricing.contextWindow(llmCall.model);
      llmCall.context_window_used_pct =
        llmCall.model_context_window_tokens > 0 ? llmCall.context_input_tokens / llmCall.model_context_window_tokens : 0;
      llmCall.cache_hit_pct =
        llmCall.context_input_tokens > 0 ? (llmCall.cache_read_tokens || 0) / llmCall.context_input_tokens : 0;
      llmCall.fresh_pct = llmCall.context_input_tokens > 0 ? (llmCall.input_tokens || 0) / llmCall.context_input_tokens : 0;
      llmCall.cache_write_pct =
        llmCall.context_input_tokens > 0 ? (llmCall.cache_write_tokens || 0) / llmCall.context_input_tokens : 0;
      llmCall.cost_driver = costDriver(llmCall);
      tin += llmCall.input_tokens;
      tout += llmCall.output_tokens;
      tread += llmCall.cache_read_tokens;
      twrite += llmCall.cache_write_tokens;
      totalEstimatedCost += llmCall.estimated_cost_usd;
      requests.add(
        llmCall.human_request_index == null
          ? llmCall.human_request_text || llmCall.llm_call_index
          : llmCall.human_request_index
      );
    }
    session.total_input_tokens = tin;
    session.total_output_tokens = tout;
    session.total_cache_read_tokens = tread;
    session.total_cache_write_tokens = twrite;
    session.total_estimated_cost_usd = totalEstimatedCost;
    session.llm_call_count = session.llm_calls.length;
    // Prefer the parser-emitted Human request list when present, so requests
    // that triggered zero billed LLM calls are still counted. Fall back to the
    // set of request keys derived from LLM calls (e.g. Codex Sessions).
    session.human_request_count = Array.isArray(session.human_requests)
      ? session.human_requests.length
      : requests.size;
  }

  _childMap() {
    const children = new Map();
    for (const session of this.sessions.values()) {
      if (!session.is_subagent || !session.parent_session_id) continue;
      if (!this.sessions.has(session.parent_session_id)) continue;
      if (!children.has(session.parent_session_id)) children.set(session.parent_session_id, []);
      children.get(session.parent_session_id).push(session);
    }
    for (const items of children.values()) {
      items.sort((a, b) => String(b.last_active_at).localeCompare(String(a.last_active_at)));
    }
    return children;
  }

  _descendants(session, childMap, seen = new Set()) {
    if (!session || seen.has(session.id)) return [];
    seen.add(session.id);
    const direct = childMap.get(session.id) || [];
    const out = [];
    for (const child of direct) {
      out.push(child);
      out.push(...this._descendants(child, childMap, seen));
    }
    return out;
  }

  _inclusiveTotals(session, descendants) {
    const totals = sessionTotals(session);
    for (const child of descendants) addSessionTotals(totals, child);
    return totals;
  }

  _inclusiveLastActive(session, descendants) {
    return descendants.reduce((latest, child) => timestampMax(latest, child.last_active_at), session.last_active_at);
  }

  _subagentLabel(session) {
    if (!session.is_subagent) return '';
    const role = session.subagent_role || session.subagent_kind || 'subagent';
    return session.subagent_name ? `${session.subagent_name} · ${role}` : role;
  }

  _listItem(session, descendants = []) {
    const inclusive = this._inclusiveTotals(session, descendants);
    return {
      id: session.id,
      source: session.source,
      project: session.project,
      title: truncate(session.title, TITLE_MAX),
      started_at: session.started_at,
      last_active_at: session.last_active_at,
      total_input_tokens: session.total_input_tokens,
      total_output_tokens: session.total_output_tokens,
      total_cache_read_tokens: session.total_cache_read_tokens,
      total_cache_write_tokens: session.total_cache_write_tokens,
      total_estimated_cost_usd: session.total_estimated_cost_usd,
      llm_call_count: session.llm_call_count,
      human_request_count: session.human_request_count,
      models: sessionModels(session),
      thread_source: session.thread_source || (session.is_subagent ? 'subagent' : 'user'),
      is_subagent: !!session.is_subagent,
      parent_session_id: session.parent_session_id || '',
      subagent_kind: session.subagent_kind || '',
      subagent_name: session.subagent_name || '',
      subagent_role: session.subagent_role || '',
      subagent_depth: session.subagent_depth || 0,
      subagent_label: this._subagentLabel(session),
      subagent_session_count: descendants.length,
      inclusive_total_input_tokens: inclusive.total_input_tokens,
      inclusive_total_output_tokens: inclusive.total_output_tokens,
      inclusive_total_cache_read_tokens: inclusive.total_cache_read_tokens,
      inclusive_total_cache_write_tokens: inclusive.total_cache_write_tokens,
      inclusive_total_estimated_cost_usd: inclusive.total_estimated_cost_usd,
      inclusive_llm_call_count: inclusive.llm_call_count,
      inclusive_last_active_at: this._inclusiveLastActive(session, descendants),
    };
  }

  /** All Sessions, sorted by last activity descending. */
  listSessions() {
    const childMap = this._childMap();
    const placed = new Set();
    const rows = [];

    const appendWithChildren = (session) => {
      if (!session || placed.has(session.id)) return;
      const descendants = this._descendants(session, childMap);
      rows.push(this._listItem(session, descendants));
      placed.add(session.id);
      for (const child of childMap.get(session.id) || []) appendWithChildren(child);
    };

    const roots = [...this.sessions.values()].filter(
      (session) => !session.is_subagent || !session.parent_session_id || !this.sessions.has(session.parent_session_id)
    );
    roots.sort((a, b) => {
      const aLatest = this._inclusiveLastActive(a, this._descendants(a, childMap));
      const bLatest = this._inclusiveLastActive(b, this._descendants(b, childMap));
      return String(bLatest).localeCompare(String(aLatest));
    });

    for (const session of roots) appendWithChildren(session);
    return rows;
  }

  getLlmCalls(id) {
    const session = this.sessions.get(id);
    if (!session) return null;
    return session.llm_calls.map((llmCall) => ({
      llm_call_index: llmCall.llm_call_index,
      human_request_index: llmCall.human_request_index,
      human_request_text: llmCall.human_request_text || '',
      human_request_full_text: llmCall.human_request_full_text || llmCall.human_request_text || '',
      timestamp: llmCall.timestamp,
      model: llmCall.model,
      activity_summary: llmCall.activity_summary || '',
      assistant_preview: llmCall.assistant_preview || '',
      assistant_full_text: llmCall.assistant_full_text || llmCall.assistant_preview || '',
      outcome: llmCall.outcome || '',
      tool_hint: llmCall.tool_hint || '',
      cost_driver: llmCall.cost_driver || '',
      reasoning_output_tokens: llmCall.reasoning_output_tokens || 0,
      input_tokens: llmCall.input_tokens,
      output_tokens: llmCall.output_tokens,
      cache_read_tokens: llmCall.cache_read_tokens,
      cache_write_tokens: llmCall.cache_write_tokens,
      context_input_tokens: llmCall.context_input_tokens,
      model_context_window_tokens: llmCall.model_context_window_tokens,
      context_window_used_pct: llmCall.context_window_used_pct,
      cache_hit_pct: llmCall.cache_hit_pct,
      fresh_pct: llmCall.fresh_pct,
      cache_write_pct: llmCall.cache_write_pct,
      estimated_cost_usd: llmCall.estimated_cost_usd,
    }));
  }

  getSessionMeta(id) {
    const session = this.sessions.get(id);
    if (!session) return null;
    const childMap = this._childMap();
    const descendants = this._descendants(session, childMap);
    return {
      ...this._listItem(session, descendants),
      session_title: session.title || '',
      human_requests: Array.isArray(session.human_requests) ? session.human_requests : null,
      subagent_sessions: descendants.map((child) => this._listItem(child, this._descendants(child, childMap))),
    };
  }

  /** Aggregate totals, per-source totals, 30-day daily breakdown, top 5. */
  summary() {
    const totals = emptyTotals();
    const bySource = {
      'claude-code': { ...emptyTotals(), session_count: 0 },
      codex: { ...emptyTotals(), session_count: 0 },
    };
    const { days, dayIndex } = buildDailyBuckets();

    for (const session of this.sessions.values()) {
      const src = session.source;
      if (bySource[src]) bySource[src].session_count += 1;

      for (const llmCall of session.llm_calls) {
        addLlmCallTotals(totals, llmCall);
        if (bySource[src]) addLlmCallTotals(bySource[src], llmCall);
        addDailyLlmCall(dayIndex, src, llmCall);
      }
    }

    const top = [...this.sessions.values()]
      .sort((a, b) => b.total_estimated_cost_usd - a.total_estimated_cost_usd)
      .slice(0, 5)
      .map(topSessionItem);

    return {
      totals: { ...totals, session_count: this.sessions.size },
      by_source: bySource,
      daily: days,
      top_sessions: top,
    };
  }
}

function emptyTotals() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    estimated_cost_usd: 0,
    llm_call_count: 0,
  };
}

function llmCallTokenTotal(llmCall) {
  return (
    llmCall.input_tokens +
    llmCall.output_tokens +
    llmCall.cache_read_tokens +
    llmCall.cache_write_tokens
  );
}

function addLlmCallTotals(totals, llmCall) {
  totals.input_tokens += llmCall.input_tokens;
  totals.output_tokens += llmCall.output_tokens;
  totals.cache_read_tokens += llmCall.cache_read_tokens;
  totals.cache_write_tokens += llmCall.cache_write_tokens;
  totals.estimated_cost_usd += llmCall.estimated_cost_usd;
  totals.llm_call_count += 1;
}

function buildDailyBuckets(dayCount = SUMMARY_DAY_COUNT) {
  const days = [];
  const dayIndex = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    const bucket = {
      date: key,
      'claude-code': { tokens: 0, estimated_cost_usd: 0 },
      codex: { tokens: 0, estimated_cost_usd: 0 },
    };
    days.push(bucket);
    dayIndex.set(key, bucket);
  }

  return { days, dayIndex };
}

function addDailyLlmCall(dayIndex, source, llmCall) {
  const key = dayKey(llmCall.timestamp);
  const bucket = key && dayIndex.get(key);
  if (!bucket || !bucket[source]) return;
  bucket[source].tokens += llmCallTokenTotal(llmCall);
  bucket[source].estimated_cost_usd += llmCall.estimated_cost_usd;
}

function topSessionItem(session) {
  return {
    id: session.id,
    source: session.source,
    project: session.project,
    title: truncate(session.title, TITLE_MAX),
    total_estimated_cost_usd: session.total_estimated_cost_usd,
    total_tokens:
      session.total_input_tokens +
      session.total_output_tokens +
      session.total_cache_read_tokens +
      session.total_cache_write_tokens,
  };
}

module.exports = { Store };
