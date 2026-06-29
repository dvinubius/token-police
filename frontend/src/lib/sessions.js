// Session-list filter/sort/visibility helpers. These read shared UI state
// (filters, table sort directions, expanded subagent rows) from state.js.
// Bodies moved verbatim from the legacy vanilla frontend.

import { state } from './state.js';

export function applyFilters(list) {
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

export function sortedRows(rows, table, valueByKey) {
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

export function visibleSessionRows(rows) {
  const rowIds = new Set(rows.map((row) => row.id));
  return rows.filter((row) => {
    if (!row.is_subagent) return true;
    return rowIds.has(row.parent_session_id) && state.expandedSessionIds.has(row.parent_session_id);
  });
}
