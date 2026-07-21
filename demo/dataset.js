'use strict';

/*
 * Authored demo dataset.
 *
 * Data only — no generation logic. `demo/transcripts.js` turns this spec into
 * provider-shaped JSONL fixtures, which `demo/build.js` then feeds through the
 * real parsers, Pricing, and Store. Everything here is fictitious: projects,
 * file paths, Human request prompts, and assistant text.
 *
 * Session spec fields:
 *   key          stable seed for deterministic ids/randomness
 *   source       'claude-code' | 'codex'
 *   project      key into PROJECTS
 *   dayOffset    days before the build anchor day (0 = anchor day)
 *   startHour    local hour the Session starts
 *   model        default model for its LLM calls
 *   smallModel   optional cheap model periodically interleaved (Claude Code)
 *   requests     Human requests, in order
 *   subagents    child Sessions spawned by this one
 *
 * Human request spec fields:
 *   text         the full Human request prompt
 *   calls        number of billed LLM calls it triggered (0 = interrupted)
 *   model        optional per-request model override (mid-Session switch)
 *   spike        optional cost-driver shape for the request's last LLM call:
 *                'context' | 'output' | 'cache-write' | 'low-cache' |
 *                'tool-dump' | 'reasoning'
 */

const PROJECTS = {
  'atlas-checkout': {
    cwd: '/Users/demo/work/atlas-checkout',
    files: [
      'src/checkout/session.ts',
      'src/checkout/totals.ts',
      'src/payments/stripe-adapter.ts',
      'src/payments/retry-policy.ts',
      'src/api/routes/checkout.ts',
      'test/checkout/totals.test.ts',
      'test/payments/retry-policy.test.ts',
    ],
    commands: ['npm test -- checkout', 'npx tsc --noEmit', 'npm run lint', 'git diff --stat'],
    notes: [
      'The checkout session is created before the cart is priced, so the tax line is written twice.',
      'Retry policy currently treats a 409 as retryable, which double-charges on idempotency-key reuse.',
      'Totals are recomputed on every mutation instead of on commit; that is the source of the drift.',
      'Added a guard so the adapter refuses to submit when the idempotency key is missing.',
      'Tests pass locally: 84 passing, 0 failing.',
    ],
  },
  'sentinel-gateway': {
    cwd: '/Users/demo/work/sentinel-gateway',
    files: [
      'internal/auth/token.go',
      'internal/auth/refresh.go',
      'internal/proxy/router.go',
      'internal/ratelimit/bucket.go',
      'cmd/gateway/main.go',
      'internal/auth/token_test.go',
    ],
    commands: ['go test ./internal/...', 'go vet ./...', 'go build ./cmd/gateway', 'rg -n "RefreshToken"'],
    notes: [
      'Refresh tokens are validated against the wrong clock skew window, so early refreshes get rejected.',
      'The router rebuilds its match table per request; caching it removes most of the p99 tail.',
      'Rate-limit buckets are keyed by IP only, so a shared NAT starves legitimate tenants.',
      'Added a table-driven test covering skew boundaries at -30s, 0s, and +30s.',
    ],
  },
  'pixel-forge': {
    cwd: '/Users/demo/work/pixel-forge',
    files: [
      'src/components/Button.svelte',
      'src/components/DataGrid.svelte',
      'src/tokens/color.css',
      'src/tokens/spacing.css',
      'docs/components/data-grid.md',
    ],
    commands: ['npm run build', 'npm run test:a11y', 'npx vitest run', 'npm run storybook -- --ci'],
    notes: [
      'The focus ring is drawn with an outline the token system cannot theme; moving it to box-shadow fixes it.',
      'DataGrid re-sorts on every keystroke because the filter input is not debounced.',
      'Contrast on the muted foreground token is 3.9:1 in light mode, below the 4.5:1 target.',
      'Extracted the row renderer so virtualization can be added without touching the public props.',
    ],
  },
  'lumen-docs': {
    cwd: '/Users/demo/work/lumen-docs',
    files: [
      'content/guides/getting-started.md',
      'content/reference/config.md',
      'src/search/index.ts',
      'astro.config.mjs',
    ],
    commands: ['npm run build', 'npm run check:links', 'rg -n "TODO" content/'],
    notes: [
      'The getting-started guide still references the removed `--legacy` flag in three places.',
      'Search indexes headings but not code blocks, so API symbols are unfindable.',
      'Rewrote the configuration reference around the four options people actually change.',
    ],
  },
  'quartz-etl': {
    cwd: '/Users/demo/work/quartz-etl',
    files: [
      'pipelines/ingest/events.py',
      'pipelines/transform/sessionize.py',
      'pipelines/load/warehouse.py',
      'pipelines/common/schema.py',
      'tests/test_sessionize.py',
    ],
    commands: ['pytest tests/ -q', 'ruff check pipelines', 'python -m pipelines.ingest.events --dry-run'],
    notes: [
      'Sessionization uses a 30 minute gap but the upstream clock is in UTC+2, so sessions split at midnight.',
      'The warehouse loader opens a connection per batch; pooling cuts the run from 41 to 9 minutes.',
      'Schema drift is silently coerced to strings, which is why the revenue column is unusable downstream.',
      'Backfill for the last 30 days completed: 12.4M rows, 0 rejects.',
    ],
  },
  'northwind-crm': {
    cwd: '/Users/demo/work/northwind-crm',
    files: [
      'app/models/contact.rb',
      'app/services/dedupe.rb',
      'app/controllers/pipeline_controller.rb',
      'app/jobs/import_job.rb',
      'spec/services/dedupe_spec.rb',
    ],
    commands: ['bundle exec rspec', 'bundle exec rubocop', 'rails db:migrate:status'],
    notes: [
      'Dedupe matches on normalized email only, so the same person with two work addresses stays split.',
      'The import job holds a transaction open for the whole file, which is why large imports time out.',
      'Pipeline stage totals are computed in Ruby instead of SQL; that is the slow query in the trace.',
      'Added a merge audit row so a bad dedupe can be reversed.',
    ],
  },
};

const SESSIONS = [
  /* ---------------------------------------------------------------- Claude Code */
  {
    key: 'atlas-flagship',
    source: 'claude-code',
    project: 'atlas-checkout',
    dayOffset: 1,
    startHour: 8,
    model: 'claude-opus-4-8',
    smallModel: 'claude-haiku-4-5',
    requests: [
      { text: 'Customers on the annual plan are occasionally charged twice when they retry a failed checkout. Find out why.', calls: 7 },
      { text: 'Show me every place the idempotency key is read or written.', calls: 3 },
      { text: 'Walk the whole payments module and summarise the retry semantics — I want the full picture before we change anything.', calls: 6, spike: 'context' },
      { text: 'Write a failing test that reproduces the double charge.', calls: 4 },
      { text: 'Now fix it, but keep the public adapter signature stable.', calls: 6, spike: 'tool-dump' },
      { text: 'wait, stop', calls: 0 },
      { text: 'Draft the migration notes for the retry policy change, long form, for the release doc.', calls: 5, spike: 'output' },
      { text: 'Run the checkout suite and the type check.', calls: 4 },
      { text: 'Explain the totals drift in plain language for the support team.', calls: 2, model: 'claude-sonnet-4-5' },
      { text: 'Add regression coverage around the 409 handling.', calls: 5 },
      { text: 'Re-read the changed files from scratch and tell me what I missed.', calls: 6, spike: 'low-cache' },
      { text: 'Summarise the whole change as a PR description.', calls: 5, spike: 'cache-write' },
    ],
    subagents: [
      {
        key: 'atlas-flagship-explore',
        agentType: 'Explore',
        description: 'Map the payments retry surface',
        model: 'claude-haiku-4-5',
        requests: [
          { text: 'Find every caller of the retry policy and every place a payment intent is submitted. Report file:line only.', calls: 5 },
        ],
      },
      {
        key: 'atlas-flagship-review',
        agentType: 'general-purpose',
        description: 'Adversarially review the retry fix',
        model: 'claude-opus-4-8',
        requests: [
          { text: 'Try to refute the claim that the 409 guard fully prevents the double charge. Default to refuted if uncertain.', calls: 6, spike: 'context' },
        ],
      },
      {
        key: 'atlas-flagship-tests',
        agentType: 'general-purpose',
        description: 'Extend regression coverage',
        model: 'claude-sonnet-4-5',
        requests: [
          { text: 'Add cases for idempotency-key reuse across the retry boundary and report what still fails.', calls: 7, spike: 'output' },
        ],
      },
    ],
  },
  {
    key: 'sentinel-refresh',
    source: 'claude-code',
    project: 'sentinel-gateway',
    dayOffset: 8,
    startHour: 14,
    model: 'claude-opus-4-8',
    smallModel: 'claude-haiku-4-5',
    requests: [
      { text: 'Refresh tokens issued in the last minute are being rejected. Diagnose it.', calls: 5 },
      { text: 'Show me the clock-skew handling end to end.', calls: 3 },
      { text: 'Fix the skew window and add a table-driven test.', calls: 5, spike: 'tool-dump' },
      { text: 'Is the rate limiter keyed correctly for multi-tenant traffic?', calls: 3 },
      { text: 'Run go vet and the auth tests.', calls: 2 },
    ],
    subagents: [
      {
        key: 'sentinel-refresh-audit',
        agentType: 'general-purpose',
        description: 'Audit the auth package for time handling',
        model: 'claude-sonnet-4-5',
        requests: [
          { text: 'Audit every use of time.Now in the auth package and flag anything not injected through the clock interface.', calls: 6, spike: 'low-cache' },
        ],
      },
    ],
  },
  {
    key: 'pixel-a11y',
    source: 'claude-code',
    project: 'pixel-forge',
    dayOffset: 3,
    startHour: 10,
    model: 'claude-sonnet-4-5',
    smallModel: 'claude-haiku-4-5',
    requests: [
      { text: 'The focus ring disappears in dark mode on the primary button. Why?', calls: 4 },
      { text: 'Move it to a themeable token and keep the 2px offset.', calls: 4 },
      { text: 'Check the muted foreground contrast in both themes.', calls: 3 },
      { text: 'Run the a11y suite and the build.', calls: 2 },
    ],
  },
  {
    key: 'lumen-rewrite',
    source: 'claude-code',
    project: 'lumen-docs',
    dayOffset: 6,
    startHour: 16,
    model: 'claude-haiku-4-5',
    smallModel: 'claude-haiku-4-5',
    requests: [
      { text: 'The getting-started guide mentions a flag we removed two releases ago. Find every stale reference.', calls: 3 },
      { text: 'actually let me look at it first', calls: 0 },
      { text: 'Rewrite the configuration reference around the four options people actually change.', calls: 5, model: 'claude-sonnet-4-5', spike: 'output' },
    ],
  },
  {
    key: 'northwind-dedupe',
    source: 'claude-code',
    project: 'northwind-crm',
    dayOffset: 9,
    startHour: 11,
    model: 'claude-opus-4-8',
    smallModel: 'claude-haiku-4-5',
    requests: [
      { text: 'Duplicate contacts keep reappearing after every import. Trace how dedupe decides a match.', calls: 5 },
      { text: 'What happens when the same person has two work addresses?', calls: 3 },
      { text: 'Propose a matching strategy that survives that case, but do not write code yet.', calls: 4 },
      { text: 'Alright, implement it with a reversible merge audit row.', calls: 5, spike: 'cache-write' },
      { text: 'Why does the import job time out on files over 50k rows?', calls: 2 },
      { text: 'Run the dedupe specs.', calls: 2 },
    ],
    subagents: [
      {
        key: 'northwind-dedupe-scout',
        agentType: 'Explore',
        description: 'Locate every dedupe entry point',
        model: 'claude-haiku-4-5',
        requests: [
          { text: 'Find all call sites of the dedupe service including background jobs and rake tasks.', calls: 4 },
        ],
      },
    ],
  },
  {
    key: 'quartz-sessionize',
    source: 'claude-code',
    project: 'quartz-etl',
    dayOffset: 14,
    startHour: 9,
    model: 'claude-sonnet-4-5',
    requests: [
      { text: 'Sessions are splitting at midnight for European users. Find the timezone assumption.', calls: 4 },
      { text: 'Fix it and add a test at the UTC+2 boundary.', calls: 3 },
      { text: 'Run pytest and ruff.', calls: 2 },
    ],
  },
  {
    key: 'atlas-totals',
    source: 'claude-code',
    project: 'atlas-checkout',
    dayOffset: 21,
    startHour: 13,
    model: 'claude-sonnet-4-5',
    smallModel: 'claude-haiku-4-5',
    requests: [
      { text: 'Order totals drift by a cent on multi-currency carts. Where does the rounding happen?', calls: 4 },
      { text: 'Move rounding to commit time only.', calls: 5, spike: 'tool-dump' },
      { text: 'Add a property test over random cart shapes.', calls: 3 },
      { text: 'Run the suite.', calls: 2 },
    ],
  },

  /* ---------------------------------------------------------------------- Codex */
  {
    key: 'quartz-warehouse',
    source: 'codex',
    project: 'quartz-etl',
    dayOffset: 0,
    startHour: 9,
    model: 'gpt-5.1-codex',
    requests: [
      { text: 'The nightly load takes 41 minutes. Profile it and tell me where the time goes.', calls: 5 },
      { text: 'Pool the warehouse connections instead of opening one per batch.', calls: 5, spike: 'reasoning' },
      { text: 'Think hard about whether pooling can reorder writes across batches.', calls: 6, spike: 'context' },
      { text: 'Add a regression test that fails if a connection is opened inside the batch loop.', calls: 4 },
      { text: 'Schema drift is being coerced to strings. Make that loud instead.', calls: 5, spike: 'output' },
      { text: 'Run the full test suite and the dry-run ingest.', calls: 3 },
    ],
    subagents: [
      {
        key: 'quartz-warehouse-spawn',
        agentType: 'thread_spawn',
        nickname: 'Ledger',
        role: 'reviewer',
        depth: 1,
        model: 'gpt-5.1-codex',
        requests: [
          { text: 'Review the connection pooling change for write-ordering hazards and report concrete failure scenarios.', calls: 6, spike: 'reasoning' },
        ],
      },
    ],
  },
  {
    key: 'atlas-codex-adapter',
    source: 'codex',
    project: 'atlas-checkout',
    dayOffset: 2,
    startHour: 15,
    model: 'gpt-5.1-codex',
    requests: [
      { text: 'Port the Stripe adapter to the new payment intents API without changing our public interface.', calls: 5 },
      { text: 'What breaks for callers that still pass a raw token?', calls: 3 },
      { text: 'Keep a compatibility shim for one release and deprecate it loudly.', calls: 5, spike: 'low-cache' },
      { text: 'Type check and run the payments tests.', calls: 3, model: 'gpt-5' },
      { text: 'Summarise the migration for the changelog.', calls: 2, model: 'gpt-5' },
    ],
  },
  {
    key: 'northwind-pipeline',
    source: 'codex',
    project: 'northwind-crm',
    dayOffset: 5,
    startHour: 12,
    model: 'gpt-5.1-codex',
    requests: [
      { text: 'The pipeline stage totals query shows up in every slow trace. Move the aggregation into SQL.', calls: 4 },
      { text: 'Verify the numbers match the Ruby implementation for the seeded dataset.', calls: 3 },
      { text: 'Add an index if the plan still does a sequential scan.', calls: 5, spike: 'reasoning' },
      { text: 'Run rspec.', calls: 2 },
    ],
  },
  {
    key: 'sentinel-router',
    source: 'codex',
    project: 'sentinel-gateway',
    dayOffset: 11,
    startHour: 10,
    model: 'gpt-5.1-codex',
    requests: [
      { text: 'p99 latency doubled after the last deploy. The router rebuilds its match table per request — confirm or refute that.', calls: 5, spike: 'context' },
      { text: 'Cache the compiled table and invalidate it on config reload only.', calls: 4 },
      { text: 'Benchmark before and after.', calls: 2 },
    ],
    subagents: [
      {
        key: 'sentinel-router-guardian',
        agentType: 'other',
        other: 'guardian',
        model: 'gpt-5.1-codex',
        requests: [
          { text: 'Check the cached routing table change for stale-config hazards during rolling restarts.', calls: 5 },
        ],
      },
    ],
  },
  {
    key: 'pixel-grid',
    source: 'codex',
    project: 'pixel-forge',
    dayOffset: 18,
    startHour: 17,
    model: 'gpt-5',
    requests: [
      { text: 'DataGrid re-sorts on every keystroke. Debounce the filter without changing the public props.', calls: 3 },
      { text: 'Extract the row renderer so we can virtualize later.', calls: 3 },
      { text: 'Run vitest.', calls: 2 },
    ],
  },
  {
    key: 'lumen-search',
    source: 'codex',
    project: 'lumen-docs',
    dayOffset: 26,
    startHour: 11,
    model: 'gpt-5',
    requests: [
      { text: 'Search cannot find API symbols because code blocks are not indexed. Fix the indexer.', calls: 4 },
      { text: 'Rebuild the site and check the links.', calls: 2 },
    ],
  },

  /* --------------------------------------- shorter Sessions, for daily coverage */
  {
    key: 'pixel-tokens',
    source: 'claude-code',
    project: 'pixel-forge',
    dayOffset: 4,
    startHour: 15,
    model: 'claude-sonnet-4-5',
    requests: [
      { text: 'Split the spacing scale so the grid can use half steps.', calls: 4 },
      { text: 'Update the docs table to match.', calls: 3 },
    ],
  },
  {
    key: 'quartz-schema',
    source: 'codex',
    project: 'quartz-etl',
    dayOffset: 7,
    startHour: 10,
    model: 'gpt-5.1-codex',
    requests: [
      { text: 'Make the schema contract explicit and fail the run on unexpected columns.', calls: 5, spike: 'reasoning' },
      { text: 'Run pytest.', calls: 2 },
    ],
  },
  {
    key: 'sentinel-limits',
    source: 'claude-code',
    project: 'sentinel-gateway',
    dayOffset: 10,
    startHour: 9,
    model: 'claude-sonnet-4-5',
    smallModel: 'claude-haiku-4-5',
    requests: [
      { text: 'Key rate-limit buckets by tenant instead of IP.', calls: 5 },
      { text: 'Add a test for shared-NAT traffic.', calls: 3 },
      { text: 'go test ./internal/...', calls: 2 },
    ],
  },
  {
    key: 'northwind-import',
    source: 'claude-code',
    project: 'northwind-crm',
    dayOffset: 13,
    startHour: 16,
    model: 'claude-sonnet-4-5',
    requests: [
      { text: 'Chunk the import job so the transaction is not held open for the whole file.', calls: 5, spike: 'tool-dump' },
      { text: 'Run the import specs.', calls: 2 },
    ],
  },
  {
    key: 'atlas-currency',
    source: 'codex',
    project: 'atlas-checkout',
    dayOffset: 16,
    startHour: 14,
    model: 'gpt-5.1-codex',
    requests: [
      { text: 'Add minor-unit handling for zero-decimal currencies in the totals module.', calls: 4 },
      { text: 'Cover JPY and KRW in the tests.', calls: 3 },
    ],
  },
  {
    key: 'lumen-nav',
    source: 'claude-code',
    project: 'lumen-docs',
    dayOffset: 19,
    startHour: 12,
    model: 'claude-haiku-4-5',
    requests: [
      { text: 'Reorder the guides sidebar so the install steps come before the concepts.', calls: 3 },
      { text: 'Build and check for broken links.', calls: 2 },
    ],
  },
  {
    key: 'quartz-backfill',
    source: 'codex',
    project: 'quartz-etl',
    dayOffset: 23,
    startHour: 8,
    model: 'gpt-5.1-codex',
    requests: [
      { text: 'Plan a 30 day backfill that can be resumed if it dies halfway.', calls: 5, spike: 'context' },
      { text: 'Dry run it.', calls: 2 },
    ],
  },
  {
    key: 'pixel-button',
    source: 'claude-code',
    project: 'pixel-forge',
    dayOffset: 28,
    startHour: 17,
    model: 'claude-sonnet-4-5',
    requests: [
      { text: 'The loading state on Button shifts the label by a pixel. Fix it without a fixed width.', calls: 4 },
      { text: 'Run the visual tests.', calls: 2 },
    ],
  },
];

module.exports = { PROJECTS, SESSIONS };
