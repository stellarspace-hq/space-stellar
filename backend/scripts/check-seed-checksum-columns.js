// Self-contained checks for issue #94: the matches.seed/checksum columns and
// the phantom package.json scripts. Runs with `node scripts/test-api.js`.

import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, '..');

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

test('no package.json script points at a missing file', () => {
  const pkg = JSON.parse(readFileSync(join(backendRoot, 'package.json'), 'utf8'));
  for (const [name, command] of Object.entries(pkg.scripts || {})) {
    const match = command.match(/scripts\/[\w./-]+\.js/);
    if (!match) continue;
    assert.ok(
      existsSync(join(backendRoot, match[0])),
      `script "${name}" points at missing ${match[0]}`
    );
  }
});

test('matches schema no longer declares seed/checksum', () => {
  for (const file of ['scripts/migrate.js', 'scripts/auto-migrate.js']) {
    const sql = readFileSync(join(backendRoot, file), 'utf8');
    const block = sql.match(/CREATE TABLE IF NOT EXISTS matches \(([\s\S]*?)\);/);
    assert.ok(block, `${file}: matches CREATE TABLE not found`);
    assert.ok(!/\bseed\b/i.test(block[1]), `${file}: matches still declares seed`);
    assert.ok(!/checksum/i.test(block[1]), `${file}: matches still declares checksum`);
    // rooms.seed is a different column and must survive.
    assert.ok(/CREATE TABLE IF NOT EXISTS rooms \([\s\S]*?\bseed\b[\s\S]*?\);/i.test(sql),
      `${file}: rooms.seed was removed by mistake`);
  }
});

test('a migration drops seed/checksum for existing matches tables', () => {
  for (const file of ['scripts/migrate.js', 'scripts/auto-migrate.js']) {
    const sql = readFileSync(join(backendRoot, file), 'utf8');
    assert.ok(/ALTER TABLE matches DROP COLUMN IF EXISTS seed/.test(sql), `${file} missing drop`);
    assert.ok(/ALTER TABLE matches DROP COLUMN IF EXISTS checksum/.test(sql), `${file} missing drop`);
  }
});

test('matches routes do not reference seed/checksum', () => {
  const rows = readFileSync(join(backendRoot, 'routes/matches.js'), 'utf8');
  assert.ok(!rows.includes('checksum'), 'routes/matches.js still references checksum');
  assert.ok(!/\bseed\b/.test(rows), 'routes/matches.js still references seed');
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll tests passed');
