// Pure helpers for the sequential user-ID logic in `backend/routes/users.js`.
//
// `getNextUserId` reads the next value from the `user_id_seq` sequence and
// falls back to `MAX(id) + 1` (starting at 243681) when the sequence is
// missing. `generateUserId` renders the public `USER-000000` text ID.

// First user ID when the table is empty: COALESCE(MAX(id), 243680) + 1.
export const FALLBACK_USER_ID = 243681;

// Number of digits the public user ID is padded to.
export const USER_ID_WIDTH = 6;

// Render a numeric user id as the public `USER-000007` text ID.
export function formatUserId(id) {
  return `USER-${String(id).padStart(USER_ID_WIDTH, '0')}`;
}

// `generateUserId(id)` renders a deterministic padded id when given one, and
// otherwise falls back to the legacy random ID (used for mock responses).
export function generateUserId(id) {
  if (typeof id === 'number' && Number.isFinite(id)) {
    return formatUserId(id);
  }
  return `USER-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

// Resolve the next sequential user ID using `client` (a pg Pool or Client).
// Tries the sequence first and falls back to `MAX(id) + 1` when the sequence
// query rejects (e.g. the sequence has not been created yet).
export async function resolveNextUserId(client) {
  try {
    const result = await client.query("SELECT nextval('user_id_seq') as next_id");
    return parseInt(result.rows[0].next_id, 10);
  } catch (error) {
    const result = await client.query(
      'SELECT COALESCE(MAX(id), 243680) + 1 as next_id FROM users',
    );
    return parseInt(result.rows[0].next_id, 10);
  }
}
