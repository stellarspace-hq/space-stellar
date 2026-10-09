import { describe, expect, it, vi } from 'vitest'
import { PFPMintClient } from './pfpContract'

// Real strkey fixtures: a deployed contract ID (see frontend/.env.example) and
// genuine ed25519 public keys, so the validation paths run on real StrKey values.
const VALID_CONTRACT_ID = 'CCHNVW6KZGR4MZF5CK5DQLPBNHVSDBGH7ZEC34URZ677JKKEY7GJRIJO'
const VALID_ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV'
const OTHER_ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEGWF'
const MIS_PREFIXED_CONTRACT_ID = `G${'A'.repeat(55)}`

const buildClient = () => new PFPMintClient(VALID_CONTRACT_ID)

const stubRpc = (client: PFPMintClient, overrides: Record<string, unknown> = {}) => {
  const rpc = {
    getAccount: vi.fn(),
    prepareTransaction: vi.fn(),
    simulateTransaction: vi.fn(),
    sendTransaction: vi.fn(),
    ...overrides,
  }

  ;(client as unknown as { rpcServer: typeof rpc }).rpcServer = rpc
  return rpc
}

describe('PFPMintClient contract ID validation', () => {
  it('throws the documented message for an empty contract ID', () => {
    expect(() => new PFPMintClient('')).toThrow('Contract ID is required')
  })

  it('throws the documented message for a too-short contract ID', () => {
    expect(() => new PFPMintClient('CSHORT')).toThrow(
      'Invalid contract ID length: "CSHORT". Expected 56 characters, got 6',
    )
  })

  it('throws the documented message for a too-long contract ID', () => {
    const tooLong = `${VALID_CONTRACT_ID}A`

    expect(() => new PFPMintClient(tooLong)).toThrow(
      `Invalid contract ID length: "${tooLong}". Expected 56 characters, got 57`,
    )
  })

  it('throws the documented message for a mis-prefixed contract ID', () => {
    expect(() => new PFPMintClient(MIS_PREFIXED_CONTRACT_ID)).toThrow(
      `Invalid contract ID prefix: "${MIS_PREFIXED_CONTRACT_ID}". Expected to start with 'C', got 'G'`,
    )
  })

  it('accepts the valid contract ID fixture', () => {
    expect(() => buildClient()).not.toThrow()
  })
})

describe('PFPMintClient.buildMintTransaction', () => {
  it('rejects a malformed recipient before making any RPC call', async () => {
    const client = buildClient()
    const rpc = stubRpc(client)

    await expect(
      client.buildMintTransaction('not-a-stellar-address', VALID_ADDRESS),
    ).rejects.toThrow('Invalid address format')

    expect(rpc.getAccount).not.toHaveBeenCalled()
  })

  it('rejects a recipient that is the wrong length before making any RPC call', async () => {
    const client = buildClient()
    const rpc = stubRpc(client)

    await expect(client.buildMintTransaction('GSHORT', VALID_ADDRESS)).rejects.toThrow(
      'Invalid address format',
    )

    expect(rpc.getAccount).not.toHaveBeenCalled()
  })

  it('accepts a valid recipient fixture and builds against a mocked RPC', async () => {
    const client = buildClient()
    const preparedXdr = 'AAAA-prepared-transaction'
    const rpc = stubRpc(client, {
      getAccount: vi.fn().mockResolvedValue({ sequenceNumber: () => '5' }),
      prepareTransaction: vi.fn().mockResolvedValue({ toXDR: () => preparedXdr }),
    })

    await expect(client.buildMintTransaction(VALID_ADDRESS, OTHER_ADDRESS)).resolves.toBe(
      preparedXdr,
    )

    expect(rpc.getAccount).toHaveBeenCalledWith(OTHER_ADDRESS)
  })
})

describe('PFPMintClient.hasPFP', () => {
  it('returns false instead of throwing when the RPC simulation rejects', async () => {
    const client = buildClient()
    stubRpc(client, {
      getAccount: vi.fn().mockRejectedValue(new Error('account not found')),
      simulateTransaction: vi.fn().mockRejectedValue(new Error('RPC unavailable')),
    })

    await expect(client.hasPFP(VALID_ADDRESS)).resolves.toBe(false)
  })
})
