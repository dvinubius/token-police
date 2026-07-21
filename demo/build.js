'use strict';

/*
 * Demo data build.
 *
 * Generates the mock transcript fixtures, runs them through the REAL parsers,
 * Pricing, and Store, and freezes the resulting API projections as static JSON
 * under dist/demo/. The deployed demo build serves those files instead of the
 * live REST API, so the hosted demo shows exactly what the local app would.
 *
 * Every emitted document is {generated_at, payload}. `generated_at` is the
 * local midnight of the build day; the frontend demo adapter shifts all
 * timestamps by whole days from it so the 30-day chart never goes stale.
 *
 * Usage: node demo/build.js [outDir]   (default: dist/demo)
 */

const fs = require('fs');
const path = require('path');

const { Pricing } = require('../src/pricing');
const { Store } = require('../src/store');
const { writeTranscripts } = require('./transcripts');

const ROOT = path.join(__dirname, '..');
const FIXTURE_DIR = path.join(ROOT, '.demo-build', 'transcripts');
const DEFAULT_OUT = path.join(ROOT, 'dist', 'demo');

// Mirrors the sanitizer in frontend/src/lib/demo.js — keep the two in sync.
function safeFileId(id) {
  return String(id).replace(/[^A-Za-z0-9._-]/g, '_');
}

function startOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function collectJsonl(dir) {
  const out = [];
  const walk = (current) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && full.endsWith('.jsonl')) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

function writeDoc(outDir, relPath, generatedAt, payload) {
  const file = path.join(outDir, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ generated_at: generatedAt, payload }));
  return fs.statSync(file).size;
}

async function main() {
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUT;
  const anchor = startOfLocalDay(new Date());
  const generatedAt = anchor.toISOString();

  const { claudeRoot, codexRoot } = writeTranscripts(FIXTURE_DIR, anchor.getTime());

  const pricing = new Pricing();
  await pricing.load();
  const store = new Store(pricing);

  const claudeFiles = collectJsonl(claudeRoot);
  const codexFiles = collectJsonl(codexRoot);
  for (const file of claudeFiles) store.upsertFromFile('claude-code', file);
  for (const file of codexFiles) store.upsertFromFile('codex', file);

  if (!store.sessions.size) throw new Error('demo build produced zero Sessions');

  fs.rmSync(outDir, { recursive: true, force: true });

  let bytes = 0;
  bytes += writeDoc(outDir, 'sessions.json', generatedAt, store.listSessions());
  bytes += writeDoc(outDir, 'summary.json', generatedAt, store.summary());
  for (const id of store.sessions.keys()) {
    bytes += writeDoc(outDir, path.join('llm-calls', `${safeFileId(id)}.json`), generatedAt, {
      session: store.getSessionMeta(id),
      llm_calls: store.getLlmCalls(id),
    });
  }

  const summary = store.summary();
  console.log(`[demo] fixtures      ${claudeFiles.length} claude + ${codexFiles.length} codex .jsonl`);
  console.log(`[demo] sessions      ${store.sessions.size}`);
  console.log(`[demo] llm calls     ${summary.totals.llm_call_count}`);
  console.log(`[demo] estimated     $${summary.totals.estimated_cost_usd.toFixed(2)}`);
  console.log(`[demo] anchor day    ${anchor.toDateString()}`);
  console.log(`[demo] wrote         ${outDir} (${(bytes / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error('[demo] build failed:', err);
  process.exit(1);
});
