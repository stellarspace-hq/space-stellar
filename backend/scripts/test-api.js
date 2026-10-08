// Self-contained checks for issue #95: rooms/matches foreign keys declare an
// ON DELETE action and the lookup columns are indexed. Runs with
// `node scripts/test-api.js`.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, '..');

const REQUIRED = [
  'host_address TEXT NOT NULL REFERENCES users(address) ON DELETE CASCADE',
  'guest_address TEXT REFERENCES users(address) ON DELETE SET NULL',
  'p1_address TEXT NOT NULL REFERENCES users(address) ON DELETE CASCADE',
  'p2_address TEXT REFERENCES users(address) ON DELETE SET NULL',
  'CREATE INDEX IF NOT EXISTS idx_rooms_host_address ON rooms(host_address)',
  'CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON rooms(room_code)',
  'CREATE INDEX IF NOT EXISTS idx_matches_p1 ON matches(p1_address)',
  'CREATE INDEX IF NOT EXISTS idx_matches_p2 ON matches(p2_address)',
  'CREATE INDEX IF NOT EXISTS idx_matches_mode ON matches(mode)',
  'DROP CONSTRAINT IF EXISTS rooms_host_address_fkey',
  'DROP CONSTRAINT IF EXISTS matches_p2_address_fkey',
];

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

for (const file of ['scripts/migrate.js', 'scripts/auto-migrate.js']) {
  const sql = readFileSync(join(backendRoot, file), 'utf8');
  test(`${file} declares ON DELETE, idempotent FKs and indexes`, () => {
    for (const needle of REQUIRED) {
      assert.ok(sql.includes(needle), `${file} is missing: ${needle}`);
    }
    assert.ok(!/REFERENCES users\(address\)(?! ON DELETE)/.test(sql), `${file} has a FK without ON DELETE`);
  });
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll tests passed');
