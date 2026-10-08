import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const freighter = vi.hoisted(() => ({
  isConnected: vi.fn(),
  getPublicKey: vi.fn(),
}))

vi.mock('@stellar/freighter-api', () => ({
  isConnected: freighter.isConnected,
  getPublicKey: freighter.getPublicKey,
}))

import { checkFreighterAvailable, waitForFreighter } from './freighterCheck'

const PUBLIC_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV'

beforeEach(() => {
  freighter.isConnected.mockReset()
  freighter.getPublicKey.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('checkFreighterAvailable', () => {
  it('reports available and connected with the public key for a connected wallet', async () => {
    freighter.isConnected.mockResolvedValue(true)
    freighter.getPublicKey.mockResolvedValue(PUBLIC_KEY)

    const result = await checkFreighterAvailable()

    expect(result.available).toBe(true)
    expect(result.connected).toBe(true)
    expect(result.publicKey).toBe(PUBLIC_KEY)
  })

  it('reports available but not connected when getPublicKey rejects', async () => {
    freighter.isConnected.mockResolvedValue(true)
    freighter.getPublicKey.mockRejectedValue(new Error('user rejected'))

    const result = await checkFreighterAvailable()

    expect(result.available).toBe(true)
    expect(result.connected).toBe(false)
    expect(result.publicKey).toBeNull()
  })

  it('reports unavailable when the extension is not installed', async () => {
    freighter.isConnected.mockRejectedValue(new Error('Freighter is not installed'))

    const result = await checkFreighterAvailable()

    expect(result.available).toBe(false)
    expect(result.connected).toBe(false)
    expect(result.publicKey).toBeNull()
  })

  it('reports available but not connected for an unrelated isConnected rejection', async () => {
    freighter.isConnected.mockRejectedValue(new Error('something else went wrong'))

    const result = await checkFreighterAvailable()

    expect(result.available).toBe(true)
    expect(result.connected).toBe(false)
  })

  it('reports available but not connected when isConnected resolves false', async () => {
    freighter.isConnected.mockResolvedValue(false)

    const result = await checkFreighterAvailable()

    expect(result.available).toBe(true)
    expect(result.connected).toBe(false)
    expect(freighter.getPublicKey).not.toHaveBeenCalled()
  })
})

describe('waitForFreighter', () => {
  it('polls with fake timers and returns false without ever reading the public key', async () => {
    vi.useFakeTimers()
    freighter.isConnected.mockRejectedValue(new Error('Freighter is not installed'))

    const pending = waitForFreighter(1200)
    await vi.advanceTimersByTimeAsync(2000)

    await expect(pending).resolves.toBe(false)
    expect(freighter.isConnected).toHaveBeenCalled()
    expect(freighter.getPublicKey).not.toHaveBeenCalled()
  })

  it('resolves true as soon as the wallet reports available', async () => {
    freighter.isConnected.mockResolvedValue(false)

    await expect(waitForFreighter(1000)).resolves.toBe(true)
  })
})
