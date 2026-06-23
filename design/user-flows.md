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
2. Detail pane loads Session metadata and totals.
3. Human requests appear newest first.
4. User scans token buckets, context, LLM call count, and Estimated cost per Human request.

## Inspect LLM Calls For A Human Request

1. User clicks or keyboard-activates a Human request row.
2. Dialog opens.
3. Full Human request text appears above request-level totals.
4. Individual LLM calls appear newest first.
5. High-cost LLM calls receive a distinct emphasis.
6. User closes the dialog by close button, backdrop click, or Escape.

## Empty Or No-Match Flow

1. User opens the app before any Sessions are imported, or filters remove all matches.
2. Stats and list regions show empty states rather than broken layout.
3. User can clear filters or wait for local watcher updates.

