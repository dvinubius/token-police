'use strict';

const fs = require('fs');
const path = require('path');

function cleanInline(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function cleanXmlishTitle(text) {
  return String(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(text, n) {
  const t = cleanInline(text);
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}

function countByName(names) {
  const counts = new Map();
  for (const name of names) {
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => (count > 1 ? `${name} x${count}` : name))
    .join(', ');
}

function basenameHint(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return path.basename(trimmed);
}

function commandHint(command) {
  if (!command || typeof command !== 'string') return '';
  const parts = command.trim().split(/\s+/).filter(Boolean);
  const firstExecutable = parts.find((p) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(p));
  return firstExecutable ? path.basename(firstExecutable) : '';
}

function previewText(text, max) {
  const t = String(text);
  return t.length > max ? t.slice(0, max) : t;
}

function readJsonlRecords(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const records = [];
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      records.push(JSON.parse(s));
    } catch {
      // Transcript files can contain partial writes; skip malformed lines.
    }
  }
  return records;
}

function timestampedJsonlRecords(filePath) {
  let range = { startedAt: null, lastActiveAt: null };
  return readJsonlRecords(filePath).map((record) => {
    range = updateTimestampRange(range, record.timestamp);
    return {
      record,
      timestamp: record.timestamp,
      startedAt: range.startedAt,
      lastActiveAt: range.lastActiveAt,
    };
  });
}

function addHumanRequest(humanRequests, title, timestamp, currentIndex, previewMax) {
  const humanRequestIndex = currentIndex + 1;
  const humanRequestText = previewText(title, previewMax);
  humanRequests.push({
    human_request_index: humanRequestIndex,
    human_request_text: humanRequestText,
    human_request_full_text: title,
    timestamp,
  });
  return {
    humanRequestIndex,
    humanRequestText,
    humanRequestFullText: title,
  };
}

function updateTimestampRange(range, ts) {
  if (!ts) return range;
  return {
    startedAt: !range.startedAt || ts < range.startedAt ? ts : range.startedAt,
    lastActiveAt: !range.lastActiveAt || ts > range.lastActiveAt ? ts : range.lastActiveAt,
  };
}

module.exports = {
  addHumanRequest,
  basenameHint,
  cleanInline,
  cleanXmlishTitle,
  commandHint,
  countByName,
  timestampedJsonlRecords,
  truncateText,
};
