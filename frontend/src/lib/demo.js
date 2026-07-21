// Demo-mode data source.
//
// A demo build (`npm run build:demo`) has no Express process and no local
// transcript directories behind it. Instead, `demo/build.js` freezes the real
// API projections into dist/demo/*.json at build time, and this module serves
// them in place of the REST calls.
//
// Frozen data would age: the Stats page charts a fixed 30-day window ending
// today, so a build from three weeks ago would render an empty chart. Each
// document therefore carries the build's anchor day in `generated_at`, and
// every timestamp is shifted forward by whole local days on read. The demo
// always looks like it was captured over the last 30 days.

const DAY_MS = 86400000;
// Vite replaces `import.meta.env` wholesale; the fallback keeps this module
// importable from plain Node (the frontend test loads the lib barrel).
const ENV = import.meta.env || {};

export const DEMO_MODE = ENV.VITE_DEMO === '1';

const DEMO_BASE = `${ENV.BASE_URL || '/'}demo/`;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const DAY_BUCKET = /^\d{4}-\d{2}-\d{2}$/;

// Mirrors safeFileId() in demo/build.js — keep the two in sync.
export function demoFileId(id) {
  return String(id).replace(/[^A-Za-z0-9._-]/g, '_');
}

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Whole-day offset from the build's anchor day to today, in the viewer's
// timezone. Whole days keep local time-of-day and local day bucketing intact.
function offsetMsFor(generatedAt) {
  const anchor = Date.parse(generatedAt);
  if (!Number.isFinite(anchor)) return 0;
  return Math.round((startOfDay(Date.now()) - startOfDay(anchor)) / DAY_MS) * DAY_MS;
}

function shiftTimestamp(value, offsetMs) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms + offsetMs).toISOString() : value;
}

// Daily buckets are local-day strings, not instants. Rebuild them from a
// local-noon anchor so the shift can never slip a day through UTC.
function shiftDayBucket(value, offsetMs) {
  const [year, month, day] = value.split('-').map(Number);
  const shifted = new Date(year, month - 1, day, 12);
  shifted.setTime(shifted.getTime() + offsetMs);
  const pad = (n) => String(n).padStart(2, '0');
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

function shiftValue(value, offsetMs, key) {
  if (Array.isArray(value)) return value.map((item) => shiftValue(item, offsetMs, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = shiftValue(v, offsetMs, k);
    return out;
  }
  if (typeof value !== 'string') return value;
  if (ISO_TIMESTAMP.test(value)) return shiftTimestamp(value, offsetMs);
  if (key === 'date' && DAY_BUCKET.test(value)) return shiftDayBucket(value, offsetMs);
  return value;
}

/** Fetch one frozen demo document and return its date-shifted payload. */
export async function fetchDemoDoc(relPath) {
  const url = `${DEMO_BASE}${relPath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const doc = await res.json();
  if (offsetMsFor(doc.generated_at) === 0) return doc.payload;
  return shiftValue(doc.payload, offsetMsFor(doc.generated_at));
}
