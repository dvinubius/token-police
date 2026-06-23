#!/usr/bin/env node
/*
 * Bootstrap launcher: installs dependencies if they are missing, then starts
 * the server. Uses only Node built-ins so it can run before `npm install`.
 */
'use strict';

const { existsSync } = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const root = __dirname;
const needed = ['express', 'chokidar'];
const missing = needed.some((dep) => !existsSync(path.join(root, 'node_modules', dep)));

if (missing) {
  console.log('[token-police] Dependencies missing — running `npm install`...\n');
  try {
    execSync('npm install', { cwd: root, stdio: 'inherit' });
  } catch (err) {
    console.error('\n[token-police] `npm install` failed. Please run it manually.');
    process.exit(1);
  }
  console.log('');
}

require('./server.js');
