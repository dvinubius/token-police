# PRD: Human-request attribution for interrupted Claude sessions

## Problem

In the Session detail view, the Human request breakdown table is built
entirely from LLM calls grouped by `human_request_index`. Two defects surface
when a Claude Code session is interrupted:

1. A Human request that triggered **zero billed LLM calls** (e.g. the initial
   prompt was interrupted before the model responded) produces **no row** and
   is not counted, because rows derive only from LLM calls.
2. The Claude Code system marker `[Request interrupted by user]` is treated as
   a genuine Human request by `genuineUserTitle()`. It increments the request
   index and overwrites the current-request label, creating phantom requests
   and risking a row literally titled "[Request interrupted by user]".

Observed: a session with initial prompt → interrupt → "Continue" → interrupt →
"please continue" showed only 2 rows ("Continue", "please continue"). Expected
3 rows, with the initial prompt at the bottom.

## Outcome

- Every genuine Human request appears as exactly one row, in chronological
  order, including requests with zero LLM calls (shown as a real row with
  0 calls / $0).
- `[Request interrupted by user]` (and the tool-use variant) is never treated
  as a Human request.
- `human_request_count` reflects genuine Human requests, including zero-call
  ones.

## Scope

- `src/parseClaude.js`: filter interrupt markers in `genuineUserTitle()`; emit
  a normalized `human_requests` list (index, preview text, full text,
  timestamp) on the Session.
- `src/store.js`: pass `human_requests` through `getSessionMeta`; count Human
  requests from that list when present.
- `public/app.js`: seed `groupHumanRequests` from the session's
  `human_requests` list so zero-call requests render; fall back to the existing
  call-derived grouping when the list is absent.
- `test/llm-insights.test.js`: cover interrupt filtering and the zero-call
  request row.
- Update `docs/normative/architecture.md` to note the parser now emits a
  Human request list; add an ADR for the first-class Human request decision.

## Codex

The zero-call defect also affects Codex: a `user_message` whose turn is
`turn_aborted` before any `token_count` produces no billed call and so no row
(confirmed in real sessions). `parseCodexFile()` now emits the same
`human_requests` list. The interrupt-marker defect does NOT affect Codex —
Codex signals interrupts with `turn_aborted` events, not a synthetic user
message, so there is no marker to filter.

## Non-goals

- No change to pricing, token-bucket semantics, or LLM-call enrichment.
- No change to Codex injected-message filtering (`isInjected`).

## Verification

- `npm test -- test/llm-insights.test.js` (focused), then `npm test` (full).
- Re-parse transcript `53a7e14b-…jsonl` and confirm 3 rows: initial prompt
  (0 calls), "Continue", "please continue".
