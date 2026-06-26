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
  return cleanXmlishTitle(text); // drop xml-ish wrappers (command tags, reminders)
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

const HUMAN_REQUEST_PREVIEW_MAX = 160;

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

function emptyParseState() {
  return {
    llmCalls: [],
    // Genuine Human requests in chronological order, emitted independently of
    // LLM calls so a request that triggered zero billed calls (e.g. an
    // interrupted initial prompt) is still represented as its own row downstream.
    humanRequests: [],
    // One assistant API response = one message.id, but Claude Code streams it as
    // several JSONL lines (often one content block per line: thinking, text,
    // then each tool_use), all repeating the same id and the same full usage. We
    // bill the usage once (first line) but must merge the content blocks across
    // every line for that id, or later tool_use blocks are lost. These maps
    // track the per-id record and its accumulated content so derived fields stay
    // correct.
    callsById: new Map(), // message id -> the pushed LLM-call record
    contentById: new Map(), // message id -> accumulated content blocks
    title: '',
    cwd: '',
    sessionId: '',
    isSubagent: false,
    parentSessionId: '',
    subagentKind: '',
    subagentName: '',
    subagentRole: '',
    subagentDepth: 0,
    startedAt: null,
    lastActiveAt: null,
    llmCallIndex: 0,
    currentHumanRequest: '', // most recent Human request; tagged onto each LLM call
    currentHumanRequestFull: '',
    currentHumanRequestIndex: -1, // increments for each genuine Human request
    pendingToolResultChars: 0,
  };
}

// Carry forward session-level facts (cwd, ids, subagent attribution) that any
// record line may be the first to reveal.
function applyRecordMeta(state, d) {
  if (d.cwd && !state.cwd) state.cwd = d.cwd;
  if (d.sessionId && !state.sessionId) state.sessionId = d.sessionId;
  if (d.isSidechain) {
    state.isSubagent = true;
    state.subagentKind = state.subagentKind || 'sidechain';
    state.parentSessionId = state.parentSessionId || d.sessionId || '';
    state.subagentName = state.subagentName || d.attributionAgent || d.agentId || '';
  }
  if (state.isSubagent && d.attributionAgent && (!state.subagentName || state.subagentName === d.agentId)) {
    state.subagentName = d.attributionAgent;
  }
}

function handleUserRecord(state, d, ts) {
  const content = d.message && d.message.content;
  if (isToolResult(content)) state.pendingToolResultChars += toolResultChars(content);

  const t = genuineUserTitle(d);
  if (t) assignHumanRequest(state, t, ts || state.lastActiveAt, HUMAN_REQUEST_PREVIEW_MAX);
}

function handleAssistantRecord(state, d, ts) {
  const msg = d.message || {};
  const content = Array.isArray(msg.content) ? msg.content : [];
  const llmCallKey = msg.id || d.uuid;

  // Subsequent streamed line for an assistant message we have already recorded:
  // merge this line's content blocks into the accumulated set and refresh the
  // derived fields. The usage is identical on every line, so we do NOT touch the
  // token buckets (it was billed once on the first line).
  if (llmCallKey && state.callsById.has(llmCallKey)) {
    const accumulated = state.contentById.get(llmCallKey);
    accumulated.push(...content);
    const record = state.callsById.get(llmCallKey);
    deriveContentFields(record, accumulated);
    if (msg.stop_reason) record.outcome = msg.stop_reason;
    return;
  }

  const usage = msg.usage;
  if (!usage) return;

  const accumulated = [...content];
  const record = {
    llm_call_index: state.llmCallIndex++,
    human_request_index: state.currentHumanRequestIndex >= 0 ? state.currentHumanRequestIndex : 0,
    human_request_text: state.currentHumanRequest,
    human_request_full_text: state.currentHumanRequestFull || state.currentHumanRequest,
    timestamp: ts || state.lastActiveAt,
    model: msg.model || 'unknown',
    outcome: msg.stop_reason || '',
    tool_result_chars: state.pendingToolResultChars,
    input_tokens: usage.input_tokens || 0,
    output_tokens: usage.output_tokens || 0,
    cache_read_tokens: usage.cache_read_input_tokens || 0,
    cache_write_tokens: usage.cache_creation_input_tokens || 0,
  };
  deriveContentFields(record, accumulated);

  if (llmCallKey) {
    state.callsById.set(llmCallKey, record);
    state.contentById.set(llmCallKey, accumulated);
  }
  state.llmCalls.push(record);
  state.pendingToolResultChars = 0;
}

function parseClaudeFile(filePath) {
  const state = emptyParseState();

  for (const item of timestampedJsonlRecords(filePath)) {
    const d = item.record;
    const ts = item.timestamp;
    state.startedAt = item.startedAt;
    state.lastActiveAt = item.lastActiveAt;
    applyRecordMeta(state, d);

    if (d.type === 'user') handleUserRecord(state, d, ts);
    if (d.type === 'assistant') handleAssistantRecord(state, d, ts);
  }

  const encodedDir = path.basename(path.dirname(filePath));
  const parentDir = path.basename(path.dirname(path.dirname(filePath)));
  if (path.basename(path.dirname(filePath)) === 'subagents') {
    state.isSubagent = true;
    state.subagentKind = state.subagentKind || 'sidechain';
    state.parentSessionId = state.parentSessionId || state.sessionId || parentDir;
    state.subagentDepth = state.subagentDepth || 1;
  }
  const project = state.cwd ? path.basename(state.cwd) : encodedDir;

  return {
    id: path.basename(filePath, '.jsonl'),
    source: 'claude-code',
    project,
    title: state.title || '(no human request)',
    cwd: state.cwd,
    sessionId: state.sessionId,
    thread_session_id: state.sessionId,
    thread_source: state.isSubagent ? 'subagent' : 'user',
    is_subagent: state.isSubagent,
    parent_session_id: state.isSubagent ? state.parentSessionId : '',
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

module.exports = { parseClaudeFile };
