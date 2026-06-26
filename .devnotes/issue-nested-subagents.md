# Issue: Deep subagent rows are unreachable and intermediate subagents understate cost

Relates to: `.devnotes/prd-nested-subagents.md` (Option A — UI reachability)

## Summary

When a session tree is deeper than one subagent level (Root → Subagent A →
Subagent B), the store aggregates correctly but the dashboard cannot navigate
to depth-2+ rows, and an intermediate subagent that has its own subagents
reports only its own tokens. Headline/root totals are unaffected.

## Reproduction

1. Have (or fixture) a session set where a subagent A (parent = root R) is
   itself the `parent_session_id` of a subagent B — e.g. a Codex transcript
   with `source.subagent.thread_spawn.depth = 2`.
2. Open the dashboard session list; expand root R.
3. Observe: A appears, but A has no expand chevron, so B is never shown.
4. Open A's detail: only A's own tokens are shown; B is omitted.

## Root cause (code references)

- Chevron rendered only for non-subagents — `public/app.js:138-140`
  (`sessionBadges` `else if`), and toggle/`has-subagents` wiring only when
  `!c.is_subagent` — `public/app.js:517`.
- `visibleSessionRows` requires the parent to be in `expandedSessionIds`,
  which an unchevroned subagent can never enter — `public/app.js:483`.
- `displayTotals` uses inclusive totals only when `!is_subagent` —
  `public/app.js:129`.
- `sessionStats` returns the simple block early for any subagent —
  `public/app.js:189`.

Store layer is already correct (`_descendants`/`_inclusiveTotals`,
`src/store.js:182`, `:194`) and needs no change for this issue.

## Acceptance criteria

- [ ] Any session row with `subagent_session_count > 0` renders an expand
      chevron and is toggleable, including rows where `is_subagent === true`.
- [ ] `displayTotals` returns inclusive totals for any row with
      `subagent_session_count > 0` (not gated on `!is_subagent`).
- [ ] `sessionStats` shows the Total / self / descendants breakdown for an
      intermediate subagent that has descendants; leaf subagents still show the
      simple block.
- [ ] The list sub-line advertises the descendant count for an expandable
      subagent (currently gated on `!is_subagent`, `public/app.js:524`).
- [ ] Nested indentation visually distinguishes B from A where depth is known
      (Codex). Claude depth-1 collapse is accepted (out of scope).
- [ ] Root inclusive totals, global summary, and single-level subagent display
      are unchanged (no regression).

## Tests

- [ ] Add a 3-level Codex fixture (R → A → B) and assert in a store test:
      `listSessions` emits all three rows in pre-order, A's
      `subagent_session_count === 1`, A's inclusive totals === A+B, R's
      inclusive totals === R+A+B.
- [ ] `npm test` (`test/llm-insights.test.js`) stays green.

## Out of scope (see PRD)

- Claude parser depth/immediate-parent derivation (Option B).
- Orphan-aware rollup when an intermediate parent file is dropped (Option C).
- Nested (vs. flat) detail breakdown presentation.
