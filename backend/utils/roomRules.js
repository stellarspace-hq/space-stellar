// Pure room-lifecycle rules for `backend/routes/rooms.js`.
//
// The rooms handlers deal with the `rooms` table (a row per room, with
// `host_address`, `guest_address`, `host_ready` and `guest_ready` columns).
// The deterministic parts of that lifecycle are extracted here so they can be
// unit tested without booting Express or connecting to Postgres.

export const VALID_MODES = ['solo', 'versus', 'multiplayer'];

// Normalise the `mode` value the same way every handler does.
export function normalizeMode(mode) {
  return mode ? mode.toString().trim().toLowerCase() : 'solo';
}

// Validate a `mode` value against the database CHECK constraint.
export function validateMode(mode) {
  const normalized = normalizeMode(mode);
  if (!VALID_MODES.includes(normalized)) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        message: `Invalid mode: ${mode}. Must be one of: ${VALID_MODES.join(', ')}`,
        received: mode,
        normalized,
        validModes: VALID_MODES,
      },
    };
  }
  return { ok: true, mode: normalized };
}

// Normalise a room code for lookups (trim surrounding whitespace).
export function normalizeRoomCode(roomCode) {
  return roomCode ? roomCode.toString().trim() : roomCode;
}

// Validate the body of `POST /create`.
export function validateCreateRoom({ roomCode, address }) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  if (!normalizedRoomCode || !address) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        message: 'Missing required fields: roomCode, address',
      },
    };
  }
  return { ok: true, roomCode: normalizedRoomCode };
}

// Decide whether `address` may join `room` as the guest.
export function validateJoin(room, address) {
  if (room.mode !== 'multiplayer') {
    return {
      ok: false,
      status: 400,
      body: { success: false, message: 'Room is not in multiplayer mode' },
    };
  }
  if (room.guest_address && room.guest_address === address) {
    return { ok: true, alreadyGuest: true, room };
  }
  if (room.guest_address) {
    return {
      ok: false,
      status: 400,
      body: { success: false, message: 'Room is full (already has a guest)' },
    };
  }
  if (room.host_address === address) {
    return {
      ok: false,
      status: 400,
      body: { success: false, message: 'You are already the host of this room' },
    };
  }
  return { ok: true, alreadyGuest: false, room };
}

// Decide which readiness column `POST /:roomCode/ready` should update, and
// with which parameters. Non-members are rejected with 403.
export function readyUpdate(room, address, ready) {
  if (room.host_address === address) {
    return { ok: true, field: 'host_ready', params: [ready, room.room_code] };
  }
  if (room.guest_address === address) {
    return { ok: true, field: 'guest_ready', params: [ready, room.room_code] };
  }
  return {
    ok: false,
    status: 403,
    body: { success: false, message: 'You are not a member of this room' },
  };
}
