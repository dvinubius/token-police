# Project Context Router

Root `AGENTS.md`, this file, and `.agent/` provide the lean methodology.
Temporary current-task artifacts live separately under
`.agent-state/current-task/`.

## Operating Model

- `docs/` contains current project facts, development state, and implemented
  technical documentation.
- Code is the primary authority for current system behavior. Permitted
  tests/contracts provide supporting behavioral evidence. Documentation
  accelerates orientation but does not replace reading the implementation.
- Accepted technical intent belongs in `docs/normative/`.
- `.agent/` contains methodology routers, templates, skills, and references.
- `.agent-state/current-task/` holds short-lived PRD, optional issue, and
  concise review artifacts while a non-trivial task is active.
- Ignore `specs/` if it is present
- Ignore `.devnotes/`: do not read, search, modify, or treat it as context, unless explicitly instructed by the developer

## Routing

| Need | Methodology route | Project files |
|---|---|---|
| Work on a feature, fix, or refactoring | `.agent/skills/work-on-task/SKILL.md` | PRD, optional issues, relevant code, tests, and docs |
| Create a current-task PRD | `.agent/skills/to-prd/SKILL.md` | `.agent-state/current-task/PRD.md` |
| Create current-task issues after issue-based execution is selected | `.agent/skills/prd-to-issues/SKILL.md` | `.agent-state/current-task/issues/` |
| Finish one delegated issue | `.agent/skills/finish-issue/SKILL.md` | delegated issue, current diff, affected project files |
| Finish a non-trivial task | `.agent/skills/finish-task/SKILL.md` | PRD, optional issues, commits, current diff, affected project files |
| Work on technical project docs | `.agent/docs/CONTEXT.md` | relevant files under `docs/` |
| Read accepted technical intent | `.agent/docs/CONTEXT.md` | `docs/normative/README.md`, relevant normative docs, code, schemas, tests, and authoritative external references |
| Read current project conventions | `.agent/docs/CONTEXT.md` | `docs/conventions.md` |
| Create or update the root README | `.agent/docs/CONTEXT.md` and `.agent/docs/templates/root-readme.md` | root `README.md`, `docs/development-commands.md`, `docs/normative/README.md`, `.agent/how-to.md`, and linked project docs |
| Find a reusable procedure | `.agent/skills/CONTEXT.md` | as routed by the selected skill |
| Learn how the developer uses the methodology | `.agent/how-to.md` | none |

## Context Rules

- `AGENTS.md` requires one direct level of project references to be read.
- After that required read, load only context relevant to the current work.
- Do not recursively traverse linked files merely because links exist.
- Read broader code when excluding it could hide a material dependency.
- Use `docs/repository-map.md` to locate implementation and
  `docs/normative/README.md` to route accepted technical intent. Neither
  substitutes for reading relevant code.
- Use `.agent-state/current-task/` for temporary current-task artifacts.
- Do not create durable task records or progress journals.
