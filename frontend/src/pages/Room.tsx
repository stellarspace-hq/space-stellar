import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useWalletKit } from '../contexts/WalletContext'
import axios from 'axios'
import './Room.css'

interface RoomData {
  roomCode: string
  mode: 'solo' | 'multiplayer'
  hostAddress: string
  guestAddress?: string
  hostShip: {
    rarity: string
    name: string
    class: string
    image?: string
  }
  guestShip?: {
    rarity: string
    name: string
    class: string
    image?: string
  }
  status: 'waiting' | 'playing' | 'finished'
  createdAt: string
  hostReady?: boolean
  guestReady?: boolean
}


const Room = () => {
  const { roomCode } = useParams<{ roomCode: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { address } = useWalletKit()
  const [roomData, setRoomData] = useState<RoomData | null>(null)
  const [loading, setLoading] = useState(true)
  const [gameStarted, setGameStarted] = useState(false)
  const [gameScore, setGameScore] = useState(0)
  const [isReady, setIsReady] = useState(false)
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)

  // Check if current user is host or guest
  const isHost = roomData && address === roomData.hostAddress
  const isGuest = roomData && address === roomData.guestAddress
  
  // Check mode: prioritize URL param (might be updating), then roomData mode
  // Use useMemo to ensure recalculation when dependencies change
  const urlMode = searchParams.get('mode')
  const roomMode = roomData?.mode
  
  // Prioritize URL param first (it's the source of truth when navigating)
  // If URL has mode='multiplayer', use it even if backend says 'solo' (might be stale)
  const isMultiplayer = useMemo(() => {
    const result = urlMode === 'multiplayer' || (roomMode === 'multiplayer' && !urlMode)
    
    // Debug logging for mode detection
    console.log('🎮 Multiplayer detection (recalculated):')
    console.log('  - URL mode:', urlMode)
    console.log('  - Room data mode:', roomMode)
    console.log('  - isMultiplayer result:', result)
    
    return result
  }, [urlMode, roomMode])

  useEffect(() => {
    if (roomCode) {
      // Always try to load room data (with or without address)
      loadRoomData()
    }

    // Cleanup polling on unmount
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval)
      }
    }
  }, [roomCode, address]) // Only depend on roomCode and address

  // Update isReady state berdasarkan roomData
  useEffect(() => {
    if (roomData && address) {
      if (isHost) {
        setIsReady(roomData.hostReady || false)
      } else if (isGuest) {
        setIsReady(roomData.guestReady || false)
      }
    }
  }, [roomData, address, isHost, isGuest])

  // Poll room data untuk multiplayer (update setiap 2 detik)
  useEffect(() => {
    if (isMultiplayer && roomCode && !gameStarted) {
      const interval = setInterval(() => {
        loadRoomData()
      }, 2000) // Poll setiap 2 detik
      
      setPollingInterval(interval)
      return () => {
        clearInterval(interval)
      }
    } else {
      if (pollingInterval) {
        clearInterval(pollingInterval)
        setPollingInterval(null)
      }
    }
  }, [isMultiplayer, roomCode, gameStarted])

  // Auto-start game jika kedua player ready (multiplayer)
  useEffect(() => {
    if (isMultiplayer && roomData && !gameStarted && address) {
      const hostReady = roomData.hostReady || false
      const guestReady = roomData.guestReady || false
      const hasGuest = !!roomData.guestAddress
      
      if (hasGuest && hostReady && guestReady) {
        console.log('✅ Both players ready, auto-starting game in 1 second...')
        const timer = setTimeout(() => {
          handleGameStart()
        }, 1000)
        
        return () => clearTimeout(timer)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData?.hostReady, roomData?.guestReady, roomData?.guestAddress, isMultiplayer, gameStarted, address])


  const loadRoomData = async () => {
    // First, check if we have room data in localStorage (from recent creation)
    const cachedRoomKey = `room_${roomCode}`
    const cachedRoom = localStorage.getItem(cachedRoomKey)
    
    // Skip cache for multiplayer rooms to always get fresh data
    // For solo rooms, we can use cache
    const skipCache = searchParams.get('mode') === 'multiplayer'
    
    if (cachedRoom && !skipCache) {
      try {
        const parsedRoom = JSON.parse(cachedRoom)
        // Remove _cachedAt before using
        const { _cachedAt, ...roomData } = parsedRoom
        
        // Check if cache is still valid (less than 1 hour old)
        const cacheAge = Date.now() - (_cachedAt || 0)
        if (cacheAge < 3600000) { // 1 hour
          console.log('✅ Using cached room data (age:', Math.round(cacheAge / 1000), 'seconds)')
          setRoomData(roomData as RoomData)
          setLoading(false)
          
          // Optionally try to sync with backend in background (non-blocking)
          if (address) {
            syncRoomWithBackend(roomCode, roomData as RoomData).catch(err => 
              console.warn('⚠️ Background sync failed (non-critical):', err)
            )
          }
          return
        } else {
          // Cache expired, remove it
          console.log('⚠️ Cache expired (age:', Math.round(cacheAge / 1000), 'seconds), removing')
          localStorage.removeItem(cachedRoomKey)
        }
      } catch (e) {
        // Invalid cache, remove it
        console.warn('⚠️ Invalid cache format, removing')
        localStorage.removeItem(cachedRoomKey)
      }
    } else if (skipCache && cachedRoom) {
      // Clear cache for multiplayer rooms
      console.log('🔄 Skipping cache for multiplayer room, loading from backend...')
      localStorage.removeItem(cachedRoomKey)
    }
    
    try {
      console.log('🔍 Loading room from backend:', roomCode)
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/rooms/${roomCode}`
      )
      
      if (response.data && response.data.success) {
        console.log('✅ Room loaded from backend:', response.data.room)
        const room = response.data.room
        
        // Debug: Log mode dari backend
        console.log('🔍 Room mode from backend:', room.mode)
        console.log('🔍 Room data:', {
          mode: room.mode,
          hostAddress: room.hostAddress,
          guestAddress: room.guestAddress,
          status: room.status
        })
        
        // Get ready status dari backend (bukan localStorage)
        const hostReady = room.hostReady || false
        const guestReady = room.guestReady || false
        
        // Priority: URL param > Backend mode > 'solo'
        // If URL has mode='multiplayer', use it even if backend says 'solo' (might be stale)
        const urlMode = searchParams.get('mode') as 'solo' | 'multiplayer' | null
        const backendMode = room.mode as 'solo' | 'multiplayer' | undefined
        
        // If URL has mode and it's different from backend, prioritize URL (might be updating)
        const finalMode = urlMode || backendMode || 'solo'
        
        console.log('🔍 Mode priority check:')
        console.log('  - URL mode:', urlMode)
        console.log('  - Backend mode:', backendMode)
        console.log('  - Final mode:', finalMode)
        console.log('  - Host ready:', hostReady)
        console.log('  - Guest ready:', guestReady)
        
        // PERBAIKAN: Pastikan ship image selalu ada, generate dari rarity jika tidak ada
        const ensureShipImage = (ship: any) => {
          if (!ship) return ship
          if (!ship.image && ship.rarity) {
            return {
              ...ship,
              image: getShipImage(ship.rarity)
            }
          }
          return ship
        }
        
        // PERBAIKAN: Untuk solo mode dan multiplayer (jika current user adalah host), pastikan hostShip menggunakan ship dari localStorage
        // Jika current user adalah guest, gunakan hostShip dari roomData (yang sudah di-sync dari backend saat host create room)
        let hostShip = ensureShipImage(room.hostShip)
        if (address && (finalMode === 'solo' || (finalMode === 'multiplayer' && address === room.hostAddress))) {
          // Current user adalah host, gunakan ship dari localStorage
          const equippedShip = localStorage.getItem(`equipped_ship_${address}`) || 'Classic'
          const shipImage = getShipImage(equippedShip)
          hostShip = {
            rarity: equippedShip,
            name: getShipNameFromRarity(equippedShip),
            class: 'Fighter',
            image: shipImage
          }
          console.log(`✅ ${finalMode === 'solo' ? 'Solo' : 'Multiplayer'} mode: Updated hostShip from localStorage:`, hostShip)
        } else if (finalMode === 'multiplayer' && address && address === room.guestAddress) {
          // Current user adalah guest, gunakan hostShip dari roomData (yang sudah benar dari backend)
          // PERBAIKAN: Jika hostShip dari backend adalah Classic (default dari GET room),
          // kita perlu mempertahankan hostShip yang sudah benar dari roomData sebelumnya
          if (room.hostShip && room.hostShip.rarity === 'Classic' && room.hostShip.name === 'Classic Fighter') {
            // Ini adalah default dari backend GET room, kita perlu mempertahankan hostShip yang sudah benar
            // Cek apakah ada hostShip yang sudah benar di roomData sebelumnya
            if (roomData && roomData.hostShip && 
                !(roomData.hostShip.rarity === 'Classic' && roomData.hostShip.name === 'Classic Fighter')) {
              // Ada hostShip yang sudah benar di roomData sebelumnya, gunakan itu
              hostShip = ensureShipImage(roomData.hostShip)
              console.log('✅ Multiplayer mode (guest): Keeping existing hostShip from previous roomData:', hostShip)
            } else {
              hostShip = ensureShipImage(room.hostShip)
              console.log('⚠️ Multiplayer mode (guest): Host ship is Classic (default from GET room), no previous hostShip found')
            }
          } else {
            hostShip = ensureShipImage(room.hostShip)
            console.log('✅ Multiplayer mode (guest): Using hostShip from roomData:', hostShip)
          }
        }
        
        // PERBAIKAN: Untuk multiplayer, pastikan guestShip menggunakan ship yang benar
        // Jika current user adalah guest, gunakan ship dari localStorage
        // Jika current user adalah host, gunakan guestShip dari roomData (yang sudah di-sync dari backend saat guest join)
        let guestShip = room.guestShip ? ensureShipImage(room.guestShip) : undefined
        if (address && finalMode === 'multiplayer' && address === room.guestAddress) {
          // Current user adalah guest, gunakan ship dari localStorage
          const equippedShip = localStorage.getItem(`equipped_ship_${address}`) || 'Classic'
          const shipImage = getShipImage(equippedShip)
          guestShip = {
            rarity: equippedShip,
            name: getShipNameFromRarity(equippedShip),
            class: 'Fighter',
            image: shipImage
          }
          console.log('✅ Multiplayer mode (guest): Updated guestShip from localStorage:', guestShip)
        } else if (finalMode === 'multiplayer' && address && address === room.hostAddress && room.guestAddress) {
          // Current user adalah host, gunakan guestShip dari roomData (yang sudah benar dari backend saat guest join)
          // PERBAIKAN: Jika guestShip dari backend adalah Classic (default dari GET room), 
          // kita perlu mempertahankan guestShip yang sudah benar dari roomData sebelumnya
          if (guestShip && guestShip.rarity === 'Classic' && guestShip.name === 'Classic Fighter') {
            // Ini adalah default dari backend GET room, kita perlu mempertahankan guestShip yang sudah benar
            // Cek apakah ada guestShip yang sudah benar di roomData sebelumnya
            if (roomData && roomData.guestShip && 
                !(roomData.guestShip.rarity === 'Classic' && roomData.guestShip.name === 'Classic Fighter')) {
              // Ada guestShip yang sudah benar di roomData sebelumnya, gunakan itu
              guestShip = ensureShipImage(roomData.guestShip)
              console.log('✅ Multiplayer mode (host): Keeping existing guestShip from previous roomData:', guestShip)
            } else {
              console.log('⚠️ Multiplayer mode (host): Guest ship is Classic (default from GET room), no previous guestShip found')
            }
          } else {
            console.log('✅ Multiplayer mode (host): Using guestShip from roomData:', guestShip)
          }
        }
        
        const roomDataToSet = {
          ...room,
          hostReady,
          guestReady,
          mode: finalMode,
          hostShip: hostShip,
          guestShip: guestShip
        }
        
        console.log('🔍 Setting room data with mode:', roomDataToSet.mode)
        console.log('🔍 isMultiplayer will be:', roomDataToSet.mode === 'multiplayer')
        console.log('🔍 Host ship:', roomDataToSet.hostShip)
        console.log('🔍 Guest ship:', roomDataToSet.guestShip)
        console.log('🔍 Full roomDataToSet:', roomDataToSet)
        
        setRoomData(roomDataToSet)
        
        // Cache room data (skip cache for multiplayer to avoid stale data)
        if (roomDataToSet.mode !== 'multiplayer') {
          localStorage.setItem(cachedRoomKey, JSON.stringify({
            ...roomDataToSet,
            _cachedAt: Date.now()
          }))
        }
        setLoading(false)
      } else {
        console.log('⚠️ Room response not successful, creating new room')
        // Create room if doesn't exist
        const mode = searchParams.get('mode') || 'solo'
        await createRoom(mode as 'solo' | 'multiplayer')
      }
    } catch (error: any) {
      console.error('❌ Error loading room from backend:', error.message)
      
      // If backend is not available, use fallback room data
      if (error.code === 'ERR_NETWORK' || error.message.includes('ERR_CONNECTION_REFUSED') || error.code === 'ECONNREFUSED') {
        console.warn('⚠️ Backend not available, using fallback room data')
        createFallbackRoomData()
      } else if (error.response && error.response.status === 404) {
        // Room not found, try to create it
        console.log('📦 Room not found in backend, creating new room')
        const mode = searchParams.get('mode') || 'solo'
        await createRoom(mode as 'solo' | 'multiplayer')
      } else {
        // Other error, use fallback
        console.warn('⚠️ Unknown error, using fallback room data')
        createFallbackRoomData()
      }
    }
  }

  // Sync room with backend in background (non-blocking)
  const syncRoomWithBackend = async (roomCode: string, roomData: RoomData) => {
    try {
      // Try to create/update room in backend (idempotent)
      await axios.post(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/rooms/create`,
        {
          roomCode,
          mode: roomData.mode,
          address: roomData.hostAddress,
          shipRarity: roomData.hostShip.rarity,
          shipName: roomData.hostShip.name,
          shipClass: roomData.hostShip.class,
          shipImage: roomData.hostShip.image
        },
        { timeout: 5000 } // 5 second timeout
      )
      console.log('✅ Room synced with backend')
    } catch (error) {
      // Non-critical, just log
      console.warn('⚠️ Could not sync room with backend (non-critical):', error)
    }
  }

  const createFallbackRoomData = () => {
    if (!roomCode) {
      setLoading(false)
      return
    }

    const equippedShip = address 
      ? localStorage.getItem(`equipped_ship_${address}`) || 'Classic'
      : 'Classic'
    const shipImage = getShipImage(equippedShip)
    const mode = searchParams.get('mode') || 'solo'

    const fallbackRoom = {
      roomCode: roomCode,
      mode: mode as 'solo' | 'multiplayer',
      hostAddress: address || '',
      hostShip: {
        rarity: equippedShip,
        name: getShipNameFromRarity(equippedShip),
        class: 'Fighter',
        image: shipImage
      },
      status: 'waiting' as const,
      createdAt: new Date().toISOString()
    }
    
    setRoomData(fallbackRoom)
    
    // Cache fallback room data
    const cachedRoomKey = `room_${roomCode}`
    localStorage.setItem(cachedRoomKey, JSON.stringify({
      ...fallbackRoom,
      _cachedAt: Date.now()
    }))
    console.log('✅ Fallback room data created and cached')
    setLoading(false)
  }

  const createRoom = async (mode: 'solo' | 'multiplayer') => {
    if (!roomCode) {
      console.error('❌ Room code is required')
      setLoading(false)
      return
    }

    if (!address) {
      console.warn('⚠️ No address, creating room with default data')
      // Set default room data if no address
      setRoomData({
        roomCode: roomCode,
        mode,
        hostAddress: '',
        hostShip: {
          rarity: 'Classic',
          name: 'Classic Fighter',
          class: 'Fighter',
          image: getShipImage('Classic')
        },
        status: 'waiting',
        createdAt: new Date().toISOString()
      })
      setLoading(false)
      return
    }

    try {
      // PERBAIKAN: Selalu gunakan ship dari localStorage untuk current user
      const equippedShip = localStorage.getItem(`equipped_ship_${address}`) || 'Classic'
      const shipImage = getShipImage(equippedShip)
      const shipName = getShipNameFromRarity(equippedShip)

      console.log('📦 Creating room:', { roomCode, mode, address, equippedShip, shipImage, shipName })

      const response = await axios.post(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/rooms/create`,
        {
          roomCode,
          mode,
          address,
          shipRarity: equippedShip,
          shipName: shipName,
          shipClass: 'Fighter',
          shipImage: shipImage // PERBAIKAN: Pastikan shipImage selalu di-set
        },
        { timeout: 5000 } // 5 second timeout
      )

      if (response.data && response.data.success) {
        console.log('✅ Room created successfully:', response.data.room)
        const room = response.data.room
        
        // PERBAIKAN: Untuk multiplayer, pastikan hostShip menggunakan ship dari localStorage (jika current user adalah host)
        if (mode === 'multiplayer' && address && address === room.hostAddress) {
          const equippedShip = localStorage.getItem(`equipped_ship_${address}`) || 'Classic'
          const shipImage = getShipImage(equippedShip)
          room.hostShip = {
            rarity: equippedShip,
            name: getShipNameFromRarity(equippedShip),
            class: 'Fighter',
            image: shipImage
          }
          console.log('✅ Multiplayer create room: Updated hostShip from localStorage:', room.hostShip)
        } else if (room.hostShip && !room.hostShip.image && room.hostShip.rarity) {
          // Fallback: generate dari rarity jika image tidak ada
          room.hostShip.image = getShipImage(room.hostShip.rarity)
          console.log('✅ Generated host ship image from rarity:', room.hostShip.image)
        }
        
        // Remove any internal fields before caching
        const { _cachedAt, ...roomToCache } = room as any
        
        // Save room data to state
        setRoomData(room)
        
        // Cache room data in localStorage (so we don't need to query again)
        const cachedRoomKey = `room_${roomCode}`
        localStorage.setItem(cachedRoomKey, JSON.stringify({
          ...roomToCache,
          _cachedAt: Date.now()
        }))
        console.log('✅ Room data cached in localStorage')
        
        setLoading(false)
      } else {
        throw new Error('Failed to create room: Response not successful')
      }
    } catch (error: any) {
      console.error('❌ Error creating room:', error.message)
      
      // If backend is not available, use fallback room data
      if (error.code === 'ERR_NETWORK' || error.message.includes('ERR_CONNECTION_REFUSED') || error.code === 'ECONNREFUSED') {
        console.warn('⚠️ Backend not available, using fallback room data')
        createFallbackRoomData()
      } else {
        // Other error, also use fallback
        console.warn('⚠️ Error creating room, using fallback room data')
        createFallbackRoomData()
      }
    }
  }


  const handleReady = async () => {
    if (!roomCode || !address || !roomData) return

    try {
      console.log('🎮 Setting ready status...', { roomCode, address, isHost, isGuest })
      
      // Update ready status di backend
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/rooms/${roomCode}/ready`,
        {
          address,
          ready: true
        }
      )

      if (response.data && response.data.success) {
        const updatedRoom = response.data.room
        console.log('✅ Ready status updated in backend:', {
          hostReady: updatedRoom.hostReady,
          guestReady: updatedRoom.guestReady
        })
        
        // Update room data dengan ready status dari backend
        setRoomData({
          ...roomData,
          hostReady: updatedRoom.hostReady,
          guestReady: updatedRoom.guestReady
        })
        
        setIsReady(true)

        // Solo mode: langsung start setelah ready
        if (!isMultiplayer) {
          console.log('✅ Solo mode, starting game...')
          handleGameStart()
        }
        // Multiplayer: auto-start akan di-handle oleh useEffect yang watch ready status
      } else {
        throw new Error('Failed to update ready status')
      }
    } catch (error: any) {
      console.error('❌ Error setting ready status:', error)
      alert(`Error: ${error.response?.data?.message || error.message || 'Failed to set ready status'}`)
    }
  }

  const handleGameStart = () => {
    setGameStarted(true)
    
    if (roomCode) {
      // Stop polling sebelum navigate
      if (pollingInterval) {
        clearInterval(pollingInterval)
        setPollingInterval(null)
      }
      // Navigate dengan mode parameter untuk memastikan multiplayer mode
      const urlMode = searchParams.get('mode') || roomData?.mode || 'solo'
      navigate(`/game/${roomCode}?mode=${urlMode}`)
    }
  }

  const handleGameOver = async (finalScore: number) => {
    setGameScore(finalScore)
    setGameStarted(false)

    if (!address || !roomCode || !roomData) return

    try {
      // Save match to database
      await axios.post(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/matches/save`,
        {
          roomCode,
          mode: roomData.mode,
          address,
          shipRarity: roomData.hostShip.rarity,
          shipName: roomData.hostShip.name,
          score: finalScore,
          duration: 0
        }
      )

      // Update room status to finished
      await axios.post(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/rooms/${roomCode}/finish`
      )
    } catch (error) {
      console.error('Error saving game result:', error)
    }
  }

  const getShipImage = (rarity: string) => {
    // PERBAIKAN: Normalisasi "Common" menjadi "Elite" untuk mapping yang benar
    const normalizedRarity = rarity === 'Common' ? 'Elite' : rarity
    const imageMap: { [key: string]: string } = {
      'Classic': '/nft-images/ships/ship-classic.gif',
      'Common': '/nft-images/ships/ship-elite.gif',
      'Elite': '/nft-images/ships/ship-elite.gif',
      'Epic': '/nft-images/ships/ship-epic.gif',
      'Legendary': '/nft-images/ships/ship-legendary.gif',
      'Master': '/nft-images/ships/ship-master.gif',
      'Ultra': '/nft-images/ships/ship-ultra.gif'
    }
    return imageMap[normalizedRarity] || '/nft-images/ships/ship-classic.gif'
  }
  
  // Canonical rarity -> display name. Matches the collection/backend table so
  // the lobby never disagrees with what the player actually owns. Used only as
  // a fallback when we hold a rarity string but no fetched ship object.
  const SHIP_NAMES: { [key: string]: string } = {
    'Classic': 'Classic Fighter',
    'Common': 'Elite Fighter',
    'Elite': 'Elite Fighter',
    'Epic': 'Epic Destroyer',
    'Legendary': 'Legendary Cruiser',
    'Master': 'Master Battleship',
    'Ultra': 'Ultra Command'
  }

  const getShipNameFromRarity = (rarity: string) =>
    SHIP_NAMES[rarity] || 'Classic Fighter'

  const getAvatar = (address: string) => {
    // Generate avatar from address (simple approach)
    const firstChar = address.charAt(0).toUpperCase()
    return firstChar
  }

  if (loading) {
    return (
      <div className="room">
        <div className="loading-container">
          <p className="loading">LOADING ROOM...</p>
        </div>
      </div>
    )
  }

  if (!roomData) {
    return (
      <div className="room">
        <div className="error-container">
          <p>Room not found</p>
          <button className="btn" onClick={() => navigate('/')}>
            BACK TO HOME
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="room">
      <div className="room-header">
        <h1 className="room-title">ROOM {roomCode}</h1>
        {isMultiplayer && (
          <div className="room-code-display">
            <span>CODE: <strong>{roomCode}</strong></span>
          </div>
        )}
        <button className="btn btn-small" onClick={() => navigate('/')}>
          EXIT ROOM
        </button>
      </div>

      <div className={`room-content ${isMultiplayer ? 'room-multiplayer' : ''}`}>
        {isMultiplayer ? (
          // Multiplayer Layout: 2 Player Cards (kiri-kanan)
          <>
            {/* Player 1 Card (Kiri) - Host */}
            <div className="player-card-wrapper player-1">
              <div className={`player-card card ${isHost ? 'current-player' : ''}`}>
                <div className="player-avatar">
                  <div className="avatar-circle">
                    {getAvatar(roomData.hostAddress)}
                  </div>
                </div>
                <div className="player-info">
                  <h3>PLAYER 1 (HOST)</h3>
                  <p className="player-address">
                    {roomData.hostAddress?.slice(0, 6)}...{roomData.hostAddress?.slice(-4)}
                  </p>
                  <div className="player-ship">
                    {(() => {
                      // PERBAIKAN: Untuk multiplayer, jika current user adalah host, gunakan ship dari localStorage
                      // Jika current user adalah guest, tampilkan host ship dari roomData (yang sudah di-sync dari backend)
                      let shipImage = roomData.hostShip.image || getShipImage(roomData.hostShip.rarity)
                      let shipName = roomData.hostShip.name
                      
                      if (isMultiplayer && address === roomData.hostAddress) {
                        // Current user adalah host, gunakan ship dari localStorage
                        const equippedShip = localStorage.getItem(`equipped_ship_${address}`) || 'Classic'
                        shipImage = getShipImage(equippedShip)
                        shipName = getShipNameFromRarity(equippedShip)
                        console.log('✅ Multiplayer lobby (host): Using ship from localStorage:', equippedShip, '→', shipImage)
                      } else if (isMultiplayer && address === roomData.guestAddress) {
                        // Current user adalah guest, gunakan host ship dari roomData (yang sudah benar dari backend)
                        // roomData.hostShip sudah di-sync dari backend saat host create room
                        console.log('✅ Multiplayer lobby (guest): Using host ship from roomData:', roomData.hostShip)
                      }
                      
                      return (
                        <>
                          <img 
                            src={shipImage} 
                            alt={shipName}
                            className="ship-preview"
                          />
                          <p>{shipName}</p>
                        </>
                      )
                    })()}
                  </div>
                  <div className="player-ready-status">
                    {roomData.hostReady ? (
                      <span className="ready-badge">✓ READY</span>
                    ) : (
                      <span className="waiting-badge">WAITING...</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Center Area - Room Info & Actions */}
            <div className="room-center">
              <div className="lobby-content card">
                <h2>MULTIPLAYER ROOM</h2>
                <p className="room-code-info">Room Code: <strong>{roomCode}</strong></p>
                {!roomData.guestAddress && (
                  <p className="waiting-message">Waiting for player 2 to join...</p>
                )}
                {roomData.guestAddress && (
                  <>
                    <p className="ready-status-info">
                      Player 1: {roomData.hostReady ? '✓ Ready' : '⏳ Not Ready'}
                    </p>
                    <p className="ready-status-info">
                      Player 2: {roomData.guestReady ? '✓ Ready' : '⏳ Not Ready'}
                    </p>
                    {roomData.hostReady && roomData.guestReady && (
                      <p className="all-ready-message">✓ Both players ready! Starting game...</p>
                    )}
                  </>
                )}
                {!isReady && (isHost || isGuest) && (
                  <button 
                    className="btn btn-large btn-ready"
                    onClick={handleReady}
                    style={{
                      backgroundColor: '#00ff41',
                      color: '#000000',
                      border: '2px solid #00ff41',
                      fontSize: '18px',
                      fontWeight: 'bold',
                      padding: '20px 40px',
                      marginTop: '30px'
                    }}
                  >
                    READY TO PLAY
                  </button>
                )}
                {isReady && (
                  <div className="ready-waiting">
                    <p>✓ You are ready!</p>
                    <p>Waiting for other player...</p>
                  </div>
                )}
              </div>
            </div>

            {/* Player 2 Card (Kanan) - Guest */}
            <div className="player-card-wrapper player-2">
              {roomData.guestAddress ? (
                <div className={`player-card card ${isGuest ? 'current-player' : ''}`}>
                  <div className="player-avatar">
                    <div className="avatar-circle">
                      {getAvatar(roomData.guestAddress)}
                    </div>
                  </div>
                  <div className="player-info">
                    <h3>PLAYER 2 (GUEST)</h3>
                    <p className="player-address">
                      {roomData.guestAddress?.slice(0, 6)}...{roomData.guestAddress?.slice(-4)}
                    </p>
                    <div className="player-ship">
                      {(() => {
                        // PERBAIKAN: Untuk multiplayer, jika current user adalah guest, gunakan ship dari localStorage
                        // Jika current user adalah host, tampilkan ship dari roomData (yang sudah di-sync dari backend saat guest join)
                        let shipImage = roomData.guestShip?.image || getShipImage(roomData.guestShip?.rarity || 'Classic')
                        let shipName = roomData.guestShip?.name || 'Classic Fighter'
                        
                        if (isMultiplayer && address === roomData.guestAddress) {
                          // Current user adalah guest, gunakan ship dari localStorage
                          const equippedShip = localStorage.getItem(`equipped_ship_${address}`) || 'Classic'
                          shipImage = getShipImage(equippedShip)
                          shipName = getShipNameFromRarity(equippedShip)
                          console.log('✅ Multiplayer lobby (guest): Using ship from localStorage:', equippedShip, '→', shipImage)
                        }
                        
                        return (
                          <>
                            <img 
                              src={shipImage} 
                              alt={shipName}
                              className="ship-preview"
                            />
                            <p>{shipName}</p>
                          </>
                        )
                      })()}
                    </div>
                    <div className="player-ready-status">
                      {roomData.guestReady ? (
                        <span className="ready-badge">✓ READY</span>
                      ) : (
                        <span className="waiting-badge">WAITING...</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="player-card card empty-slot">
                  <div className="player-info">
                    <h3>PLAYER 2</h3>
                    <p className="waiting-for-player">Waiting for player to join...</p>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          // Solo Layout: Original layout
          <>
            {/* Left Sidebar - Player Info */}
            <div className="room-sidebar">
              <div className="player-card card">
                <div className="player-avatar">
                  <div className="avatar-circle">
                    {getAvatar(address || '')}
                  </div>
                </div>
                <div className="player-info">
                  <h3>PLAYER</h3>
                  <p className="player-address">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </p>
                  <div className="player-ship">
                    {(() => {
                      // PERBAIKAN: Untuk solo mode, SELALU gunakan ship dari localStorage
                      let shipImage = roomData.hostShip.image || getShipImage(roomData.hostShip.rarity)
                      let shipName = roomData.hostShip.name
                      
                      if (!isMultiplayer && address) {
                        const equippedShip = localStorage.getItem(`equipped_ship_${address}`) || 'Classic'
                        shipImage = getShipImage(equippedShip)
                        shipName = getShipNameFromRarity(equippedShip)
                        console.log('✅ Solo mode lobby: Using ship from localStorage:', equippedShip, '→', shipImage)
                      }
                      
                      return (
                        <>
                          <img 
                            src={shipImage} 
                            alt={shipName}
                            className="ship-preview"
                          />
                          <p>{shipName}</p>
                        </>
                      )
                    })()}
                  </div>
                </div>
              </div>

              {/* Action Buttons - Only for solo */}
              <div className="room-actions card">
                <button 
                  className="btn btn-action"
                  onClick={() => navigate('/leaderboard')}
                  style={{
                    width: '100%',
                    marginBottom: '10px',
                    padding: '15px',
                    fontSize: '16px',
                    fontWeight: 'bold'
                  }}
                >
                  🏆 LEADERBOARD
                </button>
                <button 
                  className="btn btn-action"
                  onClick={() => navigate('/history')}
                  style={{
                    width: '100%',
                    padding: '15px',
                    fontSize: '16px',
                    fontWeight: 'bold'
                  }}
                >
                  📜 HISTORY
                </button>
              </div>
            </div>

            {/* Main Game Area */}
            <div className="room-main">
              {!gameStarted ? (
                <div className="game-lobby">
                  <div className="lobby-content card">
                    <h2>READY TO PLAY?</h2>
                    <p>Room Code: <strong>{roomCode}</strong></p>
                    <p>Mode: <strong>{isMultiplayer ? 'MULTIPLAYER' : 'SOLO'}</strong></p>
                    <button 
                      className="btn btn-large btn-play"
                      onClick={handleGameStart}
                      style={{
                        backgroundColor: '#0066ff',
                        color: '#ffffff',
                        border: '2px solid #0044cc',
                        fontSize: '20px',
                        fontWeight: 'bold',
                        padding: '20px 40px',
                        marginTop: '30px'
                      }}
                    >
                      START GAME
                    </button>
                  </div>
                </div>
              ) : (
                <div className="game-container">
                  <p>Game will start here...</p>
                </div>
              )}

              {gameScore > 0 && !gameStarted && (
                <div className="game-result card">
                  <h2>GAME OVER!</h2>
                  <p className="final-score">Final Score: {gameScore}</p>
                  <div className="result-actions">
                    <button 
                      className="btn btn-large"
                      onClick={() => {
                        setGameScore(0)
                        setGameStarted(true)
                      }}
                      style={{
                        backgroundColor: '#0066ff',
                        color: '#ffffff',
                        border: '2px solid #0044cc'
                      }}
                    >
                      PLAY AGAIN
                    </button>
                    <button 
                      className="btn btn-large"
                      onClick={() => navigate('/')}
                    >
                      BACK TO HOME
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default Room

