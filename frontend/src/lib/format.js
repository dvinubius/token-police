// Pure formatting and labelling helpers. Framework-agnostic: no DOM, no
// network. Bodies moved verbatim from the legacy vanilla frontend during the
// Svelte + Vite migration so the existing frontend test remains the parity
// proof for this logic.

export function fmtTokens(n) {
  n = n || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

export function fmtTokensFull(n) {
  return (n || 0).toLocaleString();
}

export function fmtEstimatedCost(n) {
  n = n || 0;
  if (n === 0) return '$0';
  if (n < 0.01) return '$' + n.toFixed(4);
  if (n < 1) return '$' + n.toFixed(3);
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPct(n) {
  n = n || 0;
  if (n <= 0) return '0%';
  const pct = n * 100;
  if (pct < 0.1) return '<0.1%';
  if (pct < 10) return pct.toFixed(1) + '%';
  return pct.toFixed(0) + '%';
}

export function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function fmtDateShort(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function relDay(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const days = Math.floor((now - d) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return days + 'd ago';
  return fmtDateShort(ts);
}

export function srcLabel(s) { return s === 'codex' ? 'Codex' : 'CC'; }
export function srcFullLabel(s) { return s === 'codex' ? 'Codex' : 'Claude Code'; }
export function srcClass(s) { return s === 'codex' ? 'codex' : 'cc'; }
export function sessionRequestLabel(c) { return c && c.is_subagent ? 'Subagent task' : 'Human request'; }
