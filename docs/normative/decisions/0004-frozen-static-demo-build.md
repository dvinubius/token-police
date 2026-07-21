# 0004 — Frozen static demo build over a hosted demo server

- Status: accepted
- Date: 2026-07-21

## Context

Token Police is a local tool: it reads `~/.claude/projects` and
`~/.codex/sessions` from the machine it runs on. Nobody can evaluate it without
first installing it and accumulating their own transcripts, which makes it hard
to show what the dashboard actually offers.

A public demo needs sample data and a way to serve the UI without any local
transcripts. Two shapes were available:

1. Deploy `server.js` with the Watcher pointed at bundled mock transcripts.
2. Freeze the API projections at build time and serve them as static files.

## Decision

Freeze the projections. `npm run build:demo` runs Vite with `VITE_DEMO=1`, then
`demo/build.js`:

1. `demo/dataset.js` holds the authored spec — fictitious projects, Human
   request prompts, LLM call counts, and per-request cost-spike shapes.
2. `demo/transcripts.js` renders that spec into provider-shaped `.jsonl`
   fixtures under `.demo-build/`, laid out like the real transcript
   directories, using a seeded PRNG so a build is reproducible for a given
   anchor day.
3. The fixtures are parsed by the real `parseClaude.js` / `parseCodex.js`,
   priced by the real `Pricing`, and projected by the real `Store`.
4. The projections are written to `dist/demo/{sessions,summary}.json` and
   `dist/demo/llm-calls/<session-id>.json`.

In a demo build, `frontend/src/lib/api.js` reads those documents through
`frontend/src/lib/demo.js` instead of calling `/api/*`.

Frozen data would age out of the Stats page's fixed 30-day window, so every
emitted document carries the build's anchor day in `generated_at`, and the
demo adapter shifts all timestamps forward by whole local days on read.

## Consequences

- The demo hosts anywhere static, with no server process, no cold starts, and
  no filesystem access.
- The demo exercises the production ingestion path. Parser, pricing, and
  projection changes flow into it automatically on the next build; they cannot
  drift from a hand-written fixture set.
- `test/demo-dataset.test.js` asserts the dataset still demonstrates both
  providers, multi-model Sessions, subagent hierarchies, zero-call Human
  requests, and every cost driver `Store` can detect. It prices off the
  hardcoded fallback rates so it stays offline and deterministic.
- The demo cannot exercise the parts of the system that are inherently live:
  `Watcher`, the Express routes, and the LiteLLM fetch/cache path. Those remain
  covered only by the local run and their own tests.
- Rebuilding is what refreshes the sample data. The whole-day timestamp shift
  keeps an old deployment coherent rather than fresh — Sessions stay correctly
  ordered and the chart stays populated, but no new work appears.
- Demo mode is a build-time flag, not a runtime toggle. A normal `npm run build`
  produces the local-server frontend with no demo documents in `dist/`.
