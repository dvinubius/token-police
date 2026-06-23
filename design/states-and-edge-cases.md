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
| Clear filters | Reset filter controls and list state. |

## Selection States

| State | Expected behavior |
|---|---|
| No selected Session | Detail pane shows empty state. |
| Selected Session | Row and detail pane reflect selection. |
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
| Very long Human request | Preview in table, show full text in dialog with internal scrolling. |
| Large token counts | Use compact numbers in summaries and full numbers in tables/tooltips where useful. |

## Desktop-Only Edge Cases

| Edge case | Expected behavior |
|---|---|
| Narrow desktop window | Maintain usable navigation and internal scrolling. |
| Wide desktop window | Preserve readable line lengths and table scannability. |
| Large tables | Use sticky headers and internal scroll regions where appropriate. |
| Keyboard-only user | Keep tab order, focus, row activation, and dialog close behavior reliable. |

