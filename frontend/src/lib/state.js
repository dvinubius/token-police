// Shared UI state seam consumed by the filter/sort helpers in sessions.js.
//
// This is the verbatim `state` object lifted from the former public/app.js so
// that the extracted helpers keep identical bodies and the frontend test keeps
// the same seam (it mutates state.filters / state.tableSorts /
// state.expandedSessionIds). A later migration issue replaces this plain
// singleton with the Svelte runes store; until then it is the single mutable
// source these pure-ish helpers read from.

const LIST_PAGE = 20; // session-list render window step (initial size and scroll increment)

export const state = {
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
