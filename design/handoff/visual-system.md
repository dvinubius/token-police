# Token Police — Implemented Visual System

This handoff describes the visual system implemented in
`frontend/src/styles.css` and the Svelte components under
`frontend/src/components/`. Code is authoritative for exact values and
behavior.

## Themes And Render Modes

The app has two user-selectable themes:

- **Liquid dark**: the default, using an aurora-dark layered gradient and
  translucent glass surfaces.
- **Liquid arctic**: the light theme, using a polar-light layered gradient and
  translucent glass surfaces.

The theme value is `dark` or `light` in the `data-theme` attribute and the
`token-police-theme` local-storage key. A legacy stored value of `graphite` is
migrated to `dark`.

Both themes also have a solid fallback render mode. The bootstrap in
`frontend/index.html` sets `data-solid` when `backdrop-filter` is unsupported,
the user prefers reduced transparency, or `token-police-solid` requests the
override. Solid mode keeps the theme gradient but replaces translucent
surfaces and blur with opaque values. There is no in-app solid-mode control.

## Token Ownership

`frontend/src/styles.css` owns the implemented custom properties. Important
semantic roles are:

| Role | CSS property | Use |
|---|---|---|
| App background | `--bg` | Fixed layered gradient painted on `body`. |
| Glass surfaces | `--bg-elev`, `--bg-elev-2`, `--bg-well`, `--topbar-bg`, `--input-bg` | Cards, rows, wells, top bar, and controls. |
| Modal surfaces | `--modal-bg`, `--modal-well`, `--modal-elev-2`, `--modal-backdrop` | Glass dialog frame and opaque reading surfaces. |
| Sticky headers | `--th-bg` | Opaque table headers above scrolling rows. |
| Text | `--text`, `--text-dim`, `--text-faint` | Primary, secondary, and tertiary copy. |
| Estimated cost | `--cost` | Estimated-cost metrics and non-hot cost cells. |
| Total tokens | `--token` | Total-token metrics and the shield color. |
| Claude Code | `--cc` | Claude Code badges, chart bars, and legend. |
| Codex | `--codex` | Codex badges, chart bars, and legend. |
| Live status | `--ok`, `--ok-glow` | Refresh indicator and output metric accent. |
| High cost | `--hot`, `--hot-bg` | High-cost rows, markers, and cost values. |
| UI accent | `--accent`, `--sel-bg`, `--sel-border`, `--focus-ring` | Selection and keyboard focus. |
| Glass effect | `--blur`, `--modal-blur` | Surface and modal-frame backdrop filters. |

Cost, total tokens, source identity, live status, high-cost emphasis, and UI
selection remain independent roles; they must not collapse onto one color.

## Brand And Typography

- The product mark is the inline shield SVG in
  `frontend/src/components/Topbar.svelte`.
- The shield shell uses `--brand-logo`; inset strokes and the dollar glyph use
  `--logo-ink`.
- The wordmark uses Saira Condensed through `--display`.
- UI copy uses Plus Jakarta Sans through `--sans`.
- Numbers, timestamps, and compact analytical labels use JetBrains Mono
  through `--mono` with tabular numerals.
- `frontend/index.html` loads the three font families from Google Fonts; the
  CSS stacks provide system fallbacks.

The top-bar theme toggle shows the current-mode icon and labels the action that
switches to the other theme.

## Surface And Shape Rules

- The layered gradient is painted once on `body` and fixed to the viewport.
- Translucent chrome pairs its background with `backdrop-filter: var(--blur)`.
- Sticky table headers are opaque so scrolled rows do not show through.
- The request-dialog frame is glass; prompt, stat, and table-reading surfaces
  inside it are opaque for consistent contrast.
- Cards use a 16 px radius, wells use 12 px role tokens or explicit 8 px
  component radii, icon buttons use 10 px, and badges use 7 px.
- Hairline borders and an inset top highlight carry the glass edge treatment.

## Implemented Component Mapping

| Surface | Svelte source | Primary visual selectors |
|---|---|---|
| App shell and navigation | `Topbar.svelte`, `ThemeToggle.svelte` | `.topbar`, `.page-nav`, `.theme-toggle`, `.refresh` |
| Global metrics | `GlobalStats.svelte` | `.global-stats`, `.gstat` |
| Daily chart | `DailyChart.svelte` | `.chart`, `.seg.cc`, `.seg.codex` |
| Top Sessions | `TopSessions.svelte` | `.top-list`, `.top-estimated-cost` |
| Filters and Session list | `Filters.svelte`, `SessionList.svelte`, `SessionRow.svelte` | `.filters`, `.session-list`, `.session-row` |
| Session hierarchy | `SessionBadges.svelte` | `.session-badges`, `.session-chevron`, `.subagent-row` |
| Session detail and totals | `SessionDetail.svelte`, `SessionStats.svelte` | `.detail-pane`, `.stats-breakdown`, `.requests` |
| LLM-call dialog | `RequestDialog.svelte` | `.dialog-backdrop`, `.request-dialog`, `.llm-calls` |
| Expanded call insights | `LlmCallInsights.svelte` | `.llm-call-detail-row`, `.llm-insights` |

## Session Hierarchy And Totals

Parent Sessions are collapsed by default. Their dedicated chevron is the only
subagent expansion control; row activation selects the Session. Expanded
subagent rows appear directly below the parent, carry a `SUB` badge, and remain
selectable.

Selected-Session stats use aligned metric columns. A simple or selected
subagent Session shows one labelled row. A parent with subagents shows an
inclusive Total row, a Main agent row, and one row per descendant subagent.
Secondary rows use smaller, less saturated values while retaining metric roles.

## Tables And High-Cost Signals

The Human request table and LLM-call table use real table structures, sticky
headers, keyboard-reachable sort buttons, right-aligned numeric columns, and a
visible sort indicator.

Human requests use an 80th-percentile Estimated-cost threshold with every
positive-cost request eligible. LLM calls use the same percentile only when a
Human request contains at least five positive-cost calls. High-cost rows use
both a tinted background and a triangle marker beside the cost, so emphasis is
not color-only.

The LLM-call table has fixed columns and a 1270 px minimum width, including a
model column. Expanded insights render in a separate detail row and do not
reflow the analytical columns.

## Dialog Layout

- Desktop backdrop padding starts 100 px from the top.
- The dialog width is capped at 1320 px.
- Prompt text is capped at 600 px and clamped to three 18 px lines.
- The call table scroll region is capped at `min(42vh, 420px)`.
- Escape, backdrop click, and the close button close the dialog.
- Opening the dialog focuses the close button.

## Responsive Boundaries

The product remains desktop-first, but the implementation contains protective
breakpoints:

- At 1280 px and above, the Sessions list pane is 600 px wide; at 1024 px and
  above it is 460 px wide.
- At 800 px and above, Top Session items use their wide one-row arrangement.
- At 1100 px and below, the dialog loses its 100 px top offset and request
  stats use two columns.
- At 760 px and below, stats collapse, the wordmark copy is hidden, and several
  grid layouts reduce columns.

These rules are defensive narrow-window behavior, not a separate mobile
product design.

## Historical Artifacts

`design/handoff/tokens.json` and `design/handoff/themes.css` contain the earlier
Graphite/Clean light exploration. They are retained for design history and are
not imported by the application. Do not use them as sources for current theme
names or values.
