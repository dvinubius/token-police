# UX Principles

## Desktop-First Inspection

Optimize for a wide desktop viewport where summary, filtering, tables, and drill-down inspection can coexist without reducing data density.

## Local Trust

Reinforce that the app is a local dashboard. Avoid patterns that imply account setup, cloud sync, remote billing, or shared team telemetry.

## Scan Before Drill-Down

The first read should answer what changed, how much usage exists, and where the highest Estimated cost appears. Detailed LLM call inspection should remain available only after the user selects a Session and Human request.

## Preserve Analytical Context

Changing tabs, selecting Sessions, opening dialogs, clearing filters, and auto-refreshing should not disorient the user. Keep selection, list context, and scroll position stable where the current implementation already does.

## Keep Domain Language Stable

Use the canonical product terms consistently:

- Session
- Human request
- LLM call
- Estimated cost
- Token bucket

## Make Expensive Usage Legible

High-cost Sessions, Human requests, and LLM calls need stronger emphasis than ordinary rows, but the exact visual treatment is open for exploration.

## Prefer Useful Density

This is an operational dashboard, not a marketing surface. Prioritize comparison, filtering, tabular readability, compact summaries, and quick scanning over decorative explanation.
