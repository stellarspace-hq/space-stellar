import { useState, useEffect } from 'react'
import { useWalletKit } from '../contexts/WalletContext'
import axios from 'axios'
import SpaceStellarNFTClient from '../contracts/client'
import { CONTRACT_ID } from '../contracts/config'
import { getShipDefinition, getShipImage } from '../constants/ships'
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

  useEffect(() => {
    if (address) {
      loadCollection()
    }
  }, [address, refreshKey]) // PERBAIKAN: Add refreshKey dependency

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
            // Name/class/rarity/stats all resolve through the shared table.
            const definition = getShipDefinition(item.tier || item.rarity)

            return {
              tokenId: item.tokenId,
              name: definition.name,
              class: definition.className,
              rarity: definition.rarity,
              tier: definition.tier,
              attack: definition.stats.attack,
              speed: definition.stats.speed,
              shield: definition.stats.shield
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
        // Name/class/rarity/stats all resolve through the shared table.
        const definition = getShipDefinition(item.tier || item.rarity)

        return {
          tokenId: item.tokenId,
          name: definition.name,
          class: definition.className,
          rarity: definition.rarity,
          tier: definition.tier,
          attack: definition.stats.attack,
          speed: definition.stats.speed,
          shield: definition.stats.shield
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
            className={`ship-card card ${selectedShip?.tokenId === ship.tokenId ? 'selected' : ''}`}
            onClick={() => setSelectedShip(ship)}
          >
            {/* PERBAIKAN: Selalu gunakan rarity untuk gambar, jangan gunakan ship.image dari contract */}
            <div className="ship-image">
              <img 
                src={getShipImage(ship.rarity)}
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
            </div>
            <button
              className="btn"
              onClick={() => {
                // PERBAIKAN: Langsung equip tanpa pop-up
                // PERBAIKAN: Gunakan tier jika ada (untuk Elite Fighter, tier='Elite' bukan rarity='Common')
                if (address && selectedShip) {
                  // PERBAIKAN: Prioritaskan tier untuk equip (Elite, Epic, Legendary, Master, Ultra)
                  const shipToEquip = selectedShip.tier || selectedShip.rarity
                  localStorage.setItem(`equipped_ship_${address}`, shipToEquip)
                  console.log(`✅ ${selectedShip.name} equipped successfully (tier: ${selectedShip.tier}, rarity: ${selectedShip.rarity}, saved: ${shipToEquip})`)
                  setSelectedShip(null) // Close modal after equip
                  // Tidak ada alert/pop-up, langsung equip
                }
              }}
            >
              EQUIP SHIP
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Collection


