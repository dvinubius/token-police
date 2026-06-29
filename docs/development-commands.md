# Development Commands

## Environment

- Default working directory: repository root.
- Toolchain versions: Node.js 18+ from `package.json`.
- Package manager: npm with `package-lock.json`.
- Required local services: none for `npm start`. For frontend-only Vite
  development, run the Express API separately with `npm run server`; Vite
  proxies `/api/*` to `http://127.0.0.1:7899`.

## Commands

```text
install:      npm install
dev:          npm run server      # Express API + static dist, no rebuild
frontend:     npm run dev         # Vite dev server with /api proxy
build:        npm run build       # frontend/ -> dist/
start:        npm start           # build, then serve dist/ through Express
test:focused: npm test -- test/llm-insights.test.js
test:full:    npm test
coverage:     npm run coverage
health:       npm run health
```

## Health (exact-mode complexity / CRAP)

`npm run health` runs the test suite under `c8`, sanitizes the coverage map,
and feeds it to `fallow health` for exact per-function CRAP scores.

- `npm run coverage` generates `coverage/coverage-final.json` (Istanbul format)
  and runs `scripts/sanitize-coverage.js` to clamp the `-1` column sentinels
  c8 emits, which Fallow's strict (unsigned-integer) parser otherwise rejects.
  Only location metadata is clamped; execution counts are untouched.
- Without `--coverage`, `fallow health` estimates CRAP from export references
  and assumes ~0% coverage for unexported internal functions, inflating their
  scores. Exact mode reports their real coverage instead.
- `coverage/` is gitignored; regenerate locally with `npm run coverage`.
