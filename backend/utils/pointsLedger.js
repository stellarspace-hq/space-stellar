// Pure helpers for the points ledger in `backend/routes/points.js`.
//
// These helpers hold the arithmetic and guards that decide how many points a
// user has and whether a deduct/add request is allowed. They are deliberately
// free of Express and of any database access so they can be unit tested
// without a live Postgres instance.

// Welcome bonus granted to users that do not exist yet, or whose stored
// points value cannot be interpreted as a number.
export const DEFAULT_POINTS = 2000;

// SQL statements used by the ledger. Kept here together with the parameter
// builders so tests can assert the exact SQL and parameters that a handler
// sends to the pool.
export const DEDUCT_POINTS_SQL = `UPDATE users
       SET points = points - $1,
           updated_at = NOW()
       WHERE address = $2
       RETURNING points`;

export const ADD_POINTS_SQL = `UPDATE users
       SET points = points + $1,
           updated_at = NOW()
       WHERE address = $2
       RETURNING points`;

// Coerce a value read from the `users.points` column into an integer.
//
// The previous implementation used `parseInt(value) || DEFAULT_POINTS`, which
// wrongly reported a real balance of `0` (or `"0"`) as the 2000 welcome
// bonus. A stored balance of 0 must survive the round trip.
export function parseStoredPoints(value, fallback = DEFAULT_POINTS) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

// Normalise an incoming request `amount` into a number, or `null` when it is
// not a usable finite number. Callers can reject `null` before touching the
// database.
export function normaliseAmount(amount) {
  if (typeof amount === 'number') {
    return Number.isFinite(amount) ? amount : null;
  }
  if (typeof amount !== 'string' || amount.trim() === '') {
    return null;
  }
  const parsed = Number(amount);
  return Number.isFinite(parsed) ? parsed : null;
}

// Validate an incoming `amount` (used by both deduct and add). Returns
// `{ ok: true, amount }` or `{ ok: false, status, body }` where `body` is the
// exact JSON payload the route should send back.
export function validateAmount(amount) {
  const value = normaliseAmount(amount);
  if (value === null) {
    return {
      ok: false,
      status: 400,
      body: { success: false, message: 'Amount must be a number' },
    };
  }
  if (value <= 0) {
    return {
      ok: false,
      status: 400,
      body: { success: false, message: 'Amount must be greater than 0' },
    };
  }
  return { ok: true, amount: value };
}

// Decide whether a `deduct` request from `currentPoints` is allowed.
export function evaluateDeduction(currentPoints, amount) {
  const amountCheck = validateAmount(amount);
  if (!amountCheck.ok) {
    return amountCheck;
  }
  if (currentPoints < amountCheck.amount) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        message: 'Insufficient points',
        currentPoints,
        required: amountCheck.amount,
        shortage: amountCheck.amount - currentPoints,
      },
    };
  }
  return { ok: true, amount: amountCheck.amount };
}

// Decide whether an `add` request is allowed (same rules as deduct, minus the
// balance check: adding can never run out of points).
export function evaluateAddition(amount) {
  return validateAmount(amount);
}

// Parameter lists for the UPDATE statements above.
export function ledgerParams(amount, address) {
  return [amount, address];
}
