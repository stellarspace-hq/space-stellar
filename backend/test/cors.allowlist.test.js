// Unit tests for the explicit CORS origin allowlist
// (stellarspace-hq/space-stellar #66).
//
// Run with:  node --test backend/test/cors.allowlist.test.js
//
// The policy lives in `backend/utils/corsAllowlist.js` so it can be exercised
// without booting Express or opening a socket.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  ALLOWLIST_ENV,
  buildAllowedOrigins,
  isOriginAllowed,
  parseAllowlist,
  rejectionReason,
} from '../utils/corsAllowlist.js';

const ATTACKER = 'https://evil.example';
const PROD = 'https://spacestellar.app';

describe('parseAllowlist', () => {
  it('splits, trims and drops empty entries', () => {
    assert.deepEqual(parseAllowlist(' https://a.test , https://b.test ,, '), [
      'https://a.test',
      'https://b.test',
    ]);
  });

  it('returns [] for missing or non-string values', () => {
    assert.deepEqual(parseAllowlist(undefined), []);
    assert.deepEqual(parseAllowlist(null), []);
    assert.deepEqual(parseAllowlist('   '), []);
    assert.deepEqual(parseAllowlist(5173), []);
  });
});

describe('buildAllowedOrigins - production', () => {
  it('does NOT fall back to a wildcard when nothing is configured', () => {
    const origins = buildAllowedOrigins({ NODE_ENV: 'production' });
    assert.equal(isOriginAllowed(ATTACKER, origins), false);
    assert.equal(isOriginAllowed('https://anything.example', origins), false);
  });

  it('does not implicitly include the Vite dev ports', () => {
    const origins = buildAllowedOrigins({ NODE_ENV: 'production' });
    assert.equal(isOriginAllowed('http://localhost:5173', origins), false);
  });

  it('allows only configured origins', () => {
    const origins = buildAllowedOrigins({
      NODE_ENV: 'production',
      [ALLOWLIST_ENV]: 'https://spacestellar.app, https://www.spacestellar.app',
      FRONTEND_URL: 'https://legacy-spacestellar.app',
      VERCEL_URL: 'space-stellar-abc.vercel.app',
    });
    assert.equal(isOriginAllowed(PROD, origins), true);
    assert.equal(isOriginAllowed('https://www.spacestellar.app', origins), true);
    assert.equal(isOriginAllowed('https://legacy-spacestellar.app', origins), true);
    assert.equal(isOriginAllowed('https://space-stellar-abc.vercel.app', origins), true);
    assert.equal(isOriginAllowed(ATTACKER, origins), false);
    assert.equal(isOriginAllowed('https://spacestellar.app.evil.example', origins), false);
  });

  it('rejects the empty-origin and wildcard string', () => {
    const origins = buildAllowedOrigins({ NODE_ENV: 'production' });
    assert.equal(origins.has(''), false);
    assert.equal(origins.has('*'), false);
  });
});

describe('buildAllowedOrigins - development', () => {
  it('allows the Vite dev ports in addition to configured origins', () => {
    const origins = buildAllowedOrigins({
      NODE_ENV: 'development',
      FRONTEND_URL: 'https://spacestellar.app',
    });
    assert.equal(isOriginAllowed('http://localhost:5173', origins), true);
    assert.equal(isOriginAllowed('http://localhost:5174', origins), true);
    assert.equal(isOriginAllowed('http://127.0.0.1:5173', origins), true);
    assert.equal(isOriginAllowed(PROD, origins), true);
    assert.equal(isOriginAllowed(ATTACKER, origins), false);
  });
});

describe('isOriginAllowed', () => {
  const origins = buildAllowedOrigins({ NODE_ENV: 'production', [ALLOWLIST_ENV]: PROD });

  it('allows requests with no Origin header', () => {
    assert.equal(isOriginAllowed(undefined, origins), true);
    assert.equal(isOriginAllowed(null, origins), true);
    assert.equal(isOriginAllowed('', origins), true);
  });

  it('matches origins exactly, not by prefix or substring', () => {
    assert.equal(isOriginAllowed(PROD, origins), true);
    assert.equal(isOriginAllowed(`${PROD}/`, origins), false);
    assert.equal(isOriginAllowed('https://spacestellar.app.evil.example', origins), false);
    assert.equal(isOriginAllowed('https://evil.example/spacestellar.app', origins), false);
    assert.equal(isOriginAllowed(PROD.toUpperCase(), origins), false);
  });

  it('rejects everything when the allowlist is empty or malformed', () => {
    assert.equal(isOriginAllowed(ATTACKER, new Set()), false);
    assert.equal(isOriginAllowed(ATTACKER, undefined), false);
    assert.equal(isOriginAllowed(ATTACKER, null), false);
  });
});

describe('rejectionReason', () => {
  it('names the rejected origin for the log line', () => {
    assert.match(rejectionReason(ATTACKER), /evil\.example/);
  });
});
