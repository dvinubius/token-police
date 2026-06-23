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
- Human request table.

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
- Full Human request text.
- Request-level totals.
- LLM calls table.
- Note explaining high-cost call emphasis.

Primary actions:

- Close dialog.
- Inspect per-call model, time, context, cache, token buckets, and Estimated cost.

## Data Hierarchy

```text
Summary
  Totals
  Daily buckets
  Top Sessions

Session
  Metadata
  Totals
  Human requests
    Aggregated token buckets
    Aggregated Estimated cost
    LLM calls
      Model
      Timestamp
      Token buckets
      Context metrics
      Estimated cost
```

