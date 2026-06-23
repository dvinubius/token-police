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
  let title = '';
  let cwd = '';
  let sessionId = '';
  let startedAt = null;
  let lastActiveAt = null;
  let curModel = null;
  let prev = null; // last cumulative totals: {input, cached, output, total}
  let llmCallIndex = 0;
  let currentHumanRequest = ''; // most recent Human request; tagged onto each LLM call
  let currentHumanRequestIndex = -1; // increments for each genuine Human request

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
          currentHumanRequestIndex += 1;
          if (!title) title = t;
        }
      }
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
        timestamp: ts || lastActiveAt,
        model: curModel || 'gpt-5-codex',
        input_tokens: freshInput,
        output_tokens: usage.output_tokens || 0,
        cache_read_tokens: cached,
        cache_write_tokens: 0,
      });

      prev = {
        input: cur.input_tokens || 0,
        cached: cur.cached_input_tokens || 0,
        output: cur.output_tokens || 0,
        total: curTotal,
      };
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
    llm_calls: llmCalls,
  };
}

module.exports = { parseCodexFile };
