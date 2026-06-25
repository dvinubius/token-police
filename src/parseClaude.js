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

const TEXT_PREVIEW_MAX = 220;
const TOOL_HINT_MAX = 140;

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

function toolHint(tool) {
  if (!tool || !tool.name) return '';
  const input = tool.input && typeof tool.input === 'object' ? tool.input : {};
  const file = basenameHint(input.file_path || input.path);
  if (file) return truncateText(`${tool.name}: ${file}`, TOOL_HINT_MAX);
  const command = commandHint(input.command || input.cmd);
  if (command) return truncateText(`${tool.name}: ${command}`, TOOL_HINT_MAX);
  return truncateText(tool.name, TOOL_HINT_MAX);
}

function extractAssistantText(content) {
  if (!Array.isArray(content)) return '';
  const text = content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join(' ');
  return cleanInline(text);
}

function extractAssistantPreview(content) {
  const text = extractAssistantText(content);
  return truncateText(text, TEXT_PREVIEW_MAX);
}

function extractToolUses(content) {
  if (!Array.isArray(content)) return [];
  return content.filter((b) => b && b.type === 'tool_use' && b.name);
}

// Recompute the content-derived fields of an LLM-call record from the full set
// of content blocks accumulated for its message id (see callsById/contentById).
function deriveContentFields(record, content) {
  const toolUses = extractToolUses(content);
  record.activity_summary = countByName(toolUses.map((tool) => tool.name));
  record.tool_hint = toolUses.map(toolHint).find(Boolean) || '';
  record.assistant_preview = extractAssistantPreview(content);
  record.assistant_full_text = extractAssistantText(content);
}

function toolResultChars(content) {
  if (!Array.isArray(content)) return 0;
  return content
    .filter((b) => b && b.type === 'tool_result')
    .reduce((sum, b) => sum + JSON.stringify(b.content || '').length, 0);
}

// Cap a Human request to a short preview so storing it per LLM call stays cheap.
const HUMAN_REQUEST_PREVIEW_MAX = 160;
function previewText(text) {
  const t = String(text);
  return t.length > HUMAN_REQUEST_PREVIEW_MAX ? t.slice(0, HUMAN_REQUEST_PREVIEW_MAX) : t;
}

// Claude Code writes this synthetic user line when the developer interrupts the
// agent. It is a system marker, not a Human request, so it must not start a new
// request or relabel the current one.
function isInterruptMarker(trimmed) {
  return trimmed.startsWith('[Request interrupted by user');
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
  if (isInterruptMarker(trimmed)) return ''; // interrupt marker, not a request
  return cleanTitle(raw);
}

function parseClaudeFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');

  const llmCalls = [];
  // Genuine Human requests in chronological order, emitted independently of LLM
  // calls so a request that triggered zero billed calls (e.g. an interrupted
  // initial prompt) is still represented as its own row downstream.
  const humanRequests = [];
  // One assistant API response = one message.id, but Claude Code streams it as
  // several JSONL lines (often one content block per line: thinking, text, then
  // each tool_use), all repeating the same id and the same full usage. We bill
  // the usage once (first line) but must merge the content blocks across every
  // line for that id, or later tool_use blocks are lost. These maps track the
  // per-id record and its accumulated content so derived fields stay correct.
  const callsById = new Map(); // message id -> the pushed LLM-call record
  const contentById = new Map(); // message id -> accumulated content blocks
  let title = '';
  let cwd = '';
  let sessionId = '';
  let startedAt = null;
  let lastActiveAt = null;
  let llmCallIndex = 0;
  let currentHumanRequest = ''; // most recent Human request; tagged onto each LLM call
  let currentHumanRequestFull = '';
  let currentHumanRequestIndex = -1; // increments for each genuine Human request
  let pendingToolResultChars = 0;

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
      const content = d.message && d.message.content;
      if (isToolResult(content)) pendingToolResultChars += toolResultChars(content);

      const t = genuineUserTitle(d);
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

    if (d.type === 'assistant') {
      const msg = d.message || {};
      const content = Array.isArray(msg.content) ? msg.content : [];
      const llmCallKey = msg.id || d.uuid;

      // Subsequent streamed line for an assistant message we have already
      // recorded: merge this line's content blocks into the accumulated set and
      // refresh the derived fields. The usage is identical on every line, so we
      // do NOT touch the token buckets (it was billed once on the first line).
      if (llmCallKey && callsById.has(llmCallKey)) {
        const accumulated = contentById.get(llmCallKey);
        accumulated.push(...content);
        const record = callsById.get(llmCallKey);
        deriveContentFields(record, accumulated);
        if (msg.stop_reason) record.outcome = msg.stop_reason;
        continue;
      }

      const usage = msg.usage;
      if (!usage) continue;

      const accumulated = [...content];
      const record = {
        llm_call_index: llmCallIndex++,
        human_request_index: currentHumanRequestIndex >= 0 ? currentHumanRequestIndex : 0,
        human_request_text: currentHumanRequest,
        human_request_full_text: currentHumanRequestFull || currentHumanRequest,
        timestamp: ts || lastActiveAt,
        model: msg.model || 'unknown',
        outcome: msg.stop_reason || '',
        tool_result_chars: pendingToolResultChars,
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0,
        cache_read_tokens: usage.cache_read_input_tokens || 0,
        cache_write_tokens: usage.cache_creation_input_tokens || 0,
      };
      deriveContentFields(record, accumulated);

      if (llmCallKey) {
        callsById.set(llmCallKey, record);
        contentById.set(llmCallKey, accumulated);
      }
      llmCalls.push(record);
      pendingToolResultChars = 0;
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
    human_requests: humanRequests,
    llm_calls: llmCalls,
  };
}

module.exports = { parseClaudeFile };
