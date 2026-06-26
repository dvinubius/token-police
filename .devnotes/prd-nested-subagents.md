# PRD: Nested Subagent Sessions

## Context

Both Claude Code and Codex now allow a subagent to spawn its own subagent
(Claude Code: nesting up to depth 5, opt-in; Codex: `agents.max_depth`,
default 1). token-police ingests these transcripts and renders a session
hierarchy. This PRD captures what the app does today when a session tree is
deeper than one subagent level (Root → Subagent A → Subagent B) and what, if
anything, we change.

Prior note (`.devnotes/notes.md`): deep nesting was considered "overkill for
this app." This PRD keeps that bias — the default scope is the cheap fix that
makes already-correct data reachable, with deeper work called out as an
explicit option, not a commitment.

## Findings (current behavior)

Code traced across the three layers:

- **Store rollup is correct and depth-agnostic.** `_descendants`
  (`src/store.js:182`) is a transitive closure with a `seen` cycle guard;
  `_inclusiveTotals` (`src/store.js:194`) sums each descendant's own totals
  once, so there is **no double-counting at any depth** and no infinite-loop
  risk. Root inclusive totals and the global summary stay accurate regardless
  of nesting depth.

- **Frontend breaks past one level.**
  - Depth-2 rows are **unreachable**: the expand chevron is rendered only for
    non-subagents (`sessionBadges`, `public/app.js:138`), so an intermediate
    subagent A can never be expanded, and `visibleSessionRows`
    (`public/app.js:483`) therefore never shows B.
  - Intermediate subagents **understate cost**: `displayTotals`
    (`public/app.js:129`) uses inclusive totals only when `!is_subagent`, and
    `sessionStats` (`public/app.js:189`) returns the simple block early for any
    subagent — so A's row and detail hide B entirely.
  - The detail breakdown **flattens the tree**: `getSessionMeta`
    (`src/store.js:312`) exposes all descendants as a flat list, so B appears
    as a sibling of A under the root.
  - Indentation can't express depth for Claude (see parser finding).

- **Parser asymmetry.**
  - Codex (`src/parseCodex.js:150`) carries true `parent_thread_id` and
    `depth`, so the store builds the real tree.
  - Claude (`src/parseClaude.js:244`) **hardcodes `subagent_depth = 1`** and
    never distinguishes a 2nd-level subagent from a 1st-level one, so nested
    Claude subagents collapse to depth-1 siblings under the root.

- **Edge case — orphan promotion.** If an intermediate parent's file is dropped
  (no billable calls, `src/store.js:99`), its child is promoted to a top-level
  row (`src/store.js:259`) and its tokens are no longer rolled into the true
  root — a narrow undercount plus a stray top-level `SUB` row.

## Problem statement

Nested subagent sessions produce data the store already aggregates correctly,
but the dashboard cannot navigate to deep subagents, and intermediate
subagents misreport their own cost. The result is silent UI degradation, not a
crash or a wrong headline number.

## Goals

1. Every subagent row the store emits is **reachable** in the session list,
   regardless of nesting depth.
2. Any row that has descendants shows **inclusive** totals (and advertises its
   descendant count), whether or not it is itself a subagent.
3. No regression to the already-correct root inclusive totals, global summary,
   or single-level subagent display.

## Non-goals

- Deriving true nesting depth / immediate parent for **Claude** transcripts
  (parser change). This is **Option B** below — out of scope, deferred per the
  prior "overkill" note. Claude nested subagents stay collapsed to depth-1
  siblings (totals correct, parentage lost).
- Rendering the detail breakdown as a true nested tree (keep the flat
  descendant list; arithmetic already reconciles).

## Scope (A + C)

**A — UI reachability** (`public/app.js`, make the depth-agnostic store
reachable):

- Render the expand chevron for **any** row with
  `subagent_session_count > 0`, not only non-subagents.
- Use inclusive totals in `displayTotals` for **any** expandable row.
- Allow `sessionStats` to show the Total / self / descendants breakdown for an
  intermediate subagent that has descendants.

**C — orphan-aware rollup** (`src/store.js`, close the one real accuracy gap):

- When an intermediate parent file is dropped (no billable calls,
  `src/store.js:99`), its child is currently promoted to a top-level row and
  its tokens detach from the true root. Retain a lightweight skeleton entry for
  the dropped parent, or re-parent orphans to their nearest surviving ancestor,
  so descendant tokens still roll into the root.

A touches only `public/app.js` (+ minor CSS for nested indent). C is a bounded,
unit-testable store change. Neither requires a parser change.

## Options

- **Option A (in scope): UI reachability.** Codex nesting becomes fully
  navigable; Claude stays collapsed to depth-1 siblings (acceptable per the
  prior note).
- **Option C (in scope): orphan-aware rollup.** Fixes the only case where a
  number is actually wrong, not just unreachable.
- **Option B (out of scope): Claude depth/parent derivation** in
  `src/parseClaude.js`. Larger, parser-format-dependent, needs real fixtures;
  start with a format-discovery spike before estimating. Deferred.

## Effort comparison (A / B / C)

| | Layer | Files | Format unknowns | Unit-testable | Relative effort |
|---|---|---|---|---|---|
| **A** | Frontend | `public/app.js` (+CSS) | None | No harness (manual) | **Smallest** |
| **C** | Store | `src/store.js` | None | Yes, cleanly | **Medium** |
| **B** | Parser | `src/parseClaude.js` | **Yes (blocking)** | Needs real fixtures | **Largest / riskiest** |

- **A** loosens existing `!is_subagent` gates to `subagent_session_count > 0`
  in one file (`sessionBadges` `public/app.js:138`, `sessionRow` `:517`/`:524`,
  `displayTotals` `:129`, `sessionStats` `:189`) plus a little CSS. No format
  unknowns; verification is manual (no frontend test harness).
- **C** is self-contained store logic. The wrinkle: the dropped session is
  removed entirely at upsert, so its parent link is gone by `_childMap` time —
  hence the skeleton-entry or re-parent approach. Cleanly unit-testable with
  existing store test patterns; no format unknowns.
- **B** is front-loaded with discovery: how Claude records a nested subagent's
  immediate parent and depth on disk (sidechain records vs. the `subagents/`
  layout, `src/parseClaude.js:244`) is unverified and may not encode depth at
  all. Fiddly parser, needs real 3-level fixtures.

### Takeaway

Effort ranks **A < C < B**, which deliberately *inverts* the value ranking: C
(the only option that fixes a wrong *number*) is cheaper and more certain than
B (which only adds Claude structural fidelity), because C is bounded logic with
no unknowns while B is gated on transcript-format discovery we haven't done.
That is why scope is **A + C**: A makes the already-correct data reachable, C
closes the one real accuracy gap, and B stays deferred until Claude nesting
*structure* specifically matters — and should then begin with a discovery spike
before any estimate is trustworthy.

## Verification focus

- A 3-level fixture (R → A → B) for **Codex** lists all three rows, with B
  reachable by expanding A, and A's row showing inclusive (A+B) totals.
- Root R's inclusive totals and the global summary are unchanged vs. today.
- Single-level subagent sessions render exactly as before (no regression).
- **C:** a 3-level tree whose intermediate parent A is dropped (no billable
  calls) still rolls B's tokens into R; B does not appear as a stray top-level
  row.
- Existing `test/llm-insights.test.js` still passes; add store-level coverage
  for a 3-level tree (`subagent_session_count`, inclusive totals, row order)
  and for the dropped-intermediate-parent case.

## Open questions

- Is the flat detail breakdown acceptable long-term, or do we want a nested
  presentation later?
- For C, prefer the skeleton-entry approach or re-parenting orphans to the
  nearest surviving ancestor?
