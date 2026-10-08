import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Networks } from '@stellar/stellar-sdk'
import { 
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
  // Wallet IDs
  XBULL_ID,
} from '@creit.tech/stellar-wallets-kit'

interface WalletContextType {
  address: string | null
  publicKey: string | null
  connect: () => Promise<void>
  disconnect: () => void
  isConnected: boolean
  signTransaction: (transactionXdr: string) => Promise<string>
  network: 'testnet' | 'mainnet'
  connectionError: string | null
  clearConnectionError: () => void
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

const NETWORK = (import.meta.env.VITE_STELLAR_NETWORK || 'testnet') as 'testnet' | 'mainnet'
const NETWORK_PASSPHRASE = NETWORK === 'mainnet'
  ? Networks.PUBLIC
  : Networks.TESTNET

// Initialize Stellar Wallet Kit with ALL available wallets
// allowAllModules() automatically includes:
// - Albedo, Freighter, Hana, Ledger, Trezor, Lobstr, Rabet, xBull, HOT Wallet, Klever
// Note: WalletConnect requires additional configuration, so it's not included by allowAllModules()
// If you need WalletConnect, add WalletConnectModule manually with configuration
const walletKit = new StellarWalletsKit({
  network: NETWORK_PASSPHRASE as unknown as WalletNetwork,
  modules: allowAllModules(),
  // Default to xBull if available, otherwise first available wallet
  selectedWalletId: XBULL_ID,
})

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const [address, setAddress] = useState<string | null>(null)
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [isWalletConnected, setIsWalletConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  // Check if wallet is already connected on mount
  // Only check once, don't poll (prevents repeated pop-ups)
  useEffect(() => {
    checkConnection()
  }, [])

  const checkConnection = async () => {
    try {
      if (typeof window === 'undefined') return
      
      const savedAddress = localStorage.getItem('wallet_address')
      const savedWalletId = localStorage.getItem('walletId')
      
      if (savedAddress && savedWalletId) {
        try {
          walletKit.setWallet(savedWalletId)
          const addressResult = await walletKit.getAddress()
          if (addressResult.address === savedAddress) {
            setPublicKey(addressResult.address)
            setAddress(addressResult.address)
            setIsWalletConnected(true)
          } else {
            // Address changed, clear storage
            localStorage.removeItem('wallet_address')
            localStorage.removeItem('walletId')
          }
        } catch {
          // Wallet not available, clear storage
          localStorage.removeItem('wallet_address')
          localStorage.removeItem('walletId')
        }
      }
    } catch (error) {
      console.log('Wallet check:', error)
    }
  }

  const connect = async () => {
    setConnectionError(null)
    try {
      // Prevent multiple simultaneous connection attempts
      if (isWalletConnected) {
        console.log('Wallet already connected')
        return
      }
      
      // Open modal - it will close automatically after wallet selection
      await walletKit.openModal({
        modalTitle: 'Connect to your Stellar wallet',
        notAvailableText: 'Wallet tidak tersedia. Pastikan extension sudah terinstall.',
        onWalletSelected: async (option) => {
          console.log('🔌 Selected wallet:', option.name, 'ID:', option.id)
          
          try {
            // Set wallet first
            walletKit.setWallet(option.id)
            
            // Get address (modal closes automatically after selection)
            const addressResult = await walletKit.getAddress()
            if (addressResult.address) {
              setPublicKey(addressResult.address)
              setAddress(addressResult.address)
              setIsWalletConnected(true)
              localStorage.setItem('wallet_address', addressResult.address)
              localStorage.setItem('walletId', option.id)
              console.log('✅ Wallet connected:', {
                wallet: option.name,
                address: addressResult.address,
                id: option.id
              })
            }
          } catch (error: any) {
            console.error('Error getting address:', error)
            // Error will be handled in onClosed callback
          }
        },
        onClosed: (err) => {
          if (err) {
            console.log('Modal closed with error:', err.message)
            // Only show error alert if it's not a user cancellation
            const errorMsg = err.message || err.toString() || 'Unknown error'
            if (!errorMsg.includes('User rejected') && 
                !errorMsg.includes('rejected') && 
                !errorMsg.includes('denied') &&
                !errorMsg.includes('closed')) {
              // Keep the failure visible so the user can open the wallet guide.
              console.warn('Wallet connection error (non-critical):', errorMsg)
              setConnectionError(errorMsg)
            }
          } else {
            console.log('Modal closed by user (no error)')
          }
        },
      })
    } catch (error: any) {
      console.error('Error opening wallet modal:', error)
      const errorMsg = error.message || error.toString() || 'Unknown error'
      
      // Only show alert for critical errors
      if (!errorMsg.includes('User rejected') && 
          !errorMsg.includes('rejected') && 
          !errorMsg.includes('denied')) {
        setConnectionError(errorMsg)
      }
    }
  }

  const disconnect = async () => {
    try {
      await walletKit.disconnect()
    } catch (error) {
      console.error('Error disconnecting wallet:', error)
    }
    setAddress(null)
    setPublicKey(null)
    setIsWalletConnected(false)
    localStorage.removeItem('wallet_address')
    localStorage.removeItem('walletId')
    console.log('Wallet disconnected')
  }

  const signTx = async (transactionXdr: string): Promise<string> => {
    if (!publicKey) {
      throw new Error('Wallet not connected')
    }

    console.log('Stellar Wallet Kit signTransaction called with:', {
      xdrLength: transactionXdr.length,
      network: NETWORK_PASSPHRASE,
      account: publicKey
    })

    try {
      // Use Stellar Wallet Kit signTransaction (supports Soroban transactions)
      const result = await walletKit.signTransaction(transactionXdr, {
        address: publicKey,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
      
      if (!result || !result.signedTxXdr || result.signedTxXdr === '') {
        throw new Error('Wallet Kit returned empty signed transaction')
      }
      
      console.log('✅ Wallet Kit signed transaction successfully')
      return result.signedTxXdr
    } catch (error: any) {
      console.error('❌ Error signing transaction:', error)
      console.error('Error type:', typeof error)
      console.error('Error details:', error)
      
      // Provide more detailed error message
      const errorMessage = error?.message || error?.toString() || 'Unknown error'
      throw new Error(`Failed to sign transaction: ${errorMessage}`)
    }
  }

  return (
    <WalletContext.Provider
      value={{
        address,
        publicKey,
        connect,
        disconnect,
        isConnected: isWalletConnected,
        signTransaction: signTx,
        network: NETWORK,
        connectionError,
        clearConnectionError: () => setConnectionError(null),
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

export const useWalletKit = () => {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWalletKit must be used within WalletProvider')
  }
  return context
}

export const WalletKitButton = () => {
  const { connect, isConnected, address, disconnect, connectionError, clearConnectionError } = useWalletKit()
  const [isConnecting, setIsConnecting] = useState(false)
  
  const handleConnect = async () => {
    setIsConnecting(true)
    try {
      await connect()
    } catch (error) {
      console.error('Connect error:', error)
    } finally {
      setIsConnecting(false)
    }
  }
  
  if (isConnected && address) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ 
          color: '#00ff41', 
          fontSize: '9px',
          fontFamily: 'monospace'
        }}>
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
        <button onClick={disconnect} className="btn btn-small">
          DISCONNECT
        </button>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={handleConnect}
        className="btn"
        disabled={isConnecting}
      >
        {isConnecting ? 'CONNECTING...' : 'CONNECT WALLET'}
      </button>
      {connectionError && (
        <div role="alert" className="wallet-connect-error">
          <span>{connectionError}</span>
          {' '}
          <Link to="/wallet-guide" onClick={clearConnectionError}>Wallet help</Link>
        </div>
      )}
    </div>
  )
}
