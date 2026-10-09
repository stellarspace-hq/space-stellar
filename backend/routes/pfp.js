import express from 'express'
import crypto from 'crypto'
import FormData from 'form-data'
import axios from 'axios'
import { PFPContractClient } from '../utils/pfpContract.js'

const router = express.Router()

// Pinata API credentials (from environment variables)
const PINATA_API_KEY = process.env.PINATA_API_KEY || ''
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY || ''
const PINATA_JWT = process.env.PINATA_JWT || ''
// Explicit opt-in for a simulated mint; never enabled by default so a deployment
// cannot report a fabricated token ID as a real on-chain mint.
const PFP_MOCK = process.env.PFP_MOCK === 'true'

// Server-authoritative PFP gacha.
//
// The weighted draw lives here (40/25/15/10/7/3) so a client cannot edit the
// weights or substitute a rarer variant before the transaction is signed. The
// assigned variant is signed with an HMAC that /upload-metadata and /mint
// verify, so a client that submits a different variant than the one assigned
// is rejected.
const PFP_GACHA_SECRET =
  process.env.PFP_GACHA_SECRET || process.env.JWT_SECRET || 'space-stellar-pfp-gacha'

const PFP_VARIANTS = [
  { id: 1, name: 'Cosmic Warrior', rarity: 'Common', image: '/nft-images/pfp/pfp-1.png', weight: 40 },
  { id: 2, name: 'Stellar Explorer', rarity: 'Uncommon', image: '/nft-images/pfp/pfp-2.png', weight: 25 },
  { id: 3, name: 'Nebula Guardian', rarity: 'Rare', image: '/nft-images/pfp/pfp-3.png', weight: 15 },
  { id: 4, name: 'Galaxy Commander', rarity: 'Epic', image: '/nft-images/pfp/pfp-4.png', weight: 10 },
  { id: 5, name: 'Void Master', rarity: 'Legendary', image: '/nft-images/pfp/pfp-5.png', weight: 7 },
  { id: 6, name: 'Cosmic Legend', rarity: 'Mythic', image: '/nft-images/pfp/pfp-6.png', weight: 3 }
]

function rollPfpVariant() {
  const totalWeight = PFP_VARIANTS.reduce((sum, variant) => sum + variant.weight, 0)
  const random = (crypto.randomBytes(4).readUInt32BE(0) / 0xffffffff) * totalWeight
  let remaining = random
  for (const variant of PFP_VARIANTS) {
    remaining -= variant.weight
    if (remaining <= 0) return variant
  }
  return PFP_VARIANTS[0]
}

function signAssignment(variantId, address) {
  const payload = `${variantId}:${(address || '').toLowerCase()}`
  return crypto.createHmac('sha256', PFP_GACHA_SECRET).update(payload).digest('hex')
}

function verifyAssignment(variantId, address, token) {
  if (!token || typeof token !== 'string') return false
  const expected = Buffer.from(signAssignment(variantId, address), 'utf8')
  const provided = Buffer.from(token, 'utf8')
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided)
}

function resolveAssignedVariant(address, pfpId, gachaToken) {
  const variant = PFP_VARIANTS.find(item => item.id === Number(pfpId))
  if (!variant || !verifyAssignment(variant.id, address, gachaToken)) return null
  return variant
}

/**
 * Roll a PFP variant server-side and return the signed assignment.
 * POST /api/pfp/roll
 */
router.post('/roll', (req, res) => {
  const { address } = req.body || {}
  const variant = rollPfpVariant()
  const token = signAssignment(variant.id, address)
  res.json({ success: true, variant, token })
})

/**
 * Upload PFP NFT metadata to Pinata IPFS
 * POST /api/pfp/upload-metadata
 */
router.post('/upload-metadata', async (req, res) => {
  try {
    const { address, pfpName, pfpRarity, pfpImage, pfpId, gachaToken } = req.body

    if (!address || !pfpName || !pfpRarity || !pfpImage) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      })
    }

    // Only the server-assigned variant may be uploaded/minted.
    const assigned = resolveAssignedVariant(address, pfpId, gachaToken)
    if (!assigned) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or missing gacha assignment. Roll again before minting.'
      })
    }
    if (pfpName !== assigned.name || pfpRarity !== assigned.rarity || pfpImage !== assigned.image) {
      return res.status(400).json({
        success: false,
        error: 'Submitted PFP does not match the assigned variant.'
      })
    }

    // Create metadata JSON
    const metadata = {
      name: pfpName,
      description: `Space Stellar Profile Picture - ${pfpRarity} rarity`,
      image: pfpImage,
      attributes: [
        {
          trait_type: 'Rarity',
          value: pfpRarity
        },
        {
          trait_type: 'Type',
          value: 'Profile Picture'
        },
        {
          trait_type: 'Collection',
          value: 'Space Stellar PFP'
        },
        {
          trait_type: 'ID',
          value: pfpId.toString()
        }
      ],
      external_url: `https://spacestellar.com/pfp/${address}`,
      properties: {
        address: address,
        minted_at: new Date().toISOString()
      }
    }

    // Upload to Pinata using Pinata SDK or direct API
    let ipfsHash = ''
    let metadataUri = ''

    if (PINATA_JWT) {
      // Using Pinata JWT (recommended)
      try {
        const response = await axios.post(
          'https://api.pinata.cloud/pinning/pinJSONToIPFS',
          {
            pinataContent: metadata,
            pinataMetadata: {
              name: `pfp-${address}-${Date.now()}.json`
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${PINATA_JWT}`,
              'Content-Type': 'application/json'
            }
          }
        )

        ipfsHash = response.data.IpfsHash
        metadataUri = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`
      } catch (pinataError) {
        console.error('Pinata upload error:', pinataError.response?.data || pinataError.message)
        throw new Error('Failed to upload to Pinata')
      }
    } else if (PINATA_API_KEY && PINATA_SECRET_KEY) {
      // Fallback: Using API key and secret
      try {
        const formData = new FormData()
        formData.append('file', JSON.stringify(metadata), {
          filename: `pfp-${address}-${Date.now()}.json`,
          contentType: 'application/json'
        })

        const response = await axios.post(
          'https://api.pinata.cloud/pinning/pinFileToIPFS',
          formData,
          {
            headers: {
              ...formData.getHeaders(),
              'pinata_api_key': PINATA_API_KEY,
              'pinata_secret_api_key': PINATA_SECRET_KEY
            }
          }
        )

        ipfsHash = response.data.IpfsHash
        metadataUri = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`
      } catch (pinataError) {
        console.error('Pinata upload error:', pinataError.response?.data || pinataError.message)
        throw new Error('Failed to upload to Pinata')
      }
    } else {
      // No Pinata credentials - return mock data for development
      console.warn('⚠️ Pinata credentials not configured, using mock IPFS hash')
      ipfsHash = `mock-${Date.now()}`
      metadataUri = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`
    }

    res.json({
      success: true,
      ipfsHash,
      metadataUri,
      metadata
    })
  } catch (error) {
    console.error('Error uploading PFP metadata:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload metadata'
    })
  }
})

/**
 * Mint PFP NFT on-chain
 * POST /api/pfp/mint
 */
router.post('/mint', async (req, res) => {
  try {
    const { address, ipfsHash, metadataUri, pfpName, pfpRarity, pfpImage, pfpId, gachaToken } = req.body

    if (!address || !ipfsHash || !metadataUri) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      })
    }

    // Only the server-assigned variant may be minted.
    const assigned = resolveAssignedVariant(address, pfpId, gachaToken)
    if (!assigned) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or missing gacha assignment. Roll again before minting.'
      })
    }

    // Get PFP contract ID and owner secret from environment
    const PFP_CONTRACT_ID = process.env.PFP_CONTRACT_ID || ''
    const PFP_CONTRACT_OWNER_SECRET = process.env.PFP_CONTRACT_OWNER_SECRET || ''
    const STELLAR_NETWORK = process.env.STELLAR_NETWORK || 'testnet'
    const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL || (STELLAR_NETWORK === 'mainnet' 
      ? 'https://soroban-rpc.mainnet.stellar.org'
      : 'https://soroban-rpc.testnet.stellar.org')
    
    if (!PFP_CONTRACT_ID) {
      if (PFP_MOCK) {
        console.warn('⚠️ PFP_CONTRACT_ID not configured; PFP_MOCK=true, simulating mint')
        return res.json({
          success: true,
          mock: true,
          configured: false,
          message: 'PFP NFT mint simulated (PFP_MOCK=true; contract not deployed). No on-chain token exists.',
          ipfsHash,
          metadataUri,
          contractId: null
        })
      }
      console.error('❌ PFP_CONTRACT_ID not configured; refusing to fabricate a token ID')
      return res.status(503).json({
        success: false,
        configured: false,
        code: 'PFP_NOT_CONFIGURED',
        error: 'PFP minting is not configured on this deployment (PFP_CONTRACT_ID is missing).'
      })
    }

    if (!PFP_CONTRACT_OWNER_SECRET) {
      if (PFP_MOCK) {
        console.warn('⚠️ PFP_CONTRACT_OWNER_SECRET not configured; PFP_MOCK=true, simulating mint')
        return res.json({
          success: true,
          mock: true,
          configured: true,
          message: 'PFP NFT mint simulated (PFP_MOCK=true; owner secret not configured). No on-chain token exists.',
          ipfsHash,
          metadataUri,
          contractId: PFP_CONTRACT_ID
        })
      }
      console.error('❌ PFP_CONTRACT_OWNER_SECRET not configured; refusing to fabricate a token ID')
      return res.status(503).json({
        success: false,
        configured: false,
        code: 'PFP_NOT_CONFIGURED',
        error: 'PFP minting is not configured on this deployment (PFP_CONTRACT_OWNER_SECRET is missing).'
      })
    }

    // Mint NFT on-chain using contract
    // Since contract is now public mint, we need user to sign transaction
    // For now, we'll use a service account approach or return XDR for frontend to sign
    try {
      // Validate address format
      if (!address || typeof address !== 'string' || !address.startsWith('G') || address.length !== 56) {
        return res.status(400).json({
          success: false,
          error: `Invalid address format: ${address}`
        })
      }
      
      // For public mint, frontend should build and sign transaction
      // Backend can optionally submit if frontend sends signed XDR
      // For now, we'll use service account as fallback
      const SERVICE_ACCOUNT_SECRET = process.env.PFP_SERVICE_ACCOUNT_SECRET || process.env.PFP_CONTRACT_OWNER_SECRET || ''
      
      // Check if frontend sent signed XDR
      const { signedXdr } = req.body
      
      if (signedXdr) {
        // Frontend signed transaction, just submit it
        const contractClient = new PFPContractClient(
          PFP_CONTRACT_ID,
          STELLAR_NETWORK,
          SOROBAN_RPC_URL
        )
        
        // Submit signed transaction
        const mintResult = await contractClient.submitTransaction(signedXdr)
        
        console.log('✅ PFP NFT minted successfully (frontend signed):', mintResult)
        
        return res.json({
          success: true,
          tokenId: mintResult.tokenId,
          txHash: mintResult.txHash,
          message: 'PFP NFT minted successfully on-chain',
          ipfsHash,
          metadataUri,
          contractId: PFP_CONTRACT_ID
        })
      }
      
      // Fallback: Use service account (if configured)
      if (!SERVICE_ACCOUNT_SECRET) {
        return res.status(500).json({
          success: false,
          error: 'Service account not configured. Frontend should sign transaction.',
          note: 'Please implement frontend signing or set PFP_SERVICE_ACCOUNT_SECRET in backend/.env'
        })
      }
      
      console.log('Minting PFP NFT on-chain (service account):', {
        address,
        ipfsHash,
        metadataUri,
        pfpName,
        pfpRarity,
        contractId: PFP_CONTRACT_ID,
        network: STELLAR_NETWORK
      })

      const contractClient = new PFPContractClient(
        PFP_CONTRACT_ID,
        STELLAR_NETWORK,
        SOROBAN_RPC_URL
      )

      // Check if address already has PFP
      try {
        const hasPFP = await contractClient.hasPFP(address)
        if (hasPFP) {
          return res.status(400).json({
            success: false,
            error: 'Address already owns a PFP NFT'
          })
        }
      } catch (checkError) {
        console.error('Error checking PFP:', checkError)
        // Continue with mint even if check fails
      }

      // Mint NFT (using service account to sign)
      const mintResult = await contractClient.mint(SERVICE_ACCOUNT_SECRET, address)

      console.log('✅ PFP NFT minted successfully:', mintResult)

      res.json({
        success: true,
        tokenId: mintResult.tokenId,
        txHash: mintResult.txHash,
        message: 'PFP NFT minted successfully on-chain',
        ipfsHash,
        metadataUri,
        contractId: PFP_CONTRACT_ID
      })
    } catch (error) {
      console.error('❌ Error minting PFP NFT on-chain:', error)
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        address,
        contractId: PFP_CONTRACT_ID,
        hasOwnerSecret: !!PFP_CONTRACT_OWNER_SECRET
      })
      
      // Return error with more details
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to mint NFT on-chain',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        ipfsHash,
        metadataUri,
        contractId: PFP_CONTRACT_ID
      })
    }
  } catch (error) {
    console.error('Error minting PFP NFT:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to mint NFT'
    })
  }
})

export default router

