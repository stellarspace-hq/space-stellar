/**
 * Utility to get owner address from existing NFT ship contract
 * This ensures PFP contract uses the same owner
 */

import { 
  Contract, 
  Networks,
  Keypair,
  TransactionBuilder,
  BASE_FEE,
  Account
} from '@stellar/stellar-sdk'
import { SorobanRpc } from '@stellar/stellar-sdk'
import { extractOwnerAddress } from './contractOwner.js'

/**
 * Get owner address from NFT ship contract
 * @param {string} contractId - NFT ship contract ID
 * @param {string} network - 'testnet' or 'mainnet'
 * @param {string} rpcUrl - Soroban RPC URL
 * @returns {Promise<string>} Owner address
 */
export async function getShipContractOwner(contractId, network = 'testnet', rpcUrl = null) {
  try {
    if (!contractId) {
      throw new Error('Contract ID is required')
    }

    // Set RPC URL
    if (!rpcUrl) {
      rpcUrl = network === 'mainnet'
        ? 'https://soroban-rpc.mainnet.stellar.org'
        : 'https://soroban-rpc.testnet.stellar.org'
    }

    const rpcServer = new SorobanRpc.Server(rpcUrl, {
      allowHttp: network === 'testnet' || rpcUrl.includes('localhost')
    })

    const contract = new Contract(contractId)

    // Call owner() function
    const contractCall = contract.call('owner')

    // Create dummy account for simulation
    const dummyKeypair = Keypair.random()
    const dummyAccount = new Account(dummyKeypair.publicKey(), '0')

    // Build transaction for simulation
    const transaction = new TransactionBuilder(dummyAccount, {
      fee: BASE_FEE,
      networkPassphrase: network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET
    })
      .addOperation(contractCall)
      .setTimeout(30)
      .build()

    // Simulate transaction (read-only)
    const simulateResult = await rpcServer.simulateTransaction(transaction)

    const ownerAddress = extractOwnerAddress(simulateResult)
    if (ownerAddress) {
      return ownerAddress
    }

    throw new Error('Failed to get owner address from contract')
  } catch (error) {
    console.error('Error getting contract owner:', error)
    throw error
  }
}

