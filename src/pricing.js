'use strict';

/*
 * Pricing: fetches live per-token rates from LiteLLM, caches them to disk for
 * 1 hour, and falls back to hardcoded rates if the fetch fails.
 *
 * Every cost is computed from four disjoint token buckets so the same math
 * works for both providers:
 *   input        — fresh (non-cached) prompt tokens
 *   output       — completion tokens (incl. reasoning tokens)
 *   cache_read   — tokens served from the prompt cache (~10x cheaper)
 *   cache_write  — tokens written to the prompt cache (~1.25x input)
 */

const fs = require('fs');
const path = require('path');

const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const CACHE_DIR = path.join(__dirname, '..', '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'litellm_prices.json');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 15000;

// Hardcoded fallback rates (USD per token) used when the live fetch fails and
// no cache exists. Mirrors the published rates for the common models.
const FALLBACK_RATES = {
  'claude-sonnet-4-5': { input: 3e-6, output: 15e-6, cache_read: 0.3e-6, cache_write: 3.75e-6 },
  'claude-sonnet-4-6': { input: 3e-6, output: 15e-6, cache_read: 0.3e-6, cache_write: 3.75e-6 },
  'claude-opus-4-8': { input: 5e-6, output: 25e-6, cache_read: 0.5e-6, cache_write: 6.25e-6 },
  'claude-opus-4-1': { input: 15e-6, output: 75e-6, cache_read: 1.5e-6, cache_write: 18.75e-6 },
  'claude-haiku-4-5': { input: 1e-6, output: 5e-6, cache_read: 0.1e-6, cache_write: 1.25e-6 },
  'gpt-5': { input: 1.25e-6, output: 10e-6, cache_read: 0.125e-6, cache_write: 0 },
  'gpt-5-codex': { input: 1.25e-6, output: 10e-6, cache_read: 0.125e-6, cache_write: 0 },
  'gpt-5.1-codex': { input: 1.25e-6, output: 10e-6, cache_read: 0.125e-6, cache_write: 0 },
  'gpt-5.5': { input: 1.25e-6, output: 10e-6, cache_read: 0.125e-6, cache_write: 0 },
};

const FALLBACK_CONTEXT_WINDOWS = {
  'claude-sonnet-4-5': 200000,
  'claude-sonnet-4-6': 200000,
  'claude-opus-4-8': 200000,
  'claude-opus-4-1': 200000,
  'claude-haiku-4-5': 200000,
  'gpt-5': 400000,
  'gpt-5-codex': 400000,
  'gpt-5.1-codex': 400000,
  'gpt-5.5': 400000,
};

// The model whose rates are used for anything we cannot otherwise resolve.
const DEFAULT_MODEL = 'claude-sonnet-4-5';

class Pricing {
  constructor() {
    this._raw = {}; // raw LiteLLM map: model -> entry
    this._resolved = new Map(); // model -> {input,output,cache_read,cache_write}
    this._contextWindows = new Map(); // model -> context window tokens
    this._loaded = false;
  }

  /** Load rates: fresh disk cache -> live fetch -> stale cache -> hardcoded. */
  async load() {
    const cached = this._readCache();
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      this._raw = cached.data;
      this._loaded = true;
      console.log('[pricing] Using cached LiteLLM rates (fresh).');
      return;
    }

    try {
      const data = await this._fetchLive();
      this._raw = data;
      this._writeCache(data);
      this._loaded = true;
      console.log(`[pricing] Fetched live LiteLLM rates (${Object.keys(data).length} models).`);
      return;
    } catch (err) {
      console.warn(`[pricing] Live fetch failed (${err.message}).`);
    }

    if (cached) {
      this._raw = cached.data;
      this._loaded = true;
      console.log('[pricing] Falling back to stale cached rates.');
      return;
    }

    this._raw = {};
    this._loaded = true;
    console.log('[pricing] Falling back to hardcoded rates.');
  }

  async _fetchLive() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(LITELLM_URL, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  _readCache() {
    try {
      const txt = fs.readFileSync(CACHE_FILE, 'utf8');
      const parsed = JSON.parse(txt);
      if (parsed && parsed.data) return parsed;
    } catch {
      /* no cache yet */
    }
    return null;
  }

  _writeCache(data) {
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify({ fetchedAt: Date.now(), data }));
    } catch (err) {
      console.warn(`[pricing] Could not write cache: ${err.message}`);
    }
  }

  /** Resolve per-token rates for a model, memoized. */
  rates(model) {
    const key = model || DEFAULT_MODEL;
    if (this._resolved.has(key)) return this._resolved.get(key);
    const r = this._resolve(key);
    this._resolved.set(key, r);
    return r;
  }

  _resolve(model) {
    // Synthetic / local turns are never billed.
    if (!model || model === '<synthetic>' || model === 'unknown') {
      return { input: 0, output: 0, cache_read: 0, cache_write: 0 };
    }

    const entry = this._lookupRaw(model);
    if (entry) {
      const input = entry.input_cost_per_token || 0;
      return {
        input,
        output: entry.output_cost_per_token || 0,
        // Default cache rates to provider-typical multiples when absent.
        cache_read:
          entry.cache_read_input_token_cost != null
            ? entry.cache_read_input_token_cost
            : input * 0.1,
        cache_write:
          entry.cache_creation_input_token_cost != null
            ? entry.cache_creation_input_token_cost
            : input * 1.25,
      };
    }

    if (FALLBACK_RATES[model]) return FALLBACK_RATES[model];

    // Family-based guesses before the final default.
    const fam = this._familyRates(model);
    if (fam) return fam;

    return FALLBACK_RATES[DEFAULT_MODEL];
  }

  /** Try exact, then a few normalized variants, against the live map. */
  _lookupRaw(model) {
    if (this._raw[model]) return this._raw[model];
    const lower = model.toLowerCase();
    if (this._raw[lower]) return this._raw[lower];
    // strip provider prefixes like "anthropic/" or "openai/"
    const noPrefix = lower.replace(/^[^/]+\//, '');
    if (this._raw[noPrefix]) return this._raw[noPrefix];
    return null;
  }

  _familyRates(model) {
    const m = model.toLowerCase().replace(/^[^/]+\//, '');
    if (m.includes('opus')) return FALLBACK_RATES['claude-opus-4-8'];
    if (m.includes('haiku')) return FALLBACK_RATES['claude-haiku-4-5'];
    if (m.includes('sonnet')) return FALLBACK_RATES['claude-sonnet-4-5'];
    if (m.includes('codex') || m.startsWith('gpt-5')) return FALLBACK_RATES['gpt-5-codex'];
    return null;
  }

  /** Resolve the model context window used for pre-generation occupancy. */
  contextWindow(model) {
    const key = model || DEFAULT_MODEL;
    if (this._contextWindows.has(key)) return this._contextWindows.get(key);
    const windowTokens = this._resolveContextWindow(key);
    this._contextWindows.set(key, windowTokens);
    return windowTokens;
  }

  _resolveContextWindow(model) {
    if (!model || model === '<synthetic>' || model === 'unknown') return 0;

    const entry = this._lookupRaw(model);
    if (entry) {
      const raw =
        entry.max_input_tokens ||
        entry.max_tokens ||
        entry.max_context_window_tokens ||
        entry.context_window_tokens ||
        entry.context_window ||
        entry.max_total_tokens;
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }

    if (FALLBACK_CONTEXT_WINDOWS[model]) return FALLBACK_CONTEXT_WINDOWS[model];

    const fam = this._familyContextWindow(model);
    if (fam) return fam;

    return FALLBACK_CONTEXT_WINDOWS[DEFAULT_MODEL];
  }

  _familyContextWindow(model) {
    const m = model.toLowerCase().replace(/^[^/]+\//, '');
    if (m.includes('opus')) return FALLBACK_CONTEXT_WINDOWS['claude-opus-4-8'];
    if (m.includes('haiku')) return FALLBACK_CONTEXT_WINDOWS['claude-haiku-4-5'];
    if (m.includes('sonnet')) return FALLBACK_CONTEXT_WINDOWS['claude-sonnet-4-5'];
    if (m.includes('codex') || m.startsWith('gpt-5')) return FALLBACK_CONTEXT_WINDOWS['gpt-5-codex'];
    return null;
  }

  /** Compute USD cost for one turn's token buckets. */
  cost(model, tokens) {
    const r = this.rates(model);
    return (
      (tokens.input_tokens || 0) * r.input +
      (tokens.output_tokens || 0) * r.output +
      (tokens.cache_read_tokens || 0) * r.cache_read +
      (tokens.cache_write_tokens || 0) * r.cache_write
    );
  }
}

module.exports = { Pricing };
