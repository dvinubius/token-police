# Decisions

## Decision Index

| Decision | Status | Summary |
|---|---|---|
| `0001-human-requests-first-class.md` | accepted | Parsers emit Human requests independently of LLM calls so zero-call requests render; Claude interrupt markers are excluded from request indexing. |
| `0002-subagent-session-hierarchy.md` | accepted | Subagent Sessions remain inspectable but are grouped under parent Sessions, with parent-inclusive detail totals kept separate from global raw transcript totals. |
| `0003-parser-duplication-over-shared-driver.md` | accepted | The ~8-line loop scaffold shared by the Claude and Codex parsers is kept duplicated; a shared record-iteration driver is rejected to avoid coupling two intentionally independent format parsers. |
