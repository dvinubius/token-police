# Component Inventory

## Navigation And Shell

| Component | Responsibility | Current implementation anchor |
|---|---|---|
| App shell | Owns global page structure and current page visibility. | `frontend/index.html`, `frontend/src/App.svelte` |
| Product identity | Displays product name and mark. | `frontend/src/components/Topbar.svelte`, `.brand` |
| Page tabs | Switch between Stats and Sessions. | `frontend/src/components/Topbar.svelte`, `.page-tab`, `setPage()` |
| Refresh indicator | Shows live or offline fetch status. | `frontend/src/components/Topbar.svelte`, `#refreshIndicator`, `refresh()` |

## Stats Components

| Component | Responsibility | Current implementation anchor |
|---|---|---|
| Global stat | Displays one aggregate metric. | `frontend/src/components/GlobalStats.svelte`, `.gstat` |
| Daily usage chart | Shows 30-day source-split token usage. | `frontend/src/components/DailyChart.svelte`, `#chart` |
| Source legend | Identifies chart source segments. | `frontend/src/components/StatsPage.svelte`, `.legend` |
| Top Sessions list | Shows five Sessions ordered by Estimated cost. | `frontend/src/components/TopSessions.svelte`, `#topList` |
| Top Session item | Navigates to selected Session detail and switches between one-row and two-row summary layouts at the 800px breakpoint. | `frontend/src/components/TopSessions.svelte`, `.top-list li`, `selectSession()` |

## Sessions Components

| Component | Responsibility | Current implementation anchor |
|---|---|---|
| Filter bar | Groups all Session filters. | `frontend/src/components/Filters.svelte`, `.filters` |
| Search input | Filters by Session title or project. | `#searchInput` |
| Source filter | Filters by Claude Code or Codex. | `#sourceFilter` |
| Project filter | Filters by discovered project. | `frontend/src/components/Filters.svelte`, `#projectFilter` |
| Date range filters | Filter by last active date. | `#fromDate`, `#toDate` |
| Clear filters control | Resets filter state. | `frontend/src/components/Filters.svelte`, `#clearFilters`, `clearFilters()` |
| List metadata | Displays rendered/filtered counts and Estimated cost. | `frontend/src/components/SessionList.svelte`, `#listMeta` |
| Session list | Contains selectable Session rows, rendered as an initial window that grows on scroll. | `frontend/src/components/SessionList.svelte`, `#sessionList` |
| Session row | Selects a Session and summarizes its totals; parent rows with subagents remain selectable without toggling expansion. | `frontend/src/components/SessionRow.svelte`, `.session-row` |
| Session source-badge stack | Vertically stacks the source badge plus either a `SUB` badge or parent expansion chevron. | `frontend/src/components/SessionBadges.svelte`, `.session-badges` |
| Session expansion chevron | Toggles parent subagent rows only when the chevron button is activated; collapsed points down and expanded points up. | `frontend/src/components/SessionBadges.svelte`, `.session-chevron`, `toggleSubagent()` |
| Subagent Session row | Displays a selectable subagent Session directly under its parent with left indentation and right-edge alignment. | `frontend/src/components/SessionRow.svelte`, `.session-row.subagent-row`, `visibleSessionRows()` |
| List load sentinel | Marks the end of the rendered window and loads more rows when scrolled near. | `frontend/src/components/SessionList.svelte`, `.list-sentinel`, `IntersectionObserver`, `growList()` |

## Detail Components

| Component | Responsibility | Current implementation anchor |
|---|---|---|
| Empty detail | Placeholder before Session selection. | `frontend/src/components/SessionDetail.svelte`, `#emptyDetail` |
| Detail pane | Displays selected Session inspection. | `frontend/src/components/SessionDetail.svelte`, `#detailPane` |
| Prompt title | Labels prompt text blocks. | `.prompt-title` |
| Initial session prompt block | Shows the selected Session's initial prompt in a clamped readable block. | `.session-title-card`, `.session-title-text` |
| Session stats block | Displays selected-Session totals as tabular metric columns; parent Sessions with subagents use Total, Main agent, and per-subagent rows. | `frontend/src/components/SessionStats.svelte`, `.stats-breakdown`, `.stats-row`, `.tstat` |
| Human request or subagent task table | Lists Human requests, or subagent tasks for selected subagent Sessions, with sortable time, call count, token, and Estimated cost summaries. | `frontend/src/components/SessionDetail.svelte`, `.requests`, `groupHumanRequests()`, `sortedRows()` |
| Human request or subagent task row | Opens the LLM Call Dialog. | `.request-row` |
| Sortable table header | Toggles table sort direction for supported analytical columns. | `frontend/src/components/SortHeader.svelte`, `.sort-btn`, `setTableSort()` |

## Dialog Components

| Component | Responsibility | Current implementation anchor |
|---|---|---|
| Dialog backdrop | Modal layer and backdrop-click close target. | `frontend/src/components/RequestDialog.svelte`, `.dialog-backdrop` |
| Request dialog | Contains one Human request's or subagent task's LLM calls. | `frontend/src/components/RequestDialog.svelte`, `.request-dialog`, `openRequestDialog()` |
| Dialog model summary | Shows the request's shared model or mixed-model summary below the dialog title. | `#requestDialogModel`, `modelSummary()` |
| Dialog close control | Closes the dialog. | `#requestDialogClose` |
| Request prompt block | Shows muted, three-line Human request prompt text with full text on hover. | `.request-full`, `.request-full-text` |
| Dialog stat | Displays one Human request aggregate. | `.dialog-stats .tstat` |
| LLM call table | Lists individual LLM calls with fixed sortable time, token, and Estimated cost columns. | `.llm-calls` |
| LLM call expand control | Expands or collapses one LLM call's detail section. | `.expand-toggle`, `.llm-call-row`, `expandedLlmCalls` |
| LLM call insight section | Shows labelled Activity, Assistant preview, Outcome, and high-cost-only Cost driver and Tool / command hint. | `frontend/src/components/LlmCallInsights.svelte`, `.llm-call-detail-row`, `.llm-insights` |
| High-cost marker | Marks highest-cost Human requests and top-cost LLM calls within a request. | `.hot`, `.hot-flag`, `hotEstimatedCostThreshold()` |
