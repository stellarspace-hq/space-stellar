// Tests for `POST /api/matches/save` mode validation and duplicate guard
// (stellarspace-hq/space-stellar #12).
//
// Run with:  node --test backend/test/matches.save.test.js
//
// `backend/routes/matches.js` imports the Express server on load, so the
// deterministic parts of the handler live in `backend/utils/matchRules.js`.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  DUPLICATE_WINDOW_SECONDS,
  NO_ROOM_DUPLICATE_SQL,
  ROOM_DUPLICATE_SQL,
  VALID_MODES,
  noRoomDuplicateParams,
  normalizeMode,
  roomDuplicateParams,
  validateMode,
} from '../utils/matchRules.js';

const ADDRESS = 'GA2C5IY3V3UX5PIZ4S5G2A7L7W5G2A2X4M3N5W2Q3FZ7H6B5J4K2L';

describe('mode validation', () => {
  it('rejects an unknown mode with a 400 payload', () => {
    const result = validateMode('battle-royale');
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(result.body.success, false);
    assert.equal(result.body.received, 'battle-royale');
    assert.deepEqual(result.body.validModes, VALID_MODES);
  });

  it('normalises a trimmed, differently-cased mode', () => {
    assert.equal(normalizeMode('  MULTIPLAYER '), 'multiplayer');
    const result = validateMode('Versus');
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'versus');
  });

  it('defaults to solo when no mode is supplied', () => {
    const result = validateMode(undefined);
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'solo');
  });
});

describe('duplicate guard', () => {
  it('looks back exactly the documented window', () => {
    const windowPattern = new RegExp(
      `INTERVAL '${DUPLICATE_WINDOW_SECONDS} seconds'`,
    );
    assert.match(ROOM_DUPLICATE_SQL, windowPattern);
    assert.match(NO_ROOM_DUPLICATE_SQL, windowPattern);
  });

  it('scopes the room duplicate query by room, address and score', () => {
    assert.match(ROOM_DUPLICATE_SQL, /room_code = \$1/);
    assert.match(ROOM_DUPLICATE_SQL, /p1_address = \$2/);
    assert.match(ROOM_DUPLICATE_SQL, /p1_score = \$3/);
    assert.deepEqual(roomDuplicateParams('ABC123', ADDRESS, 42), [
      'ABC123',
      ADDRESS,
      42,
    ]);
  });

  it('scopes the no-room duplicate query by address and score', () => {
    assert.match(NO_ROOM_DUPLICATE_SQL, /p1_address = \$1/);
    assert.match(NO_ROOM_DUPLICATE_SQL, /p1_score = \$2/);
    assert.match(NO_ROOM_DUPLICATE_SQL, /room_code IS NULL/);
    assert.deepEqual(noRoomDuplicateParams(ADDRESS, 42), [ADDRESS, 42]);
  });

  it('never issues an INSERT as part of the duplicate check', () => {
    assert.doesNotMatch(ROOM_DUPLICATE_SQL, /INSERT/i);
    assert.doesNotMatch(NO_ROOM_DUPLICATE_SQL, /INSERT/i);
  });
});
