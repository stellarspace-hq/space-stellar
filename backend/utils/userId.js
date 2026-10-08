// Single source of truth for sequential user IDs.
//
// The sequence starts at STARTING_ID and the string form is defined once,
// here, as `USER-<id>`. Every route and the user-id migration import this
// module so the starting constant and the formatting rule cannot drift apart.

export const STARTING_ID = 243681;

// Format a numeric ID as the canonical `USER-<id>` string.
export function formatUserId(id) {
  return `USER-${id}`;
}

// Reserve the next sequential ID from the database sequence, falling back to
// MAX(id) + 1 when the sequence has not been created yet.
export async function getNextUserId(pool) {
  try {
    const result = await pool.query("SELECT nextval('user_id_seq') AS next_id");
    return parseInt(result.rows[0].next_id, 10);
  } catch (error) {
    const result = await pool.query(
      'SELECT COALESCE(MAX(id), $1) + 1 AS next_id FROM users',
      [STARTING_ID - 1]
    );
    return parseInt(result.rows[0].next_id, 10);
  }
}

// Ensure a user row exists for `address`, creating it with the next
// sequential ID and the canonical `USER-<id>` string if needed.
export async function ensureUser(pool, address) {
  const existing = await pool.query(
    'SELECT 1 FROM users WHERE address = $1',
    [address]
  );
  if (existing.rows.length > 0) return;

  const nextId = await getNextUserId(pool);
  await pool.query(
    `INSERT INTO users (id, address, user_id, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (address) DO NOTHING`,
    [nextId, address, formatUserId(nextId)]
  );
}
