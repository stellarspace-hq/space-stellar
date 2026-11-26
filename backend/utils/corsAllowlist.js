// Explicit CORS origin allowlist for the Space Stellar backend
// (stellarspace-hq/space-stellar #66).
//
// Production used to accept *any* origin:
//   - the default `cors()` behaviour, plus
//   - an origin callback that returned true whenever NODE_ENV === 'production'.
// Together with the unauthenticated points and match endpoints that let any web
// page drive the API on behalf of a visitor, and let an arbitrary Socket.IO client
// join rooms and inject game state.
//
// The policy below is pure so it can be unit tested without booting Express or
// opening a socket. `server.js` wires it into both the Express middleware and the
// Socket.IO server so REST and websocket handshakes are checked against the same
// list.

/** Dev-server ports that Vite may use on this project. */
export const DEV_ORIGIN_DEFAULTS = Object.freeze([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
]);

/** Environment variable that carries the production allowlist. */
export const ALLOWLIST_ENV = 'CORS_ALLOWLIST';

/**
 * Split a comma-separated allowlist into trimmed, non-empty origins.
 * Accepts undefined/null/blank and returns [].
 *
 * @param {string | undefined | null} raw
 * @returns {string[]}
 */
export function parseAllowlist(raw) {
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Build the effective origin set.
 *
 * Rules:
 *  - `CORS_ALLOWLIST` entries always allowed (comma-separated, exact match).
 *  - `FRONTEND_URL` allowed when set (existing single-origin deployment).
 *  - `https://<VERCEL_URL>` allowed when set (existing Vercel preview deployment).
 *  - Dev defaults (localhost/127.0.0.1 Vite ports) allowed only when
 *    NODE_ENV is not 'production' - production must be configured explicitly.
 *  - Wildcards are never added, and NODE_ENV === 'production' no longer
 *    bypasses the check.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{ nodeEnv?: string }} [options]
 * @returns {Set<string>}
 */
export function buildAllowedOrigins(env = {}, options = {}) {
  const nodeEnv = options.nodeEnv ?? env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';

  const fromEnv = [
    ...parseAllowlist(env[ALLOWLIST_ENV]),
    env.FRONTEND_URL,
    env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined,
  ]
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);

  const origins = isProduction ? fromEnv : [...DEV_ORIGIN_DEFAULTS, ...fromEnv];

  return new Set(origins);
}

/**
 * Decide whether an origin is permitted.
 *
 * Requests without an `Origin` header (curl, mobile apps, same-origin proxies)
 * are allowed, as before: the header is what a browser attacker cannot forge,
 * and dropping it would break server-to-server callers without closing the hole.
 *
 * Everything else must match the allowlist exactly; production no longer
 * short-circuits to "allow".
 *
 * @param {string | undefined | null} origin
 * @param {Set<string>} allowlist
 * @returns {boolean}
 */
export function isOriginAllowed(origin, allowlist) {
  if (!origin) return true;
  return allowlist instanceof Set && allowlist.has(origin);
}

/**
 * The reason string logged for a rejected origin. Kept in one place so tests can
 * assert on the shape without duplicating prose.
 *
 * @param {string} origin
 * @returns {string}
 */
export function rejectionReason(origin) {
  return `origin "${origin}" is not in the CORS allowlist`;
}
