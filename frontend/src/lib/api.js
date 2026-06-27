// Thin client for this app's own local read-only API. Framework-agnostic; the
// store and components consume these in later migration issues. getJSON body
// moved verbatim from the former public/app.js.

export async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

export const fetchSummary = () => getJSON('/api/summary');
export const fetchSessions = () => getJSON('/api/sessions');
export const fetchLlmCalls = (id) => getJSON(`/api/sessions/${encodeURIComponent(id)}/llm-calls`);
