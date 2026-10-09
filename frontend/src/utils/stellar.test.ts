import { beforeEach, describe, expect, it, vi } from 'vitest'

const horizon = vi.hoisted(() => ({
  loadAccount: vi.fn(),
  submitTransaction: vi.fn(),
  payment: vi.fn(),
}))

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>()

  class MockHorizonServer {
    loadAccount = horizon.loadAccount
    submitTransaction = horizon.submitTransaction
  }

  return {
    ...actual,
    Horizon: { ...(actual.Horizon as object), Server: MockHorizonServer },
    Operation: {
      ...actual.Operation,
      payment: (options: Parameters<typeof actual.Operation.payment>[0]) => {
        horizon.payment(options)
        return actual.Operation.payment(options)
      },
    },
  }
})

import { Account, TransactionBuilder } from '@stellar/stellar-sdk'
import { NETWORK_PASSPHRASE, createPaymentTransaction } from './stellar'

const SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV'
const DESTINATION = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEGWF'
const ISSUER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGO6V'

const makeAccount = (accountId: string) =>
  Object.assign(new Account(accountId, '100'), {
    balances: [{ asset_type: 'native', balance: '1000.0000000' }],
    subentry_count: 0,
  })

beforeEach(() => {
  horizon.loadAccount.mockReset()
  horizon.submitTransaction.mockReset()
  horizon.payment.mockReset()
  horizon.loadAccount.mockResolvedValue(makeAccount(SOURCE))
})

describe('createPaymentTransaction', () => {
  it('converts a native amount to the exact stroop string on the operation', async () => {
    await createPaymentTransaction({
      source: SOURCE,
      destination: DESTINATION,
      asset: 'native',
      amount: '1.5',
    })

    expect(horizon.payment).toHaveBeenCalledTimes(1)

    const payment = horizon.payment.mock.calls[0][0]
    expect(payment.amount).toBe('15000000')
    expect(payment.destination).toBe(DESTINATION)
    expect(payment.asset.isNative()).toBe(true)
  })

  it('passes a non-native amount through unchanged and keeps the code and issuer', async () => {
    await createPaymentTransaction({
      source: SOURCE,
      destination: DESTINATION,
      asset: `USDC:${ISSUER}`,
      amount: '25',
    })

    const payment = horizon.payment.mock.calls[0][0]
    expect(payment.amount).toBe('25')
    expect(payment.asset.code).toBe('USDC')
    expect(payment.asset.issuer).toBe(ISSUER)
  })

  it('attaches a text memo when one is provided', async () => {
    const result = await createPaymentTransaction({
      source: SOURCE,
      destination: DESTINATION,
      amount: '2',
      memo: 'hello-memo',
    })

    const parsed = TransactionBuilder.fromXDR(result.transaction, result.network_passphrase)
    expect(parsed.memo.type).toBe('text')
    expect(String(parsed.memo.value)).toContain('hello-memo')
  })

  it('loads the source account through the Horizon server', async () => {
    await createPaymentTransaction({ source: SOURCE, destination: DESTINATION, amount: '1' })

    expect(horizon.loadAccount).toHaveBeenCalledWith(SOURCE)
    expect(horizon.loadAccount).toHaveBeenCalledTimes(1)
  })
})
