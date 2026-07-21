// Thin client for this app's own local read-only API. Framework-agnostic; the
// store and components consume these in later migration issues. getJSON body
// moved verbatim from the legacy vanilla frontend.
//
// A demo build has no server behind it, so each endpoint falls back to the
// frozen static document produced by demo/build.js. See lib/demo.js.

import { DEMO_MODE, demoFileId, fetchDemoDoc } from './demo.js';

export async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

export const fetchSummary = () => (DEMO_MODE ? fetchDemoDoc('summary.json') : getJSON('/api/summary'));
export const fetchSessions = () => (DEMO_MODE ? fetchDemoDoc('sessions.json') : getJSON('/api/sessions'));
export const fetchLlmCalls = (id) =>
  DEMO_MODE
    ? fetchDemoDoc(`llm-calls/${demoFileId(id)}.json`)
    : getJSON(`/api/sessions/${encodeURIComponent(id)}/llm-calls`);
