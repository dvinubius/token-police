'use strict';

/* Token Dashboard frontend — vanilla JS, no external libraries, no network
 * calls except to this app's own local API. */

const REFRESH_MS = 30000;

const state = {
  conversations: [],
  summary: null,
  selectedId: null,
  turnsCache: null, // {id, turns, conversation}
  filters: { search: '', source: '', project: '', from: '', to: '' },
};

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
function fmtCost(n) {
  n = n || 0;
  if (n === 0) return '$0';
  if (n < 0.01) return '$' + n.toFixed(4);
  if (n < 1) return '$' + n.toFixed(3);
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

/* ---------- data fetching ---------- */
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

async function refresh(initial) {
  try {
    const [summary, conversations] = await Promise.all([
      getJSON('/api/summary'),
      getJSON('/api/conversations'),
    ]);
    state.summary = summary;
    state.conversations = conversations;
    renderGlobal();
    renderChart();
    renderTop();
    populateProjectFilter();
    renderList();
    if (state.selectedId) await loadTurns(state.selectedId, true);
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
  document.getElementById('gsCost').textContent = fmtCost(t.cost_usd);
  document.getElementById('gsTokens').textContent = fmtTokens(tokens);
  document.getElementById('gsConvos').textContent = t.conversation_count;
  document.getElementById('gsTurns').textContent = fmtTokensFull(t.turn_count);
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
      `${d.date}\nClaude Code: ${fmtTokensFull(cc)} tok · ${fmtCost(d['claude-code'].cost_usd)}` +
      `\nCodex: ${fmtTokensFull(cx)} tok · ${fmtCost(d.codex.cost_usd)}`;
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
  const top = state.summary.top_conversations || [];
  ol.replaceChildren();
  if (!top.length) {
    ol.innerHTML = '<li class="dim">No data yet.</li>';
    return;
  }
  top.forEach((c, i) => {
    const li = document.createElement('li');
    li.innerHTML =
      `<span class="top-rank">${i + 1}</span>` +
      `<span class="top-main"><div class="top-title">${esc(c.title)}</div>` +
      `<div class="top-sub"><span class="badge ${srcClass(c.source)}">${srcLabel(c.source)}</span> ${esc(c.project)} · ${fmtTokens(c.total_tokens)} tok</div></span>` +
      `<span class="top-cost">${fmtCost(c.total_cost_usd)}</span>`;
    li.onclick = () => selectConversation(c.id);
    ol.appendChild(li);
  });
}

/* ---------- filters ---------- */
function populateProjectFilter() {
  const sel = document.getElementById('projectFilter');
  const cur = sel.value;
  const projects = [...new Set(state.conversations.map((c) => c.project))].sort((a, b) =>
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

/* ---------- conversation list ---------- */
function renderList() {
  const wrap = document.getElementById('convList');
  const filtered = applyFilters(state.conversations);
  const totalCost = filtered.reduce((s, c) => s + c.total_cost_usd, 0);
  document.getElementById('listMeta').textContent =
    `${filtered.length} conversation${filtered.length === 1 ? '' : 's'} · ${fmtCost(totalCost)}`;

  wrap.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'dim';
    empty.style.padding = '16px';
    empty.textContent = 'No conversations match the current filters.';
    wrap.appendChild(empty);
    return;
  }

  for (const c of filtered) {
    const tokens = c.total_input_tokens + c.total_output_tokens + c.total_cache_read_tokens + c.total_cache_write_tokens;
    const row = document.createElement('div');
    row.className = 'conv-row' + (c.id === state.selectedId ? ' selected' : '');
    row.innerHTML =
      `<span class="badge ${srcClass(c.source)}">${srcLabel(c.source)}</span>` +
      `<div class="conv-main">` +
        `<div class="conv-title">${esc(c.title)}</div>` +
        `<div class="conv-sub"><span class="proj">${esc(c.project)}</span><span>${c.turn_count} turns</span><span>${fmtTokens(tokens)} tok</span></div>` +
      `</div>` +
      `<div class="conv-right">` +
        `<div class="conv-cost">${fmtCost(c.total_cost_usd)}</div>` +
        `<div class="conv-meta2">${relDay(c.last_active_at)}</div>` +
      `</div>`;
    row.onclick = () => selectConversation(c.id);
    wrap.appendChild(row);
  }
}

/* ---------- detail view ---------- */
async function selectConversation(id) {
  state.selectedId = id;
  renderList();
  await loadTurns(id, false);
}

async function loadTurns(id, isRefresh) {
  try {
    const data = await getJSON(`/api/conversations/${encodeURIComponent(id)}/turns`);
    state.turnsCache = { id, ...data };
    if (state.selectedId === id) renderDetail();
  } catch (err) {
    if (!isRefresh) console.error('loadTurns failed', err);
  }
}

// 80th-percentile cost threshold: turns at/above it are the top 20%.
function hotThreshold(turns) {
  const costs = turns.map((t) => t.cost_usd).filter((c) => c > 0).sort((a, b) => a - b);
  if (costs.length < 5) return Infinity; // not enough turns to single out
  const idx = Math.ceil(costs.length * 0.8) - 1;
  return costs[Math.max(0, Math.min(idx, costs.length - 1))];
}

function renderDetail() {
  const { conversation: c, turns } = state.turnsCache;
  document.getElementById('emptyDetail').hidden = true;
  const el = document.getElementById('detailContent');
  el.hidden = false;

  // Preserve scroll position across re-renders (e.g. 30-second auto-refresh).
  const prevWrap = el.querySelector('.turns-wrap');
  const savedScroll = prevWrap ? prevWrap.scrollTop : 0;

  const tokens = c.total_input_tokens + c.total_output_tokens + c.total_cache_read_tokens + c.total_cache_write_tokens;
  const threshold = hotThreshold(turns);

  // Show newest turns first; hotThreshold uses the original array (cost only).
  const sortedTurns = [...turns].reverse();

  const totals = `
    <div class="totals-grid">
      <div class="tstat"><div class="tstat-label">Input</div><div class="tstat-value">${fmtTokens(c.total_input_tokens)}</div></div>
      <div class="tstat"><div class="tstat-label">Output</div><div class="tstat-value">${fmtTokens(c.total_output_tokens)}</div></div>
      <div class="tstat"><div class="tstat-label">Cache read</div><div class="tstat-value">${fmtTokens(c.total_cache_read_tokens)}</div></div>
      <div class="tstat"><div class="tstat-label">Cache write</div><div class="tstat-value">${fmtTokens(c.total_cache_write_tokens)}</div></div>
      <div class="tstat cost"><div class="tstat-label">Total cost</div><div class="tstat-value">${fmtCost(c.total_cost_usd)}</div></div>
    </div>`;

  const rows = sortedTurns.map((t) => {
    const hot = isFinite(threshold) && t.cost_usd >= threshold && t.cost_usd > 0;
    const prompt = t.prompt || '';
    const promptShort = prompt.length > 36 ? prompt.slice(0, 36) + '…' : prompt;
    return `<tr class="${hot ? 'hot' : ''}">
      <td class="l">${t.turn_index + 1}</td>
      <td class="l ts-cell">${fmtDate(t.timestamp)}</td>
      <td class="l model-cell">${esc(t.model)}</td>
      <td class="l prompt-cell" title="${esc(prompt)}">${esc(promptShort) || '<span class="dim">—</span>'}</td>
      <td>${fmtTokensFull(t.input_tokens)}</td>
      <td>${fmtTokensFull(t.output_tokens)}</td>
      <td>${fmtTokensFull(t.cache_read_tokens)}</td>
      <td>${fmtTokensFull(t.cache_write_tokens)}</td>
      <td class="cost">${fmtCost(t.cost_usd)}${hot ? '<span class="hot-flag">▲</span>' : ''}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="detail-header">
      <h2>${esc(c.title)}</h2>
      <div class="detail-sub">
        <span class="badge ${srcClass(c.source)}">${srcLabel(c.source)}</span>
        <span>${esc(c.project)}</span>
        <span>·</span><span>${c.turn_count} turns</span>
        <span>·</span><span>${fmtTokens(tokens)} tokens</span>
        <span>·</span><span>${fmtDateShort(c.started_at)} → ${fmtDateShort(c.last_active_at)}</span>
      </div>
    </div>
    ${totals}
    <div class="turns-wrap">
      <table class="turns">
        <thead><tr>
          <th class="l">#</th><th class="l">Time</th><th class="l">Model</th><th class="l">Prompt</th>
          <th>Input</th><th>Output</th><th>Cache R</th><th>Cache W</th><th>Cost</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="legend-note">Rows highlighted in red are the top 20% most expensive turns in this conversation.</div>`;

  if (savedScroll) {
    const newWrap = el.querySelector('.turns-wrap');
    if (newWrap) newWrap.scrollTop = savedScroll;
  }
}

/* ---------- wire up filter controls ---------- */
function bindControls() {
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
}

/* ---------- boot ---------- */
bindControls();
refresh(true);
setInterval(() => refresh(false), REFRESH_MS);
