// Coverage for the pure view logic extracted to frontend/src/lib/ — the data
// shaping that feeds the session detail table and LLM-call dialog. These are
// the high-churn, previously refactor-blocked functions; locking their
// behavior down lets the Svelte components built around them be refactored
// safely.
//
// The bodies are unchanged from the legacy vanilla frontend, so these assertions
// remain the parity proof that derivation behavior survived the Svelte + Vite
// migration. This is the only test converted to ESM; the src/ CommonJS tests
// are untouched.

import assert from 'node:assert/strict';
import test from 'node:test';

import * as app from '../frontend/src/lib/index.js';

function call(overrides = {}) {
  return {
    llm_call_index: 0,
    human_request_index: 0,
    human_request_text: 'Req',
    human_request_full_text: 'Req full',
    timestamp: '2026-06-24T10:00:00.000Z',
    model: 'gpt-5-codex',
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    estimated_cost_usd: 0,
    ...overrides,
  };
}

test('fmtTokens scales to K/M/B and leaves small counts raw', () => {
  assert.equal(app.fmtTokens(0), '0');
  assert.equal(app.fmtTokens(950), '950');
  assert.equal(app.fmtTokens(1500), '1.5K');
  assert.equal(app.fmtTokens(2_300_000), '2.30M');
  assert.equal(app.fmtTokens(4_000_000_000), '4.00B');
  assert.equal(app.fmtTokens(undefined), '0');
});

test('fmtEstimatedCost picks precision by magnitude', () => {
  assert.equal(app.fmtEstimatedCost(0), '$0');
  assert.equal(app.fmtEstimatedCost(0.0004), '$0.0004'); // < 0.01 -> 4dp
  assert.equal(app.fmtEstimatedCost(0.25), '$0.250'); // < 1 -> 3dp
  assert.equal(app.fmtEstimatedCost(12.5), '$12.50'); // >= 1 -> 2dp
});

test('fmtPct clamps tiny and zero values and rounds by band', () => {
  assert.equal(app.fmtPct(0), '0%');
  assert.equal(app.fmtPct(-1), '0%');
  assert.equal(app.fmtPct(0.0005), '<0.1%');
  assert.equal(app.fmtPct(0.052), '5.2%'); // < 10% -> 1dp
  assert.equal(app.fmtPct(0.5), '50%'); // >= 10% -> 0dp
});

test('humanRequestKey prefers index, then text, then call index', () => {
  assert.equal(app.humanRequestKey(call({ human_request_index: 3 })), '3');
  assert.equal(
    app.humanRequestKey(call({ human_request_index: null, human_request_text: 'Fix bug' })),
    'human-request:Fix bug'
  );
  assert.equal(
    app.humanRequestKey(call({ human_request_index: null, human_request_text: '', llm_call_index: 7 })),
    'llm-call:7'
  );
});

test('groupHumanRequests seeds zero-call requests from the request list and aggregates calls', () => {
  const humanRequests = [
    { human_request_index: 0, human_request_text: 'First', human_request_full_text: 'First full', timestamp: '2026-06-24T10:00:00.000Z' },
    { human_request_index: 1, human_request_text: 'Aborted', human_request_full_text: 'Aborted full', timestamp: '2026-06-24T10:01:00.000Z' },
  ];
  const llmCalls = [
    call({ llm_call_index: 0, human_request_index: 0, timestamp: '2026-06-24T10:00:05.000Z', input_tokens: 10, output_tokens: 2, cache_read_tokens: 1, cache_write_tokens: 0, estimated_cost_usd: 0.5 }),
    call({ llm_call_index: 1, human_request_index: 0, timestamp: '2026-06-24T10:00:09.000Z', input_tokens: 20, output_tokens: 4, cache_read_tokens: 3, cache_write_tokens: 1, estimated_cost_usd: 0.75 }),
  ];

  const groups = app.groupHumanRequests(llmCalls, humanRequests);
  assert.equal(groups.length, 2); // request order preserved, zero-call request kept

  const [g0, g1] = groups;
  assert.equal(g0.key, '0');
  assert.equal(g0.calls.length, 2);
  assert.equal(g0.input_tokens, 30);
  assert.equal(g0.output_tokens, 6);
  assert.equal(g0.cache_read_tokens, 4);
  assert.equal(g0.cache_write_tokens, 1);
  assert.equal(g0.estimated_cost_usd, 1.25);
  // started/last_active span the attached calls.
  assert.equal(g0.started_at, '2026-06-24T10:00:00.000Z');
  assert.equal(g0.last_active_at, '2026-06-24T10:00:09.000Z');

  // The aborted request remains a row with no calls.
  assert.equal(g1.key, '1');
  assert.equal(g1.calls.length, 0);
});

test('groupHumanRequests falls back to call-derived grouping for legacy input without a request list', () => {
  const llmCalls = [
    call({ llm_call_index: 0, human_request_index: 0, estimated_cost_usd: 1 }),
    call({ llm_call_index: 1, human_request_index: 0, estimated_cost_usd: 1 }),
    call({ llm_call_index: 2, human_request_index: 1, estimated_cost_usd: 2 }),
  ];
  const groups = app.groupHumanRequests(llmCalls, undefined);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.calls.length), [2, 1]);
});

test('hotEstimatedCostThreshold returns the 80th-percentile cost and Infinity when sparse', () => {
  const items = [1, 2, 3, 4, 5].map((c) => call({ estimated_cost_usd: c }));
  // idx = ceil(5 * 0.8) - 1 = 3 -> costs[3] = 4
  assert.equal(app.hotEstimatedCostThreshold(items, 1), 4);

  // Zero-cost rows are ignored; below the min-item floor -> not hot.
  const sparse = [call({ estimated_cost_usd: 0 }), call({ estimated_cost_usd: 3 })];
  assert.equal(app.hotEstimatedCostThreshold(sparse, 5), Infinity);
});

test('applyFilters honors source, project, search, and date range', () => {
  const sessions = [
    { title: 'Build dashboard', project: 'token-police', source: 'codex', last_active_at: '2026-06-10T12:00:00.000Z' },
    { title: 'Fix parser', project: 'other-app', source: 'claude-code', last_active_at: '2026-06-20T12:00:00.000Z' },
    { title: 'Refactor store', project: 'token-police', source: 'claude-code', last_active_at: '2026-06-25T12:00:00.000Z' },
  ];

  const original = app.state.filters;
  try {
    app.state.filters = { search: '', source: 'claude-code', project: '', from: '', to: '' };
    assert.deepEqual(app.applyFilters(sessions).map((s) => s.title), ['Fix parser', 'Refactor store']);

    app.state.filters = { search: '', source: '', project: 'token-police', from: '', to: '' };
    assert.deepEqual(app.applyFilters(sessions).map((s) => s.title), ['Build dashboard', 'Refactor store']);

    app.state.filters = { search: 'parser', source: '', project: '', from: '', to: '' };
    assert.deepEqual(app.applyFilters(sessions).map((s) => s.title), ['Fix parser']);

    app.state.filters = { search: '', source: '', project: '', from: '2026-06-15', to: '2026-06-22' };
    assert.deepEqual(app.applyFilters(sessions).map((s) => s.title), ['Fix parser']);
  } finally {
    app.state.filters = original;
  }
});

test('sortedRows sorts by key and direction and pushes nulls last', () => {
  const rows = [{ n: 3 }, { n: 1 }, { n: null }, { n: 2 }];
  const byKey = (row) => row.n;

  const original = app.state.tableSorts;
  try {
    app.state.tableSorts = { t: { key: 'n', dir: 'asc' } };
    assert.deepEqual(app.sortedRows(rows, 't', byKey).map((r) => r.n), [1, 2, 3, null]);

    app.state.tableSorts = { t: { key: 'n', dir: 'desc' } };
    assert.deepEqual(app.sortedRows(rows, 't', byKey).map((r) => r.n), [3, 2, 1, null]);
  } finally {
    app.state.tableSorts = original;
  }
});

test('context and cache-hit percentages use derived totals with a raw-token fallback', () => {
  const enriched = call({ context_input_tokens: 100000, model_context_window_tokens: 200000, cache_read_tokens: 25000 });
  assert.equal(app.contextPctForLlmCall(enriched), 0.5);
  assert.equal(app.cacheHitPctForLlmCall(enriched), 0.25);

  // Without context_input_tokens, fall back to summing the raw buckets.
  const raw = call({ context_input_tokens: undefined, input_tokens: 60, cache_read_tokens: 30, cache_write_tokens: 10, model_context_window_tokens: 0 });
  assert.equal(app.contextTokensForLlmCall(raw), 100);
  assert.equal(app.contextPctForLlmCall(raw), 0); // window 0 -> 0
  assert.equal(app.cacheHitPctForLlmCall(raw), 0.3);
});

test('modelSummary reports single, mixed, and missing models', () => {
  assert.equal(app.modelSummary([call({ model: 'gpt-5-codex' }), call({ model: 'gpt-5-codex' })]), 'gpt-5-codex');
  assert.equal(app.modelSummary([call({ model: '' }), call({ model: undefined })]), 'Model not captured');
  const mixed = ['a', 'b', 'c', 'd'].map((m) => call({ model: m }));
  assert.equal(app.modelSummary(mixed), 'Mixed models: a, b, c +1');
});

test('firstModelSummary reports the first call model and marks mixed requests', () => {
  assert.equal(app.firstModelSummary([]), 'Model not captured');
  assert.equal(app.firstModelSummary([call({ model: '' }), call({ model: 'b' })]), 'Model not captured');
  assert.equal(app.firstModelSummary([call({ model: 'a' }), call({ model: 'a' })]), 'a');
  assert.equal(app.firstModelSummary([call({ model: 'a' }), call({ model: 'b' }), call({ model: 'a' })]), 'a et. al.');
});

test('requestPreview truncates with an ellipsis only past the limit', () => {
  assert.equal(app.requestPreview('short', 10), 'short');
  assert.equal(app.requestPreview('abcdefghij', 5), 'abcde…');
  assert.equal(app.requestPreview('', 5), '');
});

test('visibleSessionRows hides subagent rows unless the parent is present and expanded', () => {
  const rows = [
    { id: 'parent', is_subagent: false },
    { id: 'child', is_subagent: true, parent_session_id: 'parent' },
    { id: 'orphan', is_subagent: true, parent_session_id: 'missing' },
  ];

  const original = app.state.expandedSessionIds;
  try {
    app.state.expandedSessionIds = new Set();
    assert.deepEqual(app.visibleSessionRows(rows).map((r) => r.id), ['parent']);

    app.state.expandedSessionIds = new Set(['parent']);
    assert.deepEqual(app.visibleSessionRows(rows).map((r) => r.id), ['parent', 'child']);
  } finally {
    app.state.expandedSessionIds = original;
  }
});

test('displayTotals uses inclusive totals only for parents with subagents', () => {
  const parent = {
    is_subagent: false,
    subagent_session_count: 2,
    total_input_tokens: 10,
    inclusive_total_input_tokens: 30,
  };
  assert.equal(app.displayTotals(parent).input_tokens, 30);

  const subagent = {
    is_subagent: true,
    subagent_session_count: 0,
    total_input_tokens: 5,
    inclusive_total_input_tokens: 5,
  };
  assert.equal(app.displayTotals(subagent).input_tokens, 5);
});
