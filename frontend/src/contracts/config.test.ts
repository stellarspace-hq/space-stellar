import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('contract network configuration', () => {
  it('maps mainnet to the mainnet RPC and Horizon URLs', async () => {
    vi.stubEnv('VITE_STELLAR_NETWORK', 'mainnet')

    const config = await import('./config')

    expect(config.NETWORK).toBe('mainnet')
    expect(config.SOROBAN_RPC_URL).toBe('https://rpc.mainnet.stellar.org:443')
    expect(config.HORIZON_URL).toBe('https://horizon.stellar.org')
  })

  it('maps testnet to the testnet RPC and Horizon URLs', async () => {
    vi.stubEnv('VITE_STELLAR_NETWORK', 'testnet')

    const config = await import('./config')

    expect(config.NETWORK).toBe('testnet')
    expect(config.SOROBAN_RPC_URL).toBe('https://soroban-testnet.stellar.org')
    expect(config.HORIZON_URL).toBe('https://horizon-testnet.stellar.org')
  })

  it('defaults to testnet when VITE_STELLAR_NETWORK is unset', async () => {
    vi.stubEnv('VITE_STELLAR_NETWORK', '')

    const config = await import('./config')

    expect(config.NETWORK).toBe('testnet')
    expect(config.SOROBAN_RPC_URL).toBe('https://soroban-testnet.stellar.org')
    expect(config.HORIZON_URL).toBe('https://horizon-testnet.stellar.org')
  })

  it('yields empty strings when the VITE_* contract variables are unset', async () => {
    vi.stubEnv('VITE_CONTRACT_ID', '')
    vi.stubEnv('VITE_TREASURY_ADDRESS', '')

    const config = await import('./config')

    expect(config.CONTRACT_ID).toBe('')
    expect(config.TREASURY_ADDRESS).toBe('')
  })
})
