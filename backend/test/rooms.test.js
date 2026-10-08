// Unit tests for the room lifecycle rules
// (stellarspace-hq/space-stellar #11).
//
// Run with:  node --test backend/test/rooms.test.js
//
// `backend/routes/rooms.js` imports the Express server on load, so the
// deterministic room rules (mode normalisation, create/join validation and the
// ready-column selection) live in `backend/utils/roomRules.js` and are tested
// here.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  VALID_MODES,
  normalizeMode,
  normalizeRoomCode,
  readyUpdate,
  validateCreateRoom,
  validateJoin,
  validateMode,
} from '../utils/roomRules.js';

const HOST = 'GA2C5IY3V3UX5PIZ4S5G2A7L7W5G2A2X4M3N5W2Q3FZ7H6B5J4K2L';
const GUEST = 'GB3D6JZ4W4VY6QJA5T6H3B8M8X6H3B3Y5N4P6X3R4GA8I7C6K5L3M2N';
const STRANGER = 'GC4E7KA5X5WZ7RKB6U7I4C9N9Y7I4C4Z6O5Q7Y4S5HB9J8D7L6M4N3P';

function makeRoom(overrides = {}) {
  return {
    room_code: 'ABC123',
    mode: 'multiplayer',
    host_address: HOST,
    guest_address: null,
    host_ready: false,
    guest_ready: false,
    ...overrides,
  };
}

describe('mode normalisation', () => {
  it('defaults to solo when no mode is given', () => {
    assert.equal(normalizeMode(undefined), 'solo');
    assert.equal(normalizeMode(''), 'solo');
  });

  it('trims and lowercases the incoming mode', () => {
    assert.equal(normalizeMode('  MultiPlayer '), 'multiplayer');
    assert.equal(normalizeMode('VERSUS'), 'versus');
  });

  it('accepts every valid mode', () => {
    for (const mode of VALID_MODES) {
      const result = validateMode(mode);
      assert.equal(result.ok, true, `mode ${mode}`);
      assert.equal(result.mode, mode);
    }
  });

  it('rejects an unknown mode with a 400 and the valid list', () => {
    const result = validateMode('coop');
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(result.body.received, 'coop');
    assert.deepEqual(result.body.validModes, VALID_MODES);
  });
});

describe('POST /create validation', () => {
  it('rejects a missing host address with a 400', () => {
    const result = validateCreateRoom({ roomCode: 'ABC123', address: '' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.match(result.body.message, /Missing required fields/);
  });

  it('rejects a missing room code with a 400', () => {
    const result = validateCreateRoom({ roomCode: '', address: HOST });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });

  it('accepts a valid body and trims the room code', () => {
    const result = validateCreateRoom({ roomCode: '  ABC123 ', address: HOST });
    assert.equal(result.ok, true);
    assert.equal(result.roomCode, 'ABC123');
  });
});

describe('POST /:roomCode/join', () => {
  it('refuses a room that already has a guest', () => {
    const result = validateJoin(makeRoom({ guest_address: GUEST }), STRANGER);
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.match(result.body.message, /full/);
  });

  it('is idempotent for the guest who is already in the room', () => {
    const room = makeRoom({ guest_address: GUEST });
    const result = validateJoin(room, GUEST);
    assert.equal(result.ok, true);
    assert.equal(result.alreadyGuest, true);
    assert.equal(result.room, room);
  });

  it('refuses a non-multiplayer room', () => {
    const result = validateJoin(makeRoom({ mode: 'solo' }), GUEST);
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.match(result.body.message, /multiplayer/);
  });

  it('refuses the host joining their own room as guest', () => {
    const result = validateJoin(makeRoom(), HOST);
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.match(result.body.message, /host/);
  });

  it('accepts a fresh guest into an open multiplayer room', () => {
    const result = validateJoin(makeRoom(), GUEST);
    assert.equal(result.ok, true);
    assert.equal(result.alreadyGuest, false);
  });
});

describe('POST /:roomCode/ready', () => {
  it('writes the host readiness column when the host toggles', () => {
    const result = readyUpdate(makeRoom({ guest_address: GUEST }), HOST, true);
    assert.equal(result.ok, true);
    assert.equal(result.field, 'host_ready');
    assert.deepEqual(result.params, [true, 'ABC123']);
  });

  it('writes the guest readiness column when the guest toggles', () => {
    const result = readyUpdate(makeRoom({ guest_address: GUEST }), GUEST, false);
    assert.equal(result.ok, true);
    assert.equal(result.field, 'guest_ready');
    assert.deepEqual(result.params, [false, 'ABC123']);
  });

  it('rejects a non-member with a 403', () => {
    const result = readyUpdate(makeRoom({ guest_address: GUEST }), STRANGER, true);
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
    assert.equal(result.body.message, 'You are not a member of this room');
  });
});

describe('normalizeRoomCode', () => {
  it('trims whitespace', () => {
    assert.equal(normalizeRoomCode('  ABC123 '), 'ABC123');
    assert.equal(normalizeRoomCode(null), null);
  });
});
