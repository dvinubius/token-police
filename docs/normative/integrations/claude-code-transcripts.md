# Claude Code Transcript Files

## Role And Direction

- External system: Claude Code
- Direction: inbound local-file dependency
- Purpose: import local Claude Code transcripts into normalized Sessions,
  Human requests, LLM calls, and Token buckets.
- Code entry points: `server.js`, `src/watcher.js`, `src/parseClaude.js`,
  `src/parseShared.js`

## Authoritative References

- [Claude Code session storage](https://code.claude.com/docs/en/sessions)
- [Claude Code application data](https://code.claude.com/docs/en/claude-directory)

The upstream documentation guarantees the JSONL location and broad record
contents, but not a stable schema for every field consumed here. Parser tests
therefore capture the supported observed shapes.

## Used Contract Surface

- Operations, endpoints, events, or resources: recursively read
  `~/.claude/projects/**/*.jsonl` and react to file add, change, and unlink.
- Data consumed: record `type`, `timestamp`, `cwd`, `sessionId`, `isSidechain`,
  agent attribution fields, user `message.content`, assistant `message.id`,
  `message.model`, `message.stop_reason`, content blocks, and
  `message.usage` token fields.
- Data produced: none; transcript files are read-only inputs.
- Internal mapping: one file becomes one Session; genuine user records become
  Human requests; assistant messages with usage become LLM calls; Anthropic
  usage maps directly to the four disjoint Token buckets.
- Ignored provider data: unknown record fields and record types; meta/tool-result
  user records do not create Human requests; malformed lines are skipped.

## Compatibility And Validation

- Required and optional data: a file may omit metadata or contain no billable
  calls; assistant usage is required to emit an LLM call.
- Unknown-field behavior: ignored.
- Version compatibility: compatibility is shape-based rather than tied to a
  Claude Code version. Newly observed shapes require parser evidence.
- Validation boundary: `timestampedJsonlRecords()` parses lines defensively;
  `parseClaudeFile()` normalizes accepted fields; `Store.upsertFromFile()` drops
  Sessions with no LLM calls and catches file-level parse failures.

## Operational Behavior

- Authentication and transport: local filesystem only; no credentials or
  transcript content are sent to Claude Code or Anthropic.
- Timeouts and retries: initial scan is synchronous; active changes use
  chokidar write stabilization plus a 250 ms per-file debounce. Missing source
  directories are polled every five seconds.
- Rate limits and idempotency: none; upsert replaces the in-memory Session for
  the file and duplicate streamed assistant records are merged by message id.
- Failure translation and recovery: malformed JSONL lines are skipped. Read or
  parse failures are logged and do not crash the server.

## Verification

- Contract tests or fixtures: `test/llm-insights.test.js`
- Manual or external verification: run against a current local Claude Code
  transcript and compare imported Human requests and LLM calls with the JSONL.
