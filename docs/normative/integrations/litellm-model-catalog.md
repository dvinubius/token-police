# LiteLLM Model Catalog

## Role And Direction

- External system: LiteLLM model price and context-window catalog
- Direction: outbound HTTPS dependency
- Purpose: resolve per-token model rates and context windows used for Estimated
  cost and context occupancy.
- Code entry points: `src/pricing.js`

## Authoritative References

- [LiteLLM model catalog](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json)
- [LiteLLM custom-pricing field reference](https://github.com/BerriAI/litellm/blob/main/docs/my-website/docs/proxy/custom_pricing.md)

## Used Contract Surface

- Operations, endpoints, events, or resources: one `GET` to the raw catalog URL
  when the one-hour disk cache is absent or stale.
- Data consumed: model-keyed JSON entries and the fields
  `input_cost_per_token`, `output_cost_per_token`,
  `cache_read_input_token_cost`, `cache_creation_input_token_cost`, and the
  supported context-window aliases (`max_input_tokens`, `max_tokens`,
  `max_context_window_tokens`, `context_window_tokens`, `context_window`,
  `max_total_tokens`).
- Data produced: an ordinary unauthenticated HTTP request; no transcript,
  Session, Human request, or LLM-call data is sent.
- Internal mapping: catalog entries become memoized input/output/cache rates
  and context-window sizes used by `Pricing`.
- Ignored provider data: all catalog fields not listed above.

## Compatibility And Validation

- Required and optional data: catalog entries are optional. Missing cost fields
  default to zero or provider-typical cache multiples as implemented; invalid
  context-window values are ignored.
- Unknown-field behavior: ignored.
- Version compatibility: the unversioned `main` catalog is consumed
  defensively; exact and normalized model keys are attempted before local
  model-family and default fallbacks.
- Validation boundary: the response must be successful HTTP and parse as JSON;
  individual entry fields are read defensively by `Pricing`.

## Operational Behavior

- Authentication and transport: unauthenticated HTTPS.
- Timeouts and retries: one attempt with a 15-second abort timeout; no retry in
  the same load.
- Rate limits and idempotency: one fetch per cache miss or expiry; the response
  is cached at `.cache/litellm_prices.json` for one hour.
- Failure translation and recovery: live-fetch failure falls back to stale
  cache, then hardcoded rates and context windows. Cache-write failure warns
  and continues.

## Verification

- Contract tests or fixtures: pricing behavior is exercised through Store
  stubs in `test/store.test.js` and `test/llm-insights.test.js`; there is no
  network contract test.
- Manual or external verification: remove the local cache in a disposable
  working copy, start the server with network access, and inspect the pricing
  load message plus regenerated cache.
