'use strict';

/*
 * Token Police server.
 *
 * On startup: load pricing, parse all existing Claude Code + Codex transcripts,
 * start filesystem watchers, serve the REST API and static UI on :7899, and
 * open the browser.
 */

const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');

const { Pricing } = require('./src/pricing');
const { Store } = require('./src/store');
const { Watcher } = require('./src/watcher');

const PORT = process.env.PORT ? Number(process.env.PORT) : 7899;
const HOST = process.env.HOST || '127.0.0.1';
const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude', 'projects');
const CODEX_DIR = path.join(HOME, '.codex', 'sessions');

function openBrowser(url) {
  if (process.env.DASH_NO_OPEN) return;
  const platform = process.platform;
  let cmd;
  let args;
  if (platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else if (platform === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* opening the browser is best-effort */
  }
}

async function main() {
  const pricing = new Pricing();
  await pricing.load();

  const store = new Store(pricing);

  const watcher = new Watcher(store, [
    { source: 'claude-code', dir: CLAUDE_DIR },
    { source: 'codex', dir: CODEX_DIR },
  ]);
  watcher.start();

  const app = express();
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/conversations', (_req, res) => {
    res.json(store.listConversations());
  });

  app.get('/api/conversations/:id/turns', (req, res) => {
    const turns = store.getTurns(req.params.id);
    if (turns === null) return res.status(404).json({ error: 'conversation not found' });
    res.json({ conversation: store.getConversationMeta(req.params.id), turns });
  });

  app.get('/api/summary', (_req, res) => {
    res.json(store.summary());
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, conversations: store.conversations.size });
  });

  app.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`;
    console.log(`\n[token-police] Serving on ${url}`);
    console.log('[token-police] Watching:');
    console.log(`    ${CLAUDE_DIR}`);
    console.log(`    ${CODEX_DIR}\n`);
    openBrowser(url);
  });
}

main().catch((err) => {
  console.error('[token-police] Fatal error:', err);
  process.exit(1);
});
