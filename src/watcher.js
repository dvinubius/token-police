'use strict';

/*
 * Watches the Claude Code and Codex session directories (recursively) and keeps
 * the store in sync. Handles three realities of local watching:
 *   - directories may not exist yet (poll until they appear, then watch)
 *   - files are written line-by-line during active sessions (awaitWriteFinish
 *     + a short debounce avoids re-parsing on every keystroke)
 *   - Codex nests files under YYYY/MM/DD (chokidar watches recursively)
 */

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

const DEBOUNCE_MS = 250;
const DIR_POLL_MS = 5000;

function isJsonl(p) {
  return p.endsWith('.jsonl');
}

// Recursively collect all .jsonl files under dir (Node 18.17+ supports
// readdir recursive; we guard with a manual walk fallback).
function findJsonlFiles(dir) {
  const out = [];
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && isJsonl(full)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

class Watcher {
  constructor(store, sources) {
    // sources: [{ source, dir }]
    this.store = store;
    this.sources = sources;
    this._debouncers = new Map();
    this._watchers = [];
  }

  /** Parse everything that already exists, then begin watching. */
  start() {
    for (const { source, dir } of this.sources) {
      if (fs.existsSync(dir)) {
        this._initialScan(source, dir);
        this._watch(source, dir);
      } else {
        console.log(`[watcher] ${dir} does not exist yet — will start watching when it appears.`);
        this._awaitDir(source, dir);
      }
    }
  }

  _initialScan(source, dir) {
    const files = findJsonlFiles(dir);
    console.log(`[watcher] Parsing ${files.length} existing ${source} file(s) in ${dir}`);
    for (const f of files) this.store.upsertFromFile(source, f);
  }

  _awaitDir(source, dir) {
    const timer = setInterval(() => {
      if (fs.existsSync(dir)) {
        clearInterval(timer);
        console.log(`[watcher] ${dir} appeared — starting watch.`);
        this._initialScan(source, dir);
        this._watch(source, dir);
      }
    }, DIR_POLL_MS);
    timer.unref();
  }

  _watch(source, dir) {
    const watcher = chokidar.watch(dir, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    });

    const onUpsert = (p) => {
      if (!isJsonl(p)) return;
      this._debounced(p, () => this.store.upsertFromFile(source, p));
    };

    watcher
      .on('add', onUpsert)
      .on('change', onUpsert)
      .on('unlink', (p) => {
        if (isJsonl(p)) this.store.removeFile(p);
      })
      .on('error', (err) => console.warn(`[watcher] error: ${err.message}`));

    this._watchers.push(watcher);
  }

  _debounced(key, fn) {
    clearTimeout(this._debouncers.get(key));
    const t = setTimeout(() => {
      this._debouncers.delete(key);
      fn();
    }, DEBOUNCE_MS);
    this._debouncers.set(key, t);
  }
}

module.exports = { Watcher, findJsonlFiles };
