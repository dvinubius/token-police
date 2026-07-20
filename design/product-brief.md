# Product Brief

## Product

Token Police is a desktop-only local dashboard for understanding token usage and Estimated cost across Claude Code and Codex CLI Sessions.

## User

The primary user is a developer or technical operator running local agent tools and wanting quick visibility into usage patterns without uploading transcript data or using an external account.

## Core Value

Make token usage inspectable at three levels:

- Overall activity across all imported Sessions.
- Session-level filtering, comparison, and selection.
- Human request, subagent, and LLM call detail for diagnosing what drove usage.

## Product Boundaries

- Desktop web app only.
- Local-only data surface served from the local Express server.
- No authentication in the current product shape.
- No mobile layout requirement for this design package.
- The implemented visual language is the two-theme liquid-glass system in
  `frontend/src/styles.css`, with an automatically selected solid fallback.

## Current App Scope

- Reads Claude Code transcripts from the local Claude projects directory.
- Reads Codex CLI session files from the local Codex sessions directory.
- Watches those directories and refreshes the dashboard during use.
- Estimates cost from model pricing data with local cache and fallback behavior.
- Exposes the same data through local JSON API endpoints.

## Design Maintenance Goal

Preserve the current information structure, component model, user flows,
desktop-only assumption, and interaction behavior while keeping design
documentation aligned with the implemented Svelte components and visual
system.
