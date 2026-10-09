// Regression test for the XLM-to-stroops bug in createPaymentTransaction (#61).
//
// `Operation.payment` takes a decimal amount string and performs its own
// stroop conversion. createPaymentTransaction used to multiply the amount by
// 10000000 first, which made an in-app XLM payment send 10,000,000x the
// requested value. This test pins the exact amount placed on the operation for
// both the native and the issued-asset branch.
//
// Run with: node scripts/test-payment-amount.mjs

import assert from 'node:assert/strict'
import { Asset, Keypair, Operation } from '@stellar/stellar-sdk'
import { normalizePaymentAmount } from '../src/utils/paymentAmount.js'

const destination = Keypair.random().publicKey()

// --- native (XLM) branch ---
const nativeAmount = normalizePaymentAmount('native', 1)
assert.equal(nativeAmount, '1', 'native amount must be handed over as a decimal string, not pre-scaled')

const nativeOp = Operation.payment({
  destination,
  asset: Asset.native(),
  amount: nativeAmount,
})
const nativeRoundTrip = Operation.fromXDRObject(nativeOp)
assert.equal(
  nativeRoundTrip.amount,
  '1.0000000',
  'a native payment of 1 XLM must place 1.0000000 on the operation'
)

// --- non-native (issued asset) branch ---
const issuer = Keypair.random().publicKey()
const creditAsset = new Asset('USDC', issuer)
const creditAmount = normalizePaymentAmount(`USDC:${issuer}`, '12.5')
assert.equal(creditAmount, '12.5', 'issued-asset amount must be passed through unchanged')

const creditOp = Operation.payment({
  destination,
  asset: creditAsset,
  amount: creditAmount,
})
const creditRoundTrip = Operation.fromXDRObject(creditOp)
assert.equal(
  creditRoundTrip.amount,
  '12.5000000',
  'an issued-asset payment must keep the requested amount'
)

console.log('✅ createPaymentTransaction amount assertions passed')
