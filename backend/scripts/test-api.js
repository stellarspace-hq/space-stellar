// Self-contained smoke tests for the shared user-ID module.
// Runs without a database or test framework: `node scripts/test-api.js`.

import assert from 'node:assert';
import { STARTING_ID, formatUserId } from '../utils/userId.js';

let failures = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`\u2705 ${name}`);
  } catch (error) {
    failures++;
    console.error(`\u274c ${name}`);
    console.error(`   ${error.message}`);
  }
}

test('STARTING_ID is the documented 243681', () => {
  assert.strictEqual(STARTING_ID, 243681);
});

test('formatUserId renders the canonical USER-<id> string', () => {
  assert.strictEqual(formatUserId(STARTING_ID), 'USER-243681');
  assert.strictEqual(formatUserId(243682), 'USER-243682');
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}

console.log('\nAll tests passed');
