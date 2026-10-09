// Self-contained security test for POST /api/matches/save server-side scoring.
//
// Runs with plain node (no framework, no database):
//   npm run test:api   # -> node scripts/test-api.js
//
// It pins the guarantee that the save endpoint no longer trusts client-supplied
// score/coins: the score is bounds-validated, the winner and coin reward are
// computed server-side, and the posted body must carry a valid signature.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import {
  buildChallengeMessage,
  verifySignedPayload,
  requireSignedAddress,
  authPayload,
} from '../utils/auth.js';
import {
  MAX_MATCH_SCORE,
  parseScore,
  computeWinner,
  deriveCoinsReward,
  deriveMatchReward,
} from '../utils/matchRules.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

let failures = 0;

const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  ✗ ${name}\n      ${error.message}`);
  }
};

const signProof = (keypair, payload, { timestamp = Date.now(), nonce = randomBytes(16).toString('hex') } = {}) => {
  const address = keypair.publicKey();
  const message = buildChallengeMessage({ address, payload, timestamp, nonce });
  const signature = keypair.sign(Buffer.from(message, 'utf8')).toString('base64');
  return { address, timestamp, nonce, signature };
};

const invoke = (middleware, req) =>
  new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ statusCode: this.statusCode, body });
        return this;
      },
    };
    middleware(req, res, () => resolve({ statusCode: 200, passed: true }));
  });

const main = async () => {
  console.log('\nmatch save validation:');

  const saveMiddleware = requireSignedAddress((req) => req.body.address, authPayload);

  await test('an unsigned save (no server-side session) is rejected with 401', async () => {
    const result = await invoke(saveMiddleware, {
      body: { address: Keypair.random().publicKey(), score: 999999, coins: 999999 },
      headers: {},
    });
    assert.equal(result.statusCode, 401);
  });

  await test('an authenticated save passes the middleware', async () => {
    const keypair = Keypair.random();
    const body = { address: keypair.publicKey(), score: 100, coins: 100, roomCode: 'solo' };
    const proof = signProof(keypair, authPayload(body));
    const result = await invoke(saveMiddleware, {
      body: { ...body, timestamp: proof.timestamp, nonce: proof.nonce, signature: proof.signature },
      headers: {},
    });
    assert.equal(result.passed, true);
  });

  await test('a tampered posted score fails signature verification', () => {
    const keypair = Keypair.random();
    const body = { address: keypair.publicKey(), score: 10, coins: 10 };
    const proof = signProof(keypair, authPayload(body));
    assert.throws(() =>
      verifySignedPayload({
        address: proof.address,
        payload: { ...authPayload(body), score: 999999 },
        timestamp: proof.timestamp,
        nonce: proof.nonce,
        signature: proof.signature,
      })
    );
  });

  await test('scores outside server bounds are rejected', () => {
    assert.equal(parseScore(-1), null);
    assert.equal(parseScore(1.5), null);
    assert.equal(parseScore('not-a-number'), null);
    assert.equal(parseScore(MAX_MATCH_SCORE + 1), null);
  });

  await test('valid scores (including 0) are accepted', () => {
    assert.equal(parseScore(0), 0);
    assert.equal(parseScore('150'), 150);
  });

  await test('the winner is computed by the server', () => {
    assert.equal(
      computeWinner({ p1Address: 'A', p2Address: null, p1Score: 10, p2Score: null }),
      'A'
    );
    assert.equal(
      computeWinner({ p1Address: 'A', p2Address: 'B', p1Score: 10, p2Score: 20 }),
      'B'
    );
    assert.equal(
      computeWinner({ p1Address: 'A', p2Address: 'B', p1Score: 5, p2Score: 5 }),
      null
    );
  });

  await test('coins are a function of the validated score, not the posted body', () => {
    assert.equal(deriveCoinsReward(120), 120);
    assert.equal(deriveCoinsReward(-5), 0);
    assert.equal(deriveMatchReward({ p1_address: 'A', p1_score: 7 }), 7);
  });

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed`);
    process.exitCode = 1;
  } else {
    console.log('\n✅ all match-save checks passed');
  }
};

main();
// Self-contained security test for PUT /api/users/profile/:address ownership.
//
// Runs with plain node (no framework, no database):
//   npm run test:api   # -> node scripts/test-api.js
//
// It pins the guarantee that a profile write proves control of the address in
// the path: unsigned updates to another address are a 401, a signature for a
// different address than the path is rejected, and a signed update from the
// address itself passes.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import {
  buildChallengeMessage,
  requireSignedAddress,
  authPayload,
  issueSessionToken,
  verifySessionToken,
} from '../utils/auth.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

let failures = 0;

const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  ✗ ${name}\n      ${error.message}`);
  }
};

const signProof = (keypair, payload, { timestamp = Date.now(), nonce = randomBytes(16).toString('hex') } = {}) => {
  const address = keypair.publicKey();
  const message = buildChallengeMessage({ address, payload, timestamp, nonce });
  const signature = keypair.sign(Buffer.from(message, 'utf8')).toString('base64');
  return { address, timestamp, nonce, signature };
};

const invoke = (middleware, req) =>
  new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ statusCode: this.statusCode, body });
        return this;
      },
    };
    middleware(req, res, () => resolve({ statusCode: 200, passed: true }));
  });

const main = async () => {
  console.log('\nprofile ownership auth:');

  const ownershipMiddleware = requireSignedAddress((req) => req.params.address, authPayload);

  await test('an unsigned update to another address returns 401 and writes nothing', async () => {
    const result = await invoke(ownershipMiddleware, {
      params: { address: Keypair.random().publicKey() },
      body: { username: 'attacker' },
      headers: {},
    });
    assert.equal(result.statusCode, 401);
    assert.equal(result.passed, undefined);
  });

  await test('a signature for a different address than the path is rejected', async () => {
    const attacker = Keypair.random();
    const victim = Keypair.random().publicKey();
    const body = { username: 'attacker' };
    const proof = signProof(attacker, authPayload(body));
    const result = await invoke(ownershipMiddleware, {
      params: { address: victim },
      body: { ...body, timestamp: proof.timestamp, nonce: proof.nonce, signature: proof.signature },
      headers: {},
    });
    assert.equal(result.statusCode, 401);
  });

  await test('a signed update from the address in the path succeeds', async () => {
    const owner = Keypair.random();
    const body = { username: 'owner' };
    const proof = signProof(owner, authPayload(body));
    const result = await invoke(ownershipMiddleware, {
      params: { address: owner.publicKey() },
      body: { ...body, timestamp: proof.timestamp, nonce: proof.nonce, signature: proof.signature },
      headers: {},
    });
    assert.equal(result.passed, true);
  });

  await test('a JWT session issued for an address verifies back to it', () => {
    const address = Keypair.random().publicKey();
    assert.equal(verifySessionToken(issueSessionToken(address)), address);
  });

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed`);
    process.exitCode = 1;
  } else {
    console.log('\n✅ all profile ownership checks passed');
  }
};

main();
