// Self-contained security test for POST /api/points/add and /api/points/deduct.
//
// Runs with plain node (no framework, no database):
//   npm run test:api   # -> node scripts/test-api.js
//
// It pins the behaviour the endpoints now rely on: a Stellar signature over the
// exact request body is required, tampering/wrong-address/replay/expiry are
// rejected, an unsigned request is a 401, and a match reward is derived from the
// stored match rather than the posted amount.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import {
  buildChallengeMessage,
  verifySignedPayload,
  issueSessionToken,
  verifySessionToken,
  requireSignedAddress,
  authPayload,
} from '../utils/auth.js';
import { deriveMatchReward, isMatchParticipant } from '../utils/matchRules.js';

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

const signProof = (
  keypair,
  payload,
  { timestamp = Date.now(), nonce = randomBytes(16).toString('hex') } = {}
) => {
  const address = keypair.publicKey();
  const message = buildChallengeMessage({ address, payload, timestamp, nonce });
  const signature = keypair.sign(Buffer.from(message, 'utf8')).toString('base64');
  return { address, payload, timestamp, nonce, signature };
};

const invoke = (middleware, req) =>
  new Promise((resolve) => {
    const res = {
      statusCode: 200,
      body: undefined,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        resolve({ statusCode: this.statusCode, body });
        return this;
      },
    };
    middleware(req, res, () => resolve({ statusCode: 200, passed: true }));
  });

const main = async () => {
  console.log('\npoints mutation auth:');

  await test('a signed challenge over the exact body is accepted', () => {
    const keypair = Keypair.random();
    const payload = { address: keypair.publicKey(), amount: 25, reason: 'Mission Reward: X' };
    assert.equal(verifySignedPayload(signProof(keypair, payload)), true);
  });

  await test('a signature for a different address is rejected', () => {
    const signer = Keypair.random();
    const victim = Keypair.random().publicKey();
    const proof = signProof(signer, { address: victim, amount: 25 });
    assert.throws(() => verifySignedPayload({ ...proof, address: victim }));
  });

  await test('a signature over a tampered body is rejected', () => {
    const keypair = Keypair.random();
    const proof = signProof(keypair, { address: keypair.publicKey(), amount: 25 });
    assert.throws(() =>
      verifySignedPayload({ ...proof, payload: { ...proof.payload, amount: 1000000 } })
    );
  });

  await test('replaying the same signed proof is rejected', () => {
    const keypair = Keypair.random();
    const proof = signProof(keypair, { address: keypair.publicKey(), amount: 25 });
    verifySignedPayload(proof);
    assert.throws(() => verifySignedPayload(proof));
  });

  await test('an expired signed proof is rejected', () => {
    const keypair = Keypair.random();
    const proof = signProof(
      keypair,
      { address: keypair.publicKey(), amount: 25 },
      { timestamp: Date.now() - 60 * 60 * 1000 }
    );
    assert.throws(() => verifySignedPayload(proof));
  });

  await test('an unsigned request to /add or /deduct is rejected with 401', async () => {
    const middleware = requireSignedAddress((req) => req.body.address, authPayload);
    const result = await invoke(middleware, {
      body: { address: Keypair.random().publicKey(), amount: 1000000, reason: 'whatever' },
      headers: {},
    });
    assert.equal(result.statusCode, 401);
  });

  await test('an authenticated request passes the middleware', async () => {
    const keypair = Keypair.random();
    const body = { address: keypair.publicKey(), amount: 25, reason: 'Mission Reward: X' };
    const proof = signProof(keypair, authPayload(body));
    const middleware = requireSignedAddress((req) => req.body.address, authPayload);
    const result = await invoke(middleware, {
      body: { ...body, timestamp: proof.timestamp, nonce: proof.nonce, signature: proof.signature },
      headers: {},
    });
    assert.equal(result.passed, true);
  });

  await test('a JWT session issued for an address verifies back to it', () => {
    const address = Keypair.random().publicKey();
    assert.equal(verifySessionToken(issueSessionToken(address)), address);
  });

  await test('a match reward is derived from the stored match, not the posted amount', () => {
    const stored = { p1_address: 'GAAA', p2_address: null, p1_score: 42 };
    assert.equal(deriveMatchReward(stored), 42);
    assert.equal(isMatchParticipant(stored, 'GAAA'), true);
    assert.equal(isMatchParticipant(stored, 'GBBB'), false);
  });

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed`);
    process.exitCode = 1;
  } else {
    console.log('\n✅ all points auth checks passed');
  }
};

main();
