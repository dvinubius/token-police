'use strict';

/* Token Police frontend — vanilla JS, no external libraries, no network
 * calls except to this app's own local API. */

const REFRESH_MS = 30000;
const THEME_STORAGE_KEY = 'token-police-theme';
const THEMES = new Set(['graphite', 'light']);

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

const state = {
  page: 'stats',
  theme: 'graphite',
  sessions: [],
  summary: null,
  selectedId: null,
  llmCallsCache: null, // {id, llmCalls, session}
  activeRequestKey: null,
  filters: { search: '', source: '', project: '', from: '', to: '' },
};

/* ---------- theme switching ---------- */
function validTheme(theme) {
  return THEMES.has(theme) ? theme : 'graphite';
}

function storedTheme() {
  try {
    return validTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch (_) {
    return 'graphite';
  }
}

function applyTheme(theme, persist = true) {
  state.theme = validTheme(theme);
  document.documentElement.dataset.theme = state.theme;

  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    const nextTheme = state.theme === 'graphite' ? 'light' : 'graphite';
    const label = nextTheme === 'light' ? 'Switch to light theme' : 'Switch to dark theme';
    toggle.dataset.nextTheme = nextTheme;
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  }

  if (!persist) return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, state.theme);
  } catch (_) {}
}

function initTheme() {
  applyTheme(storedTheme(), false);
}

/* ---------- formatting helpers ---------- */
function fmtTokens(n) {
  n = n || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}
function fmtTokensFull(n) {
  return (n || 0).toLocaleString();
}
function fmtEstimatedCost(n) {
  n = n || 0;
  if (n === 0) return '$0';
  if (n < 0.01) return '$' + n.toFixed(4);
  if (n < 1) return '$' + n.toFixed(3);
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n) {
  n = n || 0;
  if (n <= 0) return '0%';
  const pct = n * 100;
  if (pct < 0.1) return '<0.1%';
  if (pct < 10) return pct.toFixed(1) + '%';
  return pct.toFixed(0) + '%';
}
function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function fmtDateShort(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function relDay(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const days = Math.floor((now - d) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return days + 'd ago';
  return fmtDateShort(ts);
}
function srcLabel(s) { return s === 'codex' ? 'Codex' : 'CC'; }
function srcClass(s) { return s === 'codex' ? 'codex' : 'cc'; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function num(s) { return `<span class="num">${esc(s)}</span>`; }

function normalizedModel(model) {
  return String(model || '').toLowerCase().replace(/^[^/]+\//, '');
}

function fallbackContextWindow(model) {
  const m = normalizedModel(model);
  if (!m || m === '<synthetic>' || m === 'unknown') return 0;
  if (FALLBACK_CONTEXT_WINDOWS[m]) return FALLBACK_CONTEXT_WINDOWS[m];
  if (m.includes('opus')) return FALLBACK_CONTEXT_WINDOWS['claude-opus-4-8'];
  if (m.includes('haiku')) return FALLBACK_CONTEXT_WINDOWS['claude-haiku-4-5'];
  if (m.includes('sonnet')) return FALLBACK_CONTEXT_WINDOWS['claude-sonnet-4-5'];
  if (m.includes('codex') || m.startsWith('gpt-5')) return FALLBACK_CONTEXT_WINDOWS['gpt-5-codex'];
  return FALLBACK_CONTEXT_WINDOWS['claude-sonnet-4-5'];
}

function contextTokensForLlmCall(t) {
  return t.context_input_tokens != null
    ? t.context_input_tokens
    : (t.input_tokens || 0) + (t.cache_read_tokens || 0) + (t.cache_write_tokens || 0);
}

function contextWindowForLlmCall(t) {
  return t.model_context_window_tokens || fallbackContextWindow(t.model);
}

function contextPctForLlmCall(t) {
  const contextTokens = contextTokensForLlmCall(t);
  const contextWindow = contextWindowForLlmCall(t);
  return contextWindow > 0 ? contextTokens / contextWindow : 0;
}

function cacheHitPctForLlmCall(t) {
  const contextTokens = contextTokensForLlmCall(t);
  return contextTokens > 0 ? (t.cache_read_tokens || 0) / contextTokens : 0;
}

function latestContextLlmCall(group) {
  return group.calls[group.calls.length - 1] || null;
}

/* ---------- page navigation ---------- */
function pageFromHash() {
  const page = String(location.hash || '').replace(/^#/, '');
  return page === 'sessions' ? 'sessions' : 'stats';
}

function setPage(page, updateHash = true) {
  state.page = page === 'sessions' ? 'sessions' : 'stats';

  document.querySelectorAll('.page').forEach((el) => {
    el.hidden = el.dataset.page !== state.page;
  });

  document.querySelectorAll('.page-tab').forEach((tab) => {
    const active = tab.dataset.pageTarget === state.page;
    tab.classList.toggle('active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });

  if (state.page !== 'sessions') closeRequestDialog();

  if (updateHash && location.hash !== `#${state.page}`) {
    history.replaceState(null, '', `#${state.page}`);
  }
}

/* ---------- data fetching ---------- */
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

async function refresh(initial) {
  try {
    const [summary, sessions] = await Promise.all([
      getJSON('/api/summary'),
      getJSON('/api/sessions'),
    ]);
    state.summary = summary;
    state.sessions = sessions;
    renderGlobal();
    renderChart();
    renderTop();
    populateProjectFilter();
    renderList();
    if (state.selectedId) await loadLlmCalls(state.selectedId, true);
    pulse();
  } catch (err) {
    console.error('refresh failed', err);
    document.getElementById('refreshText').textContent = 'offline';
  }
}

function pulse() {
  const el = document.getElementById('refreshIndicator');
  document.getElementById('refreshText').textContent = 'live';
  el.classList.remove('pulsing');
  void el.offsetWidth;
  el.classList.add('pulsing');
}

/* ---------- global stats ---------- */
function renderGlobal() {
  const t = state.summary.totals;
  const tokens = t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_write_tokens;
  document.getElementById('gsEstimatedCost').textContent = fmtEstimatedCost(t.estimated_cost_usd);
  document.getElementById('gsTokens').textContent = fmtTokens(tokens);
  document.getElementById('gsSessions').textContent = t.session_count;
  document.getElementById('gsLlmCalls').textContent = fmtTokensFull(t.llm_call_count);
}

/* ---------- daily chart (stacked SVG bars) ---------- */
// Pure CSS/flexbox chart: heights are percentages of a fixed-height container
// and widths are distributed by flexbox, so it needs no pixel measurement and
// renders correctly regardless of when layout settles.
function renderChart() {
  const container = document.getElementById('chart');
  const daily = state.summary.daily || [];
  const max = Math.max(1, ...daily.map((d) => d['claude-code'].tokens + d.codex.tokens));
  const ticks = 4;
  const n = daily.length;

  let yLabels = '';
  for (let i = ticks; i >= 0; i--) {
    yLabels += `<span class="y-tick">${fmtTokens((max / ticks) * i)}</span>`;
  }

  let gridLines = '';
  for (let i = 0; i <= ticks; i++) {
    gridLines += `<div class="grid-line" style="bottom:${(i / ticks) * 100}%"></div>`;
  }

  let bars = '';
  let xLabels = '';
  daily.forEach((d, i) => {
    const cc = d['claude-code'].tokens;
    const cx = d.codex.tokens;
    const tip =
      `${d.date}\nClaude Code: ${fmtTokensFull(cc)} tok · ${fmtEstimatedCost(d['claude-code'].estimated_cost_usd)}` +
      `\nCodex: ${fmtTokensFull(cx)} tok · ${fmtEstimatedCost(d.codex.estimated_cost_usd)}`;
    // codex on the bottom, claude-code stacked on top
    bars +=
      `<div class="day-col" title="${esc(tip)}">` +
        `<div class="seg cc" style="height:${(cc / max) * 100}%"></div>` +
        `<div class="seg codex" style="height:${(cx / max) * 100}%"></div>` +
      `</div>`;
    const show = i % 5 === 0 || i === n - 1;
    xLabels += `<span class="x-tick">${show ? d.date.slice(5) : ''}</span>`;
  });

  container.innerHTML =
    `<div class="chart-grid">` +
      `<div class="chart-y">${yLabels}</div>` +
      `<div class="chart-main">` +
        `<div class="chart-bars">${gridLines}${bars}</div>` +
        `<div class="chart-x">${xLabels}</div>` +
      `</div>` +
    `</div>`;
}

/* ---------- top 5 ---------- */
function renderTop() {
  const ol = document.getElementById('topList');
  const top = state.summary.top_sessions || [];
  ol.replaceChildren();
  if (!top.length) {
    ol.innerHTML = '<li class="dim">No data yet.</li>';
    return;
  }
  top.forEach((c, i) => {
    const li = document.createElement('li');
    li.innerHTML =
      `<span class="top-rank">${num(i + 1)}</span>` +
      `<span class="top-main"><div class="top-title">${esc(c.title)}</div>` +
      `<div class="top-sub"><span class="badge ${srcClass(c.source)}">${srcLabel(c.source)}</span> ${esc(c.project)} · ${num(fmtTokens(c.total_tokens))} tok</div></span>` +
      `<span class="top-estimated-cost">${num(fmtEstimatedCost(c.total_estimated_cost_usd))}</span>`;
    li.onclick = () => selectSession(c.id);
    ol.appendChild(li);
  });
}

/* ---------- filters ---------- */
function populateProjectFilter() {
  const sel = document.getElementById('projectFilter');
  const cur = sel.value;
  const projects = [...new Set(state.sessions.map((c) => c.project))].sort((a, b) =>
    a.localeCompare(b));
  sel.replaceChildren();
  const all = document.createElement('option');
  all.value = ''; all.textContent = 'All projects';
  sel.appendChild(all);
  for (const p of projects) {
    const o = document.createElement('option');
    o.value = p; o.textContent = p;
    sel.appendChild(o);
  }
  if (projects.includes(cur)) sel.value = cur;
}

function applyFilters(list) {
  const f = state.filters;
  const q = f.search.trim().toLowerCase();
  const from = f.from ? new Date(f.from + 'T00:00:00') : null;
  const to = f.to ? new Date(f.to + 'T23:59:59') : null;
  return list.filter((c) => {
    if (f.source && c.source !== f.source) return false;
    if (f.project && c.project !== f.project) return false;
    if (q && !(`${c.title} ${c.project}`.toLowerCase().includes(q))) return false;
    if (from || to) {
      const d = new Date(c.last_active_at);
      if (from && d < from) return false;
      if (to && d > to) return false;
    }
    return true;
  });
}

/* ---------- Session list ---------- */
function renderList() {
  const wrap = document.getElementById('sessionList');
  const filtered = applyFilters(state.sessions);
  const totalEstimatedCost = filtered.reduce((s, c) => s + c.total_estimated_cost_usd, 0);
  document.getElementById('listMeta').innerHTML =
    `${num(filtered.length)} session${filtered.length === 1 ? '' : 's'} · ${num(fmtEstimatedCost(totalEstimatedCost))}`;

  wrap.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'dim';
    empty.style.padding = '16px';
    empty.textContent = 'No sessions match the current filters.';
    wrap.appendChild(empty);
    return;
  }

  for (const c of filtered) {
    const tokens = c.total_input_tokens + c.total_output_tokens + c.total_cache_read_tokens + c.total_cache_write_tokens;
    const row = document.createElement('div');
    row.className = 'session-row' + (c.id === state.selectedId ? ' selected' : '');
    row.innerHTML =
      `<span class="badge ${srcClass(c.source)}">${srcLabel(c.source)}</span>` +
      `<div class="session-main">` +
        `<div class="session-title">${esc(c.title)}</div>` +
        `<div class="session-sub"><span class="proj">${esc(c.project)}</span><span>${num(c.human_request_count || 0)} human req</span><span>${num(c.llm_call_count)} LLM calls</span><span>${num(fmtTokens(tokens))} tok</span></div>` +
      `</div>` +
      `<div class="session-right">` +
        `<div class="session-estimated-cost">${num(fmtEstimatedCost(c.total_estimated_cost_usd))}</div>` +
        `<div class="session-meta">${relDay(c.last_active_at)}</div>` +
      `</div>`;
    row.onclick = () => selectSession(c.id);
    wrap.appendChild(row);
  }
}

/* ---------- detail view ---------- */
async function selectSession(id) {
  setPage('sessions');
  state.selectedId = id;
  closeRequestDialog();
  renderList();
  await loadLlmCalls(id, false);
}

async function loadLlmCalls(id, isRefresh) {
  try {
    const data = await getJSON(`/api/sessions/${encodeURIComponent(id)}/llm-calls`);
    state.llmCallsCache = { id, session: data.session, llmCalls: data.llm_calls };
    if (state.selectedId === id) renderDetail();
  } catch (err) {
    if (!isRefresh) console.error('loadLlmCalls failed', err);
  }
}

// 80th-percentile estimated-cost threshold: LLM calls at/above it are the top 20%.
function hotEstimatedCostThreshold(llmCalls) {
  const costs = llmCalls.map((t) => t.estimated_cost_usd).filter((c) => c > 0).sort((a, b) => a - b);
  if (costs.length < 5) return Infinity; // not enough calls to single out
  const idx = Math.ceil(costs.length * 0.8) - 1;
  return costs[Math.max(0, Math.min(idx, costs.length - 1))];
}

function humanRequestKey(t) {
  if (t.human_request_index != null) return String(t.human_request_index);
  const request = t.human_request_text || '';
  return request ? `human-request:${request}` : `llm-call:${t.llm_call_index}`;
}

function groupHumanRequests(llmCalls) {
  const groups = new Map();
  for (const t of llmCalls) {
    const key = humanRequestKey(t);
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        human_request_index: t.human_request_index,
        human_request_text: t.human_request_text || '',
        started_at: t.timestamp,
        last_active_at: t.timestamp,
        calls: [],
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        estimated_cost_usd: 0,
      };
      groups.set(key, g);
    }
    g.calls.push(t);
    if (!g.started_at || String(t.timestamp).localeCompare(String(g.started_at)) < 0) g.started_at = t.timestamp;
    if (!g.last_active_at || String(t.timestamp).localeCompare(String(g.last_active_at)) > 0) g.last_active_at = t.timestamp;
    g.input_tokens += t.input_tokens || 0;
    g.output_tokens += t.output_tokens || 0;
    g.cache_read_tokens += t.cache_read_tokens || 0;
    g.cache_write_tokens += t.cache_write_tokens || 0;
    g.estimated_cost_usd += t.estimated_cost_usd || 0;
  }
  return [...groups.values()];
}

function requestNumber(_g, groupIndex) {
  return groupIndex + 1;
}

function requestPreview(text, n) {
  const request = text || '';
  return request.length > n ? request.slice(0, n).trimEnd() + '…' : request;
}

function renderDetail() {
  const { session: c, llmCalls } = state.llmCallsCache;
  document.getElementById('emptyDetail').hidden = true;
  const el = document.getElementById('detailContent');
  el.hidden = false;

  // Preserve scroll position across re-renders (e.g. 30-second auto-refresh).
  const prevWrap = el.querySelector('.requests-wrap');
  const savedScroll = prevWrap ? prevWrap.scrollTop : 0;

  const tokens = c.total_input_tokens + c.total_output_tokens + c.total_cache_read_tokens + c.total_cache_write_tokens;
  const requests = groupHumanRequests(llmCalls);
  state.llmCallsCache.humanRequests = requests;

  // Show newest human requests first; calls inside the dialog remain chronological.
  const sortedRequests = [...requests].reverse();
  const sessionTitle = c.session_title || (requests.find((g) => g.human_request_text) || {}).human_request_text || c.title;

  const totals = `
    <div class="totals-grid">
      <div class="tstat total"><div class="tstat-label">Total Tokens</div><div class="tstat-value">${num(fmtTokens(tokens))}</div></div>
      <div class="tstat"><div class="tstat-label">Fresh input</div><div class="tstat-value">${num(fmtTokens(c.total_input_tokens))}</div></div>
      <div class="tstat"><div class="tstat-label">Output</div><div class="tstat-value">${num(fmtTokens(c.total_output_tokens))}</div></div>
      <div class="tstat"><div class="tstat-label">Cache read</div><div class="tstat-value">${num(fmtTokens(c.total_cache_read_tokens))}</div></div>
      <div class="tstat"><div class="tstat-label">Cache write</div><div class="tstat-value">${num(fmtTokens(c.total_cache_write_tokens))}</div></div>
      <div class="tstat estimated-cost"><div class="tstat-label">Estimated cost</div><div class="tstat-value">${num(fmtEstimatedCost(c.total_estimated_cost_usd))}</div></div>
    </div>`;

  const rows = sortedRequests.map((g, i) => {
    const chronologicalIndex = requests.indexOf(g);
    const request = g.human_request_text || '';
    const requestShort = requestPreview(request, 68);
    const latestLlmCall = latestContextLlmCall(g);
    const latestContextTokens = latestLlmCall ? contextTokensForLlmCall(latestLlmCall) : 0;
    return `<tr class="request-row" data-request-key="${esc(g.key)}" tabindex="0" role="button" aria-label="Open LLM calls for human request ${requestNumber(g, chronologicalIndex)}">
      <td class="l">${requestNumber(g, chronologicalIndex)}</td>
      <td class="l ts-cell">${fmtDate(g.started_at)}</td>
      <td class="l request-cell" title="${esc(request)}">${esc(requestShort) || '<span class="dim">—</span>'}</td>
      <td>${fmtTokensFull(g.calls.length)}</td>
      <td title="${fmtTokensFull(latestContextTokens)} context tokens">${fmtTokens(latestContextTokens)}</td>
      <td>${fmtTokensFull(g.input_tokens)}</td>
      <td>${fmtTokensFull(g.cache_read_tokens)}</td>
      <td>${fmtTokensFull(g.output_tokens)}</td>
      <td>${fmtTokensFull(g.cache_write_tokens)}</td>
      <td class="estimated-cost">${fmtEstimatedCost(g.estimated_cost_usd)}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="detail-header">
      <h2>Session</h2>
      <div class="session-title-card" title="${esc(sessionTitle)}">
        <div class="session-title-text">${esc(sessionTitle)}</div>
      </div>
      <div class="detail-sub">
        <span class="badge ${srcClass(c.source)}">${srcLabel(c.source)}</span>
        <span>${esc(c.project)}</span>
        <span>·</span><span>${num(c.human_request_count || requests.length)} human requests</span>
        <span>·</span><span>${num(c.llm_call_count)} LLM calls</span>
        <span>·</span><span>${num(fmtDateShort(c.started_at))} → ${num(fmtDateShort(c.last_active_at))}</span>
      </div>
    </div>
    ${totals}
    <div class="requests-wrap">
      <table class="requests">
        <thead><tr>
          <th class="l">#</th><th class="l">Time</th><th class="l">Human request</th><th>LLM calls</th>
          <th>Context</th><th>Fresh input</th><th>Cache R</th><th>Output</th><th>Cache W</th><th>Estimated cost</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="legend-note">Click a human request to inspect the individual LLM calls that it triggered.</div>`;

  el.querySelectorAll('.request-row').forEach((row) => {
    row.addEventListener('click', () => openRequestDialog(row.dataset.requestKey));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openRequestDialog(row.dataset.requestKey);
      }
    });
  });

  if (savedScroll) {
    const newWrap = el.querySelector('.requests-wrap');
    if (newWrap) newWrap.scrollTop = savedScroll;
  }

  if (state.activeRequestKey) openRequestDialog(state.activeRequestKey);
}

function ensureRequestDialog() {
  let dialog = document.getElementById('requestDialog');
  if (dialog) return dialog;

  dialog = document.createElement('div');
  dialog.id = 'requestDialog';
  dialog.className = 'dialog-backdrop';
  dialog.hidden = true;
  dialog.innerHTML = `
    <div class="request-dialog" role="dialog" aria-modal="true" aria-labelledby="requestDialogTitle">
      <div class="dialog-head">
        <div>
          <div class="dialog-kicker">Human request</div>
          <h2 id="requestDialogTitle">LLM calls</h2>
        </div>
        <button type="button" class="dialog-close" id="requestDialogClose" aria-label="Close dialog">&times;</button>
      </div>
      <div class="dialog-body" id="requestDialogBody"></div>
    </div>`;
  document.body.appendChild(dialog);

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeRequestDialog();
  });
  dialog.querySelector('#requestDialogClose').addEventListener('click', closeRequestDialog);
  return dialog;
}

function openRequestDialog(key) {
  const groups = state.llmCallsCache && state.llmCallsCache.humanRequests;
  const group = groups && groups.find((g) => g.key === key);
  if (!group) return;

  state.activeRequestKey = key;
  const dialog = ensureRequestDialog();
  const body = dialog.querySelector('#requestDialogBody');
  const title = dialog.querySelector('#requestDialogTitle');
  const chronologicalIndex = groups.indexOf(group);
  const threshold = hotEstimatedCostThreshold(group.calls);
  const request = group.human_request_text || '';

  title.innerHTML = `Request ${num(requestNumber(group, chronologicalIndex))}`;

  const callRows = [...group.calls].reverse().map((t) => {
    const hot = isFinite(threshold) && t.estimated_cost_usd >= threshold && t.estimated_cost_usd > 0;
    const contextTokens = contextTokensForLlmCall(t);
    const contextWindow = contextWindowForLlmCall(t);
    const contextPctTitle = contextWindow
      ? `${fmtTokensFull(contextTokens)} / ${fmtTokensFull(contextWindow)} context tokens`
      : `${fmtTokensFull(contextTokens)} context tokens`;
    return `<tr class="${hot ? 'hot' : ''}">
      <td class="l">${t.llm_call_index + 1}</td>
      <td class="l ts-cell">${fmtDate(t.timestamp)}</td>
      <td class="l model-cell">${esc(t.model)}</td>
      <td title="${fmtTokensFull(contextTokens)} context tokens">${fmtTokens(contextTokens)}</td>
      <td title="${esc(contextPctTitle)}">${fmtPct(contextPctForLlmCall(t))}</td>
      <td>${fmtPct(cacheHitPctForLlmCall(t))}</td>
      <td>${fmtTokensFull(t.input_tokens)}</td>
      <td>${fmtTokensFull(t.cache_read_tokens)}</td>
      <td>${fmtTokensFull(t.output_tokens)}</td>
      <td>${fmtTokensFull(t.cache_write_tokens)}</td>
      <td class="estimated-cost">${fmtEstimatedCost(t.estimated_cost_usd)}${hot ? '<span class="hot-flag">▲</span>' : ''}</td>
    </tr>`;
  }).join('');

  body.innerHTML = `
    <div class="request-full">${esc(request) || '<span class="dim">No human request text captured.</span>'}</div>
    <div class="dialog-stats">
      <div class="tstat"><div class="tstat-label">LLM calls</div><div class="tstat-value">${num(fmtTokensFull(group.calls.length))}</div></div>
      <div class="tstat"><div class="tstat-label">Fresh input</div><div class="tstat-value">${num(fmtTokens(group.input_tokens))}</div></div>
      <div class="tstat"><div class="tstat-label">Cache read</div><div class="tstat-value">${num(fmtTokens(group.cache_read_tokens))}</div></div>
      <div class="tstat"><div class="tstat-label">Output</div><div class="tstat-value">${num(fmtTokens(group.output_tokens))}</div></div>
      <div class="tstat estimated-cost"><div class="tstat-label">Estimated cost</div><div class="tstat-value">${num(fmtEstimatedCost(group.estimated_cost_usd))}</div></div>
    </div>
    <div class="dialog-table-wrap">
      <table class="llm-calls">
        <thead><tr>
          <th class="l">LLM call #</th><th class="l">Time</th><th class="l">Model</th>
          <th>Context</th><th>Context %</th><th>Cache hit %</th>
          <th>Fresh input</th><th>Cache R</th><th>Output</th><th>Cache W</th><th>Estimated cost</th>
        </tr></thead>
        <tbody>${callRows}</tbody>
      </table>
    </div>
    <div class="legend-note">Rows highlighted in red are the top ${num('20%')} most expensive LLM calls for this human request.</div>`;

  dialog.hidden = false;
  document.body.classList.add('modal-open');
  dialog.querySelector('#requestDialogClose').focus();
}

function closeRequestDialog() {
  const dialog = document.getElementById('requestDialog');
  if (!dialog) return;
  dialog.hidden = true;
  state.activeRequestKey = null;
  document.body.classList.remove('modal-open');
}

/* ---------- wire up filter controls ---------- */
function bindControls() {
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      applyTheme(themeToggle.dataset.nextTheme || (state.theme === 'graphite' ? 'light' : 'graphite'));
    });
  }

  document.querySelectorAll('.page-tab').forEach((tab) => {
    tab.addEventListener('click', () => setPage(tab.dataset.pageTarget));
  });
  window.addEventListener('hashchange', () => setPage(pageFromHash(), false));

  const search = document.getElementById('searchInput');
  search.addEventListener('input', () => { state.filters.search = search.value; renderList(); });
  document.getElementById('sourceFilter').addEventListener('change', (e) => {
    state.filters.source = e.target.value; renderList();
  });
  document.getElementById('projectFilter').addEventListener('change', (e) => {
    state.filters.project = e.target.value; renderList();
  });
  document.getElementById('fromDate').addEventListener('change', (e) => {
    state.filters.from = e.target.value; renderList();
  });
  document.getElementById('toDate').addEventListener('change', (e) => {
    state.filters.to = e.target.value; renderList();
  });
  document.getElementById('clearFilters').addEventListener('click', () => {
    state.filters = { search: '', source: '', project: '', from: '', to: '' };
    search.value = '';
    document.getElementById('sourceFilter').value = '';
    document.getElementById('projectFilter').value = '';
    document.getElementById('fromDate').value = '';
    document.getElementById('toDate').value = '';
    renderList();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.activeRequestKey) closeRequestDialog();
  });
}

/* ---------- boot ---------- */
initTheme();
setPage(pageFromHash(), false);
bindControls();
refresh(true);
setInterval(() => refresh(false), REFRESH_MS);
