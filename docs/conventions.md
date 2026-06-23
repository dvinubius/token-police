# Project Conventions

## Code Conventions

- Prefer small, coherent, reviewable changes.
- Preserve public APIs unless the selected change requires otherwise.
- Do not reformat or clean up unrelated files.

## Test And Verification Conventions

- Add proportionate automated verification where allowed.
- Keep tests matched with `docs/normative/`.

## Documentation Conventions

- Keep root `README.md` concise and link-oriented, preserving the structure in
  `.agent/docs/templates/root-readme.md`.
- Keep current architecture and integration docs accurate to the code as it
  exists; do not rewrite them to describe future planned behavior before the
  corresponding implementation exists.
- Record accepted durable technical decisions as ADRs before implementation
  begins when those decisions are needed for task alignment.
- Do not maintain end-user behavior documentation or instructions for external
  consumers unless instructed otherwise.

## Naming And Structure

- Use canonical terminology from `docs/domain-language.md`.
- Keep one canonical home for each durable fact and prefer links over
  duplication.
