#!/usr/bin/env node
// Self-contained backend API checks that need no framework and no database.
//
// Historically these checks were six separate programs concatenated into this
// one file, which ESM rejects (duplicate top-level bindings such as `assert`,
// `main` and `test`) — the file could not even be parsed. Each check now lives
// in its own module under `scripts/check-*.js`, and this file runs them all in
// sequence, exiting non-zero if any of them fails.
//
// Run with:  node scripts/test-api.js   (or: npm run test:api:selfcheck)

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const files = readdirSync(here)
  .filter((name) => name.startsWith('check-') && name.endsWith('.js'))
  .sort();

if (files.length === 0) {
  console.error('No scripts/check-*.js modules found.');
  process.exit(1);
}

let failed = 0;
for (const name of files) {
  const file = join(here, name);
  console.log(`\n▶ node scripts/${name}`);
  const result = spawnSync(process.execPath, [file], { stdio: 'inherit' });
  if (result.status !== 0) {
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n✖ ${failed} of ${files.length} self-check file(s) failed.`);
  process.exit(1);
}

console.log(`\n✔ ${files.length} self-check file(s) passed.`);
