import { 
  Keypair, 
  Networks, 
  TransactionBuilder, 
  Operation,
  Asset,
  BASE_FEE,
  Horizon,
  Memo,
  Account,
  xdr
} from '@stellar/stellar-sdk'
import { useWalletKit } from '../contexts/WalletContext'
import { normalizePaymentAmount } from './paymentAmount.js'

const NETWORK = (import.meta.env.VITE_STELLAR_NETWORK || 'testnet') as 'testnet' | 'mainnet'
const NETWORK_PASSPHRASE = NETWORK === 'mainnet'
  ? Networks.PUBLIC
  : Networks.TESTNET

const HORIZON_URL = NETWORK === 'mainnet'
  ? 'https://horizon.stellar.org'
  : 'https://horizon-testnet.stellar.org'

// Constants sesuai dokumentasi Stellar Payment
// Reference: https://developers.stellar.org/docs/build/apps/example-application-tutorial/payment
// Reference: https://github.com/stellar/basic-payment-app
const STANDARD_TIMEBOUNDS = 300; // 5 minutes (sesuai dokumentasi)
const MAX_FEE_PER_OPERATION = "100000"; // 100,000 stroops = 0.01 XLM (sesuai dokumentasi)

export const getServer = () => {
  // In SDK v11, Server is exported as Horizon.Server
  // Check if Horizon and Horizon.Server are available
  if (!Horizon) {
    console.error('Horizon namespace is not available from @stellar/stellar-sdk')
    throw new Error('Horizon is not exported from @stellar/stellar-sdk. Please check SDK version and installation.')
  }
  
  // Debug: Log Horizon structure
  console.log('Horizon namespace:', Horizon)
  console.log('Horizon.Server:', Horizon.Server)
  console.log('Horizon keys:', Object.keys(Horizon))
  
  if (!Horizon.Server) {
    console.error('Horizon.Server is not available. Horizon object:', Horizon)
    console.error('Horizon type:', typeof Horizon)
    console.error('Available Horizon properties:', Object.keys(Horizon))
    throw new Error(
      'Horizon.Server is not available. This may be a bundler or SDK version issue.\n\n' +
      'Please try:\n' +
      '1. Delete node_modules and package-lock.json\n' +
      '2. Run: npm install\n' +
      '3. Restart dev server\n' +
      '4. Hard refresh browser (Ctrl+Shift+R)'
    )
  }
  
  // Verify it's a constructor function
  if (typeof Horizon.Server !== 'function') {
    console.error('Horizon.Server is not a function. Type:', typeof Horizon.Server)
    console.error('Horizon.Server value:', Horizon.Server)
    throw new Error(`Horizon.Server is not a constructor. Got type: ${typeof Horizon.Server}`)
  }
  
  try {
    const server = new Horizon.Server(HORIZON_URL)
    console.log('✅ Horizon Server created successfully')
    return server
  } catch (error: any) {
    console.error('❌ Failed to create Horizon Server:', error)
    throw new Error(`Failed to create Horizon Server: ${error.message || error}`)
  }
}

export const getNetwork = () => {
  return NETWORK
}

// Helper to create and sign transaction
export const createTransaction = async (
  sourceAccount: string,
  operations: Operation[],
  signer: (xdr: string) => Promise<string>
): Promise<string> => {
  const server = getServer()
  const sourceAccountData = await server.loadAccount(sourceAccount)
  
  // Sesuai dokumentasi Stellar Payment: timeout 300 seconds (5 minutes)
  let builder = new TransactionBuilder(sourceAccountData, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
  
  // Add operations one by one to avoid spread operator type issues
  for (const op of operations) {
    builder = builder.addOperation(op as any)
  }
  
  const transaction = builder
    .setTimeout(STANDARD_TIMEBOUNDS) // ✅ 300 seconds (5 minutes, sesuai dokumentasi)
    .build()

  const xdr = transaction.toXDR()
  const signedXdr = await signer(xdr)
  
  return signedXdr
}

/**
 * Create payment transaction sesuai Stellar Basic Payment App
 * Reference: https://github.com/stellar/basic-payment-app/blob/main/src/lib/stellar/transactions.js
 * 
 * @param source - Source account public key
 * @param destination - Destination account public key
 * @param asset - Asset to send (default: 'native' for XLM)
 * @param amount - Amount to send (in XLM or asset units)
 * @param memo - Optional memo (text only)
 * @returns Object with transaction XDR and network passphrase
 */
export const createPaymentTransaction = async ({
  source,
  destination,
  asset = 'native',
  amount,
  memo,
}: {
  source: string
  destination: string
  asset?: string
  amount: string | number
  memo?: string
}): Promise<{ transaction: string; network_passphrase: string }> => {
  const server = getServer()
  
  // PERBAIKAN: Reload account untuk memastikan sequence number dan balance up-to-date
  // Ini penting untuk menghindari race condition atau stale account data
  console.log('📡 Reloading source account from Horizon...');
  const sourceAccount = await server.loadAccount(source)
  
  // Log account info untuk debugging
  const nativeBalance = sourceAccount.balances.find((b: any) => b.asset_type === 'native');
  const balance = parseFloat(nativeBalance?.balance || '0');
  console.log('✅ Account loaded');
  console.log('  Balance:', balance.toFixed(7), 'XLM');
  console.log('  Sequence:', sourceAccount.sequenceNumber());
  console.log('  Sub-entries:', sourceAccount.subentry_count || 0);
  
  // Build transaction sesuai dokumentasi Stellar Payment
  // PERBAIKAN: Gunakan BASE_FEE (100 stroops) bukan MAX_FEE_PER_OPERATION
  // BASE_FEE adalah fee minimum yang cukup untuk payment transaction
  // MAX_FEE_PER_OPERATION (100000 stroops) hanya untuk priority transaction
  let transaction = new TransactionBuilder(sourceAccount, {
    networkPassphrase: NETWORK_PASSPHRASE,
    fee: BASE_FEE, // ✅ 100 stroops (BASE_FEE - sesuai dokumentasi Stellar Payment)
  })

  // Parse asset
  let sendAsset: Asset
  if (asset && asset !== 'native') {
    const [assetCode, assetIssuer] = asset.split(':')
    sendAsset = new Asset(assetCode, assetIssuer)
  } else {
    sendAsset = Asset.native()
  }

  // Pass the decimal amount straight through. Operation.payment expects a
  // decimal string and scales it to stroops itself, so pre-scaling here (the
  // old `Math.floor(amount * 10000000)`) multiplied the payment by 10,000,000.
  // Only convert to stroops where a raw API genuinely requires an integer
  // (Operation.payment does not).
  const amountString = normalizePaymentAmount(asset, amount)

  // Add memo if provided
  if (memo) {
    if (typeof memo === 'string') {
      transaction.addMemo(Memo.text(memo))
    } else if (typeof memo === 'object' && memo !== null) {
      // Handle Buffer or Uint8Array
      let hexString: string
      const memoObj = memo as any
      if (Buffer.isBuffer(memoObj)) {
        hexString = memoObj.toString('hex')
      } else if (memoObj instanceof Uint8Array) {
        hexString = Buffer.from(memoObj).toString('hex')
      } else {
        hexString = String(memoObj)
      }
      transaction.addMemo(Memo.hash(hexString))
    }
  }

  // Add payment operation
  transaction.addOperation(
    Operation.payment({
      destination: destination,
      amount: amountString,
      asset: sendAsset,
    })
  )

  // Build transaction dengan timeout sesuai dokumentasi
  const builtTransaction = transaction.setTimeout(STANDARD_TIMEBOUNDS).build()
  
  return {
    transaction: builtTransaction.toXDR(),
    network_passphrase: NETWORK_PASSPHRASE,
  }
}

// Helper to submit transaction
export const submitTransaction = async (signedXdr: string, networkPassphrase?: string) => {
  const server = getServer()
  const passphrase = networkPassphrase || NETWORK_PASSPHRASE
  
  try {
    // Parse transaction from XDR
    const transaction = TransactionBuilder.fromXDR(signedXdr, passphrase)
    
    // Submit transaction to Horizon
    const result = await server.submitTransaction(transaction)
    return result
  } catch (error: any) {
    console.error('❌ Transaction submission error:', error)
    
    // Extract detailed error information from Horizon response
    if (error.response?.data) {
      const horizonError = error.response.data
      console.error('📋 Horizon error response:', JSON.stringify(horizonError, null, 2))
      
      // Extract error details
      const errorDetail = horizonError.detail || horizonError.error || horizonError.message || 'Unknown error'
      const resultCodes = horizonError.extras?.result_codes
      const operationResults = resultCodes?.operations || []
      const transactionResult = resultCodes?.transaction || 'unknown'
      
      console.error('🔍 Error analysis:', {
        detail: errorDetail,
        transactionResult,
        operationResults,
        status: error.response.status,
        statusText: error.response.statusText
      })
      
      // Create a more informative error message
      let errorMessage = `Transaction failed: ${errorDetail}`
      if (transactionResult && transactionResult !== 'tx_success') {
        errorMessage += `\nTransaction result: ${transactionResult}`
      }
      if (operationResults && operationResults.length > 0) {
        errorMessage += `\nOperation results: ${operationResults.join(', ')}`
      }
      
      const enhancedError = new Error(errorMessage)
      ;(enhancedError as any).response = error.response
      ;(enhancedError as any).horizonError = horizonError
      throw enhancedError
    }
    
    // If no response data, throw original error
    throw error
  }
}

// Format Stellar address for display
export const formatAddress = (address: string, start: number = 6, end: number = 4) => {
  if (!address) return ''
  return `${address.slice(0, start)}...${address.slice(-end)}`
}

// Export constants
export { STANDARD_TIMEBOUNDS, MAX_FEE_PER_OPERATION, NETWORK_PASSPHRASE, HORIZON_URL }
