// Origin allowlist shared by the Express CORS middleware and the Socket.IO
// server.
//
// The previous implementation read:
//
//   if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'production')
//
// which is the inverse of the intended behaviour: in production *every* origin
// matched, so any website could call the API with the user's cookies
// (`credentials: true`). The allowlist only ever applied outside production.
//
// Rules implemented here:
//   * An explicit allowlist always wins. `CORS_ALLOWED_ORIGINS` accepts a
//     comma-separated list and is the canonical setting.
//   * `FRONTEND_URL` and `VERCEL_URL` remain supported for backwards
//     compatibility with existing deployments.
//   * Localhost development origins are only added when NODE_ENV is not
//     `production`, so a production deploy cannot be tricked into trusting
//     them through a stray config value.
//   * There is no wildcard in production. If the resulting allowlist is empty
//     the server fails closed and rejects every cross-origin request, logging
//     the misconfiguration once instead of silently accepting all origins.
//   * Requests with no `Origin` header (curl, server-to-server, mobile apps)
//     are allowed: CORS is a browser-enforced policy and those callers do not
//     participate in it.

const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

// Normalise an origin so `https://Example.com/` and `https://example.com` are
// treated identically. Returns null for unusable values.
const normalizeOrigin = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
};

const splitList = (value) =>
  typeof value === 'string' ? value.split(',').map((entry) => entry.trim()).filter(Boolean) : [];

/**
 * Build the set of allowed origins for the given environment.
 * Exported for tests and for logging what the server trusts at boot.
 */
export const resolveAllowedOrigins = (env = process.env) => {
  const isProduction = env.NODE_ENV === 'production';
  const allowed = new Set();

  for (const entry of splitList(env.CORS_ALLOWED_ORIGINS)) {
    const origin = normalizeOrigin(entry);
    if (origin) allowed.add(origin);
  }

  const frontend = normalizeOrigin(env.FRONTEND_URL);
  if (frontend) allowed.add(frontend);

  if (env.VERCEL_URL) {
    const vercelOrigin = normalizeOrigin(
      env.VERCEL_URL.startsWith('http') ? env.VERCEL_URL : `https://${env.VERCEL_URL}`
    );
    if (vercelOrigin) allowed.add(vercelOrigin);
  }

  if (!isProduction) {
    for (const origin of DEV_ORIGINS) allowed.add(origin);
  }

  return allowed;
};

/**
 * Decide whether a single origin is allowed, logging why when it is not.
 * Non-browser callers send no Origin header and are not subject to CORS.
 */
export const createOriginPolicy = (env = process.env, { logger = console } = {}) => {
  const allowedOrigins = resolveAllowedOrigins(env);
  const isProduction = env.NODE_ENV === 'production';
  let warnedEmpty = false;

  return (origin) => {
    if (!origin) return true;

    if (allowedOrigins.size === 0 && !warnedEmpty) {
      warnedEmpty = true;
      logger.warn(
        '[cors] No allowed origins configured. Set CORS_ALLOWED_ORIGINS ' +
          '(or FRONTEND_URL) to the deployed frontend origin; all cross-origin ' +
          'requests will be rejected.'
      );
    }

    const normalized = normalizeOrigin(origin);
    if (normalized && allowedOrigins.has(normalized)) return true;

    logger.warn(
      `[cors] Rejected origin ${JSON.stringify(origin)}: not in the allowlist` +
        (isProduction ? ' (production)' : '')
    );
    return false;
  };
};

/**
 * Origin callback for `cors` and for Socket.IO's handshake check.
 * A false answer makes Socket.IO refuse the handshake instead of silently
 * letting it through, and makes the `cors` middleware omit its headers.
 */
export const createOriginChecker = (env = process.env, { logger = console } = {}) => {
  const isAllowed = createOriginPolicy(env, { logger });
  return (origin, callback) => callback(null, isAllowed(origin));
};

/**
 * Express middleware that answers a disallowed browser origin with a plain 403
 * instead of letting the request reach a route and fail with a 500 later.
 */
export const createOriginGuard = (env = process.env, { logger = console } = {}) => {
  const isAllowed = createOriginPolicy(env, { logger });
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (isAllowed(origin)) return next();
    res.status(403).json({
      success: false,
      code: 'CORS_ORIGIN_NOT_ALLOWED',
      message: `Origin ${origin} is not allowed by CORS`,
    });
  };
};

export { normalizeOrigin, DEV_ORIGINS };
