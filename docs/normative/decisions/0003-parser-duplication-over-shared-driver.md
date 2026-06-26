# 0003 — Keep the per-parser loop scaffold duplicated rather than share a driver

- Status: accepted
- Date: 2026-06-26

## Context

`parseClaudeFile` and `parseCodexFile` were each refactored from one large
event-dispatch loop into a thin dispatcher plus named per-event handlers, sharing
genuine cross-parser behavior (human-request recording) through
`assignHumanRequest` in `parseShared.js`.

After that consolidation, static analysis still reports one small (~8 line)
identical block across the two parsers: the function-opening scaffold — create
the parse state, then iterate `timestampedJsonlRecords(filePath)`, reading the
record, timestamp, and started/last-active range off each item.

This block looks like duplication a "remove all clones" pass would want to fold
into a shared loop driver. It is recorded here because keeping it is a
deliberate deviation from that obvious move.

## Decision

Keep the per-parser loop scaffold duplicated. Do not extract a shared
record-iteration driver that both parsers call.

The two parsers normalize structurally different transcript formats. Their
per-record dispatch diverges fundamentally: Codex routes on `session_meta` /
`turn_context` / payload `type` (`user_message`, `token_count`, activity
events) and reconstructs per-call usage from cumulative token totals; Claude
Code routes on record `type` (`user`, `assistant`), merges content blocks
streamed across lines sharing one message id, and reads disjoint usage buckets
directly. The only thing they share at the loop level is the iteration scaffold,
not the dispatch.

## Alternatives considered

- **Shared loop driver taking per-format handlers** (e.g. a function that
  iterates records and invokes a passed-in dispatch table). Rejected: it couples
  two intentionally independent format parsers behind one control-flow seam,
  forces both formats' divergent state and dispatch needs through a common
  signature, and hides the per-format dispatch that is the most important thing
  a reader of each parser needs to see. The cost of the coupling exceeds the
  value of removing ~8 lines.

## Consequences

- Duplication tooling will continue to flag this block. It is an accepted
  exception, not a defect to fix.
- Each parser remains independently readable end to end, and either format's
  dispatch can change without negotiating a shared driver contract.
- Real shared parser behavior still belongs in `parseShared.js`; this decision
  covers only the loop scaffold, not future genuine shared logic.
