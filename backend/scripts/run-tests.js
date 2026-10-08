#!/usr/bin/env node
// Minimal, dependency-free backend test runner.
//
// `npm test` and `npm run test:api` both invoke this file (see package.json).
// It discovers every `backend/test/*.test.js` unit suite, skipping
// `*.integration.test.js` suites (which need a live database or Soroban RPC),
// and runs each one with Node's built-in test runner. It exits non-zero as
// soon as any suite fails, so it is safe to use as a CI gate.

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const testDir = join(here, '..', 'test');

let files;
try {
  files = readdirSync(testDir)
    .filter((name) => name.endsWith('.test.js'))
    .filter((name) => !name.endsWith('.integration.test.js'))
    .sort()
    .map((name) => join(testDir, name));
} catch (error) {
  console.error(`Unable to read test directory ${testDir}: ${error.message}`);
  process.exit(1);
}

if (files.length === 0) {
  console.log('No backend unit tests found.');
  process.exit(0);
}

let failed = 0;
for (const file of files) {
  console.log(`\n▶ node --test ${file}`);
  const result = spawnSync(process.execPath, ['--test', file], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n✖ ${failed} of ${files.length} test file(s) failed.`);
  process.exit(1);
}

console.log(`\n✔ ${files.length} test file(s) passed.`);
