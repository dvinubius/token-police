# Agent Instructions

## Project References

- Top-level routing: `CONTEXT.md` (mandatory; read at the start of a task)
- Repository map: `docs/repository-map.md`
- Development and verification commands: `docs/development-commands.md`
- Canonical domain language: `docs/domain-language.md`
- Methodology routers, templates, skills, and references: `.agent/`
- Project documentation methodology: `.agent/docs/CONTEXT.md`

## Operating Model: Code vs. Docs

- Code is the primary authority for current system behavior. Tests/contracts
  provide supporting behavioral evidence. Documentation accelerates orientation
  but does not replace reading the implementation.
- `docs/` contains current project facts, development state, implemented
  technical documentation, accepted technical intent.
- Ignore `specs/` if it is present.
- Ignore `.devnotes/`: do not read, search, modify, or treat it as context
  unless explicitly instructed by the developer.

## Agent Workflow

Only load routed context needed for the work.

Avoid expensive or risky work without confirmation.

Stop and ask before:

- running destructive operations, deployments, production actions, unusually
  broad verification, or expensive tool calls;
- creating commits.

Never claim a command passed unless it ran successfully.

## Never

- Do not broaden scope silently.
- Do not bypass architecture, validation, authorization, or data-access layers.
- Do not skip or conceal failing checks.
- Do not revert, overwrite, or discard unrelated pre-existing work.
- Do not hand-edit generated or vendored files unless explicitly maintained.
- Do not expose credentials, tokens, secrets, or private environment values.
