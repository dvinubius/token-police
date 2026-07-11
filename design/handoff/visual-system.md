# Token Police — Visual System Handoff

Two approved color schemes from the style exploration, packaged for implementation
against the existing front-end (`frontend/src/styles.css`, `frontend/src/`, `frontend/index.html`).

- **Graphite** — dark, near-monochrome chrome; color is reserved for data only.
- **Clean light** — warm-white, minimal, airy.

**Source of truth / reference:** `Token Police — Style Explorer.dc.html` (interactive
prototype in this project). Open it and use the style switcher to compare Graphite and
Clean light against the real screens (Stats, Sessions list + detail, LLM-call modal).

Files in this folder:

| File | Use |
| --- | --- |
| `tokens.json` | Structured design tokens for both themes (semantic groups). |
| `themes.css` | Drop-in CSS custom-property blocks using the **existing** variable names + the new ones. |
| `visual-system.md` | This document: the token model, what changed, and exactly where to repoint. |

---

## 0. Brand — logo & wordmark

Replaces the old `◆` unicode mark and plain "Token Police" heading.

- **Logo (shield badge):** a 32px by 36px inline SVG with a police-badge shield
  silhouette. The outer shell uses `brand.logo` (`--brand-logo`, currently the blue
  token color in Graphite). The inset shield stroke, small top crest, and centered
  monospace **`$`** glyph use `surface.panel`; the glyph is 700 / 14px at `x=16`,
  `y=20` in the `0 0 32 36` viewBox. Fully theme-aware — the shell and cut-in
  details re-tone from design tokens. (Static SVG fallback is in `tokens.json` →
  `brand.logo.svgFallback`.)
- **Wordmark:** "Token Police" in **Saira Condensed 800**, uppercase, `letter-spacing: 0.112em`,
  ~21px, color `text.primary`. This is the only place the display font is used.
- **Tagline (kicker):** `AGENTIC SURVEILLANCE` in `--mono`, 9px, uppercase,
  `letter-spacing: 0.14em`, color `text.faint`. Tongue-in-cheek; **7899** is the app's real port.

Load Saira Condensed (700;800) alongside the other fonts — see `themes.css` header.

---

## 1. The important change: decouple cost, tokens, and model colors

The current `styles.css` overloads **one** color for two different meanings:

- `--cc` (orange) is used for **Claude Code** (source/model) **and** for **Estimated cost**.
- `--codex` (green) is used for **Codex** (source/model) **and** for the **live** indicator dot.

The approved design separates these into **four independent data colors** plus a status color:

| Semantic role | New var | Meaning |
| --- | --- | --- |
| `--cost` | cost metric | every "Estimated cost" value / column |
| `--token` | tokens metric | "Total tokens" values |
| `--cc` | model: Claude Code | chart bars, source badge, legend swatch |
| `--codex` | model: Codex | chart bars, source badge, legend swatch |
| `--ok` | status: live/refreshing | the pulsing "live" dot |
| `--brand-logo` | brand logo | shield badge shell |

`--cc` and `--codex` are **no longer tied to orange/green** — they are free model-identity
colors, chosen to be distinct from `--cost`, `--token`, and the UI `--accent` in each theme.

`--brand-logo` owns the shield badge shell. `--accent` stays as **UI chrome only**:
selected-row border, focus ring, and other neutral chrome accents.

---

## 2. Token groups (see `tokens.json` for exact values)

- **surface** — `bg`, `panel` (cards/topbar), `panelAlt` (insets/table headers), `border`
- **text** — `primary`, `dim`, `faint`
- **metric** — `cost`, `tokens`
- **brand** — `logo`
- **model** — `claudeCode`, `codex`
- **status** — `live`, `hot`, `hotBg`
- **ui** — `accent`, `selectedBg`, `selectedBorder`
- **shape** — `radius`, `radiusSmall` (insets/badges), `borderWidth`, `shadow`
- **type** — `sans`, `mono` (numbers always use `mono` + `font-variant-numeric: tabular-nums`)

### Badge derivation (source pills `CC` / `Codex`)
Badges derive from the model color — do not hardcode:

```
bg = rgba(modelColor, mode === 'dark' ? 0.18 : 0.13)
fg = mode === 'dark' ? modelColor : darken(modelColor, 20%)
```

Computed examples:

| Theme | CC bg / fg | Codex bg / fg |
| --- | --- | --- |
| Graphite | `rgba(188,140,255,0.18)` / `#bc8cff` | `rgba(86,211,100,0.18)` / `#56d364` |
| Clean light | `rgba(122,69,224,0.13)` / `#6237b3` | `rgba(19,138,114,0.13)` / `#0f6e5b` |

---

## 3. Where to repoint in `frontend/src/styles.css`

Add `--cost`, `--token`, `--ok` to `:root` (values in `themes.css`), then change these
declarations from the overloaded color to the semantic one:

| Selector | Current | Change to |
| --- | --- | --- |
| `.gstat-value.tokens` | `color: var(--accent)` | `color: var(--token)` |
| `.tstat.total .tstat-value` | `color: var(--accent)` | `color: var(--token)` |
| `.gstat-value.estimated-cost` | `color: var(--cc)` | `color: var(--cost)` |
| `.session-estimated-cost` | `color: var(--cc)` | `color: var(--cost)` |
| `.top-estimated-cost` | `color: var(--cc)` | `color: var(--cost)` |
| `.tstat.estimated-cost .tstat-value` | `color: var(--cc)` | `color: var(--cost)` |
| `table … td.estimated-cost` (non-hot) | `var(--cc)` | `var(--cost)` |
| `.refresh .dot` | `background: var(--codex)` | `background: var(--ok)` |

**Leave unchanged** (these are genuinely model/source colors):
`.swatch.cc`, `.seg.cc`, `.badge.cc` → `--cc`; `.swatch.codex`, `.seg.codex`,
`.badge.codex` → `--codex`. Hot/expensive cost cells stay `var(--hot)`.

Badge backgrounds in `styles.css` currently use literal `rgba(...)` of the orange/green —
replace with the derivation above (or precompute the four values per theme from `tokens.json`).

---

## 4. Theme switching

`themes.css` scopes each palette under `:root[data-theme="graphite"]` /
`:root[data-theme="light"]`. Set `document.documentElement.dataset.theme` to switch; persist
the choice in `localStorage` if a user toggle is desired. Default to whichever you prefer —
the prototype defaults to dark (Graphite-style) chrome.

The production app uses one icon-only toggle in the top bar, not two text buttons. The visible
icon represents the current mode: a moon for Graphite and a sun for Clean light. Use library-style
outline icons sized around 18px inside a 32-34px square control, with an accessible label that
names the action, such as "Switch to light theme" or "Switch to dark theme".

---

## 5. Table behavior and preserved semantic signals

Session detail tables now include sortable analytical headers. The Human request
table sorts by Time, LLM calls, Fresh input, Cache R, Cache W, Output, Total tokens,
and Estimated cost. The LLM call table sorts by Time, Fresh input, Cache R, Cache W,
Output, Total tokens, and Estimated cost.

The LLM call table in the Human request dialog uses fixed column widths and a
leading expand/collapse control. Expanded sections are non-tabular detail panels
with right-aligned labels and left-aligned values for Activity, Assistant preview,
and Outcome. High-cost expanded sections additionally show Cost driver and Tool /
command hint, but the expanded panel itself stays visually neutral even when the
parent row is hot.

Both tables use `--hot` / `--hot-bg` for high-cost row emphasis: highest-cost Human
requests in the Session breakdown and top-cost LLM calls in the request dialog. Keep
the visible non-color marker alongside the red Estimated cost value.

App identity & primary nav · active page · live/refreshing/offline status · Claude Code vs
Codex source · selected session · empty vs loaded detail · filtered list state · cost as a key
metric · tokens as a key metric · high-cost Human requests and LLM calls (hot rows) · sortable
table state · keyboard focus · modal active
state. All map to the token roles above; none should collapse onto a shared hue.

---

## 6. Session hierarchy and stats presentation

Parent Sessions with subagents use an explicit hierarchy in the Sessions list.
Parent rows are collapsed by default. When relationship metadata is available,
subagent rows appear immediately below the parent only after the parent chevron
button is activated. Subagent rows indent from the left while keeping their right
edge aligned with the parent row.

The source badge stack is vertical: the source badge sits first, then either a
compact `SUB` badge for subagent rows or a parent Session chevron button. The
chevron button is the only expand/collapse target. Row activation selects the
Session without toggling expansion. Chevron states are vertical only: collapsed
points down (`▾`), expanded points up (`▴`). Keep the chevron left-aligned in the
badge stack so controls align across rows even when source badges differ in width.

Current production chevron treatment:

| Property | Value |
| --- | --- |
| Hit area | `28px` × `24px` |
| Glyph | 22px, 800 weight |
| Default color | `color-mix(in srgb, var(--text) 82%, var(--text-dim))` |
| Background | transparent |
| Border | none |
| Radius | 5px |
| Hover/focus background | `color-mix(in srgb, var(--bg-elev-2) 62%, var(--sel-bg))` |

Selected Session stats now use a tabular block rather than independent cards.
All Sessions use the same aligned metric columns: Total tokens, Fresh input,
Output, Cache read, Cache write, and Estimated cost. Simple Sessions and
selected subagent Sessions show one labelled stats row. Parent Sessions with
subagents show Total first, Main agent second, then one row per subagent. The
Total row includes the main agent plus all grouped subagents. Main-agent and
subagent rows omit repeated metric labels and rely on column alignment; their
values are smaller and less saturated while staying in the same metric color
families.

---

## 7. Typography & metric hierarchy

**Typefaces are theme-independent.** Both Graphite and Clean light use one pair:

- `--sans` — **Plus Jakarta Sans** (UI / body)
- `--mono` — **JetBrains Mono** (numbers, code, timestamps, microlabels; always with `font-variant-numeric: tabular-nums`)
- `--display` — **Saira Condensed** (700/800), brand wordmark only

Earlier drafts gave Graphite its own **IBM Plex Sans / IBM Plex Mono** pair; this was
unified so the two themes differ only in color, not type. IBM Plex is no longer loaded —
see the font `<link>` in `themes.css` header.

**Metric display size hierarchy.** The aggregate metric displays are sized to
reflect their scope, so a glance reads scope before value. Values are mono +
tabular-nums.

| Tier | Scope | Selector | Value | Label |
| --- | --- | --- | --- | --- |
| Global | whole dataset | `.gstat` | 26px | 11px |
| Session | selected Session totals | `.totals-grid .tstat` | 18px | 11px |
| Request | one Human-request dialog | `.dialog-stats .tstat` | 15px | 10px |

Concrete values also live in `tokens.json` → `layout.metricStats`.
