'use strict';

/*
 * The hosted demo is only as good as what its fixtures exercise. These tests
 * run the demo generator through the real parsers and Store — the same path
 * `npm run build:demo` takes — and assert that the dataset still demonstrates
 * every capability it was authored to show. A parser change that quietly
 * flattens the demo (no subagents, no zero-call Human requests, no cost
 * drivers) fails here instead of shipping.
 *
 * Pricing is deliberately left unloaded so the fixtures price off the
 * hardcoded fallback rates: no network, fully deterministic.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Pricing } = require('../src/pricing');
const { Store } = require('../src/store');
const { writeTranscripts } = require('../demo/transcripts');

function collectJsonl(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (full.endsWith('.jsonl')) out.push(full);
    }
  };
  walk(dir);
  return out;
}

function buildDemoStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-police-demo-'));
  const anchor = new Date();
  anchor.setHours(0, 0, 0, 0);
  const { claudeRoot, codexRoot } = writeTranscripts(path.join(dir, 'transcripts'), anchor.getTime());

  const store = new Store(new Pricing());
  for (const file of collectJsonl(claudeRoot)) store.upsertFromFile('claude-code', file);
  for (const file of collectJsonl(codexRoot)) store.upsertFromFile('codex', file);
  fs.rmSync(dir, { recursive: true, force: true });
  return store;
}

const store = buildDemoStore();
const rows = store.listSessions();
const allCalls = [...store.sessions.values()].flatMap((session) => session.llm_calls);

test('demo dataset covers both providers', () => {
  const sources = new Set(rows.map((row) => row.source));
  assert.ok(sources.has('claude-code'), 'expected Claude Code Sessions');
  assert.ok(sources.has('codex'), 'expected Codex Sessions');
});

test('demo dataset has a scrollable flagship Session', () => {
  const flagship = rows.find((row) => row.inclusive_llm_call_count >= 40);
  assert.ok(flagship, 'expected a Session with at least 40 LLM calls including subagents');
  assert.ok(flagship.human_request_count >= 10, 'expected at least 10 Human requests on the flagship Session');
});

test('demo dataset shows multiple models within a single Session', () => {
  const multiModel = rows.filter((row) => row.models.length >= 2);
  assert.ok(multiModel.length >= 4, `expected several multi-model Sessions, got ${multiModel.length}`);
  assert.ok(rows.some((row) => row.models.length >= 3), 'expected at least one Session using three models');
});

test('demo dataset links subagent Sessions to their parents for both providers', () => {
  const subagents = rows.filter((row) => row.is_subagent);
  assert.ok(subagents.length >= 5, `expected several subagent Sessions, got ${subagents.length}`);
  for (const child of subagents) {
    assert.ok(store.sessions.has(child.parent_session_id), `orphan subagent Session ${child.id}`);
    assert.notEqual(child.subagent_label, '', 'subagent Sessions should carry a label');
  }
  assert.ok(subagents.some((row) => row.source === 'claude-code'));
  assert.ok(subagents.some((row) => row.source === 'codex'));
  assert.ok(
    rows.some((row) => !row.is_subagent && row.subagent_session_count >= 3),
    'expected a parent Session with at least three subagents'
  );
});

test('demo dataset includes a Human request that triggered no LLM calls', () => {
  const withGap = [...store.sessions.values()].find(
    (session) => session.human_requests.length > new Set(session.llm_calls.map((c) => c.human_request_index)).size
  );
  assert.ok(withGap, 'expected a Session with an interrupted (zero-call) Human request');
});

test('demo dataset produces every cost driver the store can detect', () => {
  const drivers = new Set(allCalls.flatMap((call) => (call.cost_driver ? call.cost_driver.split(', ') : [])));
  for (const expected of [
    'large context window use',
    'large context',
    'low cache hit',
    'high output',
    'reasoning-heavy output',
    'cache write spike',
    'large tool result nearby',
  ]) {
    assert.ok(drivers.has(expected), `no LLM call demonstrates the "${expected}" cost driver`);
  }
});

test('demo dataset attaches cost drivers to the most expensive calls of large requests', () => {
  // The dialog only reveals the cost driver on "hot" rows, which the frontend
  // computes only for Human requests with at least five LLM calls.
  const byRequest = new Map();
  for (const session of store.sessions.values()) {
    for (const call of session.llm_calls) {
      const key = `${session.id}:${call.human_request_index}`;
      if (!byRequest.has(key)) byRequest.set(key, []);
      byRequest.get(key).push(call);
    }
  }
  const drivenPeaks = [...byRequest.values()].filter((calls) => {
    if (calls.length < 5) return false;
    const peak = calls.reduce((a, b) => (b.estimated_cost_usd > a.estimated_cost_usd ? b : a));
    return Boolean(peak.cost_driver);
  });
  assert.ok(drivenPeaks.length >= 8, `expected several explained cost spikes, got ${drivenPeaks.length}`);
});

test('demo dataset spreads activity across the summary window', () => {
  const summary = store.summary();
  const active = summary.daily.filter((day) => day['claude-code'].tokens > 0 || day.codex.tokens > 0);
  assert.ok(active.length >= 15, `expected at least 15 active days in the 30-day window, got ${active.length}`);
  assert.ok(summary.top_sessions.length === 5, 'expected a full top-five list');
});

test('demo transcripts are deterministic for a fixed anchor day', () => {
  const second = buildDemoStore();
  assert.deepEqual(
    second.listSessions().map((row) => [row.id, row.llm_call_count, row.total_estimated_cost_usd]),
    rows.map((row) => [row.id, row.llm_call_count, row.total_estimated_cost_usd])
  );
});
