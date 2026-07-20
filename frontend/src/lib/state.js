// Shared UI state seam consumed by the filter/sort helpers in sessions.js.
//
// This state shape was lifted from the legacy vanilla frontend so the extracted
// helpers and their Node tests keep a plain-JavaScript seam. The Svelte runes
// store is the UI source of truth and mirrors filter, sort, expansion, and
// selection mutations into this singleton through syncSeam().

const LIST_PAGE = 20; // session-list render window step (initial size and scroll increment)

export const state = {
  page: 'stats',
  theme: 'dark',
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
