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

test('Codex parser attaches nearby activity to emitted LLM calls', () => {
  const file = writeJsonl('codex.jsonl', [
    { type: 'session_meta', timestamp: '2026-06-24T10:00:00.000Z', payload: { id: 'codex-session', cwd: '/tmp/token-police' } },
    { type: 'event_msg', timestamp: '2026-06-24T10:00:01.000Z', payload: { type: 'user_message', message: 'Update the LLM-call dialog.' } },
    { type: 'turn_context', timestamp: '2026-06-24T10:00:02.000Z', payload: { model: 'gpt-5-codex' } },
    {
      type: 'event_msg',
      timestamp: '2026-06-24T10:00:03.000Z',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, total_tokens: 110 },
          last_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 4, total_tokens: 110 },
        },
      },
    },
    { type: 'event_msg', timestamp: '2026-06-24T10:00:04.000Z', payload: { type: 'agent_message', message: 'I found the dialog path.' } },
    {
      type: 'response_item',
      timestamp: '2026-06-24T10:00:05.000Z',
      payload: { type: 'function_call', name: 'shell_command', arguments: JSON.stringify({ cmd: 'npm test -- --runInBand' }) },
    },
    {
      type: 'response_item',
      timestamp: '2026-06-24T10:00:06.000Z',
      payload: { type: 'function_call_output', output: 'tests passed', status: 'completed' },
    },
  ]);

  const session = parseCodexFile(file);
  const call = session.llm_calls[0];

  assert.equal(call.human_request_full_text, 'Update the LLM-call dialog.');
  assert.equal(call.activity_summary, 'shell_command');
  assert.equal(call.assistant_preview, 'I found the dialog path.');
  assert.equal(call.assistant_full_text, 'I found the dialog path.');
  assert.equal(call.outcome, 'completed');
  assert.equal(call.tool_hint, 'shell_command: npm');
  assert.equal(call.reasoning_output_tokens, 4);
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
