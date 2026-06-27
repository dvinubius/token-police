// Runes-based reactive store. Replaces the former mutable `state` object from
// public/app.js as the single source the component tree reacts to. Components
// read fields off `store` and call the actions below; reactive derivation in
// the components replaces the old manual renderX() calls.
//
// Note: the pure filter/sort helpers in lib/sessions.js still read the plain
// `state` seam in lib/state.js (kept for the Node frontend test). Wiring those
// helpers to this store happens with the Sessions page in a later issue; this
// store already carries the matching fields so that work has somewhere to land.

import { fetchSummary, fetchSessions } from './lib/index.js';

const THEME_STORAGE_KEY = 'token-police-theme';
const THEMES = new Set(['graphite', 'light']);
const LIST_PAGE = 20; // session-list render window step (initial size and scroll increment)

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
  selectedId: null,
  expandedSessionIds: new Set(),
  llmCallsCache: null, // {id, llmCalls, session}
  activeRequestKey: null,
  expandedLlmCalls: new Set(),
  refreshStatus: 'live', // 'live' | 'offline'; pulse wiring lands in the polling issue
  filters: { search: '', source: '', project: '', from: '', to: '' },
  tableSorts: {
    humanRequests: { key: 'time', dir: 'desc' },
    llmCalls: { key: 'time', dir: 'desc' },
  },
});

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
  applyTheme(store.theme === 'graphite' ? 'light' : 'graphite');
}

/* ---------- routing ---------- */
export function setPage(page, updateHash = true) {
  store.page = page === 'sessions' ? 'sessions' : 'stats';
  if (store.page !== 'sessions') store.activeRequestKey = null;
  if (updateHash && location.hash !== `#${store.page}`) {
    history.replaceState(null, '', `#${store.page}`);
  }
}

/* ---------- selection ---------- */
// Selecting a session switches to the Sessions page and records the selection.
// Loading the selected session's LLM calls / rendering detail lands in issue 3.
export function selectSession(id) {
  setPage('sessions');
  store.selectedId = id;
  store.activeRequestKey = null;
}

/* ---------- data ---------- */
// Initial + refresh load of the global summary and the session list. The 30s
// polling timer, selection re-fetch, and indicator pulse land in the polling
// issue; this is the boot load so Stats renders.
export async function refresh() {
  try {
    const [summary, sessions] = await Promise.all([fetchSummary(), fetchSessions()]);
    store.summary = summary;
    store.sessions = sessions;
    store.refreshStatus = 'live';
  } catch (err) {
    console.error('refresh failed', err);
    store.refreshStatus = 'offline';
  }
}
