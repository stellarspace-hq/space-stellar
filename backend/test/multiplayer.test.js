// Tests for the multiplayer player-data merge
// (stellarspace-hq/space-stellar #14).
//
// Run with:  node --test backend/test/multiplayer.test.js
//
// `backend/routes/multiplayer.js` only depends on Express (not the server
// module), so the router can be exercised directly with a fake `req`/`res`
// pair. The merge/projection logic itself lives in
// `backend/utils/playerDataMerge.js`.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { mergePlayerUpdate, otherPlayers } from '../utils/playerDataMerge.js';

const ROOM = 'ROOM-MERGE';
const ALICE = 'GA2C5IY3V3UX5PIZ4S5G2A7L7W5G2A2X4M3N5W2Q3FZ7H6B5J4K2L';
const BOB = 'GB3D6JZ4W4VY6QJA5T6H3B8M8X6H3B3Y5N4P6X3R4GA8I7C6K5L3M2N';

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

// Drive an Express router directly without binding a port.
async function callRouter(router, method, url, body = {}) {
  const req = { method, url, body, headers: {}, get() {}, on() {} };
  const res = makeRes();
  await new Promise((resolve) => {
    router(req, res, () => resolve());
    queueMicrotask(resolve);
  });
  return res;
}

describe('mergePlayerUpdate', () => {
  it('preserves previously stored keys on a partial update', () => {
    const first = mergePlayerUpdate(undefined, { x: 10, y: 20, health: 100 }, 1);
    const second = mergePlayerUpdate(first, { score: 50 }, 2);

    assert.equal(second.x, 10);
    assert.equal(second.y, 20);
    assert.equal(second.health, 100);
    assert.equal(second.score, 50);
    assert.equal(second.timestamp, 2);
  });

  it('does not silently drop a nested position update', () => {
    const first = mergePlayerUpdate(undefined, { x: 10, y: 20 }, 1);
    const second = mergePlayerUpdate(first, { x: 99, y: 88 }, 2);

    assert.equal(second.x, 99);
    assert.equal(second.y, 88);
  });

  it('ignores a lone x without y', () => {
    const first = mergePlayerUpdate(undefined, { x: 10, y: 20 }, 1);
    const second = mergePlayerUpdate(first, { x: 99 }, 2);

    assert.equal(second.x, 10);
    assert.equal(second.y, 20);
  });

  it('writes the exact merged object', () => {
    const merged = mergePlayerUpdate({ health: 100 }, { score: 7 }, 5);
    assert.deepEqual(merged, { health: 100, score: 7, timestamp: 5 });
  });
});

describe('otherPlayers', () => {
  it('omits the requesting player and defaults bullets to an array', () => {
    const room = {
      [ALICE]: { x: 1, y: 2, health: 100, timestamp: 1 },
      [BOB]: { x: 3, y: 4, score: 9, timestamp: 2 },
    };

    const result = otherPlayers(room, ALICE);

    assert.equal(result.length, 1);
    assert.equal(result[0].address, BOB);
    assert.equal(result[0].score, 9);
    assert.deepEqual(result[0].bullets, []);
  });
});

describe('POST /update-player round trip', () => {
  it('retains the first write when a second partial write arrives', async () => {
    const router = (await import('../routes/multiplayer.js')).default;

    const a = await callRouter(router, 'POST', '/update-player', {
      roomCode: ROOM,
      address: ALICE,
      x: 1,
      y: 2,
      health: 100,
    });
    assert.equal(a.statusCode, 200);
    assert.equal(a.body.success, true);

    const b = await callRouter(router, 'POST', '/update-player', {
      roomCode: ROOM,
      address: ALICE,
      score: 1234,
    });
    assert.equal(b.statusCode, 200);

    const view = await callRouter(
      router,
      'GET',
      `/get-players/${ROOM}/${BOB}`,
    );
    assert.equal(view.statusCode, 200);
    assert.equal(view.body.players.length, 1);

    const alice = view.body.players[0];
    assert.equal(alice.address, ALICE);
    assert.equal(alice.x, 1);
    assert.equal(alice.y, 2);
    assert.equal(alice.health, 100);
    assert.equal(alice.score, 1234);
  });

  it('returns an empty player list for an unknown room', async () => {
    const router = (await import('../routes/multiplayer.js')).default;
    const view = await callRouter(
      router,
      'GET',
      '/get-players/ROOM-DOES-NOT-EXIST/ANYONE',
    );

    assert.equal(view.statusCode, 200);
    assert.deepEqual(view.body, { success: true, players: [] });
  });
});
