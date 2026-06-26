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

const LIST_PAGE = 20; // session-list render window step (initial size and scroll increment)

const state = {
  page: 'stats',
  theme: 'graphite',
  sessions: [],
  summary: null,
  listLimit: LIST_PAGE, // rows currently rendered in the session list; grows on scroll
  selectedId: null,
  expandedSessionIds: new Set(),
  llmCallsCache: null, // {id, llmCalls, session}
  activeRequestKey: null,
  expandedLlmCalls: new Set(),
  filters: { search: '', source: '', project: '', from: '', to: '' },
  tableSorts: {
    humanRequests: { key: 'time', dir: 'desc' },
    llmCalls: { key: 'time', dir: 'desc' },
  },
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
function srcFullLabel(s) { return s === 'codex' ? 'Codex' : 'Claude Code'; }
function srcClass(s) { return s === 'codex' ? 'codex' : 'cc'; }
function sessionRequestLabel(c) { return c && c.is_subagent ? 'Subagent task' : 'Human request'; }
function displayTotals(c) {
  const inclusive = !c.is_subagent && (c.subagent_session_count || 0) > 0;
  return {
    input_tokens: inclusive ? c.inclusive_total_input_tokens : c.total_input_tokens,
    output_tokens: inclusive ? c.inclusive_total_output_tokens : c.total_output_tokens,
    cache_read_tokens: inclusive ? c.inclusive_total_cache_read_tokens : c.total_cache_read_tokens,
    cache_write_tokens: inclusive ? c.inclusive_total_cache_write_tokens : c.total_cache_write_tokens,
    estimated_cost_usd: inclusive ? c.inclusive_total_estimated_cost_usd : c.total_estimated_cost_usd,
    llm_call_count: inclusive ? c.inclusive_llm_call_count : c.llm_call_count,
    last_active_at: inclusive ? c.inclusive_last_active_at : c.last_active_at,
  };
}
function totalTokensForTotals(t) {
  return (t.input_tokens || 0) + (t.output_tokens || 0) +
    (t.cache_read_tokens || 0) + (t.cache_write_tokens || 0);
}
function sessionBadges(c, expanded = false, showChevron = true) {
  const badges = [`<span class="badge ${srcClass(c.source)}">${srcLabel(c.source)}</span>`];
  if (c.is_subagent) badges.push('<span class="badge subagent">SUB</span>');
  else if (showChevron && (c.subagent_session_count || 0) > 0) {
    badges.push(`<button type="button" class="session-chevron" data-session-toggle="${esc(c.id)}" aria-label="${expanded ? 'Collapse' : 'Expand'} subagent sessions" aria-expanded="${expanded ? 'true' : 'false'}">${expanded ? '▴' : '▾'}</button>`);
  }
  return `<div class="session-badges">${badges.join('')}</div>`;
}
function subagentDisplayName(c) {
  return c.subagent_label || c.subagent_name || c.subagent_role || c.title || 'Subagent';
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function num(s) { return `<span class="num">${esc(s)}</span>`; }
function tokenCell(n) {
  return `<td title="${fmtTokensFull(n)} tokens">${fmtTokens(n)}</td>`;
}

function statsGrid(t, options = {}) {
  const tokens = totalTokensForTotals(t);
  const labels = options.labels !== false;
  return `<div class="totals-grid">
    <div class="tstat total">${labels ? '<div class="tstat-label">Total Tokens</div>' : ''}<div class="tstat-value">${num(fmtTokens(tokens))}</div></div>
    <div class="tstat fresh">${labels ? '<div class="tstat-label">Fresh input</div>' : ''}<div class="tstat-value">${num(fmtTokens(t.input_tokens))}</div></div>
    <div class="tstat output">${labels ? '<div class="tstat-label">Output</div>' : ''}<div class="tstat-value">${num(fmtTokens(t.output_tokens))}</div></div>
    <div class="tstat cache-read">${labels ? '<div class="tstat-label">Cache read</div>' : ''}<div class="tstat-value">${num(fmtTokens(t.cache_read_tokens))}</div></div>
    <div class="tstat cache-write">${labels ? '<div class="tstat-label">Cache write</div>' : ''}<div class="tstat-value">${num(fmtTokens(t.cache_write_tokens))}</div></div>
    <div class="tstat estimated-cost">${labels ? '<div class="tstat-label">Estimated cost</div>' : ''}<div class="tstat-value">${num(fmtEstimatedCost(t.estimated_cost_usd))}</div></div>
  </div>`;
}

function statValues(c, inclusive = false) {
  return {
    input_tokens: inclusive ? c.inclusive_total_input_tokens : c.total_input_tokens,
    output_tokens: inclusive ? c.inclusive_total_output_tokens : c.total_output_tokens,
    cache_read_tokens: inclusive ? c.inclusive_total_cache_read_tokens : c.total_cache_read_tokens,
    cache_write_tokens: inclusive ? c.inclusive_total_cache_write_tokens : c.total_cache_write_tokens,
    estimated_cost_usd: inclusive ? c.inclusive_total_estimated_cost_usd : c.total_estimated_cost_usd,
  };
}

function statsRow(label, values, className = '') {
  const isTotal = className.split(/\s+/).includes('total-row');
  return `<div class="stats-row ${className}">
    <div class="stats-row-label">${esc(label)}</div>
    ${statsGrid(values, { labels: isTotal })}
  </div>`;
}

function statsBlock(values) {
  return `<div class="stats-breakdown simple-stats">
    <div class="stats-row stats-row-single">
      ${statsGrid(values)}
    </div>
  </div>`;
}

function sessionStats(c) {
  const subagents = Array.isArray(c.subagent_sessions) ? c.subagent_sessions : [];
  if (c.is_subagent || !subagents.length) return statsBlock(statValues(c));
  return `<div class="stats-breakdown">
    ${statsRow('Total', statValues(c, true), 'total-row')}
    ${statsRow('Main agent', statValues(c))}
    ${subagents.map((s) => statsRow(subagentDisplayName(s), statValues(s), 'subagent-stats-row')).join('')}
  </div>`;
}

function detailField(label, value, title = '') {
  const titleAttr = title ? ` title="${esc(title)}"` : '';
  return `<div class="insight-field"><div class="insight-label">${esc(label)}</div><div class="insight-value"${titleAttr}>${value ? esc(value) : '<span class="dim">Not captured</span>'}</div></div>`;
}

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

function totalTokensForGroup(group) {
  return (group.input_tokens || 0) + (group.output_tokens || 0) +
    (group.cache_read_tokens || 0) + (group.cache_write_tokens || 0);
}

function totalTokensForLlmCall(t) {
  return (t.input_tokens || 0) + (t.output_tokens || 0) +
    (t.cache_read_tokens || 0) + (t.cache_write_tokens || 0);
}

function timestampValue(ts) {
  const time = Date.parse(ts || '');
  return Number.isFinite(time) ? time : 0;
}

function sortHeader(table, key, label, alignClass = '') {
  const sort = state.tableSorts[table];
  const active = sort && sort.key === key;
  const dir = active ? sort.dir : '';
  const ariaSort = active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none';
  const indicator = active ? (dir === 'asc' ? '▲' : '▼') : '';
  const className = `${alignClass} sortable`.trim();
  return `<th class="${className}" aria-sort="${ariaSort}">` +
    `<button type="button" class="sort-btn" data-sort-table="${esc(table)}" data-sort-key="${esc(key)}" aria-label="Sort by ${esc(label)}">` +
      `<span>${esc(label)}</span><span class="sort-indicator" aria-hidden="true">${indicator}</span>` +
    `</button>` +
  `</th>`;
}

function sortedRows(rows, table, valueByKey) {
  const sort = state.tableSorts[table] || { key: 'time', dir: 'desc' };
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = valueByKey(a, sort.key);
    const bv = valueByKey(b, sort.key);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

function setTableSort(table, key) {
  const cur = state.tableSorts[table] || { key: 'time', dir: 'desc' };
  const dir = cur.key === key && cur.dir === 'desc' ? 'asc' : 'desc';
  state.tableSorts[table] = { key, dir };
  if (table === 'humanRequests') renderDetail();
  if (table === 'llmCalls' && state.activeRequestKey) openRequestDialog(state.activeRequestKey);
}

function bindSortButtons(root) {
  root.querySelectorAll('.sort-btn').forEach((button) => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      setTableSort(button.dataset.sortTable, button.dataset.sortKey);
    });
  });
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
  document.getElementById('gsLlmCalls').textContent = fmtTokens(t.llm_call_count);
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
    const sourceClass = srcClass(c.source);
    const tokens = fmtTokens(c.total_tokens);
    li.innerHTML =
      `<span class="top-rank">${num(i + 1)}</span>` +
      `<span class="top-source"><span class="badge ${sourceClass}">${srcFullLabel(c.source)}</span></span>` +
      `<span class="top-main"><span class="top-title">${esc(c.title)}</span>` +
      `<span class="top-sub"><span class="badge ${sourceClass}">${srcLabel(c.source)}</span><span class="top-project">${esc(c.project)}</span> · ${num(tokens)} tok</span></span>` +
      `<span class="top-summary"><span class="top-project">${esc(c.project)}</span> <span class="top-token-count">${num(tokens)} tok</span></span>` +
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
let listObserver = null;

// Reset the render window to the first page. Use this whenever the result set
// changes underneath the user (filter/sort), so they start at the top; plain
// renderList() preserves the window for refreshes and selection.
function resetListWindow() {
  state.listLimit = LIST_PAGE;
  renderList();
  document.getElementById('sessionList').scrollTop = 0;
}

function visibleSessionRows(rows) {
  const rowIds = new Set(rows.map((row) => row.id));
  return rows.filter((row) => {
    if (!row.is_subagent) return true;
    return rowIds.has(row.parent_session_id) && state.expandedSessionIds.has(row.parent_session_id);
  });
}

function renderList() {
  const wrap = document.getElementById('sessionList');
  const filtered = applyFilters(state.sessions);
  const visible = visibleSessionRows(filtered);
  const totalEstimatedCost = filtered.reduce((s, c) => s + c.total_estimated_cost_usd, 0);
  document.getElementById('listMeta').innerHTML =
    `${num(visible.length)} visible / ${num(filtered.length)} session${filtered.length === 1 ? '' : 's'} · ${num(fmtEstimatedCost(totalEstimatedCost))}`;

  if (listObserver) listObserver.disconnect();
  wrap.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'dim';
    empty.style.padding = '16px';
    empty.textContent = 'No sessions match the current filters.';
    wrap.appendChild(empty);
    return;
  }

  const limit = Math.min(state.listLimit, visible.length);
  for (let i = 0; i < limit; i++) {
    const c = visible[i];
    const displayed = displayTotals(c);
    const tokens = totalTokensForTotals(displayed);
    const subagentCount = c.subagent_session_count || 0;
    const expanded = state.expandedSessionIds.has(c.id);
    const row = document.createElement('div');
    row.className = 'session-row' + (c.is_subagent ? ' subagent-row' : '') + (subagentCount && !c.is_subagent ? ' has-subagents' : '') + (c.id === state.selectedId ? ' selected' : '');
    if (subagentCount && !c.is_subagent) row.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (c.is_subagent) row.style.setProperty('--subagent-indent', `${Math.max(1, c.subagent_depth || 1) * 18}px`);
    row.innerHTML =
      sessionBadges(c, expanded) +
      `<div class="session-main">` +
        `<div class="session-title">${esc(c.title)}</div>` +
        `<div class="session-sub"><span class="proj">${esc(c.project)}</span><span>${num(c.human_request_count || 0)} ${c.is_subagent ? 'tasks' : 'human req'}</span>${subagentCount && !c.is_subagent ? `<span>${num(subagentCount)} subagents</span>` : ''}<span>${num(displayed.llm_call_count)} LLM calls</span><span>${num(fmtTokens(tokens))} tok</span></div>` +
      `</div>` +
      `<div class="session-right">` +
        `<div class="session-estimated-cost">${num(fmtEstimatedCost(displayed.estimated_cost_usd))}</div>` +
        `<div class="session-meta">${relDay(displayed.last_active_at)}</div>` +
      `</div>`;
    row.onclick = () => selectSession(c.id);
    const toggle = row.querySelector('.session-chevron');
    if (toggle) {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (expanded) state.expandedSessionIds.delete(c.id);
        else state.expandedSessionIds.add(c.id);
        renderList();
      });
    }
    wrap.appendChild(row);
  }

  // Infinite scroll: a sentinel below the window grows it as it nears view.
  if (limit < visible.length) {
    const sentinel = document.createElement('div');
    sentinel.className = 'list-sentinel';
    wrap.appendChild(sentinel);
    if (!listObserver) {
      listObserver = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            state.listLimit += LIST_PAGE;
            renderList();
          }
        },
        { root: wrap, rootMargin: '200px' }
      );
    }
    listObserver.observe(sentinel);
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

// 80th-percentile estimated-cost threshold: rows at/above it are the top 20%.
function hotEstimatedCostThreshold(items, minItems = 1) {
  const costs = items.map((item) => item.estimated_cost_usd).filter((c) => c > 0).sort((a, b) => a - b);
  if (costs.length < minItems) return Infinity;
  const idx = Math.ceil(costs.length * 0.8) - 1;
  return costs[Math.max(0, Math.min(idx, costs.length - 1))];
}

function humanRequestKey(t) {
  if (t.human_request_index != null) return String(t.human_request_index);
  const request = t.human_request_text || '';
  return request ? `human-request:${request}` : `llm-call:${t.llm_call_index}`;
}

function newHumanRequestGroup(key, index, text, fullText, timestamp) {
  return {
    key,
    human_request_index: index,
    human_request_text: text || '',
    human_request_full_text: fullText || text || '',
    started_at: timestamp,
    last_active_at: timestamp,
    calls: [],
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    estimated_cost_usd: 0,
  };
}

// Build one group per Human request. When the session provides a Human request
// list (Claude Code), seed groups from it in chronological order so requests
// with zero LLM calls still get a row; LLM calls then attach by request key.
// Sessions without the list (e.g. Codex) fall back to call-derived grouping.
function groupHumanRequests(llmCalls, humanRequests) {
  const groups = new Map();
  if (Array.isArray(humanRequests)) {
    for (const r of humanRequests) {
      const key = String(r.human_request_index);
      if (!groups.has(key)) {
        groups.set(key, newHumanRequestGroup(
          key, r.human_request_index, r.human_request_text, r.human_request_full_text, r.timestamp
        ));
      }
    }
  }
  for (const t of llmCalls) {
    const key = humanRequestKey(t);
    let g = groups.get(key);
    if (!g) {
      g = newHumanRequestGroup(
        key, t.human_request_index, t.human_request_text, t.human_request_full_text, t.timestamp
      );
      groups.set(key, g);
    }
    g.calls.push(t);
    if (!g.human_request_full_text && t.human_request_full_text) g.human_request_full_text = t.human_request_full_text;
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

function expandedCallKey(requestKey, llmCall) {
  return `${state.selectedId || ''}:${requestKey}:${llmCall.llm_call_index}`;
}

function modelSummary(calls) {
  const models = [...new Set(calls.map((t) => t.model).filter(Boolean))];
  if (!models.length) return 'Model not captured';
  if (models.length === 1) return models[0];
  const shown = models.slice(0, 3).join(', ');
  return `Mixed models: ${shown}${models.length > 3 ? ` +${models.length - 3}` : ''}`;
}

function llmCallInsightPanel(t, hot) {
  const fields = [
    detailField('Activity', t.activity_summary || 'No tool activity captured'),
    detailField(
      'Assistant preview',
      t.assistant_preview || 'No assistant text captured',
      t.assistant_full_text || t.assistant_preview || ''
    ),
    detailField('Outcome', t.outcome || 'LLM call recorded'),
  ];
  if (hot) {
    fields.push(detailField('Cost driver', t.cost_driver || 'No single dominant driver detected'));
    fields.push(detailField('Tool / command hint', t.tool_hint || 'No tool hint captured'));
  }
  return `<div class="llm-insights">${fields.join('')}</div>`;
}

function renderDetail() {
  const { session: c, llmCalls } = state.llmCallsCache;
  document.getElementById('emptyDetail').hidden = true;
  const el = document.getElementById('detailContent');
  el.hidden = false;

  // Preserve scroll position across re-renders (e.g. 30-second auto-refresh).
  const prevWrap = el.querySelector('.requests-wrap');
  const savedScroll = prevWrap ? prevWrap.scrollTop : 0;

  const requests = groupHumanRequests(llmCalls, c.human_requests);
  state.llmCallsCache.humanRequests = requests;
  const requestLabel = sessionRequestLabel(c);
  const subagentCount = c.subagent_session_count || 0;
  const displayed = displayTotals(c);

  const sortedRequests = sortedRows(requests, 'humanRequests', (g, key) => {
    switch (key) {
      case 'time': return timestampValue(g.started_at);
      case 'llmCalls': return g.calls.length;
      case 'totalTokens': return totalTokensForGroup(g);
      case 'inputTokens': return g.input_tokens || 0;
      case 'cacheReadTokens': return g.cache_read_tokens || 0;
      case 'cacheWriteTokens': return g.cache_write_tokens || 0;
      case 'outputTokens': return g.output_tokens || 0;
      case 'estimatedCost': return g.estimated_cost_usd || 0;
      default: return timestampValue(g.started_at);
    }
  });
  const sessionTitle = c.session_title || (requests.find((g) => g.human_request_text) || {}).human_request_text || c.title;

  const requestHotThreshold = hotEstimatedCostThreshold(requests, 1);
  const rows = sortedRequests.map((g) => {
    const chronologicalIndex = requests.indexOf(g);
    const request = g.human_request_text || '';
    const requestFull = g.human_request_full_text || request;
    const requestShort = requestPreview(request, 68);
    const latestLlmCall = latestContextLlmCall(g);
    const latestContextTokens = latestLlmCall ? contextTokensForLlmCall(latestLlmCall) : 0;
    const totalTokens = totalTokensForGroup(g);
    const hot = isFinite(requestHotThreshold) && g.estimated_cost_usd >= requestHotThreshold && g.estimated_cost_usd > 0;
    return `<tr class="request-row ${hot ? 'hot' : ''}" data-request-key="${esc(g.key)}" tabindex="0" role="button" aria-label="Open LLM calls for ${requestLabel.toLowerCase()} ${requestNumber(g, chronologicalIndex)}">
      <td class="l">${requestNumber(g, chronologicalIndex)}</td>
      <td class="l ts-cell">${fmtDate(g.started_at)}</td>
      <td class="l request-cell" title="${esc(requestFull)}">${esc(requestShort) || '<span class="dim">—</span>'}</td>
      <td>${fmtTokensFull(g.calls.length)}</td>
      <td title="${fmtTokensFull(latestContextTokens)} context tokens">${fmtTokens(latestContextTokens)}</td>
      ${tokenCell(g.input_tokens)}
      ${tokenCell(g.cache_read_tokens)}
      ${tokenCell(g.cache_write_tokens)}
      ${tokenCell(g.output_tokens)}
      ${tokenCell(totalTokens)}
      <td class="estimated-cost">${fmtEstimatedCost(g.estimated_cost_usd)}${hot ? '<span class="hot-flag">▲</span>' : ''}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="detail-header">
      <h2>Session</h2>
      <div class="prompt-title">${c.is_subagent ? 'Initial subagent task' : 'Initial session prompt'}</div>
      <div class="session-title-card" title="${esc(sessionTitle)}">
        <div class="session-title-text">${esc(sessionTitle)}</div>
      </div>
      <div class="detail-sub">
        ${sessionBadges(c, false, false)}
        <span>${esc(c.project)}</span>
        <span>·</span><span>${num(c.human_request_count || requests.length)} ${c.is_subagent ? 'subagent tasks' : 'human requests'}</span>
        ${subagentCount && !c.is_subagent ? `<span>·</span><span>${num(subagentCount)} subagents</span>` : ''}
        <span>·</span><span>${num(displayed.llm_call_count)} LLM calls</span>
        <span>·</span><span>${num(fmtDateShort(c.started_at))} → ${num(fmtDateShort(displayed.last_active_at))}</span>
      </div>
    </div>
    ${sessionStats(c)}
    <div class="requests-wrap">
      <table class="requests">
        <thead><tr>
          <th class="l">#</th>${sortHeader('humanRequests', 'time', 'Time', 'l')}<th class="l">${requestLabel}</th>${sortHeader('humanRequests', 'llmCalls', 'LLM calls')}
          <th>Context</th>${sortHeader('humanRequests', 'inputTokens', 'Fresh input')}${sortHeader('humanRequests', 'cacheReadTokens', 'Cache R')}${sortHeader('humanRequests', 'cacheWriteTokens', 'Cache W')}${sortHeader('humanRequests', 'outputTokens', 'Output')}${sortHeader('humanRequests', 'totalTokens', 'Total tokens')}${sortHeader('humanRequests', 'estimatedCost', 'Estimated cost')}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="legend-note">Click a ${requestLabel.toLowerCase()} to inspect the individual LLM calls that it triggered. Rows highlighted in red are the highest-cost ${requestLabel.toLowerCase()}s.</div>`;

  bindSortButtons(el);

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
          <div class="dialog-model" id="requestDialogModel"></div>
        </div>
        <button type="button" class="dialog-close" id="requestDialogClose" aria-label="Close dialog"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
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
  const session = state.llmCallsCache.session || {};
  const requestLabel = sessionRequestLabel(session);
  const dialog = ensureRequestDialog();
  const wasHidden = dialog.hidden;
  const body = dialog.querySelector('#requestDialogBody');
  const title = dialog.querySelector('#requestDialogTitle');
  const model = dialog.querySelector('#requestDialogModel');
  const kicker = dialog.querySelector('.dialog-kicker');
  const chronologicalIndex = groups.indexOf(group);
  const threshold = hotEstimatedCostThreshold(group.calls, 5);
  const request = group.human_request_full_text || group.human_request_text || '';
  const prevWrap = body.querySelector('.dialog-table-wrap');
  const savedScroll = prevWrap ? prevWrap.scrollTop : 0;

  title.innerHTML = `Request ${num(requestNumber(group, chronologicalIndex))}`;
  model.textContent = modelSummary(group.calls);
  if (kicker) kicker.textContent = requestLabel;

  const sortedCalls = sortedRows(group.calls, 'llmCalls', (t, key) => {
    switch (key) {
      case 'time': return timestampValue(t.timestamp);
      case 'inputTokens': return t.input_tokens || 0;
      case 'totalTokens': return totalTokensForLlmCall(t);
      case 'cacheReadTokens': return t.cache_read_tokens || 0;
      case 'cacheWriteTokens': return t.cache_write_tokens || 0;
      case 'outputTokens': return t.output_tokens || 0;
      case 'estimatedCost': return t.estimated_cost_usd || 0;
      default: return timestampValue(t.timestamp);
    }
  });

  const callRows = sortedCalls.map((t) => {
    const hot = isFinite(threshold) && t.estimated_cost_usd >= threshold && t.estimated_cost_usd > 0;
    const contextTokens = contextTokensForLlmCall(t);
    const contextWindow = contextWindowForLlmCall(t);
    const contextPctTitle = contextWindow
      ? `${fmtTokensFull(contextTokens)} / ${fmtTokensFull(contextWindow)} context tokens`
      : `${fmtTokensFull(contextTokens)} context tokens`;
    const totalTokens = totalTokensForLlmCall(t);
    const expandKey = expandedCallKey(group.key, t);
    const expanded = state.expandedLlmCalls.has(expandKey);
    return `<tr class="llm-call-row ${hot ? 'hot' : ''}" data-call-key="${esc(expandKey)}" tabindex="0" role="button" aria-expanded="${expanded ? 'true' : 'false'}" aria-label="Toggle details for LLM call ${t.llm_call_index + 1}">
      <td class="l expand-cell"><button type="button" class="expand-toggle" aria-label="${expanded ? 'Collapse' : 'Expand'} LLM call ${t.llm_call_index + 1}" title="${expanded ? 'Collapse details' : 'Expand details'}">${expanded ? '▾' : '▸'}</button></td>
      <td class="l">${t.llm_call_index + 1}</td>
      <td class="l ts-cell">${fmtDate(t.timestamp)}</td>
      <td title="${fmtTokensFull(contextTokens)} context tokens">${fmtTokens(contextTokens)}</td>
      <td title="${esc(contextPctTitle)}">${fmtPct(contextPctForLlmCall(t))}</td>
      <td>${fmtPct(cacheHitPctForLlmCall(t))}</td>
      ${tokenCell(t.input_tokens)}
      ${tokenCell(t.cache_read_tokens)}
      ${tokenCell(t.cache_write_tokens)}
      ${tokenCell(t.output_tokens)}
      ${tokenCell(totalTokens)}
      <td class="estimated-cost">${fmtEstimatedCost(t.estimated_cost_usd)}${hot ? '<span class="hot-flag">▲</span>' : ''}</td>
    </tr>${expanded ? `<tr class="llm-call-detail-row ${hot ? 'hot' : ''}"><td colspan="12">${llmCallInsightPanel(t, hot)}</td></tr>` : ''}`;
  }).join('');

  body.innerHTML = `
    <div class="prompt-title">${requestLabel} prompt</div>
    <div class="request-full" title="${esc(request)}"><div class="request-full-text">${esc(request) || `<span class="dim">No ${requestLabel.toLowerCase()} text captured.</span>`}</div></div>
    <div class="dialog-stats">
      <div class="tstat"><div class="tstat-label">LLM calls</div><div class="tstat-value">${num(fmtTokensFull(group.calls.length))}</div></div>
      <div class="tstat"><div class="tstat-label">Fresh input</div><div class="tstat-value">${num(fmtTokens(group.input_tokens))}</div></div>
      <div class="tstat"><div class="tstat-label">Cache read</div><div class="tstat-value">${num(fmtTokens(group.cache_read_tokens))}</div></div>
      <div class="tstat"><div class="tstat-label">Output</div><div class="tstat-value">${num(fmtTokens(group.output_tokens))}</div></div>
      <div class="tstat estimated-cost"><div class="tstat-label">Estimated cost</div><div class="tstat-value">${num(fmtEstimatedCost(group.estimated_cost_usd))}</div></div>
    </div>
    <div class="dialog-table-wrap">
      <table class="llm-calls">
        <colgroup>
          <col class="col-expand">
          <col class="col-call">
          <col class="col-time">
          <col class="col-context">
          <col class="col-context-pct">
          <col class="col-cache-hit">
          <col class="col-fresh">
          <col class="col-cache-read">
          <col class="col-cache-write">
          <col class="col-output">
          <col class="col-total">
          <col class="col-cost">
        </colgroup>
        <thead><tr>
          <th class="l expand-head"></th><th class="l">LLM call #</th>${sortHeader('llmCalls', 'time', 'Time', 'l')}
          <th>Context</th><th>Context %</th><th>Cache hit %</th>
          ${sortHeader('llmCalls', 'inputTokens', 'Fresh input')}${sortHeader('llmCalls', 'cacheReadTokens', 'Cache R')}${sortHeader('llmCalls', 'cacheWriteTokens', 'Cache W')}${sortHeader('llmCalls', 'outputTokens', 'Output')}${sortHeader('llmCalls', 'totalTokens', 'Total tokens')}${sortHeader('llmCalls', 'estimatedCost', 'Estimated cost')}
        </tr></thead>
        <tbody>${callRows}</tbody>
      </table>
    </div>
    <div class="legend-note">Rows highlighted in red are the top ${num('20%')} most expensive LLM calls for this ${requestLabel.toLowerCase()}.</div>`;

  dialog.hidden = false;
  document.body.classList.add('modal-open');
  bindSortButtons(dialog);
  body.querySelectorAll('.llm-call-row').forEach((row) => {
    const toggle = () => {
      const key = row.dataset.callKey;
      if (state.expandedLlmCalls.has(key)) state.expandedLlmCalls.delete(key);
      else state.expandedLlmCalls.add(key);
      openRequestDialog(group.key);
    };
    row.addEventListener('click', toggle);
    row.addEventListener('keydown', (e) => {
      if (e.target !== row) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });
  if (savedScroll) {
    const newWrap = body.querySelector('.dialog-table-wrap');
    if (newWrap) newWrap.scrollTop = savedScroll;
  }
  if (wasHidden) dialog.querySelector('#requestDialogClose').focus();
}

function closeRequestDialog() {
  const dialog = document.getElementById('requestDialog');
  if (!dialog) return;
  dialog.hidden = true;
  state.activeRequestKey = null;
  state.expandedLlmCalls.clear();
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
  search.addEventListener('input', () => { state.filters.search = search.value; resetListWindow(); });
  document.getElementById('sourceFilter').addEventListener('change', (e) => {
    state.filters.source = e.target.value; resetListWindow();
  });
  document.getElementById('projectFilter').addEventListener('change', (e) => {
    state.filters.project = e.target.value; resetListWindow();
  });
  document.getElementById('fromDate').addEventListener('change', (e) => {
    state.filters.from = e.target.value; resetListWindow();
  });
  document.getElementById('toDate').addEventListener('change', (e) => {
    state.filters.to = e.target.value; resetListWindow();
  });
  document.getElementById('clearFilters').addEventListener('click', () => {
    state.filters = { search: '', source: '', project: '', from: '', to: '' };
    search.value = '';
    document.getElementById('sourceFilter').value = '';
    document.getElementById('projectFilter').value = '';
    document.getElementById('fromDate').value = '';
    document.getElementById('toDate').value = '';
    resetListWindow();
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
