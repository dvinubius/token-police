'use strict';

/*
 * In-memory store of all parsed conversations. Each conversation is keyed by id;
 * re-parsing a file replaces its record wholesale (simple and robust for a
 * local tool — transcripts are not large enough to need incremental tailing).
 */

const path = require('path');
const { parseClaudeFile } = require('./parseClaude');
const { parseCodexFile } = require('./parseCodex');

const TITLE_MAX = 60;

function truncate(str, n) {
  if (!str) return str;
  return str.length > n ? str.slice(0, n - 1).trimEnd() + '…' : str;
}

// Local-time YYYY-MM-DD bucket for a timestamp.
function dayKey(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

class Store {
  constructor(pricing) {
    this.pricing = pricing;
    this.conversations = new Map(); // id -> enriched conversation
    this.fileToId = new Map(); // filePath -> id
  }

  /** Parse (or re-parse) a file and upsert the resulting conversation. */
  upsertFromFile(source, filePath) {
    let convo;
    try {
      convo = source === 'codex' ? parseCodexFile(filePath) : parseClaudeFile(filePath);
    } catch (err) {
      console.warn(`[store] Failed to parse ${filePath}: ${err.message}`);
      return;
    }
    if (!convo) return;

    // Drop empty conversations (no billable turns) to keep the list meaningful.
    if (!convo.turns.length) {
      this.removeFile(filePath);
      return;
    }

    this._enrich(convo);

    // If this file previously mapped to a different id, clean that up.
    const prevId = this.fileToId.get(filePath);
    if (prevId && prevId !== convo.id) this.conversations.delete(prevId);

    this.fileToId.set(filePath, convo.id);
    this.conversations.set(convo.id, convo);
  }

  removeFile(filePath) {
    const id = this.fileToId.get(filePath);
    if (id) {
      this.conversations.delete(id);
      this.fileToId.delete(filePath);
    }
  }

  /** Compute per-turn cost and conversation-level totals. */
  _enrich(convo) {
    let tin = 0;
    let tout = 0;
    let tread = 0;
    let twrite = 0;
    let tcost = 0;
    for (const t of convo.turns) {
      t.cost_usd = this.pricing.cost(t.model, t);
      tin += t.input_tokens;
      tout += t.output_tokens;
      tread += t.cache_read_tokens;
      twrite += t.cache_write_tokens;
      tcost += t.cost_usd;
    }
    convo.total_input_tokens = tin;
    convo.total_output_tokens = tout;
    convo.total_cache_read_tokens = tread;
    convo.total_cache_write_tokens = twrite;
    convo.total_cost_usd = tcost;
    convo.turn_count = convo.turns.length;
  }

  _listItem(c) {
    return {
      id: c.id,
      source: c.source,
      project: c.project,
      title: truncate(c.title, TITLE_MAX),
      started_at: c.started_at,
      last_active_at: c.last_active_at,
      total_input_tokens: c.total_input_tokens,
      total_output_tokens: c.total_output_tokens,
      total_cache_read_tokens: c.total_cache_read_tokens,
      total_cache_write_tokens: c.total_cache_write_tokens,
      total_cost_usd: c.total_cost_usd,
      turn_count: c.turn_count,
    };
  }

  /** All conversations, sorted by last activity descending. */
  listConversations() {
    return [...this.conversations.values()]
      .map((c) => this._listItem(c))
      .sort((a, b) => String(b.last_active_at).localeCompare(String(a.last_active_at)));
  }

  getTurns(id) {
    const c = this.conversations.get(id);
    if (!c) return null;
    return c.turns.map((t) => ({
      turn_index: t.turn_index,
      timestamp: t.timestamp,
      model: t.model,
      prompt: t.prompt || '',
      input_tokens: t.input_tokens,
      output_tokens: t.output_tokens,
      cache_read_tokens: t.cache_read_tokens,
      cache_write_tokens: t.cache_write_tokens,
      cost_usd: t.cost_usd,
    }));
  }

  getConversationMeta(id) {
    const c = this.conversations.get(id);
    if (!c) return null;
    return this._listItem(c);
  }

  /** Aggregate totals, per-source totals, 30-day daily breakdown, top 5. */
  summary() {
    const totals = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: 0, turn_count: 0 };
    const bySource = {
      'claude-code': { ...emptyTotals(), conversation_count: 0 },
      codex: { ...emptyTotals(), conversation_count: 0 },
    };

    // Build the last-30-days window (local calendar days, oldest first).
    const days = [];
    const dayIndex = new Map();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const bucket = {
        date: key,
        'claude-code': { tokens: 0, cost_usd: 0 },
        codex: { tokens: 0, cost_usd: 0 },
      };
      days.push(bucket);
      dayIndex.set(key, bucket);
    }

    for (const c of this.conversations.values()) {
      const src = c.source;
      if (bySource[src]) bySource[src].conversation_count += 1;

      for (const t of c.turns) {
        const turnTokens = t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_write_tokens;

        totals.input_tokens += t.input_tokens;
        totals.output_tokens += t.output_tokens;
        totals.cache_read_tokens += t.cache_read_tokens;
        totals.cache_write_tokens += t.cache_write_tokens;
        totals.cost_usd += t.cost_usd;
        totals.turn_count += 1;

        if (bySource[src]) {
          const b = bySource[src];
          b.input_tokens += t.input_tokens;
          b.output_tokens += t.output_tokens;
          b.cache_read_tokens += t.cache_read_tokens;
          b.cache_write_tokens += t.cache_write_tokens;
          b.cost_usd += t.cost_usd;
          b.turn_count += 1;
        }

        const key = dayKey(t.timestamp);
        const bucket = key && dayIndex.get(key);
        if (bucket && bucket[src]) {
          bucket[src].tokens += turnTokens;
          bucket[src].cost_usd += t.cost_usd;
        }
      }
    }

    const top = [...this.conversations.values()]
      .sort((a, b) => b.total_cost_usd - a.total_cost_usd)
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        source: c.source,
        project: c.project,
        title: truncate(c.title, TITLE_MAX),
        total_cost_usd: c.total_cost_usd,
        total_tokens:
          c.total_input_tokens + c.total_output_tokens + c.total_cache_read_tokens + c.total_cache_write_tokens,
      }));

    return {
      totals: { ...totals, conversation_count: this.conversations.size },
      by_source: bySource,
      daily: days,
      top_conversations: top,
    };
  }
}

function emptyTotals() {
  return { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: 0, turn_count: 0 };
}

module.exports = { Store };
