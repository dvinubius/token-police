# Implementation Brief

## Current Stack

- Local Express server.
- Static frontend in `public/`.
- Vanilla JavaScript for state, data fetching, rendering, filtering, and dialog behavior.
- CSS in `public/styles.css`.
- Node.js runtime with local filesystem watchers.

## Relevant Files

| File | Current responsibility |
|---|---|
| `public/index.html` | App shell, top navigation, Stats page containers, Sessions page containers. |
| `public/app.js` | Page state, API fetching, rendering, filters, selection, grouping, dialog behavior. |
| `public/styles.css` | Current visual implementation and layout rules. |
| `server.js` | Static serving and local REST API routes. |
| `src/store.js` | Read model, aggregate totals, Session list projections, detail projections. |
| `docs/domain-language.md` | Canonical domain terms. |
| `docs/normative/architecture.md` | Accepted architecture and boundaries. |

## API Data Sources

The frontend depends on:

- `GET /api/summary`
- `GET /api/sessions`
- `GET /api/sessions/:id/llm-calls`

Do not move pricing, parsing, file watching, or aggregation authority into the frontend during visual redesign.

## Structure To Preserve

- Two top-level pages: Stats and Sessions.
- Stats-first default route.
- Sessions page as filter/list plus detail pane.
- Human request table as the entry point to LLM call detail.
- LLM call inspection in a modal dialog.
- Thirty-second auto-refresh.
- Client-side filtering over loaded Sessions.
- Local-only positioning and language.

## Design Freedom

Claude Design may propose alternate visual systems, layout treatments within the same desktop structure, chart rendering, iconography, density, and component styling.

Claude Design should not change product scope, add onboarding, add accounts, add cloud sync, add mobile requirements, or change domain language unless explicitly directed.

## Acceptance Criteria For A Redesign Starting From This Package

- All screens in `screen-inventory.md` remain represented.
- All flows in `user-flows.md` remain possible.
- Components in `component-inventory.md` are either preserved or clearly mapped to equivalent components.
- Data columns in `ui-spec.md` remain available.
- Accessibility notes are addressed.
- Token values are filled only after a visual direction is selected.
- The app still works as a desktop-only local dashboard.

