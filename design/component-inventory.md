# Component Inventory

## Navigation And Shell

| Component | Responsibility | Current implementation anchor |
|---|---|---|
| App shell | Owns global page structure and current page visibility. | `public/index.html`, `setPage()` |
| Product identity | Displays product name and mark. | `.brand` |
| Page tabs | Switch between Stats and Sessions. | `.page-tab`, `setPage()` |
| Refresh indicator | Shows live or offline fetch status. | `#refreshIndicator`, `pulse()`, `refresh()` |

## Stats Components

| Component | Responsibility | Current implementation anchor |
|---|---|---|
| Global stat | Displays one aggregate metric. | `.gstat`, `renderGlobal()` |
| Daily usage chart | Shows 30-day source-split token usage. | `#chart`, `renderChart()` |
| Source legend | Identifies chart source segments. | `.legend` |
| Top Sessions list | Shows five Sessions ordered by Estimated cost. | `#topList`, `renderTop()` |
| Top Session item | Navigates to selected Session detail and switches between one-row and two-row summary layouts at the 800px breakpoint. | `renderTop()`, `.top-list li` |

## Sessions Components

| Component | Responsibility | Current implementation anchor |
|---|---|---|
| Filter bar | Groups all Session filters. | `.filters`, `bindControls()` |
| Search input | Filters by Session title or project. | `#searchInput` |
| Source filter | Filters by Claude Code or Codex. | `#sourceFilter` |
| Project filter | Filters by discovered project. | `#projectFilter`, `populateProjectFilter()` |
| Date range filters | Filter by last active date. | `#fromDate`, `#toDate` |
| Clear filters control | Resets filter state. | `#clearFilters` |
| List metadata | Displays filtered count and Estimated cost. | `#listMeta` |
| Session list | Contains selectable Session rows, rendered as an initial window that grows on scroll. | `#sessionList`, `renderList()` |
| Session row | Selects a Session and summarizes its totals. | `.session-row` |
| List load sentinel | Marks the end of the rendered window and loads more rows when scrolled near. | `.list-sentinel`, `IntersectionObserver` in `renderList()` |

## Detail Components

| Component | Responsibility | Current implementation anchor |
|---|---|---|
| Empty detail | Placeholder before Session selection. | `#emptyDetail` |
| Detail pane | Displays selected Session inspection. | `#detailPane`, `renderDetail()` |
| Prompt title | Labels prompt text blocks. | `.prompt-title` |
| Initial session prompt block | Shows the selected Session's initial prompt in a clamped readable block. | `.session-title-card`, `.session-title-text` |
| Total stat | Displays one selected-Session aggregate. | `.tstat` |
| Human request table | Lists Human requests with sortable time, call count, token, and Estimated cost summaries. | `.requests`, `groupHumanRequests()`, `sortedRows()` |
| Human request row | Opens the LLM Call Dialog. | `.request-row` |
| Sortable table header | Toggles table sort direction for supported analytical columns. | `.sort-btn`, `sortHeader()`, `setTableSort()` |

## Dialog Components

| Component | Responsibility | Current implementation anchor |
|---|---|---|
| Dialog backdrop | Modal layer and backdrop-click close target. | `.dialog-backdrop`, `ensureRequestDialog()` |
| Request dialog | Contains one Human request's LLM calls. | `.request-dialog`, `openRequestDialog()` |
| Dialog model summary | Shows the request's shared model or mixed-model summary below the dialog title. | `#requestDialogModel`, `modelSummary()` |
| Dialog close control | Closes the dialog. | `#requestDialogClose` |
| Request prompt block | Shows muted, three-line Human request prompt text with full text on hover. | `.request-full`, `.request-full-text` |
| Dialog stat | Displays one Human request aggregate. | `.dialog-stats .tstat` |
| LLM call table | Lists individual LLM calls with fixed sortable time, token, and Estimated cost columns. | `.llm-calls` |
| LLM call expand control | Expands or collapses one LLM call's detail section. | `.expand-toggle`, `.llm-call-row`, `expandedLlmCalls` |
| LLM call insight section | Shows labelled Activity, Assistant preview, Outcome, and high-cost-only Cost driver and Tool / command hint. | `.llm-call-detail-row`, `.llm-insights`, `llmCallInsightPanel()` |
| High-cost marker | Marks highest-cost Human requests and top-cost LLM calls within a request. | `.hot`, `.hot-flag`, `hotEstimatedCostThreshold()` |
