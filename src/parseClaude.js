'use strict';

/*
 * Parse one Claude Code transcript (~/.claude/projects/<encoded>/<uuid>.jsonl)
 * into a normalized Session record.
 *
 * Token semantics (Anthropic): message.usage.input_tokens already excludes
 * cached tokens, so the four buckets are disjoint:
 *   input        = usage.input_tokens
 *   output       = usage.output_tokens
 *   cache_read   = usage.cache_read_input_tokens
 *   cache_write  = usage.cache_creation_input_tokens
 */

const fs = require('fs');
const path = require('path');

function extractUserText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n');
  }
  return '';
}

function isToolResult(content) {
  return (
    Array.isArray(content) &&
    content.length > 0 &&
    content.every((b) => b && b.type === 'tool_result')
  );
}

function cleanTitle(text) {
  return String(text)
    .replace(/<[^>]+>/g, ' ') // drop xml-ish wrappers (command tags, reminders)
    .replace(/\s+/g, ' ')
    .trim();
}

// Cap a Human request to a short preview so storing it per LLM call stays cheap.
const HUMAN_REQUEST_PREVIEW_MAX = 160;
function previewText(text) {
  const t = String(text);
  return t.length > HUMAN_REQUEST_PREVIEW_MAX ? t.slice(0, HUMAN_REQUEST_PREVIEW_MAX) : t;
}

// Decide whether a user line is a genuine Human request worth using as a title.
function genuineUserTitle(d) {
  if (d.isMeta) return '';
  const content = d.message && d.message.content;
  if (isToolResult(content)) return '';
  const raw = extractUserText(content);
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('Caveat:')) return ''; // local-command preamble
  if (trimmed.includes('<command-name>')) return ''; // slash-command invocation
  if (trimmed.startsWith('<')) return '';
  return cleanTitle(raw);
}

function parseClaudeFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');

  const llmCalls = [];
  const seen = new Set();
  let title = '';
  let cwd = '';
  let sessionId = '';
  let startedAt = null;
  let lastActiveAt = null;
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
    if (d.cwd && !cwd) cwd = d.cwd;
    if (d.sessionId && !sessionId) sessionId = d.sessionId;

    if (d.type === 'user') {
      const t = genuineUserTitle(d);
      if (t) {
        currentHumanRequest = previewText(t);
        currentHumanRequestIndex += 1;
        if (!title) title = t;
      }
    }

    if (d.type === 'assistant') {
      const msg = d.message || {};
      const usage = msg.usage;
      if (!usage) continue;

      // Claude Code writes one JSONL line per streaming chunk / content block,
      // and every line for the same assistant message repeats the SAME message
      // id and the SAME full usage. The usage is charged once per API response,
      // so we de-dupe by message id (one message.id = one billable LLM call) and
      // only count the first line we see for it.
      const llmCallKey = msg.id || d.uuid;
      if (llmCallKey) {
        if (seen.has(llmCallKey)) continue;
        seen.add(llmCallKey);
      }

      llmCalls.push({
        llm_call_index: llmCallIndex++,
        human_request_index: currentHumanRequestIndex >= 0 ? currentHumanRequestIndex : 0,
        human_request_text: currentHumanRequest,
        timestamp: ts || lastActiveAt,
        model: msg.model || 'unknown',
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0,
        cache_read_tokens: usage.cache_read_input_tokens || 0,
        cache_write_tokens: usage.cache_creation_input_tokens || 0,
      });
    }
  }

  const encodedDir = path.basename(path.dirname(filePath));
  const project = cwd ? path.basename(cwd) : encodedDir;

  return {
    id: path.basename(filePath, '.jsonl'),
    source: 'claude-code',
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

module.exports = { parseClaudeFile };
