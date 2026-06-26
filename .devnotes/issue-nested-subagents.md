# Issue: Nested subagent sessions — deep rows unreachable, intermediate cost understated, and orphaned descendants undercounted

Relates to: `.devnotes/prd-nested-subagents.md` (scope A + C)

## Summary

When a session tree is deeper than one subagent level (Root → Subagent A →
Subagent B), the store aggregates correctly but two things go wrong:

- **A — UI reachability:** the dashboard cannot navigate to depth-2+ rows, and
  an intermediate subagent that has its own subagents reports only its own
  tokens. Headline/root totals are unaffected — this is unreachable/mislabeled
  data, not a wrong number.
- **C — orphan-aware rollup:** if an intermediate parent file is dropped (no
  billable calls), its child detaches from the true root and its tokens stop
  rolling up. This is the one case where a number is actually wrong.

## Part A — UI reachability

### Reproduction

1. Have (or fixture) a session set where a subagent A (parent = root R) is
   itself the `parent_session_id` of a subagent B — e.g. a Codex transcript
   with `source.subagent.thread_spawn.depth = 2`.
2. Open the dashboard session list; expand root R.
3. Observe: A appears, but A has no expand chevron, so B is never shown.
4. Open A's detail: only A's own tokens are shown; B is omitted.

### Root cause (code references)

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
`src/store.js:182`, `:194`) and needs no change for Part A.

### Acceptance criteria

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
      (Codex). Claude depth-1 collapse is accepted (Option B, out of scope).
- [ ] Root inclusive totals, global summary, and single-level subagent display
      are unchanged (no regression).

## Part C — orphan-aware rollup

### Reproduction

1. Fixture a 3-level tree R → A → B where intermediate parent A has **no
   billable LLM calls** (so it is dropped at `src/store.js:99`).
2. List sessions.
3. Observe: B's `parent_session_id` no longer resolves to a stored session, so
   B is promoted to a top-level row (`src/store.js:259`); B's tokens are not
   included in R's inclusive totals.

### Root cause (code references)

- Empty sessions are removed entirely at upsert — `src/store.js:99` — so the
  dropped parent's `parent_session_id` link is gone by the time `_childMap`
  builds the tree (`src/store.js:168`).
- The root filter then treats the orphaned child as a root —
  `src/store.js:259`.

### Approach

Either retain a lightweight skeleton entry (parent link + zero totals) for a
dropped intermediate parent so `_childMap` can still bridge, or re-parent
orphans to their nearest surviving ancestor at tree-build time. (Approach
choice is an open question in the PRD.)

### Acceptance criteria

- [ ] When an intermediate parent is dropped, its descendants' tokens still roll
      into the true root's inclusive totals.
- [ ] The orphaned descendant does not surface as a stray top-level row.
- [ ] Sessions with no dropped intermediate parents are unchanged (no
      regression); the global summary is unchanged.

## Tests

- [ ] Add a 3-level Codex fixture (R → A → B) and assert in a store test:
      `listSessions` emits all three rows in pre-order, A's
      `subagent_session_count === 1`, A's inclusive totals === A+B, R's
      inclusive totals === R+A+B. (Part A)
- [ ] Add a store test where intermediate parent A is dropped (no billable
      calls): R's inclusive totals still === R+B, and B is not a top-level row.
      (Part C)
- [ ] `npm test` (`test/llm-insights.test.js`) stays green.

## Out of scope (see PRD)

- Claude parser depth/immediate-parent derivation (Option B).
- Nested (vs. flat) detail breakdown presentation.
