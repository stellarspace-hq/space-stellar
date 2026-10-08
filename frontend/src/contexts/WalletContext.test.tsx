import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const kit = vi.hoisted(() => ({
  getAddress: vi.fn(),
  setWallet: vi.fn(),
  disconnect: vi.fn(),
  openModal: vi.fn(),
  signTransaction: vi.fn(),
}))

vi.mock('@creit.tech/stellar-wallets-kit', () => ({
  StellarWalletsKit: class {
    setWallet = kit.setWallet
    getAddress = kit.getAddress
    disconnect = kit.disconnect
    openModal = kit.openModal
    signTransaction = kit.signTransaction
  },
  WalletNetwork: {
    TESTNET: 'Test SDF Network ; September 2015',
    PUBLIC: 'Public Global Stellar Network ; September 2015',
  },
  allowAllModules: () => [],
  XBULL_ID: 'xbull',
}))

import { WalletProvider, useWalletKit } from './WalletContext'

const ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV'
const OTHER_ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEGWF'

const Probe = () => {
  const { address, isConnected, connect, disconnect } = useWalletKit()

  return (
    <div>
      <span data-testid="address">{address ?? 'none'}</span>
      <span data-testid="status">{isConnected ? 'connected' : 'disconnected'}</span>
      <button
        onClick={() => {
          void connect()
        }}
      >
        connect-wallet
      </button>
      <button
        onClick={() => {
          void disconnect()
        }}
      >
        disconnect-wallet
      </button>
    </div>
  )
}

const renderProvider = () =>
  render(
    <WalletProvider>
      <Probe />
    </WalletProvider>,
  )

const status = () => screen.getByTestId('status').textContent

beforeEach(() => {
  localStorage.clear()
  kit.getAddress.mockReset()
  kit.setWallet.mockReset()
  kit.disconnect.mockReset()
  kit.openModal.mockReset()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('WalletContext reconnect path', () => {
  it('reconnects from stored keys on mount and exposes the restored address', async () => {
    localStorage.setItem('walletId', 'xbull')
    localStorage.setItem('wallet_address', ADDRESS)
    kit.getAddress.mockResolvedValue({ address: ADDRESS })

    renderProvider()

    await waitFor(() => expect(status()).toBe('connected'))

    expect(screen.getByTestId('address').textContent).toBe(ADDRESS)
    expect(kit.setWallet).toHaveBeenCalledWith('xbull')
    expect(kit.getAddress).toHaveBeenCalledTimes(1)
  })

  it('clears the stored values and stays disconnected when getAddress rejects', async () => {
    localStorage.setItem('walletId', 'xbull')
    localStorage.setItem('wallet_address', ADDRESS)
    kit.getAddress.mockRejectedValue(new Error('wallet unavailable'))

    renderProvider()

    await waitFor(() => expect(localStorage.getItem('walletId')).toBeNull())

    expect(localStorage.getItem('wallet_address')).toBeNull()
    expect(status()).toBe('disconnected')
    expect(screen.getByTestId('address').textContent).toBe('none')
  })

  it('treats a restored address that no longer matches as stale', async () => {
    localStorage.setItem('walletId', 'xbull')
    localStorage.setItem('wallet_address', ADDRESS)
    kit.getAddress.mockResolvedValue({ address: OTHER_ADDRESS })

    renderProvider()

    await waitFor(() => expect(localStorage.getItem('walletId')).toBeNull())

    expect(localStorage.getItem('wallet_address')).toBeNull()
    expect(status()).toBe('disconnected')
  })

  it('does not attempt a reconnect when nothing is stored', async () => {
    renderProvider()

    await waitFor(() => expect(status()).toBe('disconnected'))

    expect(kit.getAddress).not.toHaveBeenCalled()
  })

  it('writes exactly wallet_address and walletId on connect, and removes them on disconnect', async () => {
    kit.getAddress.mockResolvedValue({ address: ADDRESS })
    kit.openModal.mockImplementation(async (options: { onWalletSelected: (o: unknown) => Promise<void> }) => {
      await options.onWalletSelected({ id: 'xbull', name: 'xBull' })
    })

    renderProvider()

    fireEvent.click(screen.getByRole('button', { name: /connect-wallet/i }))

    await waitFor(() => expect(status()).toBe('connected'))

    expect(localStorage.getItem('wallet_address')).toBe(ADDRESS)
    expect(localStorage.getItem('walletId')).toBe('xbull')
    expect(localStorage.length).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: /disconnect-wallet/i }))

    await waitFor(() => expect(status()).toBe('disconnected'))

    expect(localStorage.getItem('wallet_address')).toBeNull()
    expect(localStorage.getItem('walletId')).toBeNull()
    expect(localStorage.length).toBe(0)
    expect(kit.disconnect).toHaveBeenCalledTimes(1)
  })
})
