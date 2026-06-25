# 0001 — Human requests are first-class, emitted independently of LLM calls

- Status: accepted
- Date: 2026-06-25

## Context

The Session detail view derived its Human request rows solely by grouping LLM
calls on `human_request_index`. This had two consequences for interrupted
Claude Code sessions:

- A Human request that triggered zero billed LLM calls (e.g. an initial prompt
  interrupted before the model responded) produced no row and was not counted,
  because rows existed only where LLM calls existed.
- The Claude Code system marker `[Request interrupted by user]` passed the
  genuine-title heuristic, so each interrupt was counted as a Human request,
  inflating request indices and risking a row titled with the marker text.

## Decision

`parseClaudeFile()` and `parseCodexFile()` each emit a chronological
`human_requests` list (index, preview text, full text, timestamp) on the
Session, independent of LLM calls. Claude interrupt markers are excluded from
request detection; Codex represents interrupts as `turn_aborted` events rather
than synthetic user messages, so it has no marker to exclude. `Store` carries
this list through `getSessionMeta` and counts Human requests from it when
present. The frontend seeds its Human request groups from the list so zero-call
requests render as real rows, falling back to call-derived grouping when the
list is absent.

## Consequences

- Every genuine Human request appears as exactly one row in chronological
  order, including zero-call requests (shown with 0 calls / $0).
- Interrupt markers no longer distort request indexing or counts.
- The normalized Session shape gains a `human_requests` field emitted by both
  parsers. The frontend fallback to call-derived grouping remains for any
  Session that lacks the list.
