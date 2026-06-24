# Information Architecture

## Top Level

Token Police has two primary pages controlled by the top navigation:

- Stats
- Sessions

The current frontend uses hash navigation:

- `#stats`
- `#sessions`

## Stats Page

Purpose: provide overall usage context and entry points into expensive Sessions.

Primary regions:

- Global metrics.
- Daily token usage for the last 30 days.
- Top 5 expensive Sessions.

Primary actions:

- Switch to Sessions.
- Select a top Session, which opens the Sessions page and loads that Session detail.

## Sessions Page

Purpose: filter and inspect individual Sessions.

Primary regions:

- Filter bar.
- Filtered Session list.
- List metadata.
- Session detail pane.
- Initial session prompt.
- Human request table.
- Sortable Human request table headers for time, LLM calls, token buckets, Total tokens, and Estimated cost.

Primary actions:

- Search by title or project.
- Filter by source.
- Filter by project.
- Filter by date range.
- Clear filters.
- Select a Session.
- Open a Human request's LLM call dialog.

## LLM Call Dialog

Purpose: inspect the individual LLM calls triggered by one Human request.

Primary regions:

- Dialog heading.
- Model summary.
- Request prompt.
- Request-level totals.
- Fixed-layout LLM calls table.
- Expandable LLM call insight sections.
- Sortable LLM call table headers for time, token buckets, Total tokens, and Estimated cost.
- Note explaining high-cost row emphasis.

Primary actions:

- Close dialog.
- Sort LLM calls.
- Expand or collapse an LLM call.
- Inspect per-call time, context, cache, token buckets, Estimated cost, activity, assistant preview, and outcome.
- Inspect high-cost-only cost driver and tool/command hints.

## Data Hierarchy

```text
Summary
  Totals
  Daily buckets
  Top Sessions

Session
  Metadata
  Initial session prompt
  Totals
  Human requests
    Request prompt
    Aggregated token buckets
    Aggregated Total tokens
    Aggregated Estimated cost
    LLM calls
      Model summary
      Timestamp
      Token buckets
      Total tokens
      Context metrics
      Estimated cost
      Activity summary
      Assistant preview
      Outcome
      High-cost cost driver
      High-cost tool/command hint
```
