# Architecture

## System Context

| Actor or external system | Direction | Broad interaction | Interface or boundary | Detailed source |
|---|---|---|---|---|
| Local user | Inbound | Opens the local dashboard, filters Sessions, inspects Human requests and LLM calls. | Browser UI served from `public/` by the local Express server. | `public/index.html`, `public/app.js`, `server.js` |
| Claude Code transcript files | Inbound | Supplies `.jsonl` transcripts from `~/.claude/projects/**` for Session import. | Local filesystem watcher and parser boundary. | `server.js`, `src/watcher.js`, `src/parseClaude.js` |
| Codex CLI session files | Inbound | Supplies `.jsonl` session logs from `~/.codex/sessions/**` for Session import. | Local filesystem watcher and parser boundary. | `server.js`, `src/watcher.js`, `src/parseCodex.js` |
| LiteLLM model price catalog | Outbound | Provides model rates and context windows used for Estimated cost and context occupancy. | HTTPS fetch with one-hour local disk cache and hardcoded fallback rates. | `src/pricing.js` |
| Operating system browser opener | Outbound | Best-effort launch of the local dashboard after server startup. | `open`, `cmd /c start`, or `xdg-open`; disabled with `DASH_NO_OPEN`. | `server.js` |

## System Shape

| Component or area | Responsibility | Owns | Must not own |
|---|---|---|---|
| `start.js` | Bootstrap launcher for a local run. | Detecting missing runtime dependencies and invoking `npm install` before loading the server. | Application wiring, parsing, pricing, storage, or API behavior. |
| `server.js` | Runtime composition and HTTP boundary. | Port/host selection, source directory selection, `Pricing`/`Store`/`Watcher` construction, static asset serving, REST routes, and optional browser launch. | Provider-specific transcript parsing, Estimated cost math, aggregation logic, or frontend rendering. |
| `src/watcher.js` | Filesystem ingestion coordination. | Initial recursive scan of configured source directories, delayed watch startup for missing directories, debounced `.jsonl` add/change handling, and removal handling. | Parsing source formats, enriching Sessions, pricing, or HTTP behavior. |
| `src/parseClaude.js` | Claude Code transcript normalization. | Mapping Claude Code `.jsonl` records into normalized Session and LLM call fields, including Claude token bucket semantics and duplicate assistant-message suppression. | Pricing, persistence, Codex-specific normalization, or UI grouping. |
| `src/parseCodex.js` | Codex CLI session normalization. | Mapping Codex `.jsonl` records into normalized Session and LLM call fields, including Codex token-count semantics, injected-message filtering, and cumulative-token de-duplication. | Pricing, persistence, Claude-specific normalization, or UI grouping. |
| `src/pricing.js` | Model rate and context-window resolution. | LiteLLM fetch/cache/fallback behavior, model-family fallbacks, per-token rates, context windows, and per-call Estimated cost calculation. | Transcript parsing, session aggregation, HTTP routing, or frontend rendering. |
| `src/store.js` | In-memory read model for the local dashboard. | Session upsert/removal, file-to-session mapping, LLM call enrichment, list/detail API projections, aggregate totals, daily buckets, and top-session summaries. | Filesystem watching, HTTP routing, provider-specific parsing rules, or DOM behavior. |
| `public/` | Browser UI. | Static HTML/CSS/vanilla JS, API polling, client-side filtering, chart rendering, Human request grouping for detail display, and LLM call dialogs. | File watching, parsing, pricing authority, server-side aggregation, or external network calls. |

## Internal Dynamics

- Startup: `start.js` optionally installs missing dependencies, then loads `server.js`. `server.js` creates `Pricing`, loads rates, creates `Store`, starts `Watcher` for Claude Code and Codex directories, mounts static assets and REST routes, listens on `HOST`/`PORT`, and optionally opens the browser.
- Transcript ingestion: `Watcher.start()` scans existing `.jsonl` files before establishing recursive chokidar watchers. Adds and changes are debounced before calling `Store.upsertFromFile(source, filePath)`; unlinks call `Store.removeFile(filePath)`.
- Source normalization: `Store.upsertFromFile()` selects `parseCodexFile()` for `source === 'codex'` and `parseClaudeFile()` otherwise. Parsers return normalized Sessions with source, project, title, timestamps, file path, full and preview Human request text, and LLM calls using the shared token buckets `input_tokens`, `output_tokens`, `cache_read_tokens`, and `cache_write_tokens`. Codex and Claude Code Sessions additionally carry thread metadata when present, including whether the Session is a subagent Session, its parent Session id, and spawned-subagent name/role/depth. When available, parsers also annotate LLM calls with compact insight fields such as activity summary, assistant preview, outcome, tool hint, reasoning-output tokens, and nearby tool-result size. Both parsers additionally emit a chronological `human_requests` list (index, preview text, full text, timestamp) independent of LLM calls, so a Human request that triggered zero billed LLM calls is still represented (e.g. an interrupted Claude prompt or an aborted Codex turn). Claude Code interrupt markers (`[Request interrupted by user]`) are excluded from this list and from request indexing; Codex signals interrupts with `turn_aborted` events rather than a synthetic user message, so it has no equivalent marker to exclude.
- Enrichment: after parsing, `Store._enrich()` mutates each LLM call with Estimated cost, context input tokens, model context window, context-window percentage, cache-hit percentage, fresh-input percentage, cache-write percentage, and a compact cost-driver summary. It also writes Session-level totals and Human request counts. Store list/detail projections group subagent Sessions under parent Sessions when source metadata exposes a parent id, and parent detail projections include inclusive totals for main-agent plus subagent usage while global summary totals continue to count each imported transcript once.
- API read path: `GET /api/sessions` returns list projections from `Store.listSessions()`. `GET /api/sessions/:id/llm-calls` returns Session metadata plus enriched LLM calls. `GET /api/summary` returns aggregate totals, per-source totals, a local-calendar 30-day daily breakdown, and the top five Sessions by Estimated cost. `GET /api/health` reports liveness and in-memory Session count.
- Frontend refresh: `public/app.js` polls `/api/summary` and `/api/sessions` every 30 seconds, renders global stats, daily bars, top Sessions, filters, and the Session list. Parent Sessions with subagent children are collapsed by default and can be expanded in the list; expanded subagent Sessions display directly under their parent when relationship metadata is available. When a Session is selected, it fetches `/api/sessions/:id/llm-calls` and groups LLM calls into Human requests or subagent tasks for the detail table and dialog.

## Dependency Rules

- `server.js` may depend on `src/pricing.js`, `src/store.js`, and `src/watcher.js` for runtime composition.
- `src/store.js` may depend on `src/parseClaude.js`, `src/parseCodex.js`, and a `Pricing` instance for parser selection and enrichment.
- Parser modules must remain independent from `Pricing`, `Store`, Express, chokidar, and browser code; their output is the normalized Session shape consumed by the store.
- `src/pricing.js` must remain independent from provider transcript formats; it works only from model names and normalized token bucket fields.
- `src/watcher.js` must remain independent from parser details; source identity and file paths are passed to the store.
- `public/` may depend only on the local REST API and browser platform APIs. It must not read local files, fetch LiteLLM directly, or duplicate server-side pricing authority.
- Shared runtime data shapes are implicit JavaScript object contracts between parsers, store, API routes, and frontend code. If they become broader or externally consumed, promote them to explicit schemas near the implementation.

## Placement And Ownership

| Concern | Canonical location | Boundary rule |
|---|---|---|
| Runtime entrypoint | `server.js` | New runtime services should be composed here, then delegated to focused modules. |
| Bootstrap behavior | `start.js` | Keep pre-server dependency setup here; do not add application behavior. |
| Source directory configuration | `server.js` | Source roots are currently fixed from `os.homedir()` plus `.claude/projects` and `.codex/sessions`; changes to watched roots enter through server composition. |
| Filesystem watch policy | `src/watcher.js` | Directory existence polling, recursive discovery, `.jsonl` filtering, debounce, and write-finish behavior stay in the watcher. |
| Claude Code parsing | `src/parseClaude.js` | Claude-specific transcript interpretation and token bucket mapping stay in this parser. |
| Codex parsing | `src/parseCodex.js` | Codex-specific session interpretation and token bucket mapping stay in this parser. |
| Estimated cost and context windows | `src/pricing.js` | Rate lookup, cache policy, model fallback, and cost math stay in pricing. |
| Session read model and aggregation | `src/store.js` | Totals, API projections, daily summaries, and top-session selection stay in the store. |
| Dashboard presentation | `public/index.html`, `public/styles.css`, `public/app.js` | DOM state, filters, charts, dialogs, and client-only grouping for display stay in the frontend. |
| Canonical domain terms | `docs/domain-language.md` | Documentation and code-facing language should use Session, Human request, LLM call, Estimated cost, and Token bucket consistently. |

## Cross-Cutting Boundaries

- Validation: Transcript lines are parsed defensively in `src/parseClaude.js` and `src/parseCodex.js`; malformed JSONL lines are skipped. File-level parse failures are caught in `Store.upsertFromFile()` and logged without crashing the server. API route parameters are limited to Session id lookup; missing Sessions return `404`.
- Authorization: There is no authentication or authorization layer. The server binds to `127.0.0.1` by default and is intended as a local-only dashboard. Changing `HOST` can expose the unauthenticated API and UI.
- Data access: Runtime Session data is stored only in memory inside `Store`. The only disk writes are dependency installation by `start.js` and the LiteLLM price cache under `.cache/litellm_prices.json`.
- Side effects: Filesystem reads occur in parser modules and watcher scans. Filesystem watching occurs in `src/watcher.js`. External network access occurs only in `src/pricing.js` when fetching the LiteLLM catalog. Browser launch occurs only in `server.js`. The browser UI calls only same-origin local API endpoints.
- Error handling: Pricing fetch failures fall back from live fetch to stale cache to hardcoded rates. Price-cache write failures warn and continue. Watcher errors warn and continue. Browser-open failures are ignored as best effort. API errors are not centrally translated beyond the explicit Session-not-found `404`.

## Public And Internal Interfaces

- Public or externally consumed interfaces: the local HTTP UI and JSON endpoints served by `server.js`: `GET /api/sessions`, `GET /api/sessions/:id/llm-calls`, `GET /api/summary`, and `GET /api/health`.
- Internal interfaces callers should use: `new Pricing().load()`, `pricing.estimatedCost(model, tokens)`, `pricing.contextWindow(model)`, `new Store(pricing)`, `store.upsertFromFile(source, filePath)`, `store.removeFile(filePath)`, `store.listSessions()`, `store.getLlmCalls(id)`, `store.getSessionMeta(id)`, `store.summary()`, `new Watcher(store, sources).start()`, `parseClaudeFile(filePath)`, and `parseCodexFile(filePath)`.
- Implementation details callers must not depend on: private underscore methods in `Pricing`, `Store`, and `Watcher`; parser helper functions; `public/app.js` DOM state; exact LiteLLM raw catalog shape beyond `Pricing` resolution; and in-memory `Store.sessions`/`Store.fileToId` map internals outside API/debug contexts.

## Exceptions And Transitional States

- `docs/repository-map.md` and `docs/development-commands.md` are still template-shaped and do not yet fully reflect the implemented repository.
- `docs/normative/integrations/README.md` currently lists no integration contracts even though the implementation consumes local Claude Code/Codex files and fetches LiteLLM pricing data.
- Automated tests currently cover parser normalization and store/API projections for LLM-call insight fields. Browser interaction behavior is verified manually unless a frontend test harness is added.
