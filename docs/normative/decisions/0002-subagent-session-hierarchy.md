# 0002 — Subagent Sessions are child activity of parent Sessions

- Status: accepted
- Date: 2026-06-26

## Context

Codex and Claude Code can spawn subagent Sessions while handling a human-driven
Session. The transcript files for these subagents are valid Sessions with their
own LLM calls and token usage, but displaying them as ordinary top-level
Sessions makes delegated activity look human-driven. Their detail tables also
used the "Human request" label, which is inaccurate for delegated subagent
work.

Parent Session totals were also ambiguous. The global dashboard should count
each imported transcript exactly once, but a user inspecting a human-driven
Session expects to see the total token usage caused by that Session, including
subagent work.

## Decision

Parser output preserves subagent relationship metadata from source transcripts:
Codex uses `session_meta` fields such as `thread_source`,
`source.subagent.thread_spawn`, and parent thread id when present; Claude Code
uses sidechain records and shared `sessionId` values. `Store` uses that
metadata to group subagent Sessions under their parent in list/detail
projections.

Subagent Sessions remain selectable and inspectable. Parent Session detail
projections expose inclusive totals for the main Session plus subagent
Sessions, along with the main-agent-only and per-subagent breakdown. Global
summary totals continue to count raw imported Sessions once and do not replace
raw totals with parent-inclusive totals.

## Consequences

- The Sessions list can show spawned subagents immediately below their parent
  when the parent row is expanded, while preserving direct inspection of each
  subagent Session.
- Parent Session detail can answer both "how much did this human Session cost
  in total?" and "how much came from the main agent vs each subagent?"
- Global totals and daily charts avoid double-counting by staying based on raw
  transcript Sessions.
- Subagents without a parent id can be labeled as subagents but cannot always be
  grouped under a parent.
