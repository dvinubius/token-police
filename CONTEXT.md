# Project Context Router

## Routing

| Need | Methodology route | Project files |
|---|---|---|
| Create or update the current-task PRD | `.agent/skills/to-prd/SKILL.md` | `.agent-state/current-task/PRD.md` |
| Create optional current-task issues from an approved PRD | `.agent/skills/prd-to-issues/SKILL.md` | `.agent-state/current-task/issues/` |
| Execute an approved PRD with waived review points | `.agent/skills/execute-prd-afk/SKILL.md` | PRD, optional issues, relevant code, tests, docs, and current diff |
| Implement one current-task issue from start to finish | `.agent/skills/implement-issue/SKILL.md` | PRD, issue file, relevant code, tests, docs, and current diff |
| Create or update the branch PR and check PRD conformity | `.agent/skills/finish-task/SKILL.md` | PRD, PR change set, affected project files |
| Work on technical project docs | `.agent/docs/CONTEXT.md` | relevant files under `docs/` |
| Read accepted technical intent | `.agent/docs/CONTEXT.md` | `docs/normative/README.md`, relevant normative docs, code, schemas, tests, and authoritative external references |
| Read current project conventions | `.agent/docs/CONTEXT.md` | `docs/conventions.md` |
| Create or update the root README | `.agent/docs/CONTEXT.md` and `.agent/docs/templates/root-readme.md` | root `README.md`, `docs/development-commands.md`, `docs/normative/README.md`, `.agent/how-to.md`, and linked project docs |
| Find a reusable procedure | `.agent/skills/CONTEXT.md` | as routed by the selected skill |
| Learn how the developer uses the methodology | `.agent/how-to.md` | none |

## Conditional Skill Routing

Do not read optional skills by default. Read one only when its condition is
present and the extra procedure will reduce guessing or risk:

- read `.agent/skills/investigate-issue/SKILL.md` before planning a fix when
  reproduction, expected behavior, root cause, affected surface, or regression
  evidence is uncertain enough that planning would be speculative;
- read `.agent/skills/assess-change-impact/SKILL.md` before a consequential
  proposed change may affect callers, persistent data, public or internal
  contracts, architecture boundaries, security, privacy, authorization,
  compatibility, operations, cost, or external systems, and the credible blast
  radius is not yet clear;
- read `.agent/skills/clarify-with-shared-language/SKILL.md` when ambiguous
  terminology, overloaded concepts, contradictory intent, or a material design
  branch blocks a precise PRD or issue breakdown;
- read `.agent/skills/deepen-modules/SKILL.md` when the work is explicitly
  architecture diagnosis or current evidence suggests a bounded deep-module
  refactoring candidate that needs design before implementation;
- read `.agent/skills/neatify-code/SKILL.md` when the developer asks to
  neatify, simplify, clean up, refactor for maintainability, run a
  maintainability pass on changed code, or include maintainability-oriented
  evidence in review;
- read `.agent/skills/code-review/SKILL.md` when the developer requests review
  or the actual diff is large, risky, or cross-cutting enough that a dedicated
  review pass adds value.
