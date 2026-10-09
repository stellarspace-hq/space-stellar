import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWalletKit } from '../contexts/WalletContext'
import { PFPMintClient } from '../utils/pfpContract'
import './SpecialLaunchEvent.css'

interface PfpVariant {
  id: number
  name: string
  rarity: string
  image: string
}

// Display-only list of the six variants. The weighted draw (40/25/15/10/7/3)
// happens server-side in /api/pfp/roll, so a client cannot pick its own result;
// the server also signs the assignment, which the mint verifies.
const PFP_VARIANTS: PfpVariant[] = [
  { id: 1, name: 'Cosmic Warrior', rarity: 'Common', image: '/nft-images/pfp/pfp-1.png' },
  { id: 2, name: 'Stellar Explorer', rarity: 'Uncommon', image: '/nft-images/pfp/pfp-2.png' },
  { id: 3, name: 'Nebula Guardian', rarity: 'Rare', image: '/nft-images/pfp/pfp-3.png' },
  { id: 4, name: 'Galaxy Commander', rarity: 'Epic', image: '/nft-images/pfp/pfp-4.png' },
  { id: 5, name: 'Void Master', rarity: 'Legendary', image: '/nft-images/pfp/pfp-5.png' },
  { id: 6, name: 'Cosmic Legend', rarity: 'Mythic', image: '/nft-images/pfp/pfp-6.png' }
]

const SpecialLaunchEvent = () => {
  const navigate = useNavigate()
  const { address, isConnected, signTransaction, publicKey } = useWalletKit()
  const [hasPFP, setHasPFP] = useState(false)
  const [userPFP, setUserPFP] = useState<string | null>(null)
  const [isGaching, setIsGaching] = useState(false)
  const [gachaResult, setGachaResult] = useState<PfpVariant | null>(null)
  const [gachaToken, setGachaToken] = useState<string | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [isMinting, setIsMinting] = useState(false)
  const [mintStatus, setMintStatus] = useState<string>('')

  useEffect(() => {
    if (address) {
      checkUserPFP()
    }
  }, [address])

  const checkUserPFP = async () => {
    if (!address) return
    
    try {
      // Check blockchain first
      const pfpContractId = (import.meta.env.VITE_PFP_CONTRACT_ID || 'CCHNVW6KZGR4MZF5CK5DQLPBNHVSDBGH7ZEC34URZ677JKKEY7GJRIJO').trim()
      if (pfpContractId) {
        const { PFPMintClient } = await import('../utils/pfpContract')
        const pfpClient = new PFPMintClient(pfpContractId)
        const hasPFPOnChain = await pfpClient.hasPFP(address)
        
        if (hasPFPOnChain) {
          console.log('✅ User already has PFP on blockchain')
          setHasPFP(true)
          // Try to get from localStorage as fallback for image
          const pfpKey = `pfp_nft_${address}`
          const storedPFP = localStorage.getItem(pfpKey)
          if (storedPFP) {
            const pfpData = JSON.parse(storedPFP)
            setUserPFP(pfpData.image)
          }
          return
        }
      }
    } catch (error) {
      console.warn('⚠️ Error checking PFP on blockchain:', error)
      // Continue with localStorage check as fallback
    }
    
    // Fallback: Check localStorage
    const pfpKey = `pfp_nft_${address}`
    const storedPFP = localStorage.getItem(pfpKey)
    
    if (storedPFP) {
      const pfpData = JSON.parse(storedPFP)
      setHasPFP(true)
      setUserPFP(pfpData.image)
      // If already minted, don't show gacha result
      if (pfpData.minted) {
        setShowResult(false)
        setGachaResult(null)
      }
    } else {
      setHasPFP(false)
      setUserPFP(null)
    }
  }

  const handleMintNFT = async () => {
    if (!address || !gachaResult || !gachaToken || isMinting || !publicKey || !signTransaction) return

    setIsMinting(true)
    setMintStatus('Uploading metadata to Pinata...')

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'
      
      // Step 1: Upload metadata to Pinata
      setMintStatus('Uploading metadata to Pinata...')
      const pinataResponse = await fetch(`${apiUrl}/api/pfp/upload-metadata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: address,
          pfpName: gachaResult.name,
          pfpRarity: gachaResult.rarity,
          pfpImage: gachaResult.image,
          pfpId: gachaResult.id,
          gachaToken: gachaToken
        })
      })

      const pinataData = await pinataResponse.json()
      
      if (!pinataData.success) {
        throw new Error(pinataData.error || 'Failed to upload metadata')
      }

      // Step 2: Build and sign mint transaction (user signs)
      setMintStatus('Building transaction...')
      // Get contract ID from env with fallback to new deployed contract
      const pfpContractId = (import.meta.env.VITE_PFP_CONTRACT_ID || 'CCHNVW6KZGR4MZF5CK5DQLPBNHVSDBGH7ZEC34URZ677JKKEY7GJRIJO').trim()
      console.log('🔍 PFP Contract ID from env:', import.meta.env.VITE_PFP_CONTRACT_ID)
      console.log('🔍 PFP Contract ID (with fallback, trimmed):', pfpContractId)
      console.log('🔍 Contract ID length:', pfpContractId.length)
      console.log('🔍 Contract ID starts with C:', pfpContractId.startsWith('C'))
      
      if (!pfpContractId) {
        throw new Error('PFP Contract ID is empty. Please set VITE_PFP_CONTRACT_ID in Vercel environment variables.')
      }

      console.log('📝 Creating PFPMintClient with contract ID:', pfpContractId)
      let pfpClient
      try {
        pfpClient = new PFPMintClient(pfpContractId)
      } catch (error: any) {
        console.error('❌ Error creating PFPMintClient:', error)
        throw new Error(`Failed to initialize PFP contract client: ${error.message || error}. Contract ID: ${pfpContractId}`)
      }
      
      // Check if user already has PFP before minting
      console.log('🔍 Checking if user already has PFP...')
      try {
        const alreadyHasPFP = await pfpClient.hasPFP(address)
        console.log('🔍 hasPFP result:', alreadyHasPFP)
        if (alreadyHasPFP) {
          throw new Error('You already own a PFP NFT! Each address can only mint one PFP. Please use a different wallet address.')
        }
        console.log('✅ User does not have PFP, proceeding with mint...')
      } catch (checkError: any) {
        // If check fails, log but don't block - let contract handle it
        console.warn('⚠️ Could not verify PFP status:', checkError.message)
        console.log('⚠️ Proceeding with mint - contract will reject if already has PFP')
      }
      
      // Build transaction XDR
      const transactionXdr = await pfpClient.buildMintTransaction(address, publicKey)
      
      // User signs transaction (will show wallet popup)
      setMintStatus('Please approve transaction in your wallet...')
      const signedXdr = await signTransaction(transactionXdr)
      
      // Step 3: Submit signed transaction
      setMintStatus('Submitting transaction...')
      let mintResult
      try {
        mintResult = await pfpClient.submitTransaction(signedXdr)
      } catch (submitError: any) {
        // If transaction was sent but confirmation timed out, still proceed
        // The transaction might still be processing
        if (submitError.message && submitError.message.includes('timeout')) {
          console.warn('⚠️ Transaction confirmation timeout, but transaction was sent')
          // Try to extract hash from error or use a placeholder
          // For now, we'll throw the error and let user retry
          throw new Error('Transaction sent but confirmation timed out. Please check your wallet or try again in a few moments.')
        }
        throw submitError
      }
      
      const mintData = {
        success: true,
        tokenId: mintResult.tokenId || 0, // May be 0 if confirmation timed out
        txHash: mintResult.txHash,
        ipfsHash: pinataData.ipfsHash,
        metadataUri: pinataData.metadataUri
      }
      
      // If tokenId is 0, transaction is still processing (this is normal)
      if (mintResult.tokenId === 0) {
        console.log('ℹ️ Token ID is 0 - transaction is processing on-chain')
        console.log('   This is normal. Transaction will complete shortly.')
        setMintStatus('✅ Transaction sent! Processing on-chain...')
      }

      // Step 4: Save to localStorage
      const pfpKey = `pfp_nft_${address}`
      localStorage.setItem(pfpKey, JSON.stringify({
        id: gachaResult.id,
        name: gachaResult.name,
        rarity: gachaResult.rarity,
        image: gachaResult.image,
        tokenId: mintData.tokenId,
        txHash: mintData.txHash,
        ipfsHash: pinataData.ipfsHash,
        metadataUri: pinataData.metadataUri,
        minted: true,
        mintedAt: new Date().toISOString()
      }))

      // Update state
      setHasPFP(true)
      setUserPFP(gachaResult.image)
      setShowResult(false)
      setGachaResult(null)
      setGachaToken(null)
      
      if (mintData.tokenId === 0) {
        setMintStatus(`✅ Transaction sent! Processing on-chain...`)
        console.log('✅ Transaction hash:', mintData.txHash)
        console.log('   Transaction is processing. PFP will be available shortly.')
      } else {
        setMintStatus('✅ NFT minted successfully!')
        console.log('✅ Token ID:', mintData.tokenId)
      }

      console.log('✅ PFP NFT minted:', mintData)
    } catch (error: any) {
      console.error('❌ Error minting PFP NFT:', error)
      
      // Check if error is because user already has PFP
      const errorMessage = error.message || ''
      if (errorMessage.includes('already owns') || errorMessage.includes('already own') || errorMessage.includes('UnreachableCodeReached')) {
        setMintStatus('❌ You already own a PFP NFT! Each address can only mint one PFP.')
      } else if (errorMessage.includes('Failed to build transaction')) {
        setMintStatus('❌ Failed to build transaction. You may already own a PFP NFT, or there was a contract error.')
      } else {
        setMintStatus(`❌ Error: ${errorMessage || 'Failed to mint NFT'}`)
      }
    } finally {
      setIsMinting(false)
    }
  }

  const handleGacha = async () => {
    if (!address || hasPFP || isGaching) return

    setIsGaching(true)
    setShowResult(false)
    setGachaResult(null)
    setGachaToken(null)

    try {
      // The server performs the weighted roll and signs the assignment.
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'
      const response = await fetch(`${apiUrl}/api/pfp/roll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      })
      const data = await response.json()

      if (!data.success || !data.variant) {
        throw new Error(data.error || 'Failed to roll a PFP')
      }

      // Keep the gacha animation visible for the same duration as before.
      await new Promise(resolve => setTimeout(resolve, 3000))

      setGachaResult(data.variant)
      setGachaToken(data.token)
      setShowResult(true)
    } catch (error: any) {
      console.error('❌ Gacha roll failed:', error)
      setMintStatus(`❌ ${error.message || 'Failed to roll a PFP'}`)
    } finally {
      setIsGaching(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="special-launch-page">
        <div className="special-launch-container">
          <h1>SPECIAL LAUNCH EVENT</h1>
          <p>Please connect your wallet to participate.</p>
          <button onClick={() => navigate('/')} className="btn-back">
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="special-launch-page">
      <div className="special-launch-container">
        <div className="event-header">
          <button onClick={() => navigate('/events')} className="btn-back">
            ← Back
          </button>
          <h1>🎰 SPECIAL LAUNCH EVENT</h1>
        </div>

        <div className="gacha-section">
          {hasPFP && userPFP ? (
            <div className="pfp-owned">
              <h2>Your NFT Profile Picture</h2>
              <div className="pfp-display">
                <img src={userPFP} alt="Your PFP" className="pfp-image" />
                <p className="pfp-message">You already own an NFT PFP!</p>
                <p className="pfp-note">Your profile picture has been updated.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="gacha-info">
                <h2>Get Your Exclusive NFT Profile Picture!</h2>
                <p>Spin the gacha to get one of 6 unique NFT Profile Pictures.</p>
                <p className="gacha-note">⚠️ You can only mint once per account</p>
              </div>

              <div className="gacha-machine">
                {isGaching ? (
                  <div className="gacha-animation">
                    <div className="gacha-light-beam"></div>
                    <div className="gacha-spinner">
                      {PFP_VARIANTS.map((pfp, index) => (
                        <div key={index} className="spinner-item">
                          <img src={pfp.image} alt={pfp.name} />
                        </div>
                      ))}
                      {/* Duplicate for seamless loop */}
                      {PFP_VARIANTS.map((pfp, index) => (
                        <div key={`dup-${index}`} className="spinner-item">
                          <img src={pfp.image} alt={pfp.name} />
                        </div>
                      ))}
                    </div>
                    <div className="gacha-effects">
                      <div className="particle particle-1"></div>
                      <div className="particle particle-2"></div>
                      <div className="particle particle-3"></div>
                      <div className="particle particle-4"></div>
                      <div className="particle particle-5"></div>
                      <div className="particle particle-6"></div>
                      <div className="particle particle-7"></div>
                      <div className="particle particle-8"></div>
                    </div>
                  </div>
                ) : showResult && gachaResult ? (
                  <div className="gacha-result">
                    <div className="result-glow"></div>
                    <img src={gachaResult.image} alt={gachaResult.name} className="result-image" />
                    <h3 className="result-name">{gachaResult.name}</h3>
                    <p className="result-rarity">{gachaResult.rarity}</p>
                    <div className="result-particles">
                      <div className="particle particle-1"></div>
                      <div className="particle particle-2"></div>
                      <div className="particle particle-3"></div>
                      <div className="particle particle-4"></div>
                      <div className="particle particle-5"></div>
                    </div>
                    {mintStatus && (
                      <p className="mint-status">{mintStatus}</p>
                    )}
                    <button
                      className="mint-nft-btn"
                      onClick={handleMintNFT}
                      disabled={isMinting || hasPFP}
                    >
                      {isMinting ? 'MINTING...' : hasPFP ? 'ALREADY MINTED' : '🎨 MINT NFT'}
                    </button>
                  </div>
                ) : (
                  <div className="gacha-preview">
                    <div className="preview-grid">
                      {PFP_VARIANTS.map((pfp) => (
                        <div key={pfp.id} className="preview-item">
                          <img src={pfp.image} alt={pfp.name} />
                          <span className="preview-rarity">{pfp.rarity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                className="gacha-btn"
                onClick={handleGacha}
                disabled={isGaching || hasPFP}
              >
                {isGaching ? '🎰 SPINNING...' : hasPFP ? 'ALREADY MINTED' : '🎰 SPIN GACHA'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default SpecialLaunchEvent

