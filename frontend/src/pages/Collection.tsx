import { useState, useEffect } from 'react'
import { useWalletKit } from '../contexts/WalletContext'
import axios from 'axios'
import SpaceStellarNFTClient from '../contracts/client'
import { CONTRACT_ID } from '../contracts/config'
import { readEquippedTokenId, writeEquippedTokenId } from '../utils/equippedShip'
import './Collection.css'

interface Ship {
  tokenId: number
  name: string
  class: string
  rarity: string
  tier?: string // PERBAIKAN: Tambahkan tier untuk equip
  attack: number
  speed: number
  shield: number
  ipfsCid?: string
  image?: string
}

const Collection = () => {
  const { address } = useWalletKit()
  const [ships, setShips] = useState<Ship[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedShip, setSelectedShip] = useState<Ship | null>(null)
  const [refreshKey, setRefreshKey] = useState(0) // PERBAIKAN: Force refresh key
  // Equipped ship is identified by NFT token id (single source of truth).
  const [equippedTokenId, setEquippedTokenId] = useState<number | null>(null)

  useEffect(() => {
    if (address) {
      loadCollection()
    }
  }, [address, refreshKey]) // PERBAIKAN: Add refreshKey dependency

  // Load the equipped ship token id (shared with Home.tsx)
  useEffect(() => {
    setEquippedTokenId(readEquippedTokenId(address))
  }, [address, refreshKey])

  // PERBAIKAN: Refresh collection when window gains focus (after minting from Store)
  useEffect(() => {
    const handleFocus = () => {
      if (address) {
        console.log('🔄 Window focused, refreshing collection...')
        setRefreshKey(prev => prev + 1) // Trigger refresh
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [address])

  // PERBAIKAN: Expose refresh function globally for manual refresh
  useEffect(() => {
    (window as any).refreshCollection = () => {
      console.log('🔄 Manual collection refresh triggered')
      setRefreshKey(prev => prev + 1)
    }
    return () => {
      delete (window as any).refreshCollection
    }
  }, [])

  // Auto-refresh collection when navigating to this page
  // This helps show newly minted NFTs immediately
  useEffect(() => {
    if (!address) return
    
    const handleFocus = () => {
      console.log('🔄 Page focused, refreshing collection...')
      loadCollection()
    }
    
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('🔄 Page visible, refreshing collection...')
        loadCollection()
      }
    }
    
    // Refresh when page becomes visible
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  const loadCollection = async () => {
    if (!address) return

    setLoading(true)
    try {
      console.log('📦 Loading collection for address:', address)
      
      // Try to load from backend first
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'
        console.log('📡 Trying backend:', `${apiUrl}/api/ships/collection/${address}`)
        const response = await axios.get(
          `${apiUrl}/api/ships/collection/${address}`
        )
        console.log('📦 Backend response:', response.data)
        
        if (response.data && response.data.ships && response.data.ships.length > 0) {
          console.log(`✅ Loaded ${response.data.ships.length} ships from backend`)
          console.log('📦 Backend ships (raw):', response.data.ships)
          
          // PERBAIKAN: Process backend data dengan mapping yang SAMA seperti Home.tsx
          const processedShips: Ship[] = response.data.ships.map((item: any) => {
            // Map rarity to ship name, class, and stats
            const rarityToName: { [key: string]: string } = {
              'Common': 'Elite Fighter',
              'Epic': 'Epic Destroyer',
              'Legendary': 'Legendary Cruiser',
              'Master': 'Master Battleship',
              'Ultra': 'Ultra Command'
            }
            
            const rarityToClass: { [key: string]: string } = {
              'Common': 'Fighter', // Elite Fighter
              'Epic': 'Destroyer', // Epic Destroyer
              'Legendary': 'Cruiser', // Legendary Cruiser
              'Master': 'Battleship', // Master Battleship
              'Ultra': 'Command' // Ultra Command
            }
            
            const rarityToStats: { [key: string]: { attack: number; speed: number; shield: number } } = {
              'Common': { attack: 10, speed: 8, shield: 12 },
              'Epic': { attack: 20, speed: 6, shield: 18 },
              'Legendary': { attack: 30, speed: 15, shield: 25 },
              'Master': { attack: 40, speed: 12, shield: 35 },
              'Ultra': { attack: 50, speed: 18, shield: 45 }
            }
            
            // PERBAIKAN: Gunakan logic yang SAMA dengan Home.tsx dan blockchain processing
            // Step 1: Tentukan tier (prioritaskan tier dari backend, fallback ke rarity)
            const tier = item.tier || item.rarity || 'Classic'
            
            // Step 2: Map tier ke rarity untuk display (sama seperti Home.tsx)
            let displayRarity: string
            if (tier === 'Elite') {
              displayRarity = 'Common' // Elite Fighter menggunakan Common rarity
            } else if (tier && ['Epic', 'Legendary', 'Master', 'Ultra'].includes(tier)) {
              displayRarity = tier // Epic, Legendary, Master, Ultra sama dengan tier
            } else {
              displayRarity = tier || 'Common' // Fallback
            }
            
            // Step 3: Tentukan class berdasarkan displayRarity
            const finalClass = rarityToClass[displayRarity] || item.class || 'Fighter'
            
            // Step 4: Final tier untuk equip (gunakan tier yang sudah ditentukan)
            const finalTier = tier
            
            const stats = rarityToStats[displayRarity] || rarityToStats['Common']
            
            // Determine ship name berdasarkan displayRarity
            let shipName = rarityToName[displayRarity] || item.name || `Ship #${item.tokenId}`
            
            // Double check untuk Elite Fighter (sama seperti Home.tsx)
            if (tier === 'Elite' || displayRarity === 'Common') {
              shipName = 'Elite Fighter'
            }
            
            console.log(`📦 Processing Backend Ship ${item.tokenId}:`)
            console.log(`   📥 Backend data: tier="${item.tier}", rarity="${item.rarity}", class="${item.class}"`)
            console.log(`   🔄 Calculated: tier="${tier}", displayRarity="${displayRarity}"`)
            console.log(`   ✅ Final: tier="${finalTier}", rarity="${displayRarity}", class="${finalClass}", name="${shipName}"`)
            
            return {
              tokenId: item.tokenId,
              name: shipName,
              class: finalClass,
              rarity: displayRarity,
              tier: finalTier,
              attack: stats.attack,
              speed: stats.speed,
              shield: stats.shield
            }
          })
          
          console.log('✅ Processed backend ships:', processedShips)
          setShips(processedShips)
          setLoading(false)
          return
        } else {
          console.warn('⚠️ Backend returned empty collection, trying blockchain...')
        }
      } catch (backendError: any) {
        console.warn('⚠️ Backend error:', backendError.message || backendError)
        console.warn('   Loading from blockchain instead...')
      }
      
      // Fallback: Load directly from blockchain contract
      console.log('📡 Loading collection from blockchain contract...')
      console.log('   Contract ID:', CONTRACT_ID)
      const contractClient = new SpaceStellarNFTClient(CONTRACT_ID)
      const collection = await contractClient.getCollection(address)
      
      console.log('✅ Collection loaded from blockchain:', collection)
      console.log('   Number of NFTs:', collection.length)
      
      // PERBAIKAN: Log raw collection data untuk debugging
      console.log('📋 Raw collection from contract:', collection)
      console.log('📋 DETAILED CONTRACT DATA:')
      collection.forEach((item: any) => {
        console.log(`   Token ${item.tokenId}:`)
        console.log(`      tier="${item.tier}" (type: ${typeof item.tier})`)
        console.log(`      rarity="${item.rarity}" (type: ${typeof item.rarity})`)
        console.log(`      class="${item.class}" (type: ${typeof item.class})`)
      })
      
      // Convert to Ship format
      const shipsData: Ship[] = collection.map((item) => {
        // Map rarity to ship name, class, and stats
        const rarityToName: { [key: string]: string } = {
          'Common': 'Elite Fighter',
          'Epic': 'Epic Destroyer',
          'Legendary': 'Legendary Cruiser',
          'Master': 'Master Battleship',
          'Ultra': 'Ultra Command'
        }
        
        const rarityToClass: { [key: string]: string } = {
          'Common': 'Fighter', // Elite Fighter
          'Epic': 'Destroyer', // Epic Destroyer
          'Legendary': 'Cruiser', // Legendary Cruiser
          'Master': 'Battleship', // Master Battleship
          'Ultra': 'Command' // Ultra Command
        }
        
        const rarityToStats: { [key: string]: { attack: number; speed: number; shield: number } } = {
          'Common': { attack: 10, speed: 8, shield: 12 },
          'Epic': { attack: 20, speed: 6, shield: 18 },
          'Legendary': { attack: 30, speed: 15, shield: 25 },
          'Master': { attack: 40, speed: 12, shield: 35 },
          'Ultra': { attack: 50, speed: 18, shield: 45 }
        }
        
        // PERBAIKAN: Gunakan logic yang SAMA dengan Home.tsx untuk sinkronisasi
        // Home.tsx: const tier = item.tier || rarity
        // Home.tsx: if (tier === 'Elite') mappedRarity = 'Common'
        // Home.tsx: else if (tier in ['Epic', 'Legendary', 'Master', 'Ultra']) mappedRarity = tier
        
        // Step 1: Tentukan tier (prioritaskan tier dari contract, fallback ke rarity)
        const tier = item.tier || item.rarity || 'Classic'
        
        // Step 2: Map tier ke rarity untuk display (sama seperti Home.tsx)
        let displayRarity: string
        if (tier === 'Elite') {
          displayRarity = 'Common' // Elite Fighter menggunakan Common rarity
        } else if (tier && ['Epic', 'Legendary', 'Master', 'Ultra'].includes(tier)) {
          displayRarity = tier // Epic, Legendary, Master, Ultra sama dengan tier
        } else {
          displayRarity = tier || 'Common' // Fallback
        }
        
        // Step 3: Tentukan class berdasarkan displayRarity
        const finalClass = rarityToClass[displayRarity] || item.class || 'Fighter'
        
        // Step 4: Final tier untuk equip (gunakan tier yang sudah ditentukan)
        const finalTier = tier
        
        const stats = rarityToStats[displayRarity] || rarityToStats['Common']
        
        // Determine ship name berdasarkan displayRarity
        let shipName = rarityToName[displayRarity] || `Ship #${item.tokenId}`
        
        // Double check untuk Elite Fighter (sama seperti Home.tsx)
        if (tier === 'Elite' || displayRarity === 'Common') {
          shipName = 'Elite Fighter'
        }
        
        console.log(`📦 Processing Ship ${item.tokenId}:`)
        console.log(`   📥 Contract data:`)
        console.log(`      tier="${item.tier}" (${item.tier ? 'exists' : 'null/undefined'})`)
        console.log(`      rarity="${item.rarity}" (${item.rarity ? 'exists' : 'null/undefined'})`)
        console.log(`      class="${item.class}" (${item.class ? 'exists' : 'null/undefined'})`)
        console.log(`   🔄 Calculated:`)
        console.log(`      tier="${tier}" (from: ${item.tier ? 'item.tier' : item.rarity ? 'item.rarity' : 'default'})`)
        console.log(`      displayRarity="${displayRarity}"`)
        console.log(`   ✅ Final mapping:`)
        console.log(`      tier="${finalTier}"`)
        console.log(`      rarity="${displayRarity}"`)
        console.log(`      class="${finalClass}"`)
        console.log(`      name="${shipName}"`)
        console.log(`      stats: attack=${stats.attack}, speed=${stats.speed}, shield=${stats.shield}`)
        
        return {
          tokenId: item.tokenId,
          name: shipName,
          class: finalClass, // PERBAIKAN: Gunakan finalClass yang sudah di-map, bukan item.class
          rarity: displayRarity, // PERBAIKAN: Gunakan displayRarity, bukan item.rarity
          tier: finalTier, // PERBAIKAN: Simpan tier yang benar untuk equip
          attack: stats.attack,
          speed: stats.speed,
          shield: stats.shield
          // PERBAIKAN: Jangan set image dari contract, biarkan getShipImagePath() yang menentukan berdasarkan rarity
        }
      })
      
      console.log('✅ Converted collection to ships:', shipsData)
      console.log(`📊 Total ships in collection: ${shipsData.length}`)
      shipsData.forEach((ship) => {
        console.log(`   - ${ship.name} (Token ${ship.tokenId}): tier=${ship.tier}, rarity=${ship.rarity}`)
      })
      setShips(shipsData)
    } catch (error) {
      console.error('Error loading collection:', error)
      // Show empty state if both backend and blockchain fail
      setShips([])
    } finally {
      setLoading(false)
    }
  }

  // Equip state is keyed by NFT token id so Home.tsx and Collection.tsx always
  // agree, including for Elite ships (tier 'Elite', rarity 'Common').
  const isShipEquipped = (ship: Ship | null): boolean =>
    ship !== null &&
    equippedTokenId !== null &&
    Number(equippedTokenId) === Number(ship.tokenId)

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'Common': return '#00ffff' // Cyan for Elite
      case 'Epic': return '#ff00ff' // Magenta for Epic
      case 'Legendary': return '#ffaa00' // Orange/Gold for Legendary
      case 'Master': return '#ff6600' // Dark Orange for Master
      case 'Ultra': return '#ffd700' // Gold for Ultra
      default: return '#ffffff'
    }
  }

  const getShipImage = (rarity: string) => {
    // Map rarity to GIF file
    const imageMap: { [key: string]: string } = {
      'Common': '/nft-images/ships/ship-elite.gif',
      'Rare': '/nft-images/ships/ship-epic.gif',
      'Epic': '/nft-images/ships/ship-legendary.gif',
      'Legendary': '/nft-images/ships/ship-master.gif',
      'Mythic': '/nft-images/ships/ship-ultra.gif'
    };
    
    return imageMap[rarity] || '/nft-images/ships/ship-elite.gif';
  }

  const getShipImagePath = (rarity: string) => {
    const rarityMap: { [key: string]: string } = {
      'Common': '/nft-images/ships/ship-elite.gif',
      'Epic': '/nft-images/ships/ship-epic.gif',
      'Legendary': '/nft-images/ships/ship-legendary.gif',
      'Master': '/nft-images/ships/ship-master.gif',
      'Ultra': '/nft-images/ships/ship-ultra.gif'
    };
    return rarityMap[rarity] || '/nft-images/ships/ship-classic.gif';
  }

  if (!address) {
    return (
      <div className="collection">
        <div className="collection-empty">
          <h2>CONNECT WALLET</h2>
          <p>Please connect your Stellar wallet to view your collection</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="collection">
        <div className="loading-container">
          <p className="loading">LOADING COLLECTION...</p>
        </div>
      </div>
    )
  }

  if (ships.length === 0) {
    return (
      <div className="collection">
        <h1 className="page-title">MY COLLECTION</h1>
        <div className="collection-empty">
          <p>NO SHIPS YET</p>
          <p className="empty-hint">Visit the Store to mint your first ship!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="collection">
      <h1 className="page-title">MY COLLECTION</h1>
      <p className="page-subtitle">You own {ships.length} ship{ships.length !== 1 ? 's' : ''}</p>

      <div className="ships-grid">
        {ships.map((ship) => (
          <div
            key={ship.tokenId}
            className={`ship-card card ${selectedShip?.tokenId === ship.tokenId ? 'selected' : ''} ${isShipEquipped(ship) ? 'equipped' : ''}`}
            onClick={() => setSelectedShip(ship)}
          >
            {/* PERBAIKAN: Selalu gunakan rarity untuk gambar, jangan gunakan ship.image dari contract */}
            <div className="ship-image">
              <img 
                src={getShipImagePath(ship.rarity)}
                alt={ship.name}
                onError={(e) => {
                  // Fallback to emoji if image fails
                  e.currentTarget.style.display = 'none';
                  const parent = e.currentTarget.parentElement;
                  if (parent) {
                    parent.innerHTML = '🚀';
                  }
                }}
                style={{ width: '80px', height: '80px', objectFit: 'contain' }}
              />
            </div>
            <div className="ship-info">
              <h3 className="ship-name">{ship.name}</h3>
              {isShipEquipped(ship) && (
                <div
                  className="ship-equipped-badge"
                  style={{ color: '#00ff41', fontSize: '0.75em', fontWeight: 'bold', letterSpacing: '1px' }}
                >
                  ● EQUIPPED
                </div>
              )}
              <div
                className="ship-rarity"
                style={{ color: getRarityColor(ship.rarity) }}
              >
                {ship.rarity}
              </div>
              <div className="ship-stats">
                <div className="stat">
                  <span>⚔️</span>
                  <span>{ship.attack}</span>
                </div>
                <div className="stat">
                  <span>⚡</span>
                  <span>{ship.speed}</span>
                </div>
                <div className="stat">
                  <span>🛡️</span>
                  <span>{ship.shield}</span>
                </div>
              </div>
              <div className="ship-token-id">
                Token ID: #{ship.tokenId}
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedShip && (
        <div className="ship-detail-modal">
          <div className="modal-content card">
            <button
              className="modal-close"
              onClick={() => setSelectedShip(null)}
            >
              ✕
            </button>
            <h2>{selectedShip.name}</h2>
            <div className="detail-stats">
              <div className="detail-stat">
                <span>CLASS:</span>
                <span>{selectedShip.class}</span>
              </div>
              <div className="detail-stat">
                <span>RARITY:</span>
                <span style={{ color: getRarityColor(selectedShip.rarity) }}>
                  {selectedShip.rarity}
                </span>
              </div>
              <div className="detail-stat">
                <span>ATTACK:</span>
                <span>{selectedShip.attack}</span>
              </div>
              <div className="detail-stat">
                <span>SPEED:</span>
                <span>{selectedShip.speed}</span>
              </div>
              <div className="detail-stat">
                <span>SHIELD:</span>
                <span>{selectedShip.shield}</span>
              </div>
              <div className="detail-stat">
                <span>TOKEN ID:</span>
                <span>#{selectedShip.tokenId}</span>
              </div>
            </div>
            <button
              className="btn"
              disabled={isShipEquipped(selectedShip)}
              onClick={() => {
                // Equip is persisted by NFT token id (single source of truth),
                // matching Home.tsx so both views agree.
                if (address && selectedShip) {
                  writeEquippedTokenId(address, selectedShip.tokenId, selectedShip.tier || selectedShip.rarity)
                  setEquippedTokenId(Number(selectedShip.tokenId))
                  console.log(`✅ ${selectedShip.name} equipped successfully (tokenId: ${selectedShip.tokenId})`)
                  setSelectedShip(null) // Close modal after equip
                }
              }}
            >
              {isShipEquipped(selectedShip) ? '✓ EQUIPPED' : 'EQUIP SHIP'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Collection
