# Screen Inventory

| Screen | Route or trigger | Purpose | Primary content | Primary actions |
|---|---|---|---|---|
| Stats | `#stats` or default route | Summarize total usage and identify expensive Sessions. | Global metrics, daily usage chart, top 5 Sessions. | Switch pages, select top Session. |
| Sessions | `#sessions` or Session selection | Filter Sessions and inspect selected Session detail. | Filter controls, hierarchical Session list, detail pane with Initial session prompt, tabular Session stats, sortable Human request or subagent task table. | Filter, clear filters, select Session, expand or collapse subagents, sort Human requests or subagent tasks, open LLM call dialog. |
| Empty Session Detail | Sessions page with no selected Session | Hold the detail area before selection. | Empty-state text. | Select a Session. |
| LLM Call Dialog | Human request or subagent task row activation | Inspect calls for a Human request or subagent task. | Request prompt, model summary, request totals, sortable fixed-layout LLM call table, expandable call insights. | Sort calls, expand or collapse calls, close dialog, scan high-cost calls. |
| Offline Refresh State | Failed Summary or Sessions fetch | Indicate local API fetch failure. | Refresh status text in top bar. | Retry via next automatic refresh or page reload. |
| No Matching Sessions | Active filters return no Sessions | Explain why the list is empty. | Empty filtered-list message. | Clear or adjust filters. |
| No Data Yet | No imported Sessions or no top Sessions | Keep Stats meaningful before data arrives. | Empty top Sessions state and zero/empty metrics. | Wait for watched files or verify local sources. |

## Desktop Layout Assumptions

- Top navigation remains globally visible.
- Stats page uses a single centered content column.
- Sessions page uses a two-pane layout.
- Detail tables and dialogs may scroll internally.
- No mobile navigation pattern is required.
