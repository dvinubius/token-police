# UI Spec

## App Shell

Required elements:

- Product identity.
- Primary navigation with Stats and Sessions.
- Refresh status indicator.

Behavior:

- Stats is the default page unless the hash points to Sessions.
- Active navigation item reflects the current page.
- Refresh indicator shows live state after successful refresh and offline state after failed refresh.

## Stats Page

Required elements:

- Estimated cost metric.
- Total tokens metric.
- Sessions metric.
- LLM calls metric.
- Daily usage chart covering the last 30 local-calendar days.
- Source legend for daily usage.
- Top 5 expensive Sessions list.

Behavior:

- Metrics use local API Summary totals.
- Daily chart stacks source usage by day.
- Top Sessions are ordered by Estimated cost.
- At widths of 800px and above, each Top Session item uses one row ordered as source badge, Session title, project and token usage, then Estimated cost.
- Below 800px, each Top Session item keeps the compact two-row layout: Session title on the first row, then source badge, project, and token usage on the second row with visible spacing between the badge and project name.
- Selecting a top Session switches to Sessions and selects that Session.
- If there are no top Sessions, show a no-data state.

## Sessions Page

Required elements:

- Search input for Session title and project.
- Source filter.
- Project filter populated from loaded Sessions.
- From date filter.
- To date filter.
- Clear filters control.
- Filtered list metadata.
- Session list.
- Detail pane.

Behavior:

- Filtering is client-side against the currently loaded Sessions.
- Search matches Session title and project.
- Date filters apply to Session last activity.
- Clear filters resets all filter controls.
- Session rows show source, title, project, Human request count, LLM call count, total tokens, Estimated cost, and relative recency.
- Selected Session remains visually and programmatically distinct.
- The Session list renders an initial window of 20 rows and appends the next 20 as the user scrolls toward the end, until the filtered set is exhausted.
- List metadata reflects the full filtered set, independent of how many rows are currently windowed into view.
- Changing any filter resets the window to the first 20 rows and returns the list to the top; auto-refresh preserves the current window.

## Session Detail

Required elements:

- Session heading.
- `Initial session prompt` label.
- Initial session prompt text.
- Source, project, Human request count, LLM call count, date span.
- Total tokens.
- Fresh input tokens.
- Output tokens.
- Cache read tokens.
- Cache write tokens.
- Estimated cost.
- Human request table.

Behavior:

- Human requests display newest first.
- Human request numbering remains chronological.
- Each row opens the LLM Call Dialog.
- Initial session prompt text uses the same prompt text size as the Human request dialog and is capped to a readable 600px block.
- Detail scroll position should survive auto-refresh when possible.

## Human Request Table

Required columns:

- Human request number.
- Time.
- Human request preview.
- LLM calls.
- Context.
- Fresh input.
- Cache read.
- Cache write.
- Output.
- Total tokens.
- Estimated cost.

Behavior:

- Row activation supports pointer and keyboard.
- Long request text is previewed in the table; the full text remains available on hover.
- Visible token values use compact K/M/B formatting, with exact counts available in tooltips where useful.
- Time, LLM calls, Total tokens, Fresh input, Cache read, Cache write, Output, and Estimated cost are sortable.
- Highest-cost Human requests are emphasized in red and include a non-color marker.

## LLM Call Dialog

Required elements:

- Dialog title identifying the Human request number.
- Model summary displayed below the dialog title.
- Close control.
- `Request prompt` label.
- Human request prompt text.
- Request-level totals.
- LLM call table.
- Expandable LLM call detail sections.

Required LLM call columns:

- Expand/collapse control.
- LLM call number.
- Time.
- Context.
- Context percentage.
- Cache hit percentage.
- Fresh input.
- Cache read.
- Cache write.
- Output.
- Total tokens.
- Estimated cost.

Behavior:

- Dialog opens for one Human request at a time.
- Dialog is top-aligned at a 100px top offset and capped at 1280px wide.
- Human request prompt text is muted, capped to 600px wide, clamped to three lines, and exposes the full text on hover.
- Model is shown once below the dialog title when consistent, or as a mixed-model summary when multiple models are present.
- Calls display newest first.
- The LLM call table uses fixed column widths so expanding a row does not reflow headers or numeric columns.
- Each LLM call row can expand and collapse via the leading control or row activation.
- Expanded sections appear directly below the row and use labelled detail fields rather than table columns.
- Every expanded row shows Activity, Assistant preview, and Outcome.
- Assistant preview may be shortened visually, but the full assistant text remains available on hover.
- High-cost expanded rows additionally show Cost driver and Tool / command hint.
- Expanded detail sections stay visually neutral even when their parent row is high-cost.
- Visible token values use compact K/M/B formatting, with exact counts available in tooltips where useful.
- Time, Fresh input, Total tokens, Cache read, Cache write, Output, and Estimated cost are sortable.
- Calls in the top 20 percent by Estimated cost for that Human request are emphasized when there are enough calls to make the distinction meaningful.
- Escape closes the dialog.
- Backdrop click closes the dialog.
