# Codex CLI Session Files

## Role And Direction

- External system: Codex CLI
- Direction: inbound local-file dependency
- Purpose: import local Codex session logs into normalized Sessions, Human
  requests, LLM calls, subagent relationships, activity, and Token buckets.
- Code entry points: `server.js`, `src/watcher.js`, `src/parseCodex.js`,
  `src/parseShared.js`

## Authoritative References

- [Codex repository](https://github.com/openai/codex)
- [Codex app-server protocol](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)

The app-server protocol is related but not identical to persisted rollout
files. The upstream repository and local parser fixtures are the available
compatibility evidence for the persisted JSONL shapes consumed here.

## Used Contract Surface

- Operations, endpoints, events, or resources: recursively read
  `~/.codex/sessions/**/*.jsonl` and react to file add, change, and unlink.
- Data consumed: top-level `timestamp` and `type`; `session_meta` identifiers,
  working directory, source/thread/subagent metadata; `turn_context.model`;
  `event_msg` payloads including `user_message`, `turn_aborted`,
  `token_count`, tool/command activity, and assistant/reasoning text; and
  `response_item` activity records.
- Data produced: none; session files are read-only inputs.
- Internal mapping: one file becomes one Session; non-injected user messages
  become Human requests; changed cumulative token totals become LLM calls;
  cached input is subtracted from input to form disjoint fresh-input and
  cache-read buckets.
- Ignored provider data: injected environment/instruction messages, rate-limit
  token pings without usage, unchanged cumulative totals, unknown fields, and
  unsupported event types.

## Compatibility And Validation

- Required and optional data: `token_count.info.total_token_usage` is required
  to emit an LLM call. `last_token_usage` is preferred; the parser subtracts
  the previous cumulative total when it is absent.
- Unknown-field behavior: ignored.
- Version compatibility: compatibility is shape-based rather than tied to a
  Codex CLI version. Persisted rollout JSONL is treated as an evolving internal
  format and requires fixture updates when shapes change.
- Validation boundary: `timestampedJsonlRecords()` parses lines defensively;
  `parseCodexFile()` filters and normalizes accepted events;
  `Store.upsertFromFile()` drops Sessions with no LLM calls and catches
  file-level parse failures.

## Operational Behavior

- Authentication and transport: local filesystem only; no credentials or
  transcript content are sent to Codex or OpenAI.
- Timeouts and retries: initial scan is synchronous; active changes use
  chokidar write stabilization plus a 250 ms per-file debounce. Missing source
  directories are polled every five seconds.
- Rate limits and idempotency: rate-limit pings are ignored; cumulative usage
  must change before a new LLM call is emitted; upsert replaces the in-memory
  Session for the file.
- Failure translation and recovery: malformed JSONL lines are skipped. Read or
  parse failures are logged and do not crash the server.

## Verification

- Contract tests or fixtures: `test/llm-insights.test.js`
- Manual or external verification: run against a current local Codex rollout
  and compare imported Human requests, model changes, subagent metadata, and
  Token buckets with the JSONL.
