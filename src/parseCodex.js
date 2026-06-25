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

const fs = require('fs');
const path = require('path');

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
  return t
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanInline(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function truncateText(text, n) {
  const t = cleanInline(text);
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}

function countByName(names) {
  const counts = new Map();
  for (const name of names) {
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => (count > 1 ? `${name} x${count}` : name))
    .join(', ');
}

function safeJson(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function basenameHint(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return path.basename(trimmed);
}

function commandHint(command) {
  if (!command || typeof command !== 'string') return '';
  const parts = command.trim().split(/\s+/).filter(Boolean);
  const firstExecutable = parts.find((p) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(p));
  return firstExecutable ? path.basename(firstExecutable) : '';
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

// Cap a Human request to a short preview so storing it per LLM call stays cheap.
const HUMAN_REQUEST_PREVIEW_MAX = 160;
function previewText(text) {
  const t = String(text);
  return t.length > HUMAN_REQUEST_PREVIEW_MAX ? t.slice(0, HUMAN_REQUEST_PREVIEW_MAX) : t;
}

function parseCodexFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');

  const llmCalls = [];
  // Genuine Human requests in chronological order, emitted independently of LLM
  // calls so a request that triggered zero billed calls (e.g. a turn aborted
  // before any response) is still represented as its own row downstream. Codex
  // signals interrupts with `turn_aborted` events rather than a synthetic user
  // message, so there is no interrupt marker to exclude here.
  const humanRequests = [];
  let title = '';
  let cwd = '';
  let sessionId = '';
  let startedAt = null;
  let lastActiveAt = null;
  let curModel = null;
  let prev = null; // last cumulative totals: {input, cached, output, total}
  let llmCallIndex = 0;
  let currentHumanRequest = ''; // most recent Human request; tagged onto each LLM call
  let currentHumanRequestFull = '';
  let currentHumanRequestIndex = -1; // increments for each genuine Human request
  let activeInsight = emptyInsight();
  let activeLlmCall = null;

  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;
    let d;
    try {
      d = JSON.parse(s);
    } catch {
      continue; // skip malformed lines
    }

    const ts = d.timestamp;
    if (ts) {
      if (!startedAt || ts < startedAt) startedAt = ts;
      if (!lastActiveAt || ts > lastActiveAt) lastActiveAt = ts;
    }

    if (d.type === 'session_meta') {
      const p = d.payload || {};
      if (p.cwd) cwd = p.cwd;
      if (p.id) sessionId = p.id;
      continue;
    }

    if (d.type === 'turn_context') {
      const m = d.payload && d.payload.model;
      if (m) curModel = m;
      continue;
    }

    const p = d.payload;
    if (!p || typeof p !== 'object') continue;

    if (p.type === 'user_message') {
      const msg = typeof p.message === 'string' ? p.message : '';
      if (msg && !isInjected(msg)) {
        const t = cleanTitle(msg);
        if (t) {
          currentHumanRequest = previewText(t);
          currentHumanRequestFull = t;
          currentHumanRequestIndex += 1;
          if (!title) title = t;
          humanRequests.push({
            human_request_index: currentHumanRequestIndex,
            human_request_text: currentHumanRequest,
            human_request_full_text: currentHumanRequestFull,
            timestamp: ts || lastActiveAt,
          });
        }
      }
      // Turn boundary: drop any leftover activity so a new turn's input can't
      // be swept into the previous turn's last call.
      activeInsight = emptyInsight();
      continue;
    }

    if (p.type === 'task_started') {
      // Turn boundary (see user_message): reset accumulated activity.
      activeInsight = emptyInsight();
      continue;
    }

    if (p.type === 'token_count' && p.info) {
      const cur = p.info.total_token_usage;
      if (!cur) continue;
      const curTotal = cur.total_tokens || 0;

      // De-dupe: only the events where the cumulative total changes are LLM calls.
      if (prev && curTotal === prev.total) continue;

      const last = p.info.last_token_usage;
      let usage;
      if (last && (last.total_tokens || 0) > 0) {
        usage = last; // authoritative per-LLM-call delta
      } else {
        // Fall back to subtracting the previous cumulative total.
        usage = {
          input_tokens: Math.max(0, (cur.input_tokens || 0) - (prev ? prev.input : 0)),
          cached_input_tokens: Math.max(0, (cur.cached_input_tokens || 0) - (prev ? prev.cached : 0)),
          output_tokens: Math.max(0, (cur.output_tokens || 0) - (prev ? prev.output : 0)),
        };
      }

      const cached = usage.cached_input_tokens || 0;
      const freshInput = Math.max(0, (usage.input_tokens || 0) - cached);

      llmCalls.push({
        llm_call_index: llmCallIndex++,
        human_request_index: currentHumanRequestIndex >= 0 ? currentHumanRequestIndex : 0,
        human_request_text: currentHumanRequest,
        human_request_full_text: currentHumanRequestFull || currentHumanRequest,
        timestamp: ts || lastActiveAt,
        model: curModel || 'gpt-5-codex',
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
      activeLlmCall = llmCalls[llmCalls.length - 1];
      // Activity (reasoning/message/function_call/output) for a Codex response
      // is emitted BEFORE the token_count that reports that response's usage,
      // so the insight accumulated since the previous token_count belongs to
      // the call this token_count creates.
      applyInsight(activeLlmCall, activeInsight);
      activeInsight = emptyInsight();

      prev = {
        input: cur.input_tokens || 0,
        cached: cur.cached_input_tokens || 0,
        output: cur.output_tokens || 0,
        total: curTotal,
      };
      continue;
    }

    if (p.type === 'agent_message' || (p.type === 'message' && p.role !== 'user' && p.role !== 'developer')) {
      // agent_message is clean assistant text; the generic `message` record
      // duplicates it as output_text. Reject user/developer messages so injected
      // input_text echoes don't bleed into the call as assistant text.
      const text = payloadText(p);
      if (text) activeInsight.assistantText = activeInsight.assistantText || text;
    } else if (p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'web_search_call') {
      if (p.name) activeInsight.toolNames.push(p.name);
      if (!activeInsight.toolHint) activeInsight.toolHint = toolHint(p.name, p.arguments || p.input);
      if (p.status) activeInsight.outcome = p.status;
    } else if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output') {
      activeInsight.toolResultChars += JSON.stringify(p.output || '').length;
      if (p.status) activeInsight.outcome = p.status;
    } else if (p.type === 'task_complete') {
      // Outcome events arrive AFTER the response's token_count, so they apply
      // to the most-recently-created call directly (not the next call's insight).
      if (activeLlmCall) activeLlmCall.outcome = 'task_complete';
    } else if (p.type === 'turn_aborted') {
      if (activeLlmCall) activeLlmCall.outcome = 'turn_aborted';
    } else if (p.type === 'context_compacted') {
      if (activeLlmCall) activeLlmCall.outcome = 'context_compacted';
    }
  }

  const project = cwd ? path.basename(cwd) : 'codex';

  return {
    id: sessionId || path.basename(filePath, '.jsonl'),
    source: 'codex',
    project,
    title: title || '(no human request)',
    cwd,
    sessionId,
    filePath,
    started_at: startedAt,
    last_active_at: lastActiveAt,
    human_requests: humanRequests,
    llm_calls: llmCalls,
  };
}

module.exports = { parseCodexFile };
