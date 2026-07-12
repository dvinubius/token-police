// Runes-based reactive store. Replaces the former mutable state object from the
// legacy vanilla frontend as the single source the component tree reacts to. Components
// read fields off `store` and call the actions below; reactive derivation in
// the components replaces the old manual renderX() calls.
//
// The pure filter/sort helpers in lib/sessions.js still read the plain `state`
// seam in lib/state.js (kept for the Node frontend test). The actions below
// keep that seam mirrored from this store via syncSeam() so those helpers see
// current filter/sort/expansion values while components stay reactive on
// `store`.

import { fetchSummary, fetchSessions, fetchLlmCalls, groupHumanRequests } from './lib/index.js';
import { state } from './lib/state.js';

const THEME_STORAGE_KEY = 'token-police-theme';
const THEMES = new Set(['dark', 'light']);
const LIST_PAGE = 20; // session-list render window step (initial size and scroll increment)
export const REFRESH_MS = 30000;

function validTheme(theme) {
  if (theme === 'graphite') return 'dark'; // legacy stored value → migrate
  return THEMES.has(theme) ? theme : 'dark';
}

function storedTheme() {
  try {
    return validTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch (_) {
    return 'dark';
  }
}

// Two-page hash routing, matching the former pageFromHash().
export function pageFromHash() {
  const page = String(location.hash || '').replace(/^#/, '');
  return page === 'sessions' ? 'sessions' : 'stats';
}

export const store = $state({
  page: pageFromHash(),
  theme: storedTheme(),
  sessions: [],
  summary: null,
  listLimit: LIST_PAGE, // rows currently rendered in the session list; grows on scroll
  listResetNonce: 0, // bumped to scroll the list back to the top on filter changes
  selectedId: null,
  expandedSessionIds: new Set(),
  llmCallsCache: null, // {id, llmCalls, session}
  activeRequestKey: null,
  expandedLlmCalls: new Set(),
  refreshStatus: 'live', // 'live' | 'offline'
  refreshPulseNonce: 0, // bumped after each successful refresh to restart the indicator pulse
  filters: { search: '', source: '', project: '', from: '', to: '' },
  tableSorts: {
    humanRequests: { key: 'time', dir: 'desc' },
    llmCalls: { key: 'time', dir: 'desc' },
  },
});

// Mirror the shared UI state the pure helpers (applyFilters, sortedRows,
// visibleSessionRows) read from lib/state.js. Called after every mutation of
// filters/sorts/expansion so the helpers observe current values.
function syncSeam() {
  state.filters = { ...store.filters };
  state.tableSorts = {
    humanRequests: { ...store.tableSorts.humanRequests },
    llmCalls: { ...store.tableSorts.llmCalls },
  };
  state.expandedSessionIds = new Set(store.expandedSessionIds);
  state.selectedId = store.selectedId;
}

/* ---------- theme ---------- */
export function applyTheme(theme, persist = true) {
  store.theme = validTheme(theme);
  document.documentElement.dataset.theme = store.theme;
  if (!persist) return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, store.theme);
  } catch (_) {}
}

export function toggleTheme() {
  applyTheme(store.theme === 'dark' ? 'light' : 'dark');
}

/* ---------- routing ---------- */
export function setPage(page, updateHash = true) {
  store.page = page === 'sessions' ? 'sessions' : 'stats';
  if (store.page !== 'sessions') closeRequestDialog();
  if (updateHash && location.hash !== `#${store.page}`) {
    history.replaceState(null, '', `#${store.page}`);
  }
}

/* ---------- filters ---------- */
export function setFilter(key, value) {
  store.filters = { ...store.filters, [key]: value };
  syncSeam();
  resetListWindow();
}

export function clearFilters() {
  store.filters = { search: '', source: '', project: '', from: '', to: '' };
  syncSeam();
  resetListWindow();
}

/* ---------- list window ---------- */
// Reset the render window to the first page and scroll the list to the top.
// Use whenever the result set changes underneath the user (filter changes);
// refreshes and selection keep the window in place.
export function resetListWindow() {
  store.listLimit = LIST_PAGE;
  store.listResetNonce += 1;
}

export function growList() {
  store.listLimit += LIST_PAGE;
}

export function toggleSubagent(id) {
  const next = new Set(store.expandedSessionIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  store.expandedSessionIds = next;
  syncSeam();
}

/* ---------- table sorting ---------- */
export function setTableSort(table, key) {
  const cur = store.tableSorts[table] || { key: 'time', dir: 'desc' };
  const dir = cur.key === key && cur.dir === 'desc' ? 'asc' : 'desc';
  store.tableSorts = { ...store.tableSorts, [table]: { key, dir } };
  syncSeam();
}

/* ---------- selection + detail ---------- */
// Selecting a session switches to the Sessions page, records the selection,
// closes any open dialog, and loads the session's LLM calls for the detail pane.
export function selectSession(id) {
  setPage('sessions');
  store.selectedId = id;
  syncSeam();
  closeRequestDialog();
  loadLlmCalls(id, false);
}

export async function loadLlmCalls(id, isRefresh) {
  try {
    const data = await fetchLlmCalls(id);
    if (store.selectedId !== id) return;
    store.llmCallsCache = { id, session: data.session, llmCalls: data.llm_calls };
  } catch (err) {
    if (!isRefresh) {
      console.error('loadLlmCalls failed', err);
      return;
    }
    throw err;
  }
}

// Grouped Human requests for the currently loaded session. Recomputed from the
// LLM-call cache; both the detail table and the dialog derive from this so they
// agree on group identity and chronological ordering.
export function groupedHumanRequests() {
  const cache = store.llmCallsCache;
  if (!cache || cache.id !== store.selectedId) return [];
  return groupHumanRequests(cache.llmCalls, cache.session.human_requests);
}

/* ---------- request dialog ---------- */
export function openRequestDialog(key) {
  store.activeRequestKey = key;
}

export function closeRequestDialog() {
  store.activeRequestKey = null;
  store.expandedLlmCalls = new Set();
}

export function toggleLlmCall(callKey) {
  const next = new Set(store.expandedLlmCalls);
  if (next.has(callKey)) next.delete(callKey);
  else next.add(callKey);
  store.expandedLlmCalls = next;
}

/* ---------- data ---------- */
// Initial + polling refresh of the global summary, session list, and selected
// session detail. Local view state (selection, list window/scroll, open dialog,
// expansions, sorts) intentionally lives outside the fetched data assignments.
export async function refresh() {
  try {
    const [summary, sessions] = await Promise.all([fetchSummary(), fetchSessions()]);
    store.summary = summary;
    store.sessions = sessions;
    if (store.selectedId) await loadLlmCalls(store.selectedId, true);
    store.refreshStatus = 'live';
    store.refreshPulseNonce += 1;
  } catch (err) {
    console.error('refresh failed', err);
    store.refreshStatus = 'offline';
  }
}

export function startPolling() {
  refresh();
  const timer = setInterval(refresh, REFRESH_MS);
  return () => clearInterval(timer);
}

syncSeam();
