'use strict';

// Coverage for src/store.js read-model behavior that the existing suite did not
// reach: cost-driver derivation across every branch, file upsert/remove
// lifecycle, multi-level subagent hierarchy aggregation (and its cycle guard),
// the human-request-count fallback, and summary daily/top-session edges.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { Store } = require('../src/store');

function writeJsonl(name, records) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-police-store-test-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, records.map((record) => JSON.stringify(record)).join('\n') + '\n');
  return file;
}

function pricingSum(contextWindow = 200000) {
  return {
    estimatedCost(_model, t) {
      return (
        (t.input_tokens || 0) +
        (t.output_tokens || 0) +
        (t.cache_read_tokens || 0) +
        (t.cache_write_tokens || 0)
      ) / 100;
    },
    contextWindow() { return contextWindow; },
  };
}

function makeCall(overrides = {}) {
  return {
    llm_call_index: 0,
    human_request_index: 0,
    human_request_text: 'request',
    timestamp: '2026-06-24T10:00:03.000Z',
    model: 'gpt-5-codex',
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_output_tokens: 0,
    tool_result_chars: 0,
    ...overrides,
  };
}

function makeSession(id, calls, extra = {}) {
  return {
    id,
    source: 'codex',
    project: 'token-police',
    title: id,
    started_at: '2026-06-24T10:00:00.000Z',
    last_active_at: '2026-06-24T10:00:10.000Z',
    llm_calls: calls,
    ...extra,
  };
}

// Enrich a single call and read back its derived cost_driver string.
function driverFor(callOverrides, contextWindow = 200000) {
  const store = new Store(pricingSum(contextWindow));
  const session = makeSession('s', [makeCall(callOverrides)]);
  store._enrich(session);
  store.sessions.set(session.id, session);
  return store.getLlmCalls('s')[0].cost_driver;
}

test('costDriver flags large-window vs absolute-large context distinctly', () => {
  // pct >= 0.5 of the window -> window-relative driver.
  assert.match(driverFor({ input_tokens: 150000 }, 200000), /large context window use/);

  // Same tokens against a huge window -> pct < 0.5 but still absolutely large.
  const huge = driverFor({ input_tokens: 150000 }, 10_000_000);
  assert.match(huge, /large context/);
  assert.ok(!huge.includes('window use'));
});

test('costDriver flags low cache hit, high output, reasoning, cache write, and tool result', () => {
  assert.match(driverFor({ input_tokens: 20000 }, 10_000_000), /low cache hit/);
  assert.match(driverFor({ output_tokens: 8000 }), /high output/);
  assert.match(driverFor({ reasoning_output_tokens: 2000 }), /reasoning-heavy output/);
  // Reasoning under the absolute floor still flags via the output ratio.
  assert.match(driverFor({ reasoning_output_tokens: 60, output_tokens: 100 }), /reasoning-heavy output/);
  assert.match(driverFor({ cache_write_tokens: 20000 }), /cache write spike/);
  assert.match(driverFor({ tool_result_chars: 20000 }), /large tool result nearby/);
});

test('costDriver caps at three drivers', () => {
  const driver = driverFor({
    input_tokens: 150000,
    output_tokens: 8000,
    reasoning_output_tokens: 2000,
    cache_write_tokens: 20000,
    tool_result_chars: 20000,
  }, 200000);
  assert.equal(driver.split(', ').length, 3);
});

test('upsertFromFile drops sessions with no billable LLM calls', () => {
  const file = writeJsonl('codex-empty.jsonl', [
    { type: 'session_meta', timestamp: '2026-06-24T10:00:00.000Z', payload: { id: 'empty', cwd: '/tmp/x' } },
    { type: 'event_msg', timestamp: '2026-06-24T10:00:01.000Z', payload: { type: 'user_message', message: 'just a prompt' } },
  ]);
  const store = new Store(pricingSum());
  store.upsertFromFile('codex', file);
  assert.equal(store.sessions.size, 0);
});

test('upsertFromFile swallows parse failures without adding a session', () => {
  const store = new Store(pricingSum());
  assert.doesNotThrow(() => store.upsertFromFile('codex', '/no/such/transcript.jsonl'));
  assert.equal(store.sessions.size, 0);
});

test('upsertFromFile re-maps a file when its session id changes, and removeFile clears it', () => {
  const tokenCount = (id) => [
    { type: 'session_meta', timestamp: '2026-06-24T10:00:00.000Z', payload: { id, cwd: '/tmp/x' } },
    { type: 'event_msg', timestamp: '2026-06-24T10:00:01.000Z', payload: { type: 'user_message', message: 'hi' } },
    {
      type: 'event_msg',
      timestamp: '2026-06-24T10:00:02.000Z',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          last_token_usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        },
      },
    },
  ];
  const file = writeJsonl('codex-id.jsonl', tokenCount('id-A'));
  const store = new Store(pricingSum());
  store.upsertFromFile('codex', file);
  assert.ok(store.sessions.has('id-A'));

  // Rewrite the same path with a different session id.
  fs.writeFileSync(file, tokenCount('id-B').map((r) => JSON.stringify(r)).join('\n') + '\n');
  store.upsertFromFile('codex', file);
  assert.ok(!store.sessions.has('id-A'));
  assert.ok(store.sessions.has('id-B'));
  assert.equal(store.sessions.size, 1);

  store.removeFile(file);
  assert.equal(store.sessions.size, 0);
});

test('subagent totals roll up through multiple hierarchy levels', () => {
  const store = new Store(pricingSum());
  const sessions = [
    makeSession('P', [makeCall({ input_tokens: 100 })], { is_subagent: false }),
    makeSession('C', [makeCall({ input_tokens: 50 })], { is_subagent: true, parent_session_id: 'P' }),
    makeSession('G', [makeCall({ input_tokens: 25 })], { is_subagent: true, parent_session_id: 'C' }),
  ];
  for (const s of sessions) {
    store._enrich(s);
    store.sessions.set(s.id, s);
  }

  const parent = store.getSessionMeta('P');
  assert.equal(parent.subagent_session_count, 2); // child + grandchild
  assert.equal(parent.inclusive_total_input_tokens, 175);
  assert.equal(parent.subagent_sessions.length, 2);

  const child = store.getSessionMeta('C');
  assert.equal(child.subagent_session_count, 1);
  assert.equal(child.inclusive_total_input_tokens, 75);

  const grandchild = store.getSessionMeta('G');
  assert.equal(grandchild.subagent_session_count, 0);
  assert.equal(grandchild.inclusive_total_input_tokens, 25);

  // listSessions places each session under its parent in depth-first order.
  assert.deepEqual(store.listSessions().map((r) => r.id), ['P', 'C', 'G']);
});

test('listSessions orders multiple roots by inclusive last activity', () => {
  const store = new Store(pricingSum());
  const older = makeSession('older', [makeCall({ input_tokens: 10 })], { last_active_at: '2026-06-24T09:00:00.000Z' });
  const newer = makeSession('newer', [makeCall({ input_tokens: 10 })], { last_active_at: '2026-06-24T11:00:00.000Z' });
  // A subagent of the older root, active later than the newer root, must lift its
  // parent ahead via inclusive last-activity.
  const child = makeSession('child', [makeCall({ input_tokens: 10 })], {
    is_subagent: true,
    parent_session_id: 'older',
    last_active_at: '2026-06-24T12:00:00.000Z',
  });
  for (const s of [older, newer, child]) {
    store._enrich(s);
    store.sessions.set(s.id, s);
  }
  assert.deepEqual(store.listSessions().map((r) => r.id), ['older', 'child', 'newer']);
});

test('descendant walk terminates on a malformed parent cycle', () => {
  const store = new Store(pricingSum());
  const a = makeSession('A', [makeCall({ input_tokens: 10 })], { is_subagent: true, parent_session_id: 'B' });
  const b = makeSession('B', [makeCall({ input_tokens: 10 })], { is_subagent: true, parent_session_id: 'A' });
  for (const s of [a, b]) {
    store._enrich(s);
    store.sessions.set(s.id, s);
  }
  // The `seen` guard must stop the recursion rather than overflow the stack.
  assert.doesNotThrow(() => store.getSessionMeta('A'));
});

test('human_request_count falls back to call-derived request keys without a request list', () => {
  const store = new Store(pricingSum());
  const session = makeSession('codex-no-list', [
    makeCall({ llm_call_index: 0, human_request_index: 0 }),
    makeCall({ llm_call_index: 1, human_request_index: 0 }),
    makeCall({ llm_call_index: 2, human_request_index: 1 }),
  ]);
  store._enrich(session);
  assert.equal(session.human_request_count, 2);
});

test('session list items report distinct models in first-use order', () => {
  const store = new Store(pricingSum());
  const session = makeSession('mixed-models', [
    makeCall({ llm_call_index: 0, model: 'gpt-5-codex' }),
    makeCall({ llm_call_index: 1, model: 'claude-sonnet-4-5' }),
    makeCall({ llm_call_index: 2, model: 'gpt-5-codex' }),
  ]);
  store._enrich(session);
  store.sessions.set(session.id, session);

  assert.deepEqual(store.listSessions()[0].models, ['gpt-5-codex', 'claude-sonnet-4-5']);
  assert.deepEqual(store.getSessionMeta(session.id).models, ['gpt-5-codex', 'claude-sonnet-4-5']);
});

test('getLlmCalls and getSessionMeta return null for unknown ids', () => {
  const store = new Store(pricingSum());
  assert.equal(store.getLlmCalls('missing'), null);
  assert.equal(store.getSessionMeta('missing'), null);
});

test('summary ranks top sessions by cost and caps the list at five', () => {
  const store = new Store(pricingSum());
  for (let i = 1; i <= 6; i++) {
    const session = makeSession(`s${i}`, [makeCall({ input_tokens: i * 10 })]);
    store._enrich(session);
    store.sessions.set(session.id, session);
  }
  const summary = store.summary();
  assert.equal(summary.top_sessions.length, 5);
  assert.equal(summary.top_sessions[0].id, 's6'); // highest cost first
  assert.equal(summary.totals.session_count, 6);
});

test('summary counts out-of-window and invalid timestamps in totals but not daily buckets', () => {
  const store = new Store(pricingSum());
  const oldTs = new Date(Date.now() - 60 * 86400000).toISOString();
  const stale = makeSession('stale', [makeCall({ input_tokens: 100, timestamp: oldTs })]);
  const bad = makeSession('bad', [makeCall({ input_tokens: 50, timestamp: 'not-a-date' })]);
  for (const s of [stale, bad]) {
    store._enrich(s);
    store.sessions.set(s.id, s);
  }

  const summary = store.summary();
  assert.equal(summary.totals.input_tokens, 150); // both counted in totals

  const dailyCodexTokens = summary.daily.reduce((sum, day) => sum + day.codex.tokens, 0);
  assert.equal(dailyCodexTokens, 0); // neither lands in the 30-day window
});
