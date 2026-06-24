# Agent Instructions

This file, root `CONTEXT.md`, and the installed files under `.agent/` are the
lean methodology. They are read-only to the agent during normal project work.
Temporary active-task state lives outside the methodology tree at
`.agent-state/current-task/`.

## Required First Read

When reading this file, always read these direct references as one required
level of project context:

- `docs/repository-map.md`
- `docs/development-commands.md`
- `docs/normative/README.md`
- root `CONTEXT.md`

Do not recursively follow every link found in those files. After this required
one-level read, follow only the routes relevant to the current work.

❗️ Do not skip the first read, regardless of how detailed the (initial) user 
prompt is.

## Project References

- Repository map: `docs/repository-map.md`
- Development and verification commands: `docs/development-commands.md`
- Accepted technical intent: `docs/normative/README.md`
- Current conventions: `docs/conventions.md`
- Canonical domain language: `docs/domain-language.md`

The project files above are mutable. Their canonical blank formats are
templates under `.agent/docs/templates/`.

When a mutable project file drifts structurally, restore its intended shape
from the corresponding template without replacing valid
project-specific content.

## Agent Workflow

- The developer is the strategist and final decision maker.
- Work on one coherent line of work at a time.
- Follow root `CONTEXT.md` and only load routed context needed for the work.
- Use `.agent/skills/work-on-task/SKILL.md` for non-trivial application work.
  If `.agent-state/current-task/` exists, treat it as active non-trivial task
  state and follow that skill before resuming.

### Confirmation And Review

Avoid expensive or risky work without confirmation.

Before asking, summarize the evidence, options, recommendation, and practical
consequence. Ask one concrete question.

Stop and ask before:

- running destructive operations, deployments, production actions, unusually
  broad verification, or expensive tool calls;
- creating commits.

## Development And Verification

Use the commands and environment rules in `docs/development-commands.md`.
Run straightforward local checks without asking. For unusually broad, costly,
slow, or environmentally consequential checks, ask first. After two failed
attempts with the same verification path or tool, ask before investing more
effort.

Never claim a command passed unless it ran successfully.

## Code, Documentation, And Tests

For code, test, and documentation changes, follow `docs/conventions.md`.

Code is authoritative for what currently runs. `docs/normative/` is
authoritative for accepted technical intent. Use the repository map and
normative index to locate relevant implementation and accepted technical
intent.

Read `docs/normative/README.md` and relevant normative documents before work
that could affect technical design.

## Never

- Do not broaden scope silently.
- Do not bypass architecture, validation, authorization, or data-access layers.
- Do not skip or conceal failing checks.
- Do not revert, overwrite, or discard unrelated pre-existing work.
- Do not hand-edit generated or vendored files unless explicitly maintained.
- Do not expose credentials, tokens, secrets, or private environment values.
- Do not silently edit content marked as developer-maintained.
