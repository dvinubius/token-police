'use strict';

/*
 * Parse one Codex CLI session log (~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl)
 * into a normalized Session record.
 *
 * Token semantics (OpenAI): token_count events carry cumulative
 * `info.total_token_usage` and a per-LLM-call `info.last_token_usage`. Crucially,
 * `input_tokens` INCLUDES `cached_input_tokens`, so we split them into disjoint
 * buckets:
 *   input        = input_tokens - cached_input_tokens   (fresh input tokens)
 *   cache_read   = cached_input_tokens
 *   output       = output_tokens                         (incl. reasoning)
 *   cache_write  = 0                                      (OpenAI auto-caches)
 *
 * token_count events fire many times per LLM call (rate-limit pings carry
 * info: null); we emit an LLM call only when the cumulative total actually
 * changes, which de-dupes them. We prefer `last_token_usage` for the per-call
 * values and fall back to subtracting the previous cumulative total when it is
 * absent.
 */

const path = require('path');
const {
  assignHumanRequest,
  basenameHint,
  cleanInline,
  cleanXmlishTitle,
  commandHint,
  countByName,
  timestampedJsonlRecords,
  truncateText,
} = require('./parseShared');

const TEXT_PREVIEW_MAX = 220;
const TOOL_HINT_MAX = 140;

const INJECTED_PREFIXES = [
  '# AGENTS.md',
  '<environment_context',
  '<user_instructions',
  '<INSTRUCTIONS',
  '## Environment',
];

function isInjected(text) {
  const t = text.trimStart();
  return INJECTED_PREFIXES.some((p) => t.startsWith(p));
}

function cleanTitle(text) {
  let t = String(text);
  // Codex (VSCode) wraps user input with a "## My request for Codex:" label.
  t = t.replace(/^\s*##\s*My request for Codex:\s*/i, '');
  return cleanXmlishTitle(t);
}

function safeJson(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toolHint(name, rawArgs) {
  if (!name) return '';
  const args = safeJson(rawArgs) || {};
  const file = basenameHint(args.file_path || args.path);
  if (file) return truncateText(`${name}: ${file}`, TOOL_HINT_MAX);
  const command = commandHint(args.command || args.cmd);
  if (command) return truncateText(`${name}: ${command}`, TOOL_HINT_MAX);
  return truncateText(name, TOOL_HINT_MAX);
}

function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      return part.text || part.content || '';
    })
    .filter(Boolean)
    .join(' ');
}

function payloadText(p) {
  if (!p || typeof p !== 'object') return '';
  return textFromContent(p.content) || p.message || p.text || '';
}

function emptyInsight() {
  return {
    toolNames: [],
    assistantText: '',
    outcome: '',
    toolHint: '',
    toolResultChars: 0,
  };
}

function applyInsight(llmCall, insight) {
  if (!llmCall) return;
  llmCall.activity_summary = countByName(insight.toolNames);
  llmCall.assistant_preview = truncateText(insight.assistantText, TEXT_PREVIEW_MAX);
  llmCall.assistant_full_text = cleanInline(insight.assistantText);
  llmCall.outcome = insight.outcome || '';
  llmCall.tool_hint = insight.toolHint || '';
  llmCall.tool_result_chars = insight.toolResultChars || 0;
}

const HUMAN_REQUEST_PREVIEW_MAX = 160;

function emptyParseState() {
  return {
    llmCalls: [],
    // Genuine Human requests in chronological order, emitted independently of
    // LLM calls so a request that triggered zero billed calls (e.g. a turn
    // aborted before any response) is still represented as its own row
    // downstream. Codex signals interrupts with `turn_aborted` events rather
    // than a synthetic user message, so there is no interrupt marker to exclude.
    humanRequests: [],
    title: '',
    cwd: '',
    sessionId: '',
    threadSessionId: '',
    threadSource: '',
    isSubagent: false,
    parentSessionId: '',
    subagentKind: '',
    subagentName: '',
    subagentRole: '',
    subagentDepth: 0,
    startedAt: null,
    lastActiveAt: null,
    curModel: null,
    prev: null, // last cumulative totals: {input, cached, output, total}
    llmCallIndex: 0,
    currentHumanRequest: '', // most recent Human request; tagged onto each LLM call
    currentHumanRequestFull: '',
    currentHumanRequestIndex: -1, // increments for each genuine Human request
    activeInsight: emptyInsight(),
    activeLlmCall: null,
  };
}

function handleSessionMeta(state, p) {
  if (p.cwd) state.cwd = p.cwd;
  if (p.id) state.sessionId = p.id;
  if (p.session_id) state.threadSessionId = p.session_id;
  if (p.thread_source) state.threadSource = p.thread_source;
  if (state.threadSource === 'subagent') state.isSubagent = true;
  if (p.source && typeof p.source === 'object' && p.source.subagent) {
    state.isSubagent = true;
    const subagent = p.source.subagent;
    if (subagent.thread_spawn) {
      const spawn = subagent.thread_spawn;
      state.subagentKind = 'thread_spawn';
      state.parentSessionId = spawn.parent_thread_id || state.parentSessionId;
      state.subagentName = spawn.agent_nickname || '';
      state.subagentRole = spawn.agent_role || '';
      state.subagentDepth = spawn.depth || 0;
    } else if (subagent.other) {
      state.subagentKind = subagent.other;
    }
  }
  if (state.isSubagent && !state.parentSessionId && state.threadSessionId && state.threadSessionId !== state.sessionId) {
    state.parentSessionId = state.threadSessionId;
  }
}

function handleUserMessage(state, p, ts) {
  const msg = typeof p.message === 'string' ? p.message : '';
  if (msg && !isInjected(msg)) {
    const t = cleanTitle(msg);
    if (t) assignHumanRequest(state, t, ts || state.lastActiveAt, HUMAN_REQUEST_PREVIEW_MAX);
  }
  // Turn boundary: drop any leftover activity so a new turn's input can't be
  // swept into the previous turn's last call.
  state.activeInsight = emptyInsight();
}

function handleTokenCount(state, p, ts) {
  const cur = p.info.total_token_usage;
  if (!cur) return;
  const curTotal = cur.total_tokens || 0;

  // De-dupe: only the events where the cumulative total changes are LLM calls.
  if (state.prev && curTotal === state.prev.total) return;

  const last = p.info.last_token_usage;
  let usage;
  if (last && (last.total_tokens || 0) > 0) {
    usage = last; // authoritative per-LLM-call delta
  } else {
    // Fall back to subtracting the previous cumulative total.
    usage = {
      input_tokens: Math.max(0, (cur.input_tokens || 0) - (state.prev ? state.prev.input : 0)),
      cached_input_tokens: Math.max(0, (cur.cached_input_tokens || 0) - (state.prev ? state.prev.cached : 0)),
      output_tokens: Math.max(0, (cur.output_tokens || 0) - (state.prev ? state.prev.output : 0)),
    };
  }

  const cached = usage.cached_input_tokens || 0;
  const freshInput = Math.max(0, (usage.input_tokens || 0) - cached);

  state.llmCalls.push({
    llm_call_index: state.llmCallIndex++,
    human_request_index: state.currentHumanRequestIndex >= 0 ? state.currentHumanRequestIndex : 0,
    human_request_text: state.currentHumanRequest,
    human_request_full_text: state.currentHumanRequestFull || state.currentHumanRequest,
    timestamp: ts || state.lastActiveAt,
    model: state.curModel || 'gpt-5-codex',
    activity_summary: '',
    assistant_preview: '',
    assistant_full_text: '',
    outcome: '',
    tool_hint: '',
    tool_result_chars: 0,
    reasoning_output_tokens: usage.reasoning_output_tokens || 0,
    input_tokens: freshInput,
    output_tokens: usage.output_tokens || 0,
    cache_read_tokens: cached,
    cache_write_tokens: 0,
  });
  state.activeLlmCall = state.llmCalls[state.llmCalls.length - 1];
  // Activity (reasoning/message/function_call/output) for a Codex response is
  // emitted BEFORE the token_count that reports that response's usage, so the
  // insight accumulated since the previous token_count belongs to the call this
  // token_count creates.
  applyInsight(state.activeLlmCall, state.activeInsight);
  state.activeInsight = emptyInsight();

  state.prev = {
    input: cur.input_tokens || 0,
    cached: cur.cached_input_tokens || 0,
    output: cur.output_tokens || 0,
    total: curTotal,
  };
}

// Accumulate response activity (assistant text, tool calls/results, outcomes)
// onto the active insight or the most-recently-created call.
function handleActivity(state, p) {
  if (p.type === 'agent_message' || (p.type === 'message' && p.role !== 'user' && p.role !== 'developer')) {
    // agent_message is clean assistant text; the generic `message` record
    // duplicates it as output_text. Reject user/developer messages so injected
    // input_text echoes don't bleed into the call as assistant text.
    const text = payloadText(p);
    if (text) state.activeInsight.assistantText = state.activeInsight.assistantText || text;
  } else if (p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'web_search_call') {
    if (p.name) state.activeInsight.toolNames.push(p.name);
    if (!state.activeInsight.toolHint) state.activeInsight.toolHint = toolHint(p.name, p.arguments || p.input);
    if (p.status) state.activeInsight.outcome = p.status;
  } else if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output') {
    state.activeInsight.toolResultChars += JSON.stringify(p.output || '').length;
    if (p.status) state.activeInsight.outcome = p.status;
  } else if (p.type === 'task_complete') {
    // Outcome events arrive AFTER the response's token_count, so they apply to
    // the most-recently-created call directly (not the next call's insight).
    if (state.activeLlmCall) state.activeLlmCall.outcome = 'task_complete';
  } else if (p.type === 'turn_aborted') {
    if (state.activeLlmCall) state.activeLlmCall.outcome = 'turn_aborted';
  } else if (p.type === 'context_compacted') {
    if (state.activeLlmCall) state.activeLlmCall.outcome = 'context_compacted';
  }
}

function parseCodexFile(filePath) {
  const state = emptyParseState();

  for (const item of timestampedJsonlRecords(filePath)) {
    const d = item.record;
    const ts = item.timestamp;
    state.startedAt = item.startedAt;
    state.lastActiveAt = item.lastActiveAt;

    if (d.type === 'session_meta') {
      handleSessionMeta(state, d.payload || {});
      continue;
    }
    if (d.type === 'turn_context') {
      const m = d.payload && d.payload.model;
      if (m) state.curModel = m;
      continue;
    }

    const p = d.payload;
    if (!p || typeof p !== 'object') continue;

    if (p.type === 'user_message') {
      handleUserMessage(state, p, ts);
      continue;
    }
    if (p.type === 'task_started') {
      // Turn boundary (see handleUserMessage): reset accumulated activity.
      state.activeInsight = emptyInsight();
      continue;
    }
    if (p.type === 'token_count' && p.info) {
      handleTokenCount(state, p, ts);
      continue;
    }

    handleActivity(state, p);
  }

  const project = state.cwd ? path.basename(state.cwd) : 'codex';

  return {
    id: state.sessionId || path.basename(filePath, '.jsonl'),
    source: 'codex',
    project,
    title: state.title || '(no human request)',
    cwd: state.cwd,
    sessionId: state.sessionId,
    thread_session_id: state.threadSessionId,
    thread_source: state.threadSource || (state.isSubagent ? 'subagent' : 'user'),
    is_subagent: state.isSubagent,
    parent_session_id: state.parentSessionId,
    subagent_kind: state.subagentKind,
    subagent_name: state.subagentName,
    subagent_role: state.subagentRole,
    subagent_depth: state.subagentDepth,
    filePath,
    started_at: state.startedAt,
    last_active_at: state.lastActiveAt,
    human_requests: state.humanRequests,
    llm_calls: state.llmCalls,
  };
}

module.exports = { parseCodexFile };
