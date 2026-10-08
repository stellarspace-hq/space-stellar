// Unit tests for `PFPContractClient` address and secret validation
// (stellarspace-hq/space-stellar #15).
//
// Run with:  node --test backend/test/pfpContract.test.js
//
// Every path below is exercised offline: no RPC call is ever sent. The Soroban
// RPC client is replaced with a stub before any call that would otherwise
// reach the network.

import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { Keypair, StrKey } from '@stellar/stellar-sdk';

import { PFPContractClient } from '../utils/pfpContract.js';

const originalConsoleError = console.error;

// A syntactically valid contract ID (C..., 56 chars, correct checksum).
function validContractId() {
  return StrKey.encodeContract(Keypair.random().rawPublicKey());
}

// A well-formed recipient key (G..., 56 chars, correct checksum).
function validAddress() {
  return Keypair.random().publicKey();
}

// Build a client whose `hasPFP` is stubbed and whose RPC server counts calls.
function makeClient({ hasPFP }) {
  const client = new PFPContractClient(validContractId());
  client.hasPFP = async () => hasPFP;

  const state = { rpcCalls: 0 };
  client.rpcServer = {
    async getAccount() {
      state.rpcCalls += 1;
      throw new Error('getAccount should not be reached');
    },
    async sendTransaction() {
      state.rpcCalls += 1;
      throw new Error('sendTransaction should not be reached');
    },
    async prepareTransaction() {
      state.rpcCalls += 1;
      throw new Error('prepareTransaction should not be reached');
    },
  };
  return { client, state };
}

beforeEach(() => {
  // The client logs and swallows expected errors; keep the test output clean.
  console.error = () => {};
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe('constructor', () => {
  it('rejects a falsy contract ID with a clear message', () => {
    assert.throws(
      () => new PFPContractClient(''),
      /Contract ID is required/,
    );
    assert.throws(
      () => new PFPContractClient(undefined),
      /Contract ID is required/,
    );
  });

  it('accepts a valid contract ID without any network access', () => {
    assert.doesNotThrow(() => new PFPContractClient(validContractId()));
  });
});

describe('hasPFP', () => {
  it('returns false (does not throw) for a malformed address', async () => {
    const client = new PFPContractClient(validContractId());
    assert.equal(await client.hasPFP('not-an-address'), false);
    assert.equal(await client.hasPFP(''), false);
    assert.equal(await client.hasPFP(undefined), false);
  });

  it('returns false for a 56-char G address with a bad checksum', async () => {
    const client = new PFPContractClient(validContractId());
    assert.equal(await client.hasPFP(`G${'A'.repeat(55)}`), false);
  });

  it('returns false when the simulation rejects', async () => {
    const client = new PFPContractClient(validContractId());
    let attempted = 0;
    client.rpcServer = {
      async simulateTransaction() {
        attempted += 1;
        throw new Error('rpc unavailable');
      },
    };

    const result = await client.hasPFP(validAddress());
    assert.equal(result, false);
    assert.equal(attempted, 1);
  });
});

describe('mint validation', () => {
  it('rejects a non-G / non-56 recipient before any RPC call', async () => {
    const { client, state } = makeClient({ hasPFP: false });

    await assert.rejects(
      () => client.mint(Keypair.random().secret(), 'not-an-address'),
      /Invalid Stellar address format/,
    );
    assert.equal(state.rpcCalls, 0);
  });

  it('rejects an invalid signer secret before any RPC call', async () => {
    const { client, state } = makeClient({ hasPFP: false });

    await assert.rejects(
      () => client.mint('not-a-secret', validAddress()),
      /Invalid Stellar secret key format/,
    );
    assert.equal(state.rpcCalls, 0);
  });

  it('throws the already-owns message when hasPFP is true', async () => {
    const { client, state } = makeClient({ hasPFP: true });

    await assert.rejects(
      () => client.mint(Keypair.random().secret(), validAddress()),
      /Address already owns a PFP NFT/,
    );
    assert.equal(state.rpcCalls, 0);
  });
});

describe('signer public key', () => {
  it('derives a 56-character G... public key from a valid secret', () => {
    const secret = Keypair.random().secret();
    const publicKey = Keypair.fromSecret(secret).publicKey();

    assert.equal(publicKey.startsWith('G'), true);
    assert.equal(publicKey.length, 56);
  });
});
