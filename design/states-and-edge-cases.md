# States And Edge Cases

## App Data States

| State | Expected behavior |
|---|---|
| Initial load | Fetch Summary and Sessions, then render the current page. |
| Successful refresh | Update Summary, Sessions, filters, list, and selected detail if present. |
| Failed refresh | Keep existing rendered data if available and show offline refresh status. |
| No imported Sessions | Show zero/empty metrics and no-data list states without breaking layout. |
| New files detected | Data appears after watcher parses files and next refresh runs. |
| Deleted files detected | Removed Sessions disappear after watcher updates store and next refresh runs. |

## Filtering States

| State | Expected behavior |
|---|---|
| No filters | Show all Sessions sorted by last activity descending. |
| Search active | Match against Session title and project. |
| Source active | Show only selected source. |
| Project active | Show only selected project. |
| Date range active | Include Sessions with last activity inside the range. |
| No matches | Show no-matching-Sessions state and keep filters editable. |
| Filter changed | Reset the list window to the first page and return the list to the top. |
| Clear filters | Reset filter controls and list state. |

## Selection States

| State | Expected behavior |
|---|---|
| No selected Session | Detail pane shows empty state. |
| Selected Session | Row and detail pane reflect selection. |
| Parent Session with subagents collapsed | Show only the parent row; chevron points down. |
| Parent Session with subagents expanded | Show subagent rows directly below the parent; chevron points up. |
| Chevron activation | Toggle only the parent row's subagent visibility and do not rely on whole-row activation. |
| Selected subagent Session | Show a simple one-row stats block and subagent task language where applicable. |
| Selected Session removed | Detail fetch may fail; the UI should avoid crashing and allow another selection. |
| Auto-refresh during detail inspection | Preserve scroll position where possible. |
| Open dialog during refresh | Reopen the active Human request if it still exists. |

## Data Quality Edge Cases

| Edge case | Expected behavior |
|---|---|
| Missing or malformed timestamps | Display fallback date text instead of invalid date output. |
| Missing Human request text | Keep the row usable and show a neutral empty text state in the dialog. |
| Unknown model | Use backend-provided pricing/context fallback data where available. |
| Synthetic or zero-cost calls | Display zero Estimated cost without implying billing. |
| Few LLM calls in a request | Do not over-emphasize high-cost rows when there are too few calls to compare. |
| Very long Session title | Truncate in list and preserve access to fuller title in detail. |
| Very long initial Session prompt | Clamp in the Session detail prompt block while keeping readable line length. |
| Very long Human request | Preview in the Human request table, clamp to three lines in the dialog, and expose full text on hover. |
| Long assistant preview | Show a compact preview in expanded LLM call details and expose full text on hover. |
| Large token counts | Use compact numbers in summaries and tables, with exact full values in tooltips where useful. |
| Equal sort values | Preserve a stable order while toggling the requested sortable column. |
| Zero-cost rows | Do not mark rows as high-cost solely because they tie at zero Estimated cost. |

## Desktop-Only Edge Cases

| Edge case | Expected behavior |
|---|---|
| Narrow desktop window | Maintain usable navigation and internal scrolling. |
| Wide desktop window | Preserve readable line lengths and table scannability. |
| Large tables | Use sticky headers and internal scroll regions where appropriate. |
| Long Session list | Render an initial window and load more rows on scroll rather than all rows at once. |
| Mixed-width source badges | Keep Session-list chevron controls left-aligned so they visually line up across rows. |
| Parent Session stats with subagents | Keep Total, Main agent, and per-subagent values aligned in tabular columns without repeating metric labels below the Total row. |
| Simple Session stats | Use the same tabular stats treatment as parent Sessions, but with one labelled row. |
| Expanded LLM call row | Keep table headers and numeric columns stable; expanded content must not reflow the LLM call table. |
| Sorted tables | Keep sortable headers keyboard reachable and expose direction without disrupting row activation. |
| Keyboard-only user | Keep tab order, focus, row activation, and dialog close behavior reliable. |
