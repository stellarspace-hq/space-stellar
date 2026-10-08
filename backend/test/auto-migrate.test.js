// Tests for `backend/scripts/auto-migrate.js` idempotency
// (stellarspace-hq/space-stellar #17).
//
// Run with:  node --test backend/test/auto-migrate.test.js
//
// `runMigrations` accepts an injectable query client (defaulting to the module
// pool), so it can be run twice against an in-memory recorder without a live
// Postgres instance.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { runMigrations } from '../scripts/auto-migrate.js';

// A pg-like pool that answers the schema probes and records every statement.
// `state` mimics a database that gains tables/columns as the migration runs,
// so the second `runMigrations` pass takes the "already exists" branch.
function makeRecordingPool() {
  const state = { tables: new Set(), pointsAdded: false };
  const statements = [];

  return {
    statements,
    state,
    async query(text) {
      statements.push(text);

      if (
        /information_schema\.tables/.test(text) &&
        /table_name = 'users'/.test(text)
      ) {
        return { rows: [{ exists: state.tables.has('users') }] };
      }

      if (
        /information_schema\.columns/.test(text) &&
        /column_name = 'points'/.test(text)
      ) {
        return { rows: [{ exists: state.pointsAdded }] };
      }

      const created = /CREATE TABLE IF NOT EXISTS (\w+)/.exec(text);
      if (created) {
        state.tables.add(created[1]);
      }
      if (/ADD COLUMN IF NOT EXISTS points/.test(text)) {
        state.pointsAdded = true;
      }

      return { rows: [] };
    },
  };
}

function countMatches(statements, pattern) {
  return statements.filter((text) => pattern.test(text)).length;
}

describe('runMigrations idempotency', () => {
  it('runs twice without throwing', async () => {
    const pool = makeRecordingPool();
    await assert.doesNotReject(() => runMigrations(pool));
    await assert.doesNotReject(() => runMigrations(pool));
  });

  it('creates the expected tables on the first pass', async () => {
    const pool = makeRecordingPool();
    await runMigrations(pool);

    assert.deepEqual([...pool.state.tables].sort(), [
      'leaderboard',
      'matches',
      'rooms',
      'ships',
      'users',
    ]);
  });

  it('creates the user_id_seq sequence exactly once across both passes', async () => {
    const pool = makeRecordingPool();
    await runMigrations(pool);
    await runMigrations(pool);

    assert.equal(
      countMatches(pool.statements, /CREATE SEQUENCE IF NOT EXISTS user_id_seq/),
      1,
    );
  });

  it('issues no unguarded CREATE TABLE on the second pass', async () => {
    const pool = makeRecordingPool();
    await runMigrations(pool);

    const secondPassStart = pool.statements.length;
    await runMigrations(pool);
    const secondPass = pool.statements.slice(secondPassStart);

    assert.ok(secondPass.length > 0, 'second pass should still probe the schema');
    for (const text of secondPass) {
      if (/CREATE TABLE/i.test(text)) {
        assert.match(text, /IF NOT EXISTS/i, `unguarded statement: ${text}`);
      }
    }
  });
});
