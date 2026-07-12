# Visual Direction

## Status: direction selected

The exploration phase is complete. The adopted visual system is **liquid glass**,
in two themes the app toggles between:

- **Liquid dark** — frosted glass over an aurora-dark gradient.
- **Liquid arctic** — frosted glass over a polar-light gradient.

Reference prototype: `Token Police - Style Explorer v2 (standalone).html` (in
this folder; v2 adds the modal glass treatment). It also contains two non-liquid
parent studies ("Refined dark", "Arctic") for comparison; only the liquid
variants are adopted.

Concrete values and implementation guidance live in `handoff/`:
`handoff/tokens.json`, `handoff/themes.css`, `handoff/visual-system.md`, and
the actionable plan in `handoff/implementation-handoff.md`.

## Fallback: solid render mode (decision)

The previous non-liquid studies (Graphite / Refined dark, Clean light / Arctic)
are **retired as user-facing options**. For environments that render
`backdrop-filter` poorly or not at all (no GPU compositing, remote desktop,
older Firefox) and for `prefers-reduced-transparency` users, the app ships a
**solid render mode of the liquid design**: ~14 surface tokens overridden with
opaque values reused from the parent studies, blur disabled, gradient kept.
It is auto-detected with a manual override — one design, two render modes.
See `handoff/themes.css` (solid fallback blocks) and
`handoff/implementation-handoff.md`.

## Scope: style only, not layout

The mockups dictate visual style. Layout remains as the production app has it
today. Mockup-only layout deviations — such as the compact text-glyph expansion
chevron on session list items or the sessions-list pane width — are **not**
adopted. Where mockup and app layout differ, the app wins.

## Core style ingredients

- A fixed, layered gradient app background per theme.
- Translucent chrome (cards, top bar, rows, inputs) always paired with
  `backdrop-filter` blur; opaque sticky table headers.
- The request dialog as its own glass layer: translucent frame with a light
  blur over a light scrim (shapes behind stay readable), opaque inner reading
  surfaces for text contrast.
- Hairline translucent borders plus shadows with an inset top highlight.
- Softer radius scale (16px cards / 12px insets / 10px icon buttons / 7px badges).
- Shared typeface pair across themes: Plus Jakarta Sans + JetBrains Mono, with
  Saira Condensed reserved for the brand wordmark.

## Preserve These Semantic Signals

The visual style must keep these distinctions clear:

- App identity and primary navigation.
- Active page.
- Live, refreshing, offline, or failed refresh status.
- Claude Code source versus Codex source.
- Parent Session versus subagent Session hierarchy.
- Selected Session.
- Empty detail state versus loaded detail state.
- Filtered list state.
- Estimated cost as a key metric.
- Total tokens as a key metric.
- High-cost Human requests inside a Session and high-cost LLM calls inside a Human request.
- Sortable analytical table headers and visible sort state.
- Keyboard focus.
- Modal/dialog active state.

Cost, tokens, and the two source/model colors remain four independent hues in
both themes (see `handoff/visual-system.md` §2).

## Desktop Constraints

The app is desktop-only. The style assumes enough horizontal space for:

- A top navigation bar.
- Overview metric and chart sections.
- A Sessions page with a left list/filter pane and right detail pane.
- Tables with multiple numeric columns.
- A large LLM call inspection dialog.

## Output Expectation

Adopting this style must keep the screen inventory, component inventory, and
flows in this package intact unless a product decision explicitly changes them.
