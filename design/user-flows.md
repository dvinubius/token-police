# User Flows

## Open And Monitor

1. User starts the app locally.
2. Browser opens the dashboard.
3. App loads Summary and Sessions from the local API.
4. Stats page shows aggregate metrics, daily usage, and top Sessions.
5. App refreshes data every 30 seconds.

## Find A Costly Session From Stats

1. User opens Stats.
2. User scans global metrics and top Sessions.
3. User selects a top Session.
4. App switches to Sessions.
5. Selected Session loads in the detail pane.
6. User inspects Human request totals.

## Filter Sessions

1. User opens Sessions.
2. User enters a search term, source, project, or date range.
3. Session list updates locally.
4. List metadata updates to show filtered count and filtered Estimated cost.
5. User clears filters when they want the full list again.

## Inspect A Session

1. User selects a Session row.
2. Detail pane loads Session metadata, the labelled Initial session prompt, and totals.
3. Human requests appear newest first.
4. User scans token buckets, context, LLM call count, Total tokens, and Estimated cost per Human request.
5. User sorts Time, LLM calls, token bucket, Total tokens, or Estimated cost columns when ranking Human requests.
6. Highest-cost Human requests are emphasized in red with a marker.

## Inspect A Session With Subagents

1. User finds a parent Session that shows a chevron below the source badge.
2. User activates the chevron to expand subagent rows.
3. Subagent Sessions appear directly below the parent row and remain selectable.
4. User selects the parent Session to inspect inclusive Total, Main agent, and per-subagent stats rows.
5. User selects a subagent Session to inspect that subagent as a simple one-row Session detail.
6. User scans the subagent detail using Subagent task labels.
7. User activates the chevron again to collapse the subagent rows without changing Session selection.

## Inspect LLM Calls For A Human Request Or Subagent Task

1. User clicks or keyboard-activates a Human request row or subagent task row.
2. Dialog opens 100px from the top of the viewport.
3. Request prompt appears above request-level totals, clamped to three lines with full text available on hover.
4. Individual LLM calls appear newest first.
5. User sorts Time, token bucket, Total tokens, or Estimated cost columns when ranking LLM calls.
6. User expands an LLM call to inspect Activity, Assistant preview, and Outcome.
7. User hovers Assistant preview when they need the full assistant text.
8. High-cost LLM calls receive a distinct row emphasis and expanded Cost driver plus Tool / command hint.
9. User closes the dialog by close button, backdrop click, or Escape.

## Empty Or No-Match Flow

1. User opens the app before any Sessions are imported, or filters remove all matches.
2. Stats and list regions show empty states rather than broken layout.
3. User can clear filters or wait for local watcher updates.
