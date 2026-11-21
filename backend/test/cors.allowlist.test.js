// Pins the CORS allowlist guarantee requested in issue #66: production must not
// accept an arbitrary origin, and the Socket.IO handshake must enforce exactly
// the same policy as the HTTP middleware.
//
// Runs with plain node (no framework, no database):
//   npm run test:api

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveAllowedOrigins,
  createOriginChecker,
  createOriginGuard,
  normalizeOrigin,
} from '../utils/corsAllowlist.js';

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(here, '..');
const serverSource = readFileSync(join(backendRoot, 'server.js'), 'utf8');

// Small helper: run the origin callback and report the decision.
const decide = (checker, origin) => {
  let result;
  checker(origin, (error, allowed) => {
    result = { error, allowed };
  });
  return result;
};

const quiet = { warn() {}, log() {}, error() {} };

test('production with no configured origin rejects every browser origin', () => {
  const checker = createOriginChecker({ NODE_ENV: 'production' }, { logger: quiet });
  const decision = decide(checker, 'https://evil.example');

  // `cors` and Socket.IO accept a boolean; false refuses the origin/handshake.
  assert.equal(decision.allowed, false);
});

test('production does not fall back to localhost development origins', () => {
  const allowed = resolveAllowedOrigins({ NODE_ENV: 'production' });

  assert.equal(allowed.size, 0);
  assert.equal(allowed.has('http://localhost:5173'), false);
  assert.equal(allowed.has('http://127.0.0.1:5173'), false);
});

test('production accepts only the configured frontend origin', () => {
  const env = { NODE_ENV: 'production', FRONTEND_URL: 'https://space-stellar.vercel.app' };
  const checker = createOriginChecker(env, { logger: quiet });

  assert.equal(decide(checker, 'https://space-stellar.vercel.app').allowed, true);
  assert.equal(decide(checker, 'https://space-stellar.vercel.app.evil.example').allowed, false);
  assert.equal(decide(checker, 'http://space-stellar.vercel.app').allowed, false, 'scheme must match');
});

test('CORS_ALLOWED_ORIGINS accepts a comma-separated list', () => {
  const env = {
    NODE_ENV: 'production',
    CORS_ALLOWED_ORIGINS: 'https://app.example.com, https://admin.example.com/',
  };
  const checker = createOriginChecker(env, { logger: quiet });

  assert.equal(decide(checker, 'https://app.example.com').allowed, true);
  assert.equal(decide(checker, 'https://admin.example.com').allowed, true);
  assert.equal(decide(checker, 'https://other.example.com').allowed, false);
});

test('development still trusts localhost so local tooling keeps working', () => {
  const checker = createOriginChecker({ NODE_ENV: 'development' }, { logger: quiet });

  assert.equal(decide(checker, 'http://localhost:5173').allowed, true);
  assert.equal(decide(checker, 'https://evil.example').allowed, false);
});

test('requests without an Origin header are allowed', () => {
  const checker = createOriginChecker({ NODE_ENV: 'production' }, { logger: quiet });

  assert.equal(decide(checker, undefined).allowed, true);
});

test('a rejected origin logs the reason exactly once per request', () => {
  const warnings = [];
  const checker = createOriginChecker(
    { NODE_ENV: 'production' },
    { logger: { warn: (message) => warnings.push(message), log() {}, error() {} } }
  );

  decide(checker, 'https://evil.example');
  assert.equal(warnings.length, 2, 'one empty-allowlist notice plus one rejection');
  assert.match(warnings.join('\n'), /evil\.example/);
  assert.match(warnings.join('\n'), /CORS_ALLOWED_ORIGINS/);
});

test('the HTTP guard answers a disallowed origin with 403, not a 500', () => {
  const guard = createOriginGuard(
    { NODE_ENV: 'production', FRONTEND_URL: 'https://space-stellar.vercel.app' },
    { logger: quiet }
  );

  const call = (origin) => {
    const result = {};
    const res = {
      statusCode: 200,
      status(code) {
        result.statusCode = code;
        return this;
      },
      json(body) {
        result.body = body;
        return this;
      },
    };
    guard({ headers: origin ? { origin } : {} }, res, () => {
      result.passed = true;
    });
    return result;
  };

  const blocked = call('https://evil.example');
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.body.code, 'CORS_ORIGIN_NOT_ALLOWED');
  assert.equal(blocked.passed, undefined);

  assert.equal(call('https://space-stellar.vercel.app').passed, true);
  assert.equal(call(undefined).passed, true, 'server-to-server callers pass through');
});

test('normalizeOrigin collapses trailing slashes and rejects junk', () => {
  assert.equal(normalizeOrigin('https://example.com/'), 'https://example.com');
  assert.equal(normalizeOrigin('  https://example.com//  '), 'https://example.com');
  assert.equal(normalizeOrigin('not a url'), null);
  assert.equal(normalizeOrigin('file:///etc/passwd'), null);
  assert.equal(normalizeOrigin(undefined), null);
});

test('server.js enforces no production wildcard for HTTP or Socket.IO', () => {
  // The regression this issue reports: `|| NODE_ENV === 'production'` inside
  // the origin callback let every origin through in production.
  assert.equal(
    /NODE_ENV\s*===\s*'production'\s*\)\s*\{?\s*callback\(null,\s*true\)/.test(serverSource),
    false,
    'server.js must not allow every origin in production'
  );
  assert.equal(/\ballowedOrigins\b/.test(serverSource), false, 'the old wildcard list must be gone');

  // Both the Socket.IO server and the Express middleware must use the shared
  // checker, so the handshake and the API cannot drift apart.
  const corsOriginUses = serverSource.match(/origin:\s*corsOrigin\b/g) || [];
  assert.equal(corsOriginUses.length, 2, 'HTTP middleware and Socket.IO must share one checker');
});
