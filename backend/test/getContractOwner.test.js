// Unit tests for the contract-owner simulation parsing
// (stellarspace-hq/space-stellar #16).
//
// Run with:  node --test backend/test/getContractOwner.test.js
//
// Only the pure parser is exercised: no Soroban RPC client is created and no
// network call is made.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { Keypair, xdr } from '@stellar/stellar-sdk';

import { extractOwnerAddress } from '../utils/contractOwner.js';

function scvString(value) {
  return xdr.ScVal.scvString(value);
}

function wrapped(retval) {
  return { result: { retval } };
}

describe('extractOwnerAddress', () => {
  it('returns the address for a valid scvString return value', () => {
    const address = Keypair.random().publicKey();
    assert.equal(extractOwnerAddress(wrapped(scvString(address))), address);
  });

  it('returns null without throwing when the simulation has no return value', () => {
    assert.equal(extractOwnerAddress(undefined), null);
    assert.equal(extractOwnerAddress(null), null);
    assert.equal(extractOwnerAddress({}), null);
    assert.equal(extractOwnerAddress({ result: {} }), null);
    assert.equal(extractOwnerAddress({ result: { retval: undefined } }), null);
  });

  it('returns null when the return value is not a G... address', () => {
    assert.equal(extractOwnerAddress(wrapped(scvString('hello'))), null);
    assert.equal(extractOwnerAddress(wrapped(scvString('C'.repeat(56)))), null);
    // A numeric ScVal stringifies, but is not an account address.
    assert.equal(
      extractOwnerAddress(wrapped(xdr.ScVal.scvI128(new xdr.Int128Parts({ hi: 0n, lo: 42n })))),
      null,
    );
  });

  it('validates the G... address at exactly 56 characters', () => {
    const short = `G${'A'.repeat(53)}`; // 54 chars
    const long = `G${'A'.repeat(56)}`; // 57 chars
    assert.equal(extractOwnerAddress(wrapped(scvString(short))), null);
    assert.equal(extractOwnerAddress(wrapped(scvString(long))), null);

    const exact = Keypair.random().publicKey();
    assert.equal(exact.length, 56);
    assert.equal(extractOwnerAddress(wrapped(scvString(exact))), exact);
  });

  it('never throws on a malformed ScVal', () => {
    assert.doesNotThrow(() => extractOwnerAddress({ result: { retval: {} } }));
  });
});
