// Unit tests for the `GameStateManager` singleton lifecycle
// (stellarspace-hq/space-stellar #9).
//
// Run with:  node --test backend/test/gameStateManager.test.js
//
// `backend/game/GameStateManager.js` has no external imports, so it can be
// imported directly. Its only real contract today is the `games` Map
// lifecycle: `initGame` -> `getGameState` -> `removeGame`.

import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

import gameStateManager from '../game/GameStateManager.js';

const HOST = 'GA2C5IY3V3UX5PIZ4S5G2A7L7W5G2A2X4M3N5W2Q3FZ7H6B5J4K2L';
const GUEST = 'GB3D6JZ4W4VY6QJA5T6H3B8M8X6H3B3Y5N4P6X3R4GA8I7C6K5L3M2N';

// The module exports a singleton, so isolate the shared Map between tests.
beforeEach(() => {
  gameStateManager.games.clear();
});

describe('GameStateManager lifecycle', () => {
  it('initGame registers a room keyed by roomCode with the player addresses', () => {
    const state = gameStateManager.initGame('ROOM-1', [
      { address: HOST },
      { address: GUEST },
    ]);

    assert.equal(state.roomCode, 'ROOM-1');
    assert.deepEqual(state.players, [HOST, GUEST]);
    assert.equal(state.started, true);
    assert.equal(typeof state.createdAt, 'number');

    // The room is retrievable by the same key.
    assert.equal(gameStateManager.getGameState('ROOM-1'), state);
  });

  it('getGameState returns the object registered by initGame', () => {
    gameStateManager.initGame('ROOM-2', [{ address: HOST }]);
    const state = gameStateManager.getGameState('ROOM-2');

    assert.ok(state);
    assert.equal(state.roomCode, 'ROOM-2');
    assert.deepEqual(state.players, [HOST]);
  });

  it('removeGame deletes the room', () => {
    gameStateManager.initGame('ROOM-3', [{ address: HOST }]);
    assert.ok(gameStateManager.getGameState('ROOM-3'));

    gameStateManager.removeGame('ROOM-3');
    assert.equal(gameStateManager.getGameState('ROOM-3'), undefined);
  });

  it('getGameState returns undefined for an unknown room', () => {
    assert.equal(gameStateManager.getGameState('does-not-exist'), undefined);
  });
});
