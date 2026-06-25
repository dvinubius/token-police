'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { parseClaudeFile } = require('../src/parseClaude');
const { parseCodexFile } = require('../src/parseCodex');
const { Store } = require('../src/store');

function writeJsonl(name, records) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-police-test-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, records.map((record) => JSON.stringify(record)).join('\n') + '\n');
  return file;
}

test('Claude parser captures full Human request text and LLM-call insights', () => {
  const request = 'Please inspect the parser and update the dialog with richer per-call insight fields. '.repeat(4);
  const file = writeJsonl('claude.jsonl', [
    {
      type: 'user',
      timestamp: '2026-06-24T10:00:00.000Z',
      sessionId: 'claude-session',
      cwd: '/tmp/token-police',
      message: { content: [{ type: 'text', text: request }] },
    },
    {
      type: 'assistant',
      timestamp: '2026-06-24T10:00:01.000Z',
      sessionId: 'claude-session',
      cwd: '/tmp/token-police',
      uuid: 'assistant-1',
      message: {
        id: 'msg-1',
        model: 'claude-sonnet-4-5',
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'I will inspect the parser and dialog rendering.' },
          { type: 'tool_use', name: 'Read', input: { file_path: '/repo/src/parseClaude.js' } },
          { type: 'tool_use', name: 'Read', input: { file_path: '/repo/src/store.js' } },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          cache_read_input_tokens: 30,
          cache_creation_input_tokens: 40,
        },
      },
    },
  ]);

  const session = parseClaudeFile(file);
  const call = session.llm_calls[0];

  assert.equal(call.human_request_full_text, request.replace(/\s+/g, ' ').trim());
  assert.ok(call.human_request_text.length <= 160);
  assert.equal(call.activity_summary, 'Read x2');
  assert.equal(call.assistant_preview, 'I will inspect the parser and dialog rendering.');
  assert.equal(call.assistant_full_text, 'I will inspect the parser and dialog rendering.');
  assert.equal(call.outcome, 'tool_use');
  assert.equal(call.tool_hint, 'Read: parseClaude.js');
});

test('Claude parser merges tool_use blocks streamed across split lines of one message', () => {
  // Newer Claude Code writes one JSONL line per content block, all sharing the
  // same message id and repeating the same full usage. The tool_use blocks land
  // on later lines than the leading thinking/text, so the parser must merge
  // content across every line for the id (and bill the usage only once).
  const usage = {
    input_tokens: 2,
    output_tokens: 62,
    cache_read_input_tokens: 47731,
    cache_creation_input_tokens: 292,
  };
  const line = (content) => ({
    type: 'assistant',
    timestamp: '2026-06-24T10:00:01.000Z',
    sessionId: 'claude-session',
    cwd: '/tmp/token-police',
    uuid: 'assistant-stream',
    message: {
      id: 'msg-stream',
      model: 'claude-opus-4-8',
      stop_reason: 'tool_use',
      content,
      usage,
    },
  });

  const file = writeJsonl('claude-split.jsonl', [
    { type: 'user', timestamp: '2026-06-24T10:00:00.000Z', sessionId: 'claude-session', cwd: '/tmp/token-police', message: { content: [{ type: 'text', text: 'Align the Top 5 list.' }] } },
    line([{ type: 'thinking', thinking: 'Let me check the layout.' }]),
    line([{ type: 'text', text: 'Inspecting the rendered list.' }]),
    line([{ type: 'tool_use', name: 'mcp__Claude_Preview__preview_inspect', input: { selector: 'li' } }]),
    line([{ type: 'tool_use', name: 'mcp__Claude_Preview__preview_inspect', input: { selector: 'span' } }]),
  ]);

  const session = parseClaudeFile(file);

  // Four assistant lines, one message id -> exactly one billable LLM call.
  assert.equal(session.llm_calls.length, 1);
  const call = session.llm_calls[0];

  // Tool activity from the later lines is surfaced, not dropped.
  assert.equal(call.activity_summary, 'mcp__Claude_Preview__preview_inspect x2');
  assert.equal(call.tool_hint, 'mcp__Claude_Preview__preview_inspect');
  assert.equal(call.assistant_preview, 'Inspecting the rendered list.');
  assert.equal(call.outcome, 'tool_use');

  // Usage is billed once despite repeating on every line.
  assert.equal(call.input_tokens, 2);
  assert.equal(call.output_tokens, 62);
  assert.equal(call.cache_read_tokens, 47731);
  assert.equal(call.cache_write_tokens, 292);
});

test('Claude parser emits interrupted requests as zero-call Human requests and ignores interrupt markers', () => {
  // Reproduces an interrupted session: the initial prompt is interrupted before
  // any assistant response, then the developer types follow-up prompts. The
  // interrupt marker must not become a Human request, and the zero-call initial
  // prompt must still be emitted as its own request.
  const file = writeJsonl('claude-interrupted.jsonl', [
    { type: 'user', timestamp: '2026-06-24T10:00:00.000Z', sessionId: 'claude-session', cwd: '/tmp/token-police', message: { content: [{ type: 'text', text: 'Initial prompt that gets interrupted.' }] } },
    { type: 'user', timestamp: '2026-06-24T10:00:05.000Z', message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] } },
    { type: 'user', timestamp: '2026-06-24T10:00:10.000Z', message: { content: [{ type: 'text', text: 'Continue' }] } },
    {
      type: 'assistant',
      timestamp: '2026-06-24T10:00:11.000Z',
      uuid: 'assistant-1',
      message: {
        id: 'msg-1',
        model: 'claude-opus-4-8',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Working on it.' }],
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    },
  ]);

  const session = parseClaudeFile(file);

  // Two genuine Human requests; the interrupt marker is not one of them.
  assert.equal(session.human_requests.length, 2);
  assert.deepEqual(
    session.human_requests.map((r) => r.human_request_index),
    [0, 1]
  );
  assert.equal(session.human_requests[0].human_request_text, 'Initial prompt that gets interrupted.');
  assert.equal(session.human_requests[1].human_request_text, 'Continue');

  // The interrupt marker did not relabel or re-index the follow-up request.
  assert.equal(session.llm_calls.length, 1);
  assert.equal(session.llm_calls[0].human_request_index, 1);
  assert.equal(session.llm_calls[0].human_request_text, 'Continue');

  // The store counts the zero-call initial prompt and exposes the request list.
  const store = new Store({
    estimatedCost() { return 0; },
    contextWindow() { return 200000; },
  });
  store.upsertFromFile('claude-code', file);
  const meta = store.getSessionMeta(session.id);
  assert.equal(meta.human_request_count, 2);
  assert.equal(meta.human_requests.length, 2);
});

test('Codex parser attributes each response\'s activity to the call its token_count creates', () => {
  // Real Codex ordering: a response emits reasoning/agent_message/function_call/
  // function_call_output FIRST, then the token_count reporting that response's
  // usage. So the activity accumulated since the previous token_count belongs to
  // the call this token_count creates. Two responses prove the per-call ownership
  // (no off-by-one), that the first response's activity is not dropped, and that
  // a trailing task_complete lands on the last call. An injected user message
  // between responses must not bleed into a call as assistant text.
  const file = writeJsonl('codex.jsonl', [
    { type: 'session_meta', timestamp: '2026-06-24T10:00:00.000Z', payload: { id: 'codex-session', cwd: '/tmp/token-police' } },
    { type: 'event_msg', timestamp: '2026-06-24T10:00:01.000Z', payload: { type: 'user_message', message: 'Update the LLM-call dialog.' } },
    { type: 'turn_context', timestamp: '2026-06-24T10:00:02.000Z', payload: { model: 'gpt-5-codex' } },

    // Response 1: activity, then its token_count.
    { type: 'response_item', timestamp: '2026-06-24T10:00:03.000Z', payload: { type: 'reasoning' } },
    { type: 'event_msg', timestamp: '2026-06-24T10:00:04.000Z', payload: { type: 'agent_message', message: 'I found the dialog path.' } },
    {
      type: 'response_item',
      timestamp: '2026-06-24T10:00:05.000Z',
      payload: { type: 'function_call', name: 'shell_command', arguments: JSON.stringify({ cmd: 'npm test -- --runInBand' }) },
    },
    { type: 'response_item', timestamp: '2026-06-24T10:00:06.000Z', payload: { type: 'function_call_output', output: 'tests passed', status: 'completed' } },
    {
      type: 'event_msg',
      timestamp: '2026-06-24T10:00:07.000Z',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, total_tokens: 110 },
          last_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 4, total_tokens: 110 },
        },
      },
    },

    // Injected user input echoed as a `message` record: must be filtered out so it
    // does not become the next call's assistant text.
    {
      type: 'response_item',
      timestamp: '2026-06-24T10:00:08.000Z',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<permissions instructions> Filesystem sandboxing defines which files...' }] },
    },

    // Response 2: activity, then its token_count, then the turn's task_complete.
    { type: 'event_msg', timestamp: '2026-06-24T10:00:09.000Z', payload: { type: 'agent_message', message: 'Tests passed; applying the renderer patch.' } },
    {
      type: 'response_item',
      timestamp: '2026-06-24T10:00:10.000Z',
      payload: { type: 'function_call', name: 'apply_patch', arguments: JSON.stringify({ file_path: '/repo/public/app.js' }) },
    },
    { type: 'response_item', timestamp: '2026-06-24T10:00:11.000Z', payload: { type: 'function_call_output', output: 'patched', status: 'completed' } },
    {
      type: 'event_msg',
      timestamp: '2026-06-24T10:00:12.000Z',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { input_tokens: 210, cached_input_tokens: 40, output_tokens: 25, total_tokens: 230 },
          last_token_usage: { input_tokens: 110, cached_input_tokens: 20, output_tokens: 15, reasoning_output_tokens: 6, total_tokens: 120 },
        },
      },
    },
    { type: 'event_msg', timestamp: '2026-06-24T10:00:13.000Z', payload: { type: 'task_complete' } },
  ]);

  const session = parseCodexFile(file);
  assert.equal(session.llm_calls.length, 2);
  const [call0, call1] = session.llm_calls;

  // Response 1's activity stays on call 0 (not dropped, not shifted to call 1).
  assert.equal(call0.human_request_full_text, 'Update the LLM-call dialog.');
  assert.equal(call0.activity_summary, 'shell_command');
  assert.equal(call0.assistant_preview, 'I found the dialog path.');
  assert.equal(call0.assistant_full_text, 'I found the dialog path.');
  assert.equal(call0.outcome, 'completed');
  assert.equal(call0.tool_hint, 'shell_command: npm');
  assert.equal(call0.reasoning_output_tokens, 4);
  assert.equal(call0.output_tokens, 10);

  // Response 2's activity is owned by call 1, and the trailing task_complete lands here.
  assert.equal(call1.activity_summary, 'apply_patch');
  assert.equal(call1.assistant_full_text, 'Tests passed; applying the renderer patch.');
  assert.equal(call1.tool_hint, 'apply_patch: app.js');
  assert.equal(call1.outcome, 'task_complete');
  assert.equal(call1.output_tokens, 15);
  assert.equal(call1.reasoning_output_tokens, 6);

  // The injected user input never surfaces as assistant text on any call.
  assert.ok(!call0.assistant_full_text.includes('permissions instructions'));
  assert.ok(!call1.assistant_full_text.includes('permissions instructions'));
});

test('Codex parser emits an aborted turn as a zero-call Human request', () => {
  // A user message whose turn is aborted before any token_count produces no
  // billed LLM call. It must still be emitted as a Human request so it gets its
  // own row, distinct from the following request that does produce a call.
  const file = writeJsonl('codex-aborted.jsonl', [
    { type: 'session_meta', timestamp: '2026-06-24T10:00:00.000Z', payload: { id: 'codex-aborted', cwd: '/tmp/token-police' } },
    { type: 'turn_context', timestamp: '2026-06-24T10:00:01.000Z', payload: { model: 'gpt-5-codex' } },
    { type: 'event_msg', timestamp: '2026-06-24T10:00:02.000Z', payload: { type: 'user_message', message: 'First request that gets aborted.' } },
    { type: 'response_item', timestamp: '2026-06-24T10:00:03.000Z', payload: { type: 'turn_aborted' } },
    { type: 'event_msg', timestamp: '2026-06-24T10:00:04.000Z', payload: { type: 'user_message', message: 'please continue' } },
    {
      type: 'event_msg',
      timestamp: '2026-06-24T10:00:05.000Z',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, total_tokens: 110 },
          last_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, total_tokens: 110 },
        },
      },
    },
  ]);

  const session = parseCodexFile(file);

  // Both user messages are Human requests; only the second produced a call.
  assert.equal(session.human_requests.length, 2);
  assert.deepEqual(
    session.human_requests.map((r) => r.human_request_text),
    ['First request that gets aborted.', 'please continue']
  );
  assert.equal(session.llm_calls.length, 1);
  assert.equal(session.llm_calls[0].human_request_index, 1);

  // The store counts the zero-call aborted request and exposes the list.
  const store = new Store({
    estimatedCost() { return 0; },
    contextWindow() { return 200000; },
  });
  store.upsertFromFile('codex', file);
  const meta = store.getSessionMeta(session.id);
  assert.equal(meta.human_request_count, 2);
  assert.equal(meta.human_requests.length, 2);
});

test('Store projects insight fields and derives cost drivers', () => {
  const store = new Store({
    estimatedCost() { return 0.25; },
    contextWindow() { return 200000; },
  });
  const session = {
    id: 'session-1',
    source: 'codex',
    project: 'token-police',
    title: 'Update dialog',
    started_at: '2026-06-24T10:00:00.000Z',
    last_active_at: '2026-06-24T10:00:10.000Z',
    llm_calls: [{
      llm_call_index: 0,
      human_request_index: 0,
      human_request_text: 'Update dialog',
      human_request_full_text: 'Update dialog with expandable insight rows.',
      timestamp: '2026-06-24T10:00:03.000Z',
      model: 'gpt-5-codex',
      activity_summary: 'Read x4',
      assistant_preview: 'I found the dialog path.',
      assistant_full_text: 'I found the dialog path and the relevant renderer.',
      outcome: 'completed',
      tool_hint: 'Read: app.js',
      reasoning_output_tokens: 3000,
      input_tokens: 150000,
      output_tokens: 9000,
      cache_read_tokens: 1000,
      cache_write_tokens: 0,
    }],
  };

  store._enrich(session);
  store.sessions.set(session.id, session);

  const [call] = store.getLlmCalls(session.id);
  assert.equal(call.human_request_full_text, 'Update dialog with expandable insight rows.');
  assert.equal(call.activity_summary, 'Read x4');
  assert.equal(call.assistant_preview, 'I found the dialog path.');
  assert.equal(call.assistant_full_text, 'I found the dialog path and the relevant renderer.');
  assert.equal(call.outcome, 'completed');
  assert.equal(call.tool_hint, 'Read: app.js');
  assert.match(call.cost_driver, /large context window use/);
  assert.match(call.cost_driver, /high output/);
  assert.equal(call.reasoning_output_tokens, 3000);
});
