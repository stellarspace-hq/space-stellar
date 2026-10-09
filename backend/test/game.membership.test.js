// Tests for the membership checks in `backend/routes/game.js`
// (stellarspace-hq/space-stellar #19).
//
// Run with:  node --test backend/test/game.membership.test.js
//
// `backend/routes/game.js` imports the Express server on load, so the access
// decision itself lives in `backend/utils/gameAccess.js` and is tested here.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  canUpdateGameState,
  classifyGameAccess,
} from '../utils/gameAccess.js';

const HOST = 'GA2C5IY3V3UX5PIZ4S5G2A7L7W5G2A2X4M3N5W2Q3FZ7H6B5J4K2L';
const GUEST = 'GB3D6JZ4W4VY6QJA5T6H3B8M8X6H3B3Y5N4P6X3R4GA8I7C6K5L3M2N';
const STRANGER = 'GC4E7KA5X5WZ7RKB6U7I4C9N9Y7I4C4Z6O5Q7Y4S5HB9J8D7L6M4N3P';

function makeGameState(overrides = {}) {
  return {
    roomCode: 'ABC123',
    hostAddress: HOST,
    guestAddress: GUEST,
    players: { host: { x: 1 }, guest: { x: 2 } },
    ...overrides,
  };
}

describe('classifyGameAccess', () => {
  it('grants the host role to the host address', () => {
    assert.deepEqual(classifyGameAccess(makeGameState(), HOST, 'ABC123'), {
      role: 'host',
    });
  });

  it('grants the guest role to the guest address', () => {
    assert.deepEqual(classifyGameAccess(makeGameState(), GUEST, 'ABC123'), {
      role: 'guest',
    });
  });

  it('rejects a non-member with a 403', () => {
    const result = classifyGameAccess(makeGameState(), STRANGER, 'ABC123');
    assert.equal(result.status, 403);
    assert.equal(result.body.success, false);
    assert.equal(result.body.message, 'You are not a member of this game');
  });

  it('rejects an unknown room with a 404', () => {
    const result = classifyGameAccess(undefined, HOST, 'MISSING');
    assert.equal(result.status, 404);
    assert.equal(result.body.success, false);
    assert.match(result.body.message, /MISSING/);
  });

  it('compares addresses case-sensitively', () => {
    const result = classifyGameAccess(
      makeGameState(),
      HOST.toLowerCase(),
      'ABC123',
    );
    assert.equal(result.status, 403);
  });

  it('rejects a non-member before any game-state field is read', () => {
    // Even a fully populated game state must not leak a role to a stranger;
    // the decision depends only on the membership addresses.
    const rich = makeGameState({ players: { host: {}, guest: {} }, winner: HOST });
    const result = classifyGameAccess(rich, STRANGER, 'ABC123');
    assert.equal(result.status, 403);
    assert.equal(result.role, undefined);
  });
});

describe('canUpdateGameState', () => {
  it('allows only the host', () => {
    const gameState = makeGameState();
    assert.equal(canUpdateGameState(gameState, HOST), true);
    assert.equal(canUpdateGameState(gameState, GUEST), false);
    assert.equal(canUpdateGameState(gameState, STRANGER), false);
  });

  it('returns false for an unknown room', () => {
    assert.equal(canUpdateGameState(undefined, HOST), false);
  });
});
