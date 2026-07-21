# Development Commands

## Environment

- Default working directory: repository root.
- Toolchain versions: Node.js `^20.19.0 || >=22.12.0` from `package.json`. The
  floor is set by the build toolchain (Vite 8 and the Svelte plugin), not by the
  server; `npm run server` alone still runs on older releases, but `npm start`
  builds first, so treat the declared range as the requirement.
- Package manager: npm with `package-lock.json`.
- Required local services: none for `npm start` after dependencies are installed. For frontend-only Vite
  development, run the Express API separately with `npm run server`; Vite
  proxies `/api/*` to `http://127.0.0.1:7899`.

## Commands

```text
install:      npm install
dev:          npm run server      # Express API + existing static dist, no rebuild
frontend:     npm run dev         # Vite dev server with /api proxy
build:        npm run build       # frontend/ -> dist/
start:        npm start           # build, serve dist/, and open the browser
demo:         npm run build:demo  # VITE_DEMO=1 vite build, then freeze demo data to dist/demo/
demo:preview: npm run preview:demo # build the demo and serve dist/ on :4173
test:focused: npm test -- test/llm-insights.test.js
test:full:    npm test
coverage:     npm run coverage
health:       npm run health
```

## Demo build

`npm run build:demo` produces the hosted demo: a static `dist/` that reads no
local transcript directories and needs no server.

- The Vite build runs with `VITE_DEMO=1`, which switches
  `frontend/src/lib/api.js` from `/api/*` to the frozen documents under
  `dist/demo/` and shows the `Demo` badge in the topbar.
- `node demo/build.js` then generates the fixtures from `demo/dataset.js` into
  `.demo-build/` (gitignored), parses them with the real parsers and `Pricing`,
  and writes `dist/demo/sessions.json`, `dist/demo/summary.json`, and one
  `dist/demo/llm-calls/<session-id>.json` per Session.
- Order matters: `vite build` empties `dist/`, so the data step must run after
  it. `npm run build:demo` already sequences them.
- `npm run preview:demo` builds and serves the result on `http://localhost:4173`.
- Deploying is publishing `dist/` to any static host. Rebuild to refresh the
  sample data; between rebuilds the demo adapter day-shifts timestamps so the
  30-day chart stays populated.
- `vercel.json` pins the deploy settings in the repository: build command
  `npm run build:demo` and output directory `dist`. The override matters — the
  Vite framework preset would otherwise run `npm run build`, which emits the
  app without `dist/demo/`, and every data fetch would 404. Any other static
  host needs the same two settings configured on its side.
- The demo build fetches the LiteLLM price catalog. `.cache/litellm_prices.json`
  is gitignored, so a CI build with no network falls back to the hardcoded
  rates in `src/pricing.js`: Estimated cost shifts slightly, nothing breaks.

`test/demo-dataset.test.js` runs the generator through the parsers and asserts
the dataset still demonstrates both providers, multi-model Sessions, subagent
hierarchies, zero-call Human requests, and every cost driver. It prices from the
hardcoded fallback rates, so it needs no network.

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
