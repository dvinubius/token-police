#!/usr/bin/env node
// Clamp negative line/column coordinates that c8 (via v8-to-istanbul) emits in
// branch/statement/function location maps. Fallow's coverage parser requires
// unsigned integers and rejects the `-1` sentinel. Only location metadata is
// touched; execution counts (s/f/b) are left intact, so coverage is unchanged.
const fs = require('fs');
const path = process.argv[2] || 'coverage/coverage-final.json';

const cov = JSON.parse(fs.readFileSync(path, 'utf8'));
let fixed = 0;

const walk = (n) => {
  if (!n || typeof n !== 'object') return;
  if (typeof n.column === 'number' && n.column < 0) { n.column = 0; fixed++; }
  if (typeof n.line === 'number' && n.line < 0) { n.line = 0; fixed++; }
  for (const v of Object.values(n)) if (typeof v === 'object') walk(v);
};

for (const data of Object.values(cov)) {
  for (const map of [data.statementMap, data.fnMap, data.branchMap]) walk(map);
}

fs.writeFileSync(path, JSON.stringify(cov));
console.log(`sanitize-coverage: clamped ${fixed} negative coordinate(s) in ${path}`);
