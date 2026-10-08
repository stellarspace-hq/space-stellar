// Pure rules for `POST /api/matches/save` in `backend/routes/matches.js`.
//
// The handler normalises/validates `mode` and de-duplicates saves with a
// 10 second window. Both are extracted here so they can be tested without
// booting Express or connecting to Postgres.

export const VALID_MODES = ['solo', 'versus', 'multiplayer'];

// How far back the duplicate guard looks for an identical save.
export const DUPLICATE_WINDOW_SECONDS = 10;

export function normalizeMode(mode) {
  return mode ? mode.toString().trim().toLowerCase() : 'solo';
}

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

// Duplicate lookup for room-scoped saves.
export const ROOM_DUPLICATE_SQL = `SELECT match_id FROM matches
           WHERE room_code = $1
           AND p1_address = $2
           AND p1_score = $3
           AND created_at > NOW() - INTERVAL '${DUPLICATE_WINDOW_SECONDS} seconds'
           ORDER BY created_at DESC
           LIMIT 1`;

// Duplicate lookup for saves without a room code.
export const NO_ROOM_DUPLICATE_SQL = `SELECT match_id FROM matches
           WHERE p1_address = $1
           AND p1_score = $2
           AND created_at > NOW() - INTERVAL '${DUPLICATE_WINDOW_SECONDS} seconds'
           AND (room_code IS NULL OR room_code = '')
           ORDER BY created_at DESC
           LIMIT 1`;

export function roomDuplicateParams(roomCode, address, score) {
  return [roomCode, address, score];
}

export function noRoomDuplicateParams(address, score) {
  return [address, score];
}
