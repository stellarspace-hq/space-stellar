import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import axios from 'axios'
import { getSocket, disconnectSocket } from '../utils/socket'
import type { Socket } from 'socket.io-client'
import { getShipImage, getShipStats as getSharedShipStats } from '../constants/ships'
import './SpaceShooterGame.css'

interface GameObject {
  x: number
  y: number
  width: number
  height: number
  speed?: number
  health?: number
}

interface Bullet extends GameObject {
  id: string
}

interface EnemyBullet extends GameObject {
  id: string
  color: string
}

interface Enemy extends GameObject {
  id: string
  type: 'enemy1' | 'enemy2' | 'enemylevel1' | 'enemylevel2' | 'boss1' | 'boss2'
  image?: HTMLImageElement
  zigzagOffset?: number
  zigzagDirection?: number
  shadows?: Array<{ x: number; y: number; opacity: number }> // Deprecated for enemylevel2
  auraRadius?: number // For enemylevel2: pulsing red aura radius
  auraPhase?: number // Animation phase for aura pulsing (0-2π)
  lastShot?: number
  shootCooldown?: number
  canShoot?: boolean
  maxHealth?: number
}

interface PowerUp extends GameObject {
  id: string
  type: 'shield' | 'triple' | 'laser'
  collected?: boolean
}

interface Coin extends GameObject {
  id: string
  collected?: boolean
  value?: number // Nilai koin (bisa berbeda-beda)
}

interface SpaceShooterGameProps {
  onGameOver: (score: number, coins: number, player2Score?: number) => void
  shipRarity?: string
  shipImage?: string
  shipStats?: {
    attack: number
    speed: number
    shield: number
  }
  roomCode?: string
  isMultiplayer?: boolean
  isHost?: boolean
  address?: string
  guestAddress?: string
  roomData?: any
}

const SpaceShooterGame = ({ 
  onGameOver, 
  shipRarity = 'Classic', 
  shipImage, 
  shipStats: propShipStats,
  roomCode,
  isMultiplayer = false,
  isHost = false,
  address,
  guestAddress,
  roomData
}: SpaceShooterGameProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [score, setScore] = useState(0)
  const [coins, setCoins] = useState(0) // State untuk menampilkan coins di UI
  const [gameOver, setGameOver] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const gameOverCalledRef = useRef<boolean>(false)
  const scoreRef = useRef<number>(0)
  const player2ScoreRef = useRef<number>(0) // Score for player 2 (guest) in multiplayer
  
  // Player 1 (host) - left side for multiplayer, center for solo
  const playerRef = useRef<GameObject>({
    x: isMultiplayer ? 300 : 400,
    y: 500,
    width: 120,
    height: 120,
    speed: 5,
    health: 100
  })
  
  // Player 2 (guest) - right side for multiplayer
  const player2Ref = useRef<GameObject>({
    x: 500,
    y: 500,
    width: 120,
    height: 120,
    speed: 5,
    health: 100
  })
  
  // Multiplayer state management
  const [gameStateInitialized, setGameStateInitialized] = useState(false)
  const gameStartedOnServerRef = useRef(false) // Track if game started on server(false)
  const socketRef = useRef<Socket | null>(null)
  const remoteGameStateRef = useRef<any>(null)
  const lastInputSendRef = useRef<number>(0)
  const lastStateUpdateRef = useRef<number>(0)
  
  const bulletsRef = useRef<Bullet[]>([])
  const enemyBulletsRef = useRef<EnemyBullet[]>([])
  const enemiesRef = useRef<Enemy[]>([])
  const powerUpsRef = useRef<PowerUp[]>([])
  const coinsRef = useRef<Coin[]>([])
  const keysRef = useRef<{ [key: string]: boolean }>({})
  const animationFrameRef = useRef<number>()
  const gameLogicIntervalRef = useRef<NodeJS.Timeout | null>(null) // PERBAIKAN: Interval untuk game logic (tetap berjalan saat tab hidden)
  const enemySpawnTimerRef = useRef<number>()
  const lastEnemySpawnRef = useRef<number>(0)
  const lastPowerUpSpawnRef = useRef<number>(0)
  const lastCoinSpawnRef = useRef<number>(0)
  const lastAuraHitTimeRef = useRef<{ [enemyId: string]: number }>({})
  const shipImageRef = useRef<HTMLImageElement | null>(null)
  const player2ShipImageRef = useRef<HTMLImageElement | null>(null) // PERBAIKAN: Ship image untuk Player 2
  const coinsCollectedRef = useRef<number>(0) // Total koin yang dikumpulkan Player 1
  const player2CoinsRef = useRef<number>(0) // Total koin yang dikumpulkan Player 2
  
  // Power-up effects state (Player 1)
  const shieldActiveRef = useRef<boolean>(false)
  const shieldEndTimeRef = useRef<number>(0)
  const tripleShotActiveRef = useRef<boolean>(false)
  const tripleShotEndTimeRef = useRef<number>(0)
  const laserActiveRef = useRef<boolean>(false)
  const laserEndTimeRef = useRef<number>(0)
  
  // Power-up effects state (Player 2)
  const player2ShieldActiveRef = useRef<boolean>(false)
  const player2ShieldEndTimeRef = useRef<number>(0)
  const player2TripleShotActiveRef = useRef<boolean>(false)
  const player2TripleShotEndTimeRef = useRef<number>(0)
  const player2LaserActiveRef = useRef<boolean>(false)
  const player2LaserEndTimeRef = useRef<number>(0)
  
  // Enemy images refs
  const enemyImagesRef = useRef<{ [key: string]: HTMLImageElement | null }>({
    enemy1: null,
    enemy2: null,
    enemylevel1: null,
    enemylevel2: null,
    boss1: null,
    boss2: null
  })

  // Load ship image untuk Player 1 (host)
  useEffect(() => {
    // PERBAIKAN: Prioritaskan roomData.hostShip untuk multiplayer, fallback ke prop shipImage
    let imageToLoad: string | null = null
    
    // PERBAIKAN: Untuk solo mode, SELALU gunakan ship dari prop (yang berasal dari localStorage)
    // Untuk multiplayer, prioritaskan roomData.hostShip
    if (!isMultiplayer) {
      // Solo mode: gunakan prop (yang sudah di-set dari localStorage di Game.tsx)
      if (shipImage) {
        imageToLoad = shipImage
        console.log('✅ Solo mode Player 1: Using ship image from prop:', imageToLoad, 'rarity:', shipRarity)
      } else if (shipRarity) {
        imageToLoad = getShipImage(shipRarity)
        console.log('✅ Solo mode Player 1: Generated ship image from prop shipRarity:', shipRarity, '→', imageToLoad)
      }
    } else if (isMultiplayer && roomData?.hostShip) {
      // Multiplayer: prioritaskan roomData.hostShip
      // Ini berlaku untuk BOTH host dan guest (keduanya harus melihat host ship yang benar)
      if (roomData.hostShip.image) {
        imageToLoad = roomData.hostShip.image
        console.log('✅ Multiplayer Player 1: Using ship image from roomData.hostShip.image:', imageToLoad, 'rarity:', roomData.hostShip.rarity)
      } else if (roomData.hostShip.rarity) {
        imageToLoad = getShipImage(roomData.hostShip.rarity)
        console.log('✅ Multiplayer Player 1: Generated ship image from roomData.hostShip.rarity:', roomData.hostShip.rarity, '→', imageToLoad)
      }
    }
    
    // Fallback ke prop jika tidak ada di roomData (untuk multiplayer jika roomData tidak ada)
    if (!imageToLoad && shipImage) {
      imageToLoad = shipImage
      console.log('✅ Player 1: Using ship image from prop (fallback):', imageToLoad)
    } else if (!imageToLoad && shipRarity) {
      imageToLoad = getShipImage(shipRarity)
      console.log('✅ Player 1: Generated ship image from prop shipRarity (fallback):', shipRarity, '→', imageToLoad)
    }
    
    if (imageToLoad) {
      // PERBAIKAN: Check jika image sudah sama, skip reload untuk avoid flicker
      if (shipImageRef.current?.src === imageToLoad) {
        console.log('✅ Player 1: Ship image already loaded:', imageToLoad)
        return
      }
      
      const img = new Image()
      img.src = imageToLoad
      img.onload = () => {
        shipImageRef.current = img
        console.log('✅ Player 1 ship image loaded and set:', imageToLoad, 'rarity:', roomData?.hostShip?.rarity || shipRarity)
      }
      img.onerror = () => {
        console.warn('⚠️ Failed to load Player 1 ship image:', imageToLoad)
        shipImageRef.current = null
      }
    } else {
      console.warn('⚠️ No image to load for Player 1:', { isMultiplayer, hasRoomData: !!roomData, hasHostShip: !!roomData?.hostShip, shipImage, shipRarity })
    }
  }, [shipImage, shipRarity, isMultiplayer, roomData?.hostShip?.image, roomData?.hostShip?.rarity])

  // PERBAIKAN: Load ship image untuk Player 2 (guest) dari roomData
  useEffect(() => {
    if (!isMultiplayer) return
    
    let imageToLoad: string | null = null
    
    // PERBAIKAN: Gunakan image jika ada, jika tidak generate dari rarity
    if (roomData?.guestShip) {
      if (roomData.guestShip.image) {
        imageToLoad = roomData.guestShip.image
        console.log('✅ Player 2: Using ship image from roomData.guestShip.image:', imageToLoad, 'rarity:', roomData.guestShip.rarity)
      } else if (roomData.guestShip.rarity) {
        imageToLoad = getShipImage(roomData.guestShip.rarity)
        console.log('✅ Player 2: Generated ship image from roomData.guestShip.rarity:', roomData.guestShip.rarity, '→', imageToLoad)
      }
    }
    
    if (imageToLoad) {
      // PERBAIKAN: Check jika image sudah sama, skip reload untuk avoid flicker
      if (player2ShipImageRef.current?.src === imageToLoad) {
        console.log('✅ Player 2: Ship image already loaded:', imageToLoad)
        return
      }
      
      const img = new Image()
      img.src = imageToLoad
      img.onload = () => {
        player2ShipImageRef.current = img
        console.log('✅ Player 2 ship image loaded and set:', imageToLoad, 'rarity:', roomData?.guestShip?.rarity)
      }
      img.onerror = () => {
        console.warn('⚠️ Failed to load Player 2 ship image:', imageToLoad)
        player2ShipImageRef.current = null
      }
    } else {
      console.warn('⚠️ No image to load for Player 2:', { isMultiplayer, hasRoomData: !!roomData, hasGuestShip: !!roomData?.guestShip })
    }
  }, [isMultiplayer, roomData?.guestShip?.image, roomData?.guestShip?.rarity])

  // Load enemy images with retry and better error handling
  useEffect(() => {
    const enemyTypes = ['enemy1', 'enemy2', 'enemylevel1', 'enemylevel2', 'boss1', 'boss2']
    
    const loadEnemyImage = (type: string, retryCount = 0) => {
      const img = new Image()
      img.crossOrigin = 'anonymous' // Allow CORS if needed
      
      img.onload = () => {
        enemyImagesRef.current[type] = img
        console.log(`✅ Enemy image loaded: ${type}`)
      }
      
      img.onerror = () => {
        if (retryCount < 2) {
          // Retry loading
          console.warn(`⚠️ Retry loading enemy image: ${type} (attempt ${retryCount + 1})`)
          setTimeout(() => loadEnemyImage(type, retryCount + 1), 500)
        } else {
          console.warn(`⚠️ Failed to load enemy image: ${type} after ${retryCount + 1} attempts (using fallback shape)`)
          enemyImagesRef.current[type] = null
          // Don't show red box - we'll use colored shapes instead
        }
      }
      
      // Try to load image
      img.src = `/game-assets/enemies/${type}.png`
    }
    
    enemyTypes.forEach(type => {
      loadEnemyImage(type)
    })
  }, [])

  // Ship stats based on rarity (fallback if no propShipStats).
  // attack/speed/shield/fireRate come from the shared rarity table; health is
  // uniform (all ships have 100 HP).
  const getShipStats = (rarity: string, propStats?: { attack: number; speed: number; shield: number }) => {
    // Use prop stats if available (from NFT metadata)
    if (propStats) {
      return {
        attack: propStats.attack,
        speed: propStats.speed,
        shield: propStats.shield,
        health: 100, // All ships have 100 HP
        fireRate: Math.max(50, 300 - propStats.speed * 10) // Faster speed = faster fire rate
      }
    }

    const shared = getSharedShipStats(rarity)
    return {
      attack: shared.attack,
      speed: shared.speed,
      shield: shared.shield,
      health: 100,
      fireRate: shared.fireRate
    }
  }

  // PERBAIKAN: Gunakan shipRarity dari roomData untuk multiplayer, fallback ke prop
  const actualShipRarity = useMemo(() => {
    if (isMultiplayer && roomData?.hostShip?.rarity) {
      console.log('✅ SpaceShooterGame: Using shipRarity from roomData.hostShip:', roomData.hostShip.rarity)
      return roomData.hostShip.rarity
    }
    console.log('✅ SpaceShooterGame: Using shipRarity from prop:', shipRarity)
    return shipRarity
  }, [isMultiplayer, roomData?.hostShip?.rarity, shipRarity])

  const shipStats = useMemo(() => getShipStats(actualShipRarity, propShipStats), [actualShipRarity, propShipStats])
  const playerMaxHealthRef = useRef<number>(100) // All ships have 100 HP max
  const playerHealthRef = useRef<number>(100) // Start with 100 HP
  const player2HealthRef = useRef<number>(100) // Player 2 health (multiplayer)
  const lastShotRef = useRef<number>(0)
  const lastShot2Ref = useRef<number>(0) // Player 2 last shot time
  const playerInitialXRef = useRef<number | null>(null) // Store initial X position
  const playerInitialYRef = useRef<number | null>(null) // Store initial Y position
  const lastSentBulletsRef = useRef<{ host: string, guest: string }>({ host: '', guest: '' }) // Track sent bullets untuk avoid spam
  
  // Multiplayer API URL
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = true
      
      // Removed space bar shooting - now auto-fire
      
      if (e.key.toLowerCase() === 'p') {
        setIsPaused(prev => !prev)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [gameOver, isPaused])
  
  // Auto-fire: shoot continuously in game loop (handled in updatePlayer)

  // Shoot bullet
  const shoot = useCallback(() => {
    const now = Date.now()
    if (now - lastShotRef.current < shipStats.fireRate) return
    
    lastShotRef.current = now
    const player = playerRef.current
    
    // Check active power-ups
    const nowTime = Date.now()
    
    // Laser aktif - tidak perlu shoot bullet, laser adalah continuous beam
    if (laserActiveRef.current && nowTime < laserEndTimeRef.current) {
      // Laser adalah continuous beam, tidak perlu menambahkan bullet
      // Laser akan digambar sebagai garis lurus di game loop
      return
    }
    
    // Triple shot (bola oranye) - 3 cabang
    if (tripleShotActiveRef.current && nowTime < tripleShotEndTimeRef.current) {
      const centerX = player.x + player.width / 2
      const centerY = player.y
      
      // Tembakan tengah (lurus ke atas)
      bulletsRef.current.push({
        id: `bullet-${Date.now()}-${Math.random()}-center`,
        x: centerX - 5,
        y: centerY,
        width: 10,
        height: 20,
        speed: 12,
        damage: shipStats.attack,
        playerId: isMultiplayer ? (isHost ? 'host' : 'guest') : 'player1'
      } as any)
      
      // Tembakan kiri (miring ke kiri)
      bulletsRef.current.push({
        id: `bullet-${Date.now()}-${Math.random()}-left`,
        x: centerX - 5,
        y: centerY,
        width: 10,
        height: 20,
        speed: 12,
        damage: shipStats.attack,
        velX: -2, // Miring ke kiri
        velY: -12, // Ke atas
        playerId: isMultiplayer ? (isHost ? 'host' : 'guest') : 'player1'
      } as any)
      
      // Tembakan kanan (miring ke kanan)
      bulletsRef.current.push({
        id: `bullet-${Date.now()}-${Math.random()}-right`,
        x: centerX - 5,
        y: centerY,
        width: 10,
        height: 20,
        speed: 12,
        damage: shipStats.attack,
        velX: 2, // Miring ke kanan
        velY: -12, // Ke atas
        playerId: isMultiplayer ? (isHost ? 'host' : 'guest') : 'player1'
      } as any)
    }
    // Normal shot
    else {
      bulletsRef.current.push({
        id: `bullet-${Date.now()}-${Math.random()}`,
        x: player.x + player.width / 2 - 5,
        y: player.y,
        width: 10,
        height: 20,
        speed: 12,
        damage: shipStats.attack,
        playerId: isMultiplayer ? (isHost ? 'host' : 'guest') : 'player1'
      } as any)
    }
  }, [shipStats.fireRate, shipStats.attack, isMultiplayer, isHost])

  // Initialize game state for multiplayer
  const initializeGameState = useCallback(async () => {
    if (!isMultiplayer || !roomCode || !address || !roomData) {
      console.log('⚠️ Cannot initialize game state:', { isMultiplayer, roomCode, address, hasRoomData: !!roomData })
      return
    }
    
    try {
      console.log('🎮 Initializing multiplayer game state...', { 
        roomCode, 
        address, 
        isHost, 
        hostAddress: roomData.hostAddress,
        guestAddress: roomData.guestAddress 
      })
      
      const response = await axios.post(`${API_URL}/api/game/${roomCode}/init`, {
        hostAddress: roomData.hostAddress,
        guestAddress: roomData.guestAddress || null
      })
      
      if (response.data && response.data.success) {
        console.log('✅ Game state initialized', response.data.gameState)
        setGameStateInitialized(true)
        
        // Set initial positions from backend
        if (response.data.gameState) {
          const state = response.data.gameState
          const canvas = canvasRef.current
          
          if (isHost) {
            // Host: Player 1 on left, Player 2 on right (if guest exists)
            playerRef.current.x = state.players.host.x || 300
            playerRef.current.y = state.players.host.y || (canvas ? canvas.height - playerRef.current.height - 50 : 500)
            
            if (state.players.guest && roomData.guestAddress) {
              player2Ref.current.x = state.players.guest.x || (canvas ? canvas.width - 500 : 500)
              player2Ref.current.y = state.players.guest.y || (canvas ? canvas.height - player2Ref.current.height - 50 : 500)
              console.log('✅ Host: Player 1 at', playerRef.current.x, playerRef.current.y, 'Player 2 at', player2Ref.current.x, player2Ref.current.y)
            }
          } else {
            // Guest: Player 1 (host) on left, Player 2 (guest) on right
            if (state.players.host) {
              playerRef.current.x = state.players.host.x || 300
              playerRef.current.y = state.players.host.y || (canvas ? canvas.height - playerRef.current.height - 50 : 500)
            }
            
            if (state.players.guest) {
              player2Ref.current.x = state.players.guest.x || (canvas ? canvas.width - 500 : 500)
              player2Ref.current.y = state.players.guest.y || (canvas ? canvas.height - player2Ref.current.height - 50 : 500)
            }
            console.log('✅ Guest: Player 1 at', playerRef.current.x, playerRef.current.y, 'Player 2 at', player2Ref.current.x, player2Ref.current.y)
          }
        }
      } else {
        console.error('❌ Game state initialization failed:', response.data)
      }
    } catch (error: any) {
      console.error('❌ Error initializing game state:', error)
      // Still set initialized to allow game to continue
      setGameStateInitialized(true)
    }
  }, [isMultiplayer, roomCode, address, roomData, isHost, API_URL])

  // Send player input via WebSocket (guest only)
  // Send input ke server (SEMUA player kirim input) - REAL-TIME
  const sendInput = useCallback(() => {
    if (!isMultiplayer || !roomCode || !address || !socketRef.current) {
      return
    }
    
    const now = Date.now()
    if (now - lastInputSendRef.current < 16) return // Throttle to 16ms (~60fps)
    lastInputSendRef.current = now
    
    const input = {
      left: keysRef.current['a'] || keysRef.current['arrowleft'] || false,
      right: keysRef.current['d'] || keysRef.current['arrowright'] || false,
      up: keysRef.current['w'] || keysRef.current['arrowup'] || false,
      down: keysRef.current['s'] || keysRef.current['arrowdown'] || false,
      shooting: true // Auto-fire
    }
    
    // Only send if there's actual input to avoid spam
    const hasInput = input.left || input.right || input.up || input.down
    if (hasInput) {
      // Send to server for real-time broadcast to other players
      socketRef.current.emit('player-input', { roomCode, address, input })
    }
  }, [isMultiplayer, roomCode, address])

  // Update guest player from input (called by host in game loop)
  // PERBAIKAN: Host harus selalu memproses input guest setiap frame
  const updateGuestPlayer = useCallback(() => {
    if (!isMultiplayer || !isHost || !roomData?.guestAddress) return
    
    const remoteState = remoteGameStateRef.current
    if (!remoteState || !remoteState.players.guest) {
      console.warn('⚠️ updateGuestPlayer: No guest state available')
      return
    }
    
    const guestInput = remoteState.players.guest.input
    if (!guestInput) {
      // Tidak ada input, skip (guest mungkin belum mengirim input atau belum mulai)
      // Jangan log warning karena ini normal di awal game atau saat guest tidak bergerak
      return
    }
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    // PERBAIKAN: Hanya update jika Player 2 masih hidup
    if (player2HealthRef.current <= 0) {
      return
    }
    
    // PERBAIKAN: Gunakan ship stats untuk Player 2 (bisa berbeda dengan Player 1)
    // Untuk sekarang, gunakan shipStats yang sama (nanti bisa di-improve dengan player2ShipStats)
    const speed = shipStats.speed
    const guest = player2Ref.current
    const now = Date.now()
    
    // PERBAIKAN: Update guest position based on input (host is authoritative)
    // Pastikan input diproses dengan benar setiap frame
    if (guestInput.left) {
      guest.x = Math.max(0, guest.x - speed)
    }
    if (guestInput.right) {
      guest.x = Math.min(canvas.width - guest.width, guest.x + speed)
    }
    if (guestInput.up) {
      guest.y = Math.max(0, guest.y - speed)
    }
    if (guestInput.down) {
      guest.y = Math.min(canvas.height - guest.height, guest.y + speed)
    }
    
    // Auto-fire for guest (host spawns guest bullets)
    // PERBAIKAN: Check laser dan triple shot untuk Player 2
    const isPlayer2LaserActive = player2LaserActiveRef.current && now < player2LaserEndTimeRef.current
    
    if (guestInput.shooting && !isPlayer2LaserActive) {
      // Check if player 2 has triple shot
      const isPlayer2TripleShot = player2TripleShotActiveRef.current && now < player2TripleShotEndTimeRef.current
      
      if (now - lastShot2Ref.current > shipStats.fireRate) {
        lastShot2Ref.current = now
        
        if (isPlayer2TripleShot) {
          // Triple shot for player 2
          const centerX = guest.x + guest.width / 2
          const centerY = guest.y
          
          bulletsRef.current.push({
            id: `bullet-${Date.now()}-${Math.random()}-p2-center`,
            x: centerX - 5,
            y: centerY,
            width: 10,
            height: 20,
            speed: 12,
            damage: shipStats.attack,
            playerId: 'guest'
          } as any)
          
          bulletsRef.current.push({
            id: `bullet-${Date.now()}-${Math.random()}-p2-left`,
            x: centerX - 5,
            y: centerY,
            width: 10,
            height: 20,
            speed: 12,
            damage: shipStats.attack,
            velX: -2,
            velY: -12,
            playerId: 'guest'
          } as any)
          
          bulletsRef.current.push({
            id: `bullet-${Date.now()}-${Math.random()}-p2-right`,
            x: centerX - 5,
            y: centerY,
            width: 10,
            height: 20,
            speed: 12,
            damage: shipStats.attack,
            velX: 2,
            velY: -12,
            playerId: 'guest'
          } as any)
        } else {
          // Normal shot for player 2
          bulletsRef.current.push({
            id: `bullet-${Date.now()}-${Math.random()}-p2`,
            x: guest.x + guest.width / 2 - 5,
            y: guest.y,
            width: 10,
            height: 20,
            speed: 12,
            damage: shipStats.attack,
            playerId: 'guest'
          } as any)
        }
      }
    }
  }, [isMultiplayer, isHost, roomData, shipStats])

  // Update game state via WebSocket (host only)
  const updateGameState = useCallback(() => {
    if (!isMultiplayer || !roomCode || !address || !isHost || !socketRef.current) return
    
    const now = Date.now()
    if (now - lastStateUpdateRef.current < 16) return // Throttle to 16ms (~60fps)
    lastStateUpdateRef.current = now
    
    // Send current game state via WebSocket (host is authoritative)
    // PERBAIKAN: Pastikan host selalu mengirim posisi Player 1 dan Player 2 dengan benar
    const gameState = {
        roomCode,
        hostAddress: roomData?.hostAddress || address,
        guestAddress: roomData?.guestAddress || null,
        players: {
          host: {
            x: playerRef.current.x,
            y: playerRef.current.y,
            health: playerHealthRef.current,
            score: scoreRef.current,
            coins: coinsCollectedRef.current,
            input: {
              left: keysRef.current['a'] || keysRef.current['arrowleft'] || false,
              right: keysRef.current['d'] || keysRef.current['arrowright'] || false,
              up: keysRef.current['w'] || keysRef.current['arrowup'] || false,
              down: keysRef.current['s'] || keysRef.current['arrowdown'] || false,
              shooting: true
            },
            // PERBAIKAN: Sync power-up states untuk Player 1
            powerUps: {
              shield: shieldActiveRef.current && now < shieldEndTimeRef.current,
              tripleShot: tripleShotActiveRef.current && now < tripleShotEndTimeRef.current,
              laser: laserActiveRef.current && now < laserEndTimeRef.current
            }
          },
          guest: roomData?.guestAddress ? {
            x: player2Ref.current.x,
            y: player2Ref.current.y,
            health: player2HealthRef.current,
            score: player2ScoreRef.current || 0, // Guest score
            coins: player2CoinsRef.current || 0, // Guest coins
            input: remoteGameStateRef.current?.players?.guest?.input || {
              left: false,
              right: false,
              up: false,
              down: false,
              shooting: false
            },
            // PERBAIKAN: Sync power-up states untuk Player 2
            powerUps: {
              shield: player2ShieldActiveRef.current && now < player2ShieldEndTimeRef.current,
              tripleShot: player2TripleShotActiveRef.current && now < player2TripleShotEndTimeRef.current,
              laser: player2LaserActiveRef.current && now < player2LaserEndTimeRef.current
            }
          } : null
        },
        enemies: enemiesRef.current.map(enemy => ({
          id: enemy.id,
          type: enemy.type,
          x: enemy.x,
          y: enemy.y,
          health: enemy.health || 100
        })),
        bullets: bulletsRef.current.map(bullet => ({
          id: bullet.id,
          playerId: (bullet as any).playerId || 'host',
          x: bullet.x,
          y: bullet.y
        })),
        enemyBullets: enemyBulletsRef.current.map(bullet => ({
          id: bullet.id,
          x: bullet.x,
          y: bullet.y
        })),
        powerUps: powerUpsRef.current.filter(p => !p.collected).map(powerUp => ({
          id: powerUp.id,
          type: powerUp.type,
          x: powerUp.x,
          y: powerUp.y
        })),
        coins: coinsRef.current.filter(c => !c.collected).map(coin => ({
          id: coin.id,
          x: coin.x,
          y: coin.y
        })),
        gameOver: gameOver,
        winner: null,
        lastUpdate: now
    }
    
    socketRef.current.emit('game-state-update', { roomCode, gameState })
  }, [isMultiplayer, roomCode, address, isHost, roomData, gameOver, scoreRef])

  // Handle game state updates from server (AUTHORITATIVE SERVER dengan CLIENT-SIDE PREDICTION)
  // Server mengirim state dengan array players, bukan object host/guest
  const handleGameStateUpdate = useCallback((state: any) => {
    if (!isMultiplayer) return
    
    remoteGameStateRef.current = state
    
    // Server mengirim players sebagai array dengan address
    if (state.players && Array.isArray(state.players)) {
      state.players.forEach((playerData: any) => {
        const playerAddress = playerData.address
        
        // Tentukan apakah ini player sendiri atau player lain
        const isSelf = playerAddress === address
        const isHostPlayer = playerAddress === roomData?.hostAddress
        const isGuestPlayer = playerAddress === roomData?.guestAddress
        
        if (isSelf) {
          // Player sendiri - reconciliation dengan server (hanya jika perbedaan besar)
          if (isHost) {
            // Host: reconcile Player 1 (self) dengan server
            const localX = playerRef.current.x
            const localY = playerRef.current.y
            const serverX = playerData.x
            const serverY = playerData.y
            const distance = Math.sqrt(Math.pow(serverX - localX, 2) + Math.pow(serverY - localY, 2))
            
            // Reconciliation: hanya sync jika perbedaan > 30px (untuk smoothness)
            if (distance > 30) {
              playerRef.current.x = serverX
              playerRef.current.y = serverY
            }
            // Jika perbedaan kecil, biarkan client-side prediction (local movement)
            
            // Sync health, score, coins dari server (authoritative)
            playerHealthRef.current = playerData.health
            scoreRef.current = playerData.score
            setScore(playerData.score)
            coinsCollectedRef.current = playerData.coins || 0
            setCoins(playerData.coins || 0)
          } else {
            // Guest: reconcile Player 2 (self) dengan server
            const localX = player2Ref.current.x
            const localY = player2Ref.current.y
            const serverX = playerData.x
            const serverY = playerData.y
            const distance = Math.sqrt(Math.pow(serverX - localX, 2) + Math.pow(serverY - localY, 2))
            
            // Reconciliation: hanya sync jika perbedaan > 30px
            if (distance > 30) {
              player2Ref.current.x = serverX
              player2Ref.current.y = serverY
            }
            
            // Sync health, score dari server
            player2HealthRef.current = playerData.health
            player2ScoreRef.current = playerData.score
          }
        } else {
          // Player lain - SELALU update dari server (tidak ada prediction untuk player lain)
          if (isHostPlayer && !isHost) {
            // Guest melihat host (Player 1) - SELALU dari server
            playerRef.current.x = playerData.x
            playerRef.current.y = playerData.y
            playerHealthRef.current = playerData.health
            scoreRef.current = playerData.score
            setScore(playerData.score)
            coinsCollectedRef.current = playerData.coins || 0
            setCoins(playerData.coins || 0)
          } else if (isGuestPlayer && isHost) {
            // Host melihat guest (Player 2) - SELALU dari server
            player2Ref.current.x = playerData.x
            player2Ref.current.y = playerData.y
            player2HealthRef.current = playerData.health
            player2ScoreRef.current = playerData.score
          }
        }
      });
    }
    
    // Update enemies, bullets, etc. from remote state
    if (state.enemies && Array.isArray(state.enemies)) {
      enemiesRef.current = state.enemies.map((e: any) => ({
        id: e.id,
        type: e.type,
        x: e.x,
        y: e.y,
        width: 60,
        height: 60,
        health: e.health || 100,
        speed: 2
      })) as Enemy[]
    }
    
    if (state.bullets && Array.isArray(state.bullets)) {
      bulletsRef.current = state.bullets.map((b: any) => ({
        id: b.id,
        x: b.x,
        y: b.y,
        width: 10,
        height: 20,
        speed: 12,
        damage: shipStats.attack,
        playerId: b.playerId || 'host'
      })) as Bullet[]
    }
    
    if (state.enemyBullets && Array.isArray(state.enemyBullets)) {
      enemyBulletsRef.current = state.enemyBullets.map((b: any) => ({
        id: b.id,
        x: b.x,
        y: b.y,
        width: 10,
        height: 20,
        speed: 8,
        color: '#ff0000'
      })) as EnemyBullet[]
    }
    
    if (state.powerUps && Array.isArray(state.powerUps)) {
      powerUpsRef.current = state.powerUps.map((p: any) => ({
        id: p.id,
        type: p.type,
        x: p.x,
        y: p.y,
        width: 30,
        height: 30,
        collected: false
      })) as PowerUp[]
    }
    
    if (state.coins && Array.isArray(state.coins)) {
      coinsRef.current = state.coins.map((c: any) => ({
        id: c.id,
        x: c.x,
        y: c.y,
        width: 20,
        height: 20,
        collected: false,
        value: 1
      })) as Coin[]
    }
    
    if (state.gameOver) {
      setGameOver(true)
    }
  }, [isMultiplayer, isHost, address, roomData])

  // Update player position (AUTHORITATIVE SERVER dengan CLIENT-SIDE PREDICTION)
  // Untuk multiplayer: Update posisi lokal untuk responsiveness (prediction), server authoritative untuk sync
  // Input sudah dikirim ke server di sendInput(), posisi diterima dari server di handleGameStateUpdate untuk reconciliation
  const updatePlayer = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Multiplayer: Client-side prediction untuk responsiveness
    // Player bergerak langsung berdasarkan input, server state untuk reconciliation
    if (isMultiplayer) {
      // Tentukan player mana yang dikontrol oleh user ini
      const isHostPlayer = isHost && address === roomData?.hostAddress
      const isGuestPlayer = !isHost && address === roomData?.guestAddress
      
      if (isHostPlayer) {
        // Host: Update Player 1 (self) secara lokal untuk responsiveness
        const player = playerRef.current
        if (playerHealthRef.current > 0) {
          const speed = shipStats.speed

          if (keysRef.current['a'] || keysRef.current['arrowleft']) {
            player.x = Math.max(0, player.x - speed)
          }
          if (keysRef.current['d'] || keysRef.current['arrowright']) {
            player.x = Math.min(canvas.width - player.width, player.x + speed)
          }
          if (keysRef.current['w'] || keysRef.current['arrowup']) {
            player.y = Math.max(0, player.y - speed)
          }
          if (keysRef.current['s'] || keysRef.current['arrowdown']) {
            player.y = Math.min(canvas.height - player.height, player.y + speed)
          }
          
          // Auto-fire: shoot automatically untuk Player 1
          shoot()
        }
      } else if (isGuestPlayer) {
        // Guest: Update Player 2 (self) secara lokal untuk responsiveness
        const player2 = player2Ref.current
        if (player2HealthRef.current > 0) {
          const speed = shipStats.speed

          if (keysRef.current['a'] || keysRef.current['arrowleft']) {
            player2.x = Math.max(0, player2.x - speed)
          }
          if (keysRef.current['d'] || keysRef.current['arrowright']) {
            player2.x = Math.min(canvas.width - player2.width, player2.x + speed)
          }
          if (keysRef.current['w'] || keysRef.current['arrowup']) {
            player2.y = Math.max(0, player2.y - speed)
          }
          if (keysRef.current['s'] || keysRef.current['arrowdown']) {
            player2.y = Math.min(canvas.height - player2.height, player2.y + speed)
          }
          
          // Auto-fire: shoot untuk Player 2
          const now = Date.now()
          const isPlayer2LaserActive = player2LaserActiveRef.current && now < player2LaserEndTimeRef.current
          
          if (!isPlayer2LaserActive) {
            const isPlayer2TripleShot = player2TripleShotActiveRef.current && now < player2TripleShotEndTimeRef.current
            
            if (now - lastShot2Ref.current > shipStats.fireRate) {
              lastShot2Ref.current = now
              
              if (isPlayer2TripleShot) {
                // Triple shot for player 2
                const centerX = player2.x + player2.width / 2
                const centerY = player2.y
                
                bulletsRef.current.push({
                  id: `bullet2-${Date.now()}-${Math.random()}-center`,
                  x: centerX - 5,
                  y: centerY,
                  width: 10,
                  height: 20,
                  speed: 12,
                  damage: shipStats.attack,
                  playerId: 'guest'
                } as any)
                
                bulletsRef.current.push({
                  id: `bullet2-${Date.now()}-${Math.random()}-left`,
                  x: centerX - 5,
                  y: centerY,
                  width: 10,
                  height: 20,
                  speed: 12,
                  damage: shipStats.attack,
                  velX: -2,
                  velY: -12,
                  playerId: 'guest'
                } as any)
                
                bulletsRef.current.push({
                  id: `bullet2-${Date.now()}-${Math.random()}-right`,
                  x: centerX - 5,
                  y: centerY,
                  width: 10,
                  height: 20,
                  speed: 12,
                  damage: shipStats.attack,
                  velX: 2,
                  velY: -12,
                  playerId: 'guest'
                } as any)
              } else {
                // Normal shot for player 2
                bulletsRef.current.push({
                  id: `bullet2-${Date.now()}-${Math.random()}`,
                  x: player2.x + player2.width / 2 - 5,
                  y: player2.y,
                  width: 10,
                  height: 20,
                  speed: 12,
                  damage: shipStats.attack,
                  playerId: 'guest'
                } as any)
              }
            }
          }
        }
      }
      // Player lain di-update dari server state di handleGameStateUpdate
      return
    }

    // Solo mode: update player 1 from keyboard (only if alive)
    const player = playerRef.current
    if (playerHealthRef.current > 0) {
      const speed = shipStats.speed

      // Store initial position only once (don't reset after collision)
      if (playerInitialXRef.current === null) {
        playerInitialXRef.current = player.x
        playerInitialYRef.current = player.y
      }

      if (keysRef.current['a'] || keysRef.current['arrowleft']) {
        player.x = Math.max(0, player.x - speed)
      }
      if (keysRef.current['d'] || keysRef.current['arrowright']) {
        player.x = Math.min(canvas.width - player.width, player.x + speed)
      }
      if (keysRef.current['w'] || keysRef.current['arrowup']) {
        player.y = Math.max(0, player.y - speed)
      }
      if (keysRef.current['s'] || keysRef.current['arrowdown']) {
        player.y = Math.min(canvas.height - player.height, player.y + speed)
      }
      
      // Auto-fire: shoot automatically (cooldown handled in shoot function) - only if alive
      shoot()
    }
  }, [shipStats.speed, shoot, isMultiplayer, isHost, address, roomData, shipStats.fireRate, shipStats.attack])

  // Update bullets
  const updateBullets = useCallback(() => {
    bulletsRef.current = bulletsRef.current.filter(bullet => {
      // Check if bullet has velocity (triple shot side bullets)
      if ((bullet as any).velX !== undefined && (bullet as any).velY !== undefined) {
        bullet.x += (bullet as any).velX
        bullet.y += (bullet as any).velY
      } else {
        // Normal movement (straight up)
        bullet.y -= bullet.speed!
      }
      return bullet.y > -bullet.height && bullet.x > -bullet.width && bullet.x < (canvasRef.current?.width || 800) + bullet.width
    })
  }, [])

  // Update enemy bullets (with directional movement for bosses)
  const updateEnemyBullets = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    enemyBulletsRef.current = enemyBulletsRef.current.filter(bullet => {
      // If bullet has velocity (boss bullets), use directional movement
      if ((bullet as any).velX !== undefined && (bullet as any).velY !== undefined) {
        bullet.x += (bullet as any).velX
        bullet.y += (bullet as any).velY
      } else {
        // Otherwise, just move down
        bullet.y += bullet.speed!
      }
      return bullet.y < canvas.height + bullet.height && bullet.y > -bullet.height &&
             bullet.x > -bullet.width && bullet.x < canvas.width + bullet.width
    })
  }, [])

  // Track if game has started (to delay first spawn)
  const gameStartTimeRef = useRef<number>(0)
  const firstSpawnDelayRef = useRef<boolean>(false)
  
  // Spawn power-up items
  const spawnPowerUp = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const now = Date.now()
    const baseSpawnRate = 8000 // Spawn power-up every 8 seconds
    const spawnRate = Math.max(5000, baseSpawnRate - score * 10) // Spawn lebih sering saat score tinggi
    
    if (now - lastPowerUpSpawnRef.current > spawnRate) {
      lastPowerUpSpawnRef.current = now
      
      // Random power-up type
      const rand = Math.random()
      let powerUpType: 'shield' | 'triple' | 'laser'
      
      if (rand < 0.33) {
        powerUpType = 'shield'
      } else if (rand < 0.66) {
        powerUpType = 'triple'
      } else {
        powerUpType = 'laser'
      }
      
      const powerUp: PowerUp = {
        id: `powerup-${Date.now()}-${Math.random()}`,
        type: powerUpType,
        x: Math.max(20, Math.min(canvas.width - 40, Math.random() * (canvas.width - 40))),
        y: -30,
        width: 30,
        height: 30,
        speed: 3
      }
      
      powerUpsRef.current.push(powerUp)
    }
  }, [score])
  
  // Spawn coin items
  const spawnCoin = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const now = Date.now()
    const baseSpawnRate = 5000 // Spawn coin every 5 seconds
    const spawnRate = Math.max(3000, baseSpawnRate - score * 5) // Spawn lebih sering saat score tinggi
    
    if (now - lastCoinSpawnRef.current > spawnRate) {
      lastCoinSpawnRef.current = now
      
      // Random coin value (1-3 points)
      const coinValue = Math.floor(Math.random() * 3) + 1
      
      const coin: Coin = {
        id: `coin-${Date.now()}-${Math.random()}`,
        x: Math.max(20, Math.min(canvas.width - 40, Math.random() * (canvas.width - 40))),
        y: -30,
        width: 25,
        height: 25,
        speed: 4,
        value: coinValue,
        collected: false
      }
      
      coinsRef.current.push(coin)
    }
  }, [score])
  
  // Update coins
  const updateCoins = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    coinsRef.current = coinsRef.current.filter(coin => {
      coin.y += coin.speed!
      return coin.y < canvas.height + coin.height && !coin.collected
    })
  }, [])
  
  // Check coin collection
  const checkCoinCollection = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    
    coinsRef.current.forEach(coin => {
      if (coin.collected) return
      
      // Check collision with player 1 (host)
      const hitPlayer1 = (
        player.x < coin.x + coin.width &&
        player.x + player.width > coin.x &&
        player.y < coin.y + coin.height &&
        player.y + player.height > coin.y
      )
      
      // Check collision with player 2 (guest) in multiplayer
      let hitPlayer2 = false
      if (isMultiplayer && roomData?.guestAddress && player2HealthRef.current > 0) {
        const player2 = player2Ref.current
        hitPlayer2 = (
          player2.x < coin.x + coin.width &&
          player2.x + player2.width > coin.x &&
          player2.y < coin.y + coin.height &&
          player2.y + player2.height > coin.y
        )
      }
      
      if (hitPlayer1 || hitPlayer2) {
        coin.collected = true
        const coinValue = coin.value || 1
        
        if (hitPlayer1) {
          // Player 1 collected coin
          coinsCollectedRef.current += coinValue
          setCoins(coinsCollectedRef.current)
          console.log(`💰 Player 1 collected coin! +${coinValue} coins (Total: ${coinsCollectedRef.current})`)
        } else if (hitPlayer2) {
          // Player 2 collected coin
          player2CoinsRef.current += coinValue
          console.log(`💰 Player 2 collected coin! +${coinValue} coins (Total: ${player2CoinsRef.current})`)
        }
      }
    })
    
    // Remove collected coins
    coinsRef.current = coinsRef.current.filter(c => !c.collected)
  }, [isMultiplayer, roomData])
  
  // Update power-ups
  const updatePowerUps = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    powerUpsRef.current = powerUpsRef.current.filter(powerUp => {
      powerUp.y += powerUp.speed!
      return powerUp.y < canvas.height + powerUp.height && !powerUp.collected
    })
  }, [])
  
  // Check power-up collection
  const checkPowerUpCollection = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    
    const now = Date.now()
    
    powerUpsRef.current.forEach(powerUp => {
      if (powerUp.collected) return
      
      // Check collision with player 1 (host)
      const hitPlayer1 = (
        player.x < powerUp.x + powerUp.width &&
        player.x + player.width > powerUp.x &&
        player.y < powerUp.y + powerUp.height &&
        player.y + player.height > powerUp.y
      )
      
      // Check collision with player 2 (guest) in multiplayer
      let hitPlayer2 = false
      if (isMultiplayer && roomData?.guestAddress && player2HealthRef.current > 0) {
        const player2 = player2Ref.current
        hitPlayer2 = (
          player2.x < powerUp.x + powerUp.width &&
          player2.x + player2.width > powerUp.x &&
          player2.y < powerUp.y + powerUp.height &&
          player2.y + player2.height > powerUp.y
        )
      }
      
      if (hitPlayer1 || hitPlayer2) {
        powerUp.collected = true
        
        if (hitPlayer1) {
          // Apply power-up effect to player 1
          if (powerUp.type === 'shield') {
            shieldActiveRef.current = true
            shieldEndTimeRef.current = now + 3000
            console.log('🛡️ Player 1: Shield activated! Immune to damage for 3 seconds')
          } else if (powerUp.type === 'triple') {
            tripleShotActiveRef.current = true
            tripleShotEndTimeRef.current = now + 5000
            console.log('🔶 Player 1: Triple shot activated! 3-way bullets for 5 seconds')
          } else if (powerUp.type === 'laser') {
            laserActiveRef.current = true
            laserEndTimeRef.current = now + 5000
            console.log('🔴 Player 1: Laser activated! Straight laser shots for 5 seconds')
          }
        } else if (hitPlayer2) {
          // Apply power-up effect to player 2
          if (powerUp.type === 'shield') {
            player2ShieldActiveRef.current = true
            player2ShieldEndTimeRef.current = now + 3000
            console.log('🛡️ Player 2: Shield activated! Immune to damage for 3 seconds')
          } else if (powerUp.type === 'triple') {
            player2TripleShotActiveRef.current = true
            player2TripleShotEndTimeRef.current = now + 5000
            console.log('🔶 Player 2: Triple shot activated! 3-way bullets for 5 seconds')
          } else if (powerUp.type === 'laser') {
            player2LaserActiveRef.current = true
            player2LaserEndTimeRef.current = now + 5000
            console.log('🔴 Player 2: Laser activated! Straight laser shots for 5 seconds')
          }
        }
      }
    })
    
    // Remove collected power-ups
    powerUpsRef.current = powerUpsRef.current.filter(p => !p.collected)
    
    // Check if effects expired for player 1
    if (shieldActiveRef.current && now >= shieldEndTimeRef.current) {
      shieldActiveRef.current = false
      console.log('🛡️ Player 1: Shield expired')
    }
    if (tripleShotActiveRef.current && now >= tripleShotEndTimeRef.current) {
      tripleShotActiveRef.current = false
      console.log('🔶 Player 1: Triple shot expired')
    }
    if (laserActiveRef.current && now >= laserEndTimeRef.current) {
      laserActiveRef.current = false
      console.log('🔴 Player 1: Laser expired')
    }
    
    // Check if effects expired for player 2
    if (player2ShieldActiveRef.current && now >= player2ShieldEndTimeRef.current) {
      player2ShieldActiveRef.current = false
      console.log('🛡️ Player 2: Shield expired')
    }
    if (player2TripleShotActiveRef.current && now >= player2TripleShotEndTimeRef.current) {
      player2TripleShotActiveRef.current = false
      console.log('🔶 Player 2: Triple shot expired')
    }
    if (player2LaserActiveRef.current && now >= player2LaserEndTimeRef.current) {
      player2LaserActiveRef.current = false
      console.log('🔴 Player 2: Laser expired')
    }
  }, [isMultiplayer, roomData])

  // Spawn enemy based on score
  const spawnEnemy = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const now = Date.now()
    
    // Delay first spawn by 1 second to ensure images/fallbacks are ready
    if (!firstSpawnDelayRef.current) {
      gameStartTimeRef.current = now
      firstSpawnDelayRef.current = true
      return // Skip first spawn
    }
    
    // Wait at least 1 second after game starts before first enemy spawn
    if (now - gameStartTimeRef.current < 1000) {
      return
    }

    const baseSpawnRate = 2000
    const spawnRate = Math.max(300, baseSpawnRate - score * 5)
    
    if (now - lastEnemySpawnRef.current > spawnRate) {
      lastEnemySpawnRef.current = now
      
      // Determine enemy type based on score
      let enemyType: Enemy['type']
      const rand = Math.random()
      
      if (score < 100) {
        // Early game: enemy1 and enemy2
        enemyType = rand < 0.5 ? 'enemy1' : 'enemy2'
      } else if (score < 300) {
        // Mid game: add enemylevel1
        if (rand < 0.4) enemyType = 'enemy1'
        else if (rand < 0.8) enemyType = 'enemy2'
        else enemyType = 'enemylevel1'
      } else if (score < 500) {
        // Late game: add enemylevel2
        if (rand < 0.3) enemyType = 'enemy1'
        else if (rand < 0.6) enemyType = 'enemy2'
        else if (rand < 0.8) enemyType = 'enemylevel1'
        else enemyType = 'enemylevel2'
      } else {
        // Boss level: add bosses
        if (rand < 0.2) enemyType = 'enemy1'
        else if (rand < 0.4) enemyType = 'enemy2'
        else if (rand < 0.55) enemyType = 'enemylevel1'
        else if (rand < 0.7) enemyType = 'enemylevel2'
        else if (rand < 0.85) enemyType = 'boss1'
        else enemyType = 'boss2'
      }

      // Enemy sizes and health - make them bigger
      const enemyConfig: { [key: string]: { width: number; height: number; maxHealth: number } } = {
        'enemy1': { width: 90, height: 90, maxHealth: 10 },
        'enemy2': { width: 90, height: 90, maxHealth: 10 },
        'enemylevel1': { width: 100, height: 100, maxHealth: 15 },
        'enemylevel2': { width: 100, height: 100, maxHealth: 20 },
        'boss1': { width: 140, height: 140, maxHealth: 50 },
        'boss2': { width: 140, height: 140, maxHealth: 60 }
      }
      
      const config = enemyConfig[enemyType] || { width: 90, height: 90, maxHealth: 10 }
      const spawnX = Math.max(0, Math.min(canvas.width - config.width, Math.random() * (canvas.width - config.width)))
      
      const enemy: Enemy = {
        id: `enemy-${Date.now()}-${Math.random()}`,
        type: enemyType,
        x: spawnX,
        y: -config.height,
        width: config.width, // Bigger size
        height: config.height, // Bigger size
        speed: enemyType === 'enemy1' || enemyType === 'enemy2' 
          ? 4 + score * 0.02
          : enemyType === 'enemylevel1' 
          ? 5 + score * 0.03
          : enemyType === 'enemylevel2'
          ? 6 + score * 0.03
          : 2 + score * 0.015,
        health: config.maxHealth, // Use maxHealth from config
        maxHealth: config.maxHealth, // Store max health for health bar
        zigzagOffset: 0,
        zigzagDirection: Math.random() > 0.5 ? 1 : -1,
        shadows: undefined, // No longer used for enemylevel2
        auraRadius: enemyType === 'enemylevel2' ? 50 : undefined, // Initial aura radius for enemylevel2
        auraPhase: enemyType === 'enemylevel2' ? 0 : undefined, // Animation phase for pulsing
        lastShot: 0,
        shootCooldown: enemyType === 'boss1' ? 2000 : enemyType === 'boss2' ? 1500 : undefined,
        canShoot: enemyType.includes('boss')
      } as any

      // Load image if available
      if (enemyImagesRef.current[enemyType]) {
        enemy.image = enemyImagesRef.current[enemyType]!
      }

      enemiesRef.current.push(enemy)
    }
  }, [score])

  // Update enemies with special behaviors
  const updateEnemies = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const player = playerRef.current

    enemiesRef.current = enemiesRef.current.filter(enemy => {
      // Calculate direction to player for ALL enemies (homing behavior)
      const dx = (player.x + player.width / 2) - (enemy.x + enemy.width / 2)
      const dy = (player.y + player.height / 2) - (enemy.y + enemy.height / 2)
      const distance = Math.sqrt(dx * dx + dy * dy)
      
      // Basic movement down (all enemies move down)
      enemy.y += enemy.speed!

      // ALL enemies move towards player (homing) with different speeds
      if (distance > 0) {
        let moveSpeedX = 0
        let moveSpeedY = 0
        
        // Different homing speeds based on enemy type
        if (enemy.type === 'enemy1' || enemy.type === 'enemy2') {
          // Enemy1 and Enemy2: Moderate homing speed
          moveSpeedX = (dx / distance) * 1.5
          moveSpeedY = (dy / distance) * 0.3 // Less vertical movement, more horizontal
        } else if (enemy.type === 'enemylevel1') {
          // Enemylevel1: Fast homing
          moveSpeedX = (dx / distance) * 2.5
          moveSpeedY = (dy / distance) * 0.5
        } else if (enemy.type === 'enemylevel2') {
          // Enemylevel2: Very fast homing
          moveSpeedX = (dx / distance) * 3.0
          moveSpeedY = (dy / distance) * 0.6
        } else if (enemy.type === 'boss1' || enemy.type === 'boss2') {
          // Bosses: Slow but steady homing
          moveSpeedX = (dx / distance) * 1.0
          moveSpeedY = (dy / distance) * 0.2
        }
        
        // Apply movement
        enemy.x += moveSpeedX
        // enemy.y already updated above, but add small homing adjustment
        enemy.y += moveSpeedY * 0.3
      }
      
      // CRITICAL: Keep ALL enemies within canvas bounds (prevent going outside)
      enemy.x = Math.max(0, Math.min(canvas.width - enemy.width, enemy.x))
      // Y bounds are handled by filter condition below

      // enemylevel2: Update pulsing red aura (membesar mengecil)
      if (enemy.type === 'enemylevel2' && enemy.auraPhase !== undefined && enemy.auraRadius !== undefined) {
        // Update aura animation phase (pulsing effect)
        enemy.auraPhase = (enemy.auraPhase || 0) + 0.1 // Increase phase for animation
        
        // Calculate pulsing radius (50 to 120 pixels, sinusoidal)
        const baseRadius = 50
        const pulseAmplitude = 35
        enemy.auraRadius = baseRadius + Math.sin(enemy.auraPhase) * pulseAmplitude
      }

      // Boss shooting
      if (enemy.canShoot && enemy.shootCooldown) {
        const now = Date.now()
        if (now - (enemy.lastShot || 0) > enemy.shootCooldown) {
          enemy.lastShot = now
          
          // Shoot towards player
          const player = playerRef.current
          const dx = player.x + player.width / 2 - (enemy.x + enemy.width / 2)
          const dy = player.y + player.height / 2 - (enemy.y + enemy.height / 2)
          const distance = Math.sqrt(dx * dx + dy * dy)
          const angle = Math.atan2(dy, dx)
          
          // Calculate bullet direction towards player
          const bulletSpeed = 4 // Increased from 3
          const velX = (dx / distance) * bulletSpeed
          const velY = (dy / distance) * bulletSpeed
          
          enemyBulletsRef.current.push({
            id: `enemy-bullet-${Date.now()}-${Math.random()}`,
            x: enemy.x + enemy.width / 2 - 6,
            y: enemy.y + enemy.height,
            width: 12, // Increased from 10
            height: 12, // Increased from 10
            speed: bulletSpeed,
            color: enemy.type === 'boss1' ? '#1a1a2e' : '#8b00ff', // Octopus ink or purple
            velX: velX, // Store velocity for directional movement
            velY: velY
          } as any)
        }
      }

      return enemy.y < canvas.height + enemy.height
    })
  }, [])

  // Check collisions
  const checkCollisions = useCallback(() => {
    const player = playerRef.current
    if (!player) return

    const now = Date.now()
    const canvas = canvasRef.current
    
    // Laser beam collision for player 1 (continuous beam dari player ke atas) - only if player 1 alive
    if (playerHealthRef.current > 0) {
      const isLaserActive = laserActiveRef.current && now < laserEndTimeRef.current
      if (isLaserActive && canvas) {
        const laserX = player.x + player.width / 2
        const laserWidth = 8 // Lebar laser beam
        const laserStartY = player.y
        const laserEndY = 0 // Dari player sampai atas canvas
        
        // Check collision dengan semua enemies di jalur laser
        const hitEnemyIds: string[] = []
        enemiesRef.current.forEach(enemy => {
          if (hitEnemyIds.includes(enemy.id)) return
          
          // Check if enemy overlap dengan laser beam (rectangular collision)
          const laserLeft = laserX - laserWidth / 2
          const laserRight = laserX + laserWidth / 2
          const enemyLeft = enemy.x
          const enemyRight = enemy.x + enemy.width
          const enemyTop = enemy.y
          const enemyBottom = enemy.y + enemy.height
          
          if (
            enemyRight >= laserLeft &&
            enemyLeft <= laserRight &&
            enemyBottom > laserEndY &&
            enemyTop < laserStartY
          ) {
            // Enemy terkena laser beam - damage setiap frame
            const laserDamage = shipStats.attack * 2 // Laser lebih kuat
            enemy.health = (enemy.health || 1) - laserDamage
            
            if (enemy.health! <= 0) {
              hitEnemyIds.push(enemy.id)
              // Score based on enemy type - assign to player 1 (laser is player 1's weapon)
              const scoreValue = enemy.type.includes('boss') ? 50 : enemy.type.includes('level') ? 20 : 10
              setScore(prev => {
                const newScore = prev + scoreValue
                scoreRef.current = newScore
                return newScore
              })
            }
          }
        })
        
        // Remove destroyed enemies
        enemiesRef.current = enemiesRef.current.filter(e => !hitEnemyIds.includes(e.id))
      }
    }
    
    // Laser beam collision for player 2 (continuous beam dari player ke atas) - only if player 2 alive
    if (isMultiplayer && roomData?.guestAddress && player2HealthRef.current > 0) {
      const isPlayer2LaserActive = player2LaserActiveRef.current && now < player2LaserEndTimeRef.current
      if (isPlayer2LaserActive && canvas) {
        const player2 = player2Ref.current
        const laserX = player2.x + player2.width / 2
        const laserWidth = 8 // Lebar laser beam
        const laserStartY = player2.y
        const laserEndY = 0 // Dari player sampai atas canvas
        
        // Check collision dengan semua enemies di jalur laser
        const hitEnemyIds: string[] = []
        enemiesRef.current.forEach(enemy => {
          if (hitEnemyIds.includes(enemy.id)) return
          
          // Check if enemy overlap dengan laser beam (rectangular collision)
          const laserLeft = laserX - laserWidth / 2
          const laserRight = laserX + laserWidth / 2
          const enemyLeft = enemy.x
          const enemyRight = enemy.x + enemy.width
          const enemyTop = enemy.y
          const enemyBottom = enemy.y + enemy.height
          
          if (
            enemyRight >= laserLeft &&
            enemyLeft <= laserRight &&
            enemyBottom > laserEndY &&
            enemyTop < laserStartY
          ) {
            // Enemy terkena laser beam - damage setiap frame
            const laserDamage = shipStats.attack * 2 // Laser lebih kuat
            enemy.health = (enemy.health || 1) - laserDamage
            
            if (enemy.health! <= 0) {
              hitEnemyIds.push(enemy.id)
              // Score based on enemy type - assign to player 2 (laser is player 2's weapon)
              const scoreValue = enemy.type.includes('boss') ? 50 : enemy.type.includes('level') ? 20 : 10
              player2ScoreRef.current = (player2ScoreRef.current || 0) + scoreValue
            }
          }
        })
        
        // Remove destroyed enemies
        enemiesRef.current = enemiesRef.current.filter(e => !hitEnemyIds.includes(e.id))
      }
    }

    // Bullet vs Enemy (untuk normal bullets dan triple shot)
    const hitEnemyIds: string[] = []
    bulletsRef.current = bulletsRef.current.filter(bullet => {
      const hitEnemyIndex = enemiesRef.current.findIndex(enemy => {
        if (hitEnemyIds.includes(enemy.id)) return false
        return (
          bullet.x < enemy.x + enemy.width &&
          bullet.x + bullet.width > enemy.x &&
          bullet.y < enemy.y + enemy.height &&
          bullet.y + bullet.height > enemy.y
        )
      })

      if (hitEnemyIndex !== -1) {
        const enemy = enemiesRef.current[hitEnemyIndex]
        const bulletDamage = (bullet as any).damage || shipStats.attack || 10 // Use bullet damage or fallback
        enemy.health = (enemy.health || 1) - bulletDamage // Apply damage from bullet
        
        if (enemy.health! <= 0) {
          hitEnemyIds.push(enemy.id)
          // Score based on enemy type
          const scoreValue = enemy.type.includes('boss') ? 50 : enemy.type.includes('level') ? 20 : 10
          
          // Assign score to the player who shot the bullet
          const bulletPlayerId = (bullet as any).playerId || 'host'
          if (bulletPlayerId === 'guest' && isMultiplayer && roomData?.guestAddress) {
            // Player 2 (guest) scored
            player2ScoreRef.current += scoreValue
          } else {
            // Player 1 (host) scored
            setScore(prev => {
              const newScore = prev + scoreValue
              scoreRef.current = newScore
              return newScore
            })
          }
        }
        return false // Remove bullet
      }

      return true
    })
    
    // Remove destroyed enemies
    enemiesRef.current = enemiesRef.current.filter(e => !hitEnemyIds.includes(e.id))

    // Enemy vs Player - ALL enemies can hurt player, damage based on type
    // For enemylevel2: also check aura collision
    // PERBAIKAN: Check shield power-up (kebal serangan)
    // Note: 'now' already declared at the beginning of this function
    const hitPlayerEnemyIds: string[] = []
    
    // Check if shield is active
    const isShieldActive = shieldActiveRef.current && now < shieldEndTimeRef.current
    
    enemiesRef.current.forEach(enemy => {
      let hitPlayer1 = false
      let hitPlayer2 = false
      
      // Check collision with player 1 (host) - enemy body (direct contact)
      if (
        player.x < enemy.x + enemy.width &&
        player.x + player.width > enemy.x &&
        player.y < enemy.y + enemy.height &&
        player.y + player.height > enemy.y
      ) {
        hitPlayer1 = true
      }
      
      // Check collision with player 2 (guest) in multiplayer
      if (isMultiplayer && roomData?.guestAddress) {
        const player2 = player2Ref.current
        if (
          player2.x < enemy.x + enemy.width &&
          player2.x + player2.width > enemy.x &&
          player2.y < enemy.y + enemy.height &&
          player2.y + player2.height > enemy.y
        ) {
          hitPlayer2 = true
        }
      }
      
      // For enemylevel2: Check collision with pulsing red aura
      if (enemy.type === 'enemylevel2' && enemy.auraRadius !== undefined) {
        const enemyCenterX = enemy.x + enemy.width / 2
        const enemyCenterY = enemy.y + enemy.height / 2
        
        // Check player 1 aura collision
        const player1CenterX = player.x + player.width / 2
        const player1CenterY = player.y + player.height / 2
        const dx1 = player1CenterX - enemyCenterX
        const dy1 = player1CenterY - enemyCenterY
        const distance1 = Math.sqrt(dx1 * dx1 + dy1 * dy1)
        const player1Radius = Math.max(player.width, player.height) / 2
        if (distance1 < enemy.auraRadius + player1Radius) {
          const lastHit = lastAuraHitTimeRef.current[enemy.id] || 0
          if (now - lastHit > 500) {
            hitPlayer1 = true
            lastAuraHitTimeRef.current[enemy.id] = now
          }
        }
        
        // Check player 2 aura collision
        if (isMultiplayer && roomData?.guestAddress) {
          const player2 = player2Ref.current
          const player2CenterX = player2.x + player2.width / 2
          const player2CenterY = player2.y + player2.height / 2
          const dx2 = player2CenterX - enemyCenterX
          const dy2 = player2CenterY - enemyCenterY
          const distance2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)
          const player2Radius = Math.max(player2.width, player2.height) / 2
          if (distance2 < enemy.auraRadius + player2Radius) {
            const lastHit2 = lastAuraHitTimeRef.current[`${enemy.id}-p2`] || 0
            if (now - lastHit2 > 500) {
              hitPlayer2 = true
              lastAuraHitTimeRef.current[`${enemy.id}-p2`] = now
            }
          }
        }
      }
      
      if (hitPlayer1) {
        // PERBAIKAN: Jika shield aktif, tidak terkena damage
        if (isShieldActive) {
          console.log('🛡️ Shield protected from damage!')
        } else {
          // Damage based on enemy type (with shield reduction)
          let damage = 0
          if (enemy.type === 'enemy1' || enemy.type === 'enemy2') {
            damage = 20 // Enemy1 & Enemy2: 20 damage
          } else if (enemy.type === 'enemylevel1' || enemy.type === 'enemylevel2') {
            damage = 30 // Enemylevel1 & Enemylevel2: 30 damage
          } else if (enemy.type === 'boss1' || enemy.type === 'boss2') {
            damage = 50 // Boss: 50 damage
          }
          
          // Apply shield reduction (shield reduces damage)
          const reducedDamage = Math.max(1, damage - Math.floor(shipStats.shield / 10))
          playerHealthRef.current = Math.max(0, playerHealthRef.current - reducedDamage)
          hitPlayerEnemyIds.push(enemy.id)
          
          // In multiplayer, game over only if both players die
          if (playerHealthRef.current <= 0) {
            if (isMultiplayer && roomData?.guestAddress) {
              if (player2HealthRef.current <= 0 && !gameOverCalledRef.current) {
                gameOverCalledRef.current = true
                setGameOver(true)
                if (animationFrameRef.current) {
                  cancelAnimationFrame(animationFrameRef.current)
                }
                const finalScore = scoreRef.current || score
                const finalPlayer2Score = player2ScoreRef.current || 0
                const finalCoins = coinsCollectedRef.current
                console.log('🎮 Game Over - Both players dead - Player 1 Score:', finalScore, 'Player 2 Score:', finalPlayer2Score, 'Coins:', finalCoins)
                setTimeout(() => {
                  onGameOver(finalScore, finalCoins, finalPlayer2Score)
                }, 50)
              }
            } else if (!gameOverCalledRef.current) {
              gameOverCalledRef.current = true
              setGameOver(true)
              if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
              }
              const finalScore = scoreRef.current || score
              const finalCoins = coinsCollectedRef.current
              console.log('🎮 Game Over - Final Score:', finalScore, 'Coins:', finalCoins)
              setTimeout(() => {
                onGameOver(finalScore, finalCoins)
              }, 50)
            }
          }
        }
      }
      
      if (hitPlayer2 && player2HealthRef.current > 0) {
        // PERBAIKAN: Jika shield aktif untuk player 2, tidak terkena damage
        const isPlayer2ShieldActive = player2ShieldActiveRef.current && now < player2ShieldEndTimeRef.current
        if (isPlayer2ShieldActive) {
          console.log('🛡️ Player 2 Shield protected from damage!')
        } else {
          // Damage based on enemy type (with shield reduction)
          let damage = 0
          if (enemy.type === 'enemy1' || enemy.type === 'enemy2') {
            damage = 20
          } else if (enemy.type === 'enemylevel1' || enemy.type === 'enemylevel2') {
            damage = 30
          } else if (enemy.type === 'boss1' || enemy.type === 'boss2') {
            damage = 50
          }
          
          const reducedDamage = Math.max(1, damage - Math.floor(shipStats.shield / 10))
          player2HealthRef.current = Math.max(0, player2HealthRef.current - reducedDamage)
          hitPlayerEnemyIds.push(enemy.id)
        }
        
        // Check if player 2 died
        if (player2HealthRef.current <= 0) {
          console.log('💀 Player 2 died!')
          
          // Check if both players are dead
          if (playerHealthRef.current <= 0) {
            // Both players dead - game over
            if (!gameOverCalledRef.current) {
              gameOverCalledRef.current = true
              setGameOver(true)
              if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
              }
              const finalScore = scoreRef.current || score
              const finalPlayer2Score = player2ScoreRef.current || 0
              const finalCoins = coinsCollectedRef.current
              console.log('🎮 Game Over - Both players dead - Player 1 Score:', finalScore, 'Player 2 Score:', finalPlayer2Score, 'Coins:', finalCoins)
              setTimeout(() => {
                onGameOver(finalScore, finalCoins, finalPlayer2Score)
              }, 50)
            }
          } else {
            // Player 2 dead but Player 1 still alive - continue game (player 2 ship will disappear/ghost)
            console.log('💀 Player 2 died, but Player 1 is still alive. Game continues...')
          }
        }
      }
    })
    
    // Remove enemies that hit player (only if direct collision, not aura)
    enemiesRef.current = enemiesRef.current.filter(e => {
      // Don't remove enemylevel2 if only aura hit (aura is continuous damage, enemy stays)
      if (e.type === 'enemylevel2') {
        return true // Keep enemy, aura damage is continuous
      }
      return !hitPlayerEnemyIds.includes(e.id)
    })

    // Enemy bullets vs Player - damage based on bullet type
    // PERBAIKAN: Check shield power-up (kebal serangan)
    // Note: 'now' and 'isShieldActive' already declared above
    const hitPlayerBulletIds: string[] = []
    
    enemyBulletsRef.current = enemyBulletsRef.current.filter(bullet => {
      // Check collision with player 1 (host)
      const hitPlayer1 = (
        player.x < bullet.x + bullet.width &&
        player.x + player.width > bullet.x &&
        player.y < bullet.y + bullet.height &&
        player.y + player.height > bullet.y
      )
      
      // Check collision with player 2 (guest) in multiplayer
      let hitPlayer2 = false
      if (isMultiplayer && roomData?.guestAddress) {
        const player2 = player2Ref.current
        hitPlayer2 = (
          player2.x < bullet.x + bullet.width &&
          player2.x + player2.width > bullet.x &&
          player2.y < bullet.y + bullet.height &&
          player2.y + player2.height > bullet.y
        )
      }
      
      if (hitPlayer1 && playerHealthRef.current > 0) {
        // PERBAIKAN: Jika shield aktif, tidak terkena damage
        if (isShieldActive) {
          console.log('🛡️ Shield protected from bullet damage!')
          return false // Remove bullet tapi tidak damage
        }
        
        // Boss bullets do damage (same as boss collision)
        const damage = 50 // Boss bullet damage
        const reducedDamage = Math.max(1, damage - Math.floor(shipStats.shield / 10))
        playerHealthRef.current = Math.max(0, playerHealthRef.current - reducedDamage)
        hitPlayerBulletIds.push(bullet.id)
        
        // Check if player 1 died
        if (playerHealthRef.current <= 0) {
          console.log('💀 Player 1 died from bullet!')
          
          // In multiplayer: check if both players are dead
          if (isMultiplayer && roomData?.guestAddress) {
            if (player2HealthRef.current <= 0) {
              // Both players dead - game over
              if (!gameOverCalledRef.current) {
                gameOverCalledRef.current = true
                setGameOver(true)
                if (animationFrameRef.current) {
                  cancelAnimationFrame(animationFrameRef.current)
                }
                const finalScore = scoreRef.current || score
                const finalPlayer2Score = player2ScoreRef.current || 0
                const finalCoins = coinsCollectedRef.current
                console.log('🎮 Game Over - Both players dead - Player 1 Score:', finalScore, 'Player 2 Score:', finalPlayer2Score, 'Coins:', finalCoins)
                setTimeout(() => {
                  onGameOver(finalScore, finalCoins, finalPlayer2Score)
                }, 50)
              }
            } else {
              // Player 1 dead but Player 2 still alive - continue game
              console.log('💀 Player 1 died, but Player 2 is still alive. Game continues...')
            }
          } else {
            // Solo mode - game over
            if (!gameOverCalledRef.current) {
              gameOverCalledRef.current = true
              setGameOver(true)
              if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
              }
              const finalScore = scoreRef.current || score
              const finalCoins = coinsCollectedRef.current
              console.log('🎮 Game Over - Final Score:', finalScore, 'Coins:', finalCoins)
              setTimeout(() => {
                onGameOver(finalScore, finalCoins)
              }, 50)
            }
          }
        }
        return false
      }
      
      if (hitPlayer2 && player2HealthRef.current > 0) {
        // PERBAIKAN: Jika shield aktif untuk player 2, tidak terkena damage
        const isPlayer2ShieldActive = player2ShieldActiveRef.current && now < player2ShieldEndTimeRef.current
        if (isPlayer2ShieldActive) {
          console.log('🛡️ Player 2 Shield protected from bullet damage!')
          return false // Remove bullet tapi tidak damage
        }
        
        // Boss bullets do damage (same as boss collision)
        const damage = 50 // Boss bullet damage
        const reducedDamage = Math.max(1, damage - Math.floor(shipStats.shield / 10))
        player2HealthRef.current = Math.max(0, player2HealthRef.current - reducedDamage)
        hitPlayerBulletIds.push(bullet.id)
        
        // Check if player 2 died
        if (player2HealthRef.current <= 0) {
          console.log('💀 Player 2 died from bullet!')
          
          // Check if both players are dead
          if (playerHealthRef.current <= 0) {
            // Both players dead - game over
            if (!gameOverCalledRef.current) {
              gameOverCalledRef.current = true
              setGameOver(true)
              if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
              }
              const finalScore = scoreRef.current || score
              const finalPlayer2Score = player2ScoreRef.current || 0
              const finalCoins = coinsCollectedRef.current
              console.log('🎮 Game Over - Both players dead - Player 1 Score:', finalScore, 'Player 2 Score:', finalPlayer2Score, 'Coins:', finalCoins)
              setTimeout(() => {
                onGameOver(finalScore, finalCoins, finalPlayer2Score)
              }, 50)
            }
          } else {
            // Player 2 dead but Player 1 still alive - continue game (player 2 ship will disappear/ghost)
            console.log('💀 Player 2 died, but Player 1 is still alive. Game continues...')
          }
        }
        return false
      }
      
      return true
    })
  }, [onGameOver, score, shipStats, isMultiplayer, roomData, setScore, setGameOver])

  // Reset game state when gameOver changes from true to false (new game started)
  useEffect(() => {
    if (!gameOver) {
      // Reset coins when new game starts
      coinsCollectedRef.current = 0
      setCoins(0)
      // Reset other game state
      setScore(0)
      scoreRef.current = 0
      player2ScoreRef.current = 0
      gameOverCalledRef.current = false
      playerHealthRef.current = playerMaxHealthRef.current
      player2HealthRef.current = 100
      // Clear all game objects
      bulletsRef.current = []
      enemyBulletsRef.current = []
      enemiesRef.current = []
      powerUpsRef.current = []
      coinsRef.current = []
      // Reset power-up effects
      shieldActiveRef.current = false
      tripleShotActiveRef.current = false
      laserActiveRef.current = false
      // Reset multiplayer state
      setGameStateInitialized(false)
      lastInputSendRef.current = 0
      lastStateUpdateRef.current = 0
      // PERBAIKAN: Clear game logic interval
      if (gameLogicIntervalRef.current) {
        clearInterval(gameLogicIntervalRef.current)
        gameLogicIntervalRef.current = null
      }
      // Leave WebSocket room
      if (socketRef.current && roomCode) {
        socketRef.current.emit('leave-room', { roomCode })
      }
    }
  }, [gameOver, roomCode])

  // REST API polling untuk multiplayer (FALLBACK - lebih reliable)
  // Sync: position, health, bullets, ship images
  useEffect(() => {
    if (!isMultiplayer || !roomCode || !address) {
      return
    }
    
    console.log('🔌 Starting REST API multiplayer sync...', { roomCode, address, isHost })
    
    // Poll other players' data (position, health, bullets, ship)
    const pollInterval = setInterval(async () => {
      try {
        const response = await axios.get(
          `${API_URL}/api/multiplayer/get-players/${roomCode}/${address}`
        )
        
        if (response.data.success && response.data.players) {
          response.data.players.forEach((player: any) => {
            if (player.address === roomData?.hostAddress && !isHost) {
              // Guest melihat host data
              if (player.x !== undefined && player.y !== undefined) {
                playerRef.current.x = player.x
                playerRef.current.y = player.y
              }
              if (player.health !== undefined) {
                playerHealthRef.current = player.health
              }
              if (player.score !== undefined) {
                scoreRef.current = player.score
                setScore(player.score)
              }
              if (player.coins !== undefined) {
                coinsCollectedRef.current = player.coins
                setCoins(player.coins)
              }
              if (player.bullets && Array.isArray(player.bullets)) {
                // Merge bullets dari player lain (filter bullets yang sudah ada)
                const existingBulletIds = new Set(bulletsRef.current.map(b => b.id))
                const newBullets = player.bullets
                  .filter((b: any) => !existingBulletIds.has(b.id))
                  .map((b: any) => ({
                    id: b.id,
                    x: b.x,
                    y: b.y,
                    width: 10,
                    height: 20,
                    speed: 12,
                    damage: shipStats.attack,
                    playerId: 'host'
                  }))
                bulletsRef.current.push(...newBullets)
              }
              // Update ship image dari player lain (host)
              if (player.shipImage && player.shipImage !== shipImageRef.current?.src) {
                const img = new Image()
                img.src = player.shipImage
                img.onload = () => {
                  shipImageRef.current = img
                  console.log('✅ Updated Player 1 (host) ship image from sync:', player.shipImage)
                }
                img.onerror = () => {
                  console.warn('⚠️ Failed to load Player 1 ship image from sync:', player.shipImage)
                }
              }
            } else if (player.address === roomData?.guestAddress && isHost) {
              // Host melihat guest data
              if (player.x !== undefined && player.y !== undefined) {
                player2Ref.current.x = player.x
                player2Ref.current.y = player.y
              }
              if (player.health !== undefined) {
                player2HealthRef.current = player.health
              }
              if (player.score !== undefined) {
                player2ScoreRef.current = player.score
              }
              if (player.coins !== undefined) {
                player2CoinsRef.current = player.coins
              }
              if (player.bullets && Array.isArray(player.bullets)) {
                // Merge bullets dari player lain
                const existingBulletIds = new Set(bulletsRef.current.map(b => b.id))
                const newBullets = player.bullets
                  .filter((b: any) => !existingBulletIds.has(b.id))
                  .map((b: any) => ({
                    id: b.id,
                    x: b.x,
                    y: b.y,
                    width: 10,
                    height: 20,
                    speed: 12,
                    damage: shipStats.attack,
                    playerId: 'guest'
                  }))
                bulletsRef.current.push(...newBullets)
              }
              // Update ship image dari player lain (guest)
              if (player.shipImage && player.shipImage !== player2ShipImageRef.current?.src) {
                const img = new Image()
                img.src = player.shipImage
                img.onload = () => {
                  player2ShipImageRef.current = img
                  console.log('✅ Updated Player 2 (guest) ship image from sync:', player.shipImage)
                }
                img.onerror = () => {
                  console.warn('⚠️ Failed to load Player 2 ship image from sync:', player.shipImage)
                }
              }
            }
          })
        }
      } catch (error) {
        // Silent error - polling will retry
      }
    }, 50) // Poll setiap 50ms (~20fps) untuk sync
    
    // Send own data (position, health, bullets, ship)
    const sendInterval = setInterval(async () => {
      const isHostPlayer = isHost && address === roomData?.hostAddress
      const isGuestPlayer = !isHost && address === roomData?.guestAddress
      
      if (!isHostPlayer && !isGuestPlayer) return
      
      let x, y, health, bullets, shipImage, shipRarity, score, coins
      if (isHostPlayer) {
        x = playerRef.current.x
        y = playerRef.current.y
        health = playerHealthRef.current
        score = scoreRef.current
        coins = coinsCollectedRef.current
        // Send only own bullets (filter bullets yang baru dibuat)
        const ownBullets = bulletsRef.current
          .filter(b => (b as any).playerId === 'host') // Only own bullets
          .map(b => ({ id: b.id, x: b.x, y: b.y }))
        const bulletsKey = JSON.stringify(ownBullets)
        if (bulletsKey !== lastSentBulletsRef.current.host) {
          bullets = ownBullets
          lastSentBulletsRef.current.host = bulletsKey
        }
        // PERBAIKAN: Prioritaskan roomData.hostShip untuk sinkronisasi
        shipImage = shipImageRef.current?.src || roomData?.hostShip?.image || shipImage
        shipRarity = roomData?.hostShip?.rarity || shipRarity
      } else if (isGuestPlayer) {
        x = player2Ref.current.x
        y = player2Ref.current.y
        health = player2HealthRef.current
        score = player2ScoreRef.current
        coins = player2CoinsRef.current
        // Send only own bullets (filter bullets yang baru dibuat)
        const ownBullets = bulletsRef.current
          .filter(b => (b as any).playerId === 'guest') // Only own bullets
          .map(b => ({ id: b.id, x: b.x, y: b.y }))
        const bulletsKey = JSON.stringify(ownBullets)
        if (bulletsKey !== lastSentBulletsRef.current.guest) {
          bullets = ownBullets
          lastSentBulletsRef.current.guest = bulletsKey
        }
        shipImage = player2ShipImageRef.current?.src || roomData?.guestShip?.image
        shipRarity = roomData?.guestShip?.rarity
      }
      
      try {
        await axios.post(`${API_URL}/api/multiplayer/update-player`, {
          roomCode,
          address,
          x,
          y,
          health,
          bullets,
          shipImage,
          shipRarity,
          score,
          coins
        })
      } catch (error) {
        // Silent error
      }
    }, 50) // Send setiap 50ms
    
    return () => {
      clearInterval(pollInterval)
      clearInterval(sendInterval)
      console.log('🔌 Stopped REST API multiplayer sync')
    }
  }, [isMultiplayer, roomCode, address, isHost, roomData, shipImage, shipRarity, shipStats.attack])
  
  // Initialize WebSocket connection untuk multiplayer (OPTIONAL - fallback ke REST)
  useEffect(() => {
    if (!isMultiplayer || !roomCode || !address) {
      return
    }
    
    // Try WebSocket, but don't fail if it doesn't work
    try {
      console.log('🔌 Trying WebSocket connection...', { roomCode, address, isHost })
      const socket = getSocket()
      socketRef.current = socket
    } catch (error) {
      console.warn('⚠️ WebSocket failed, using REST API only:', error)
      return
    }
    
    const socket = socketRef.current
    if (!socket) return
    
    // Wait for connection, then join room
    if (socket.connected) {
      socket.emit('join-room', { roomCode, address, isHost })
      console.log('✅ WebSocket joined room immediately:', { roomCode, address, isHost })
    } else {
      socket.on('connect', () => {
        socket.emit('join-room', { roomCode, address, isHost })
        console.log('✅ WebSocket joined room after connect:', { roomCode, address, isHost })
      })
    }
    
    // Listen for real-time player movement from other players
    const handlePlayerMovement = ({ address: playerAddress, input }: any) => {
      if (playerAddress === address) return // Ignore own movement
      
      console.log('🎮 Received player movement:', { playerAddress, input })
      
      // Apply movement immediately for real-time feel
      if (playerAddress === roomData?.hostAddress && !isHost) {
        // Guest receiving host movement - update Player 1
        const player = playerRef.current
        const speed = shipStats.speed
        
        if (input.left) player.x = Math.max(0, player.x - speed)
        if (input.right) player.x = Math.min(window.innerWidth - player.width, player.x + speed)
        if (input.up) player.y = Math.max(0, player.y - speed)
        if (input.down) player.y = Math.min(window.innerHeight - player.height, player.y + speed)
        
      } else if (playerAddress === roomData?.guestAddress && isHost) {
        // Host receiving guest movement - update Player 2
        const player2 = player2Ref.current
        const speed = shipStats.speed
        
        if (input.left) player2.x = Math.max(0, player2.x - speed)
        if (input.right) player2.x = Math.min(window.innerWidth - player2.width, player2.x + speed)
        if (input.up) player2.y = Math.max(0, player2.y - speed)
        if (input.down) player2.y = Math.min(window.innerHeight - player2.height, player2.y + speed)
      }
    }
    
    // Listen for room events
    const handleRoomStatus = ({ playersCount }: any) => {
      console.log('👥 Room status:', { playersCount })
    }
    
    const handlePlayerJoined = ({ address: joinedAddress, isHost: joinedIsHost, playersCount }: any) => {
      console.log('👤 Player joined:', { joinedAddress, joinedIsHost, playersCount })
    }
    
    const handlePlayerLeft = ({ address: leftAddress, playersCount }: any) => {
      console.log('👋 Player left:', { leftAddress, playersCount })
    }
    
    // Register event listeners
    socket.on('player-movement', handlePlayerMovement)
    socket.on('room-status', handleRoomStatus)
    socket.on('player-joined', handlePlayerJoined)
    socket.on('player-left', handlePlayerLeft)
    
    // Cleanup: leave room on unmount
    return () => {
      if (socketRef.current && roomCode) {
        console.log('🔌 Leaving WebSocket room:', roomCode)
        socketRef.current.emit('leave-room', { roomCode })
        
        // Remove event listeners
        socketRef.current.off('player-movement', handlePlayerMovement)
        socketRef.current.off('room-status', handleRoomStatus)
        socketRef.current.off('player-joined', handlePlayerJoined)
        socketRef.current.off('player-left', handlePlayerLeft)
      }
    }
  }, [isMultiplayer, roomCode, address, isHost, roomData, shipStats])

  // Initialize game state for multiplayer
  useEffect(() => {
    if (isMultiplayer && roomCode && address && roomData && !gameStateInitialized && !gameOver) {
      initializeGameState()
    }
  }, [isMultiplayer, roomCode, address, roomData, gameStateInitialized, gameOver, initializeGameState])

  // WebSocket event listeners setup (REAL-TIME MULTIPLAYER)
  useEffect(() => {
    if (!isMultiplayer || !roomCode || !gameStateInitialized || !address) {
      console.log('⚠️ WebSocket setup skipped:', {
        isMultiplayer,
        roomCode,
        gameStateInitialized,
        address
      })
      return
    }
    
    // Check if WebSocket is available
    if (!socketRef.current) {
      console.warn('⚠️ WebSocket not available, game will run in local mode')
      return
    }
    
    // Check if WebSocket is connected
    if (!socketRef.current.connected) {
      console.warn('⚠️ WebSocket not connected, waiting for connection...')
      // Game will still run locally, WebSocket will sync when connected
    }
    
    const socket = socketRef.current
    
    // SEMUA player: Kirim input ke server setiap frame (jika WebSocket connected)
    let inputInterval: NodeJS.Timeout | null = null
    if (!gameOver) {
      console.log(`✅ ${isHost ? 'Host' : 'Guest'}: Starting input sending`, {
        roomCode,
        address,
        isHost,
        hasSocket: !!socketRef.current,
        socketConnected: socketRef.current?.connected
      })
      inputInterval = setInterval(() => {
        sendInput() // Will check WebSocket connection inside
      }, 16) // ~60fps
    } else {
      console.log('⚠️ Input sending skipped: game over')
    }
    
    // SEMUA player: Terima game state dari server
    const handleGameState = (gameState: any) => {
      console.log(`📥 ${isHost ? 'Host' : 'Guest'}: Received game state from server`, {
        players: gameState?.players?.length || 0,
        tick: gameState?.tick
      })
      handleGameStateUpdate(gameState)
    }
    
    socket.on('game-state', handleGameState)
    console.log(`👂 ${isHost ? 'Host' : 'Guest'}: Listening for game-state events`)
    
    // Start game di server saat game initialized (hanya host yang start)
    if (roomData?.hostAddress && roomData?.guestAddress && isHost && !gameStartedOnServerRef.current) {
      const canvas = canvasRef.current
      const canvasWidth = canvas ? canvas.width : window.innerWidth
      const canvasHeight = canvas ? canvas.height : window.innerHeight
      
      const players = [
        { address: roomData.hostAddress, speed: shipStats.speed, fireRate: shipStats.fireRate },
        { address: roomData.guestAddress, speed: shipStats.speed, fireRate: shipStats.fireRate }
      ]
      
      console.log('🎮 Host: Starting multiplayer game on server...', { canvasWidth, canvasHeight, roomCode, players: players.length })
      
      gameStartedOnServerRef.current = true
      socket.emit('start-game', {
        roomCode,
        players,
        canvasWidth,
        canvasHeight
      })
    } else {
      console.log('⚠️ Game start skipped:', {
        hasHostAddress: !!roomData?.hostAddress,
        hasGuestAddress: !!roomData?.guestAddress,
        isHost,
        gameStarted: gameStartedOnServerRef.current
      })
    }
    
    // Listen for game-started event from server
    const handleGameStarted = ({ roomCode: startedRoomCode, initialState }: any) => {
      console.log('✅ Game started on server:', { startedRoomCode, initialState })
      
      // Set initial positions from server
      if (initialState && initialState.players) {
        initialState.players.forEach((player: any) => {
          if (player.address === roomData?.hostAddress) {
            // Update Player 1 (host) position
            playerRef.current.x = player.x
            playerRef.current.y = player.y
          } else if (player.address === roomData?.guestAddress) {
            // Update Player 2 (guest) position
            player2Ref.current.x = player.x
            player2Ref.current.y = player.y
          }
        })
        console.log('🎯 Initial positions set from server')
      }
    }
    socket.on('game-started', handleGameStarted)
    
    return () => {
      socket.off('game-state', handleGameState)
      socket.off('game-started', handleGameStarted)
      if (inputInterval) clearInterval(inputInterval)
      // Stop game di server saat unmount (hanya host)
      if (isHost && gameStartedOnServerRef.current) {
        socket.emit('stop-game', { roomCode })
        gameStartedOnServerRef.current = false
      }
    }
  }, [isMultiplayer, roomCode, isHost, gameStateInitialized, gameOver, sendInput, handleGameStateUpdate, address, roomData, shipStats])

  // REMOVED: Host tidak perlu kirim game state lagi
  // Server yang menghitung dan mengirim game state ke semua player
  // useEffect untuk host game state updates dihapus karena server authoritative

  // PERBAIKAN: Game logic loop (tetap berjalan meskipun tab hidden)
  // Ini penting untuk multiplayer agar host tetap update state meskipun tab hidden
  useEffect(() => {
    if (gameOver || isPaused) {
      // Clear game logic interval jika game over atau paused
      if (gameLogicIntervalRef.current) {
        clearInterval(gameLogicIntervalRef.current)
        gameLogicIntervalRef.current = null
      }
      return
    }
    
    // PERBAIKAN: Game logic menggunakan setInterval (tetap berjalan saat tab hidden)
    // Ini berbeda dengan rendering yang menggunakan requestAnimationFrame (berhenti saat tab hidden)
    const gameLogicLoop = () => {
      if (isMultiplayer) {
        // Multiplayer: ALWAYS run ALL local game logic for responsiveness
        // WebSocket hanya untuk sync posisi player, BUKAN untuk game logic
        // Semua enemies, bullets, collisions di-handle secara lokal
        
        // Update player movement (client-side prediction)
        updatePlayer() // Local movement untuk responsiveness (includes auto-fire)
        
        // Update game elements (local untuk smoothness)
        updateBullets() // Local bullet movement
        updateEnemyBullets() // Local enemy bullet movement
        updateEnemies() // Local enemy movement
        updatePowerUps() // Local power-up movement
        updateCoins() // Local coin movement
        
        // SELALU spawn dan check collisions secara lokal (tidak tergantung WebSocket)
        spawnEnemy() // Spawn enemies locally
        spawnPowerUp() // Spawn power-ups locally
        spawnCoin() // Spawn coins locally
        checkPowerUpCollection() // Check power-up collection locally
        checkCoinCollection() // Check coin collection locally
        checkCollisions() // Check collisions locally (bullets vs enemies, enemies vs players)
        
        return
      }
      
      // Solo mode: calculate all game logic locally
      updatePlayer()
      updateBullets()
      updateEnemyBullets()
      spawnEnemy()
      updateEnemies()
      spawnPowerUp()
      updatePowerUps()
      checkPowerUpCollection()
      spawnCoin()
      updateCoins()
      checkCoinCollection()
      checkCollisions()
    }
    
    // PERBAIKAN: Gunakan setInterval untuk game logic (tetap berjalan saat tab hidden)
    // Interval 16ms = ~60fps untuk game logic
    gameLogicIntervalRef.current = setInterval(gameLogicLoop, 16) as any
    
    return () => {
      if (gameLogicIntervalRef.current) {
        clearInterval(gameLogicIntervalRef.current)
        gameLogicIntervalRef.current = null
      }
    }
  }, [gameOver, isPaused, isMultiplayer, updatePlayer, updateBullets, updateEnemyBullets, spawnEnemy, updateEnemies, spawnPowerUp, updatePowerUps, checkPowerUpCollection, spawnCoin, updateCoins, checkCoinCollection, checkCollisions])

  // PERBAIKAN: Rendering loop (hanya render saat tab visible atau multiplayer)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    
    // Set player initial position only once (don't reset after collision)
    if (playerInitialXRef.current === null) {
      console.log('🎮 Setting initial player positions:', { isMultiplayer, isHost, hasGuest: !!roomData?.guestAddress })
      
      if (isMultiplayer && roomData?.guestAddress) {
        // Multiplayer: Player 1 (host) on left, Player 2 (guest) on right
        if (isHost) {
          // Host: Player 1 on left
          playerRef.current.x = 300
          playerRef.current.y = canvas.height - playerRef.current.height - 50
          // Guest: Player 2 on right
          player2Ref.current.x = canvas.width - 500
          player2Ref.current.y = canvas.height - player2Ref.current.height - 50
        } else {
          // Guest: Player 1 (host) on left (will be updated from backend), Player 2 (guest) on right
          playerRef.current.x = 300
          playerRef.current.y = canvas.height - playerRef.current.height - 50
          player2Ref.current.x = canvas.width - 500
          player2Ref.current.y = canvas.height - player2Ref.current.height - 50
        }
        console.log('✅ Multiplayer positions set - Player 1:', playerRef.current.x, playerRef.current.y, 'Player 2:', player2Ref.current.x, player2Ref.current.y)
      } else {
        // Solo: Player in center
        playerRef.current.x = canvas.width / 2 - playerRef.current.width / 2
        playerRef.current.y = canvas.height - playerRef.current.height - 50
        console.log('✅ Solo position set - Player 1:', playerRef.current.x, playerRef.current.y)
      }
      playerInitialXRef.current = playerRef.current.x
      playerInitialYRef.current = playerRef.current.y
    }

    const renderLoop = () => {
      // Get current time once for the entire frame
      const now = Date.now()
      
      // PERBAIKAN: Skip rendering jika tab hidden (tapi tetap lanjutkan loop untuk keep-alive)
      // Game logic sudah di-handle oleh gameLogicInterval yang tetap berjalan
      if (document.hidden && !isMultiplayer) {
        // Solo mode: skip rendering saat tab hidden (hemat resource)
        animationFrameRef.current = requestAnimationFrame(renderLoop)
        return
      }
      
      // PERBAIKAN: Multiplayer mode: tetap render meskipun tab hidden (agar guest tetap lihat game)
      // Tapi kita bisa optimize dengan mengurangi frame rate saat tab hidden
      
      if (gameOver || isPaused) {
        if (gameOver) {
          // Semi-transparent overlay untuk game over (biarkan background space terlihat)
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.fillStyle = '#ffffff'
          ctx.font = '48px Arial'
          ctx.textAlign = 'center'
          ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 80)
          ctx.font = '24px Arial'
          ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2 - 20)
          ctx.font = '24px Arial'
          ctx.fillStyle = '#ffd700'
          ctx.fillText(`💰 Coins Collected: ${coins}`, canvas.width / 2, canvas.height / 2 + 20)
        }
        animationFrameRef.current = requestAnimationFrame(renderLoop)
        return
      }

      // Clear canvas dengan transparent (biarkan background space terlihat)
      // Background space dengan bintang dan shooting stars akan terlihat di belakang
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // PERBAIKAN: Game logic sudah di-handle oleh gameLogicInterval
      // Di sini hanya rendering (drawing) saja

      // Draw player 1 (alive or dead - if dead, draw as ghost)
      const player = playerRef.current
      if (player) {
        const isPlayer1Alive = playerHealthRef.current > 0
        
        // Draw shield effect if active (only if alive)
        if (isPlayer1Alive) {
          const isShieldActive = shieldActiveRef.current && now < shieldEndTimeRef.current
          
          if (isShieldActive) {
            // Draw shield aura (lingkaran biru transparan)
            ctx.save()
            const shieldRadius = Math.max(player.width, player.height) / 2 + 10
            const shieldCenterX = player.x + player.width / 2
            const shieldCenterY = player.y + player.height / 2
            
            const shieldGradient = ctx.createRadialGradient(
              shieldCenterX, shieldCenterY, 0,
              shieldCenterX, shieldCenterY, shieldRadius
            )
            shieldGradient.addColorStop(0, 'rgba(0, 150, 255, 0.6)')
            shieldGradient.addColorStop(0.5, 'rgba(0, 150, 255, 0.3)')
            shieldGradient.addColorStop(1, 'rgba(0, 150, 255, 0.1)')
            
            ctx.fillStyle = shieldGradient
            ctx.beginPath()
            ctx.arc(shieldCenterX, shieldCenterY, shieldRadius, 0, Math.PI * 2)
            ctx.fill()
            
            ctx.strokeStyle = '#0096ff'
            ctx.lineWidth = 3
            ctx.beginPath()
            ctx.arc(shieldCenterX, shieldCenterY, shieldRadius, 0, Math.PI * 2)
            ctx.stroke()
            ctx.restore()
          }
        }
        
        // Draw player 1 ship (with ghost effect if dead)
        ctx.save()
        if (!isPlayer1Alive) {
          // Ghost effect: samar-samar (transparent) dan tidak bisa bergerak
          ctx.globalAlpha = 0.3 // Sangat transparan
        } else {
          ctx.globalAlpha = 1.0
        }
        
        if (shipImageRef.current) {
          try {
            // PERBAIKAN: Debug logging untuk verify ship image yang digunakan
            const currentShipImageSrc = shipImageRef.current.src
            const expectedRarity = isMultiplayer && roomData?.hostShip?.rarity ? roomData.hostShip.rarity : actualShipRarity
            if (currentShipImageSrc.includes('classic') && expectedRarity !== 'Classic') {
              console.warn('⚠️ Player 1: Rendering Classic ship but expected:', expectedRarity, 'image src:', currentShipImageSrc)
            }
            ctx.drawImage(shipImageRef.current, player.x, player.y, player.width, player.height)
          } catch (err) {
            ctx.beginPath()
            ctx.moveTo(player.x + player.width / 2, player.y)
            ctx.lineTo(player.x, player.y + player.height)
            ctx.lineTo(player.x + player.width, player.y + player.height)
            ctx.closePath()
            ctx.fillStyle = !isPlayer1Alive ? '#666666' : '#0066ff'
            ctx.fill()
          }
        } else {
          ctx.beginPath()
          ctx.moveTo(player.x + player.width / 2, player.y)
          ctx.lineTo(player.x, player.y + player.height)
          ctx.lineTo(player.x + player.width, player.y + player.height)
          ctx.closePath()
          ctx.fillStyle = !isPlayer1Alive ? '#666666' : '#0066ff'
          ctx.fill()
        }
        
        ctx.restore()
        
        // Draw player label for multiplayer
        if (isMultiplayer) {
          ctx.fillStyle = !isPlayer1Alive ? '#888888' : '#ffffff'
          ctx.font = '12px Arial'
          ctx.textAlign = 'center'
          ctx.fillText(!isPlayer1Alive ? 'Player 1 (DEAD)' : 'Player 1', player.x + player.width / 2, player.y - 10)
        }
      }
      
      // Draw player 2 (guest) in multiplayer mode (alive or dead - if dead, draw as ghost)
      if (isMultiplayer && roomData?.guestAddress) {
        const player2 = player2Ref.current
        if (player2) {
          const isPlayer2Alive = player2HealthRef.current > 0
          
          // Ensure player 2 has valid position (set default if not set)
          if (player2.x === 0 && player2.y === 0) {
            // Set default position for player 2 (right side)
            player2.x = canvas.width - 500
            player2.y = canvas.height - player2.height - 50
          }
          
          // Draw shield effect if active (only if alive)
          if (isPlayer2Alive) {
            const isPlayer2ShieldActive = player2ShieldActiveRef.current && now < player2ShieldEndTimeRef.current
            
            if (isPlayer2ShieldActive) {
              // Draw shield aura for player 2
              ctx.save()
              const shieldRadius = Math.max(player2.width, player2.height) / 2 + 10
              const shieldCenterX = player2.x + player2.width / 2
              const shieldCenterY = player2.y + player2.height / 2
              
              const shieldGradient = ctx.createRadialGradient(
                shieldCenterX, shieldCenterY, 0,
                shieldCenterX, shieldCenterY, shieldRadius
              )
              shieldGradient.addColorStop(0, 'rgba(0, 255, 150, 0.6)')
              shieldGradient.addColorStop(0.5, 'rgba(0, 255, 150, 0.3)')
              shieldGradient.addColorStop(1, 'rgba(0, 255, 150, 0.1)')
              
              ctx.fillStyle = shieldGradient
              ctx.beginPath()
              ctx.arc(shieldCenterX, shieldCenterY, shieldRadius, 0, Math.PI * 2)
              ctx.fill()
              
              ctx.strokeStyle = '#00ff96'
              ctx.lineWidth = 3
              ctx.beginPath()
              ctx.arc(shieldCenterX, shieldCenterY, shieldRadius, 0, Math.PI * 2)
              ctx.stroke()
              ctx.restore()
            }
          }
          
          // Draw player 2 ship (with ghost effect if dead)
          ctx.save()
          if (!isPlayer2Alive) {
            // Ghost effect: samar-samar (transparent) dan tidak bisa bergerak
            ctx.globalAlpha = 0.3 // Sangat transparan
          } else {
            ctx.globalAlpha = 0.9
          }
          
          // PERBAIKAN: Gunakan Player 2 ship image (bukan Player 1 ship image)
          const player2ShipImg = player2ShipImageRef.current || shipImageRef.current // Fallback ke Player 1 image jika Player 2 image tidak ada
          if (player2ShipImg) {
            try {
              // PERBAIKAN: Debug logging untuk verify ship image yang digunakan
              const currentShipImageSrc = player2ShipImg.src
              const expectedRarity = isMultiplayer && roomData?.guestShip?.rarity ? roomData.guestShip.rarity : 'Classic'
              if (currentShipImageSrc.includes('classic') && expectedRarity !== 'Classic') {
                console.warn('⚠️ Player 2: Rendering Classic ship but expected:', expectedRarity, 'image src:', currentShipImageSrc)
              }
              ctx.drawImage(player2ShipImg, player2.x, player2.y, player2.width, player2.height)
            } catch (err) {
              ctx.beginPath()
              ctx.moveTo(player2.x + player2.width / 2, player2.y)
              ctx.lineTo(player2.x, player2.y + player2.height)
              ctx.lineTo(player2.x + player2.width, player2.y + player2.height)
              ctx.closePath()
              ctx.fillStyle = !isPlayer2Alive ? '#666666' : '#00ff00' // PERBAIKAN: Player 2 warna hijau (beda dengan Player 1 biru)
              ctx.fill()
            }
          } else {
            ctx.beginPath()
            ctx.moveTo(player2.x + player2.width / 2, player2.y)
            ctx.lineTo(player2.x, player2.y + player2.height)
            ctx.lineTo(player2.x + player2.width, player2.y + player2.height)
            ctx.closePath()
            ctx.fillStyle = !isPlayer2Alive ? '#666666' : '#00ff00' // PERBAIKAN: Player 2 warna hijau (beda dengan Player 1 biru)
            ctx.fill()
          }
          
          ctx.restore()
          
          // Draw player 2 label
          ctx.fillStyle = !isPlayer2Alive ? '#888888' : '#ffffff'
          ctx.font = '12px Arial'
          ctx.textAlign = 'center'
          ctx.fillText(!isPlayer2Alive ? 'Player 2 (DEAD)' : 'Player 2', player2.x + player2.width / 2, player2.y - 10)
        }
      }
      
      // Draw laser beam for player 1 (continuous beam dari player ke atas) - only if player 1 alive
      // Note: 'now' already declared at the beginning of renderLoop
      if (playerHealthRef.current > 0) {
        const isLaserActive = laserActiveRef.current && now < laserEndTimeRef.current
        if (isLaserActive && player) {
          const laserX = player.x + player.width / 2
          const laserWidth = 8
          const laserStartY = player.y
          const laserEndY = 0
          
          // Draw laser beam dengan glow effect
          ctx.save()
          
          // Outer glow
          const gradient = ctx.createLinearGradient(laserX - laserWidth, laserStartY, laserX + laserWidth, laserStartY)
          gradient.addColorStop(0, 'rgba(255, 0, 0, 0.3)')
          gradient.addColorStop(0.5, 'rgba(255, 0, 0, 0.8)')
          gradient.addColorStop(1, 'rgba(255, 0, 0, 0.3)')
          
          ctx.fillStyle = gradient
          ctx.fillRect(laserX - laserWidth, laserEndY, laserWidth * 2, laserStartY - laserEndY)
          
          // Core laser (bright red)
          ctx.fillStyle = '#ff0000'
          ctx.fillRect(laserX - 3, laserEndY, 6, laserStartY - laserEndY)
          
          // Inner bright core
          ctx.fillStyle = '#ff6666'
          ctx.fillRect(laserX - 1, laserEndY, 2, laserStartY - laserEndY)
          
          // Glow effect
          ctx.shadowBlur = 15
          ctx.shadowColor = '#ff0000'
          ctx.fillRect(laserX - 2, laserEndY, 4, laserStartY - laserEndY)
          
          ctx.restore()
        }
      }
      
      // Draw laser beam for player 2 (continuous beam dari player ke atas) - only if player 2 alive
      if (isMultiplayer && roomData?.guestAddress && player2HealthRef.current > 0) {
        const player2 = player2Ref.current
        const isPlayer2LaserActive = player2LaserActiveRef.current && now < player2LaserEndTimeRef.current
        if (isPlayer2LaserActive && player2) {
          const laserX = player2.x + player2.width / 2
          const laserWidth = 8
          const laserStartY = player2.y
          const laserEndY = 0
          
          // Draw laser beam dengan glow effect (green for player 2)
          ctx.save()
          
          // Outer glow
          const gradient = ctx.createLinearGradient(laserX - laserWidth, laserStartY, laserX + laserWidth, laserStartY)
          gradient.addColorStop(0, 'rgba(0, 255, 150, 0.3)')
          gradient.addColorStop(0.5, 'rgba(0, 255, 150, 0.8)')
          gradient.addColorStop(1, 'rgba(0, 255, 150, 0.3)')
          
          ctx.fillStyle = gradient
          ctx.fillRect(laserX - laserWidth, laserEndY, laserWidth * 2, laserStartY - laserEndY)
          
          // Core laser (bright green)
          ctx.fillStyle = '#00ff96'
          ctx.fillRect(laserX - 3, laserEndY, 6, laserStartY - laserEndY)
          
          // Inner bright core
          ctx.fillStyle = '#66ffb3'
          ctx.fillRect(laserX - 1, laserEndY, 2, laserStartY - laserEndY)
          
          // Glow effect
          ctx.shadowBlur = 15
          ctx.shadowColor = '#00ff96'
          ctx.fillRect(laserX - 2, laserEndY, 4, laserStartY - laserEndY)
          
          ctx.restore()
        }
      }
      
      // Draw player bullets (normal bullets dan triple shot)
      bulletsRef.current.forEach(bullet => {
        // Normal bullet (yellow)
        ctx.fillStyle = '#ffff00'
        ctx.shadowBlur = 4
        ctx.shadowColor = '#ffff00'
        ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height)
      })
      ctx.shadowBlur = 0

      // Draw enemy bullets with effects
      enemyBulletsRef.current.forEach(bullet => {
        ctx.fillStyle = bullet.color
        ctx.beginPath()
        ctx.arc(bullet.x + bullet.width / 2, bullet.y + bullet.height / 2, bullet.width / 2, 0, Math.PI * 2)
        ctx.fill()
        
        // Add glow effect for boss bullets
        if (bullet.color === '#1a1a2e') {
          // Octopus ink effect
          ctx.shadowBlur = 10
          ctx.shadowColor = '#1a1a2e'
          ctx.fill()
          ctx.shadowBlur = 0
        } else if (bullet.color === '#8b00ff') {
          // Purple effect
          ctx.shadowBlur = 10
          ctx.shadowColor = '#8b00ff'
          ctx.fill()
          ctx.shadowBlur = 0
        }
      })

      // Draw enemies (with better fallback to avoid red boxes)
      enemiesRef.current.forEach(enemy => {
        // Try to draw image, but always have a fallback
        let imageDrawn = false
        
        // Try to draw image for ALL enemy types (including enemy1 and enemy2)
        // Use gradient fallback only if image is not available or failed to load
        const enemyImage = enemyImagesRef.current[enemy.type]
        if (enemyImage && enemyImage.complete && enemyImage.naturalWidth > 0 && enemyImage.naturalHeight > 0) {
          try {
            ctx.drawImage(enemyImage, enemy.x, enemy.y, enemy.width, enemy.height)
            imageDrawn = true
          } catch (err) {
            // Image draw failed, use gradient fallback
            imageDrawn = false
          }
        }
        
        // Draw gradient fallback if image is not available (use non-red colors for enemy1/enemy2)
        if (!imageDrawn) {
          // Create gradient for better appearance (no red colors to avoid red boxes)
          const gradient = ctx.createLinearGradient(enemy.x, enemy.y, enemy.x + enemy.width, enemy.y + enemy.height)
          
          // Determine gradient colors based on enemy type (NO RED COLORS)
          if (enemy.type.includes('boss')) {
            gradient.addColorStop(0, '#4b0082') // Dark purple
            gradient.addColorStop(0.5, '#8b00ff') // Purple
            gradient.addColorStop(1, '#ff00ff') // Magenta
          } else if (enemy.type.includes('level2')) {
            gradient.addColorStop(0, '#cc6600') // Dark orange
            gradient.addColorStop(0.5, '#ff6600') // Orange
            gradient.addColorStop(1, '#ffaa00') // Light orange
          } else if (enemy.type.includes('level1')) {
            gradient.addColorStop(0, '#ff7700') // Orange
            gradient.addColorStop(0.5, '#ff8800') // Yellow-orange
            gradient.addColorStop(1, '#ffcc00') // Yellow
          } else if (enemy.type === 'enemy2') {
            // Enemy2: Use bright cyan-blue gradient (NO RED)
            gradient.addColorStop(0, '#0066cc') // Dark blue
            gradient.addColorStop(0.5, '#0088ff') // Bright blue
            gradient.addColorStop(1, '#00aaff') // Light cyan
          } else {
            // Enemy1: Use cyan gradient (NO RED - completely different from red)
            gradient.addColorStop(0, '#0099cc') // Dark cyan
            gradient.addColorStop(0.5, '#00ccff') // Cyan
            gradient.addColorStop(1, '#66ffff') // Light cyan
          }
          
          ctx.fillStyle = gradient
          
          // Draw enemy as rounded rectangle
          const radius = Math.min(10, enemy.width / 8)
          const x = enemy.x
          const y = enemy.y
          const w = enemy.width
          const h = enemy.height
          
          ctx.beginPath()
          ctx.moveTo(x + radius, y)
          ctx.lineTo(x + w - radius, y)
          ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
          ctx.lineTo(x + w, y + h - radius)
          ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
          ctx.lineTo(x + radius, y + h)
          ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
          ctx.lineTo(x, y + radius)
          ctx.quadraticCurveTo(x, y, x + radius, y)
          ctx.closePath()
          ctx.fill()
          
          // Add border for visibility
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2
          ctx.stroke()
        }
        
        // Draw enemy health bar (if enemy has taken damage)
        if (enemy.maxHealth && enemy.health !== undefined && enemy.health < enemy.maxHealth && enemy.health > 0) {
          const enemyHealthBarWidth = enemy.width
          const enemyHealthBarHeight = 5
          const enemyHealthBarX = enemy.x
          const enemyHealthBarY = enemy.y - 10
          const enemyHealthPercent = Math.max(0, enemy.health / enemy.maxHealth)
          
          // Health bar background
          ctx.fillStyle = '#333333'
          ctx.fillRect(enemyHealthBarX, enemyHealthBarY, enemyHealthBarWidth, enemyHealthBarHeight)
          
          // Health bar fill
          ctx.fillStyle = enemyHealthPercent > 0.5 ? '#00ff00' : enemyHealthPercent > 0.25 ? '#ffaa00' : '#ff0000'
          ctx.fillRect(enemyHealthBarX, enemyHealthBarY, enemyHealthBarWidth * enemyHealthPercent, enemyHealthBarHeight)
          
          // Health bar border
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1
          ctx.strokeRect(enemyHealthBarX, enemyHealthBarY, enemyHealthBarWidth, enemyHealthBarHeight)
        }

        // Draw pulsing red aura for enemylevel2
        if (enemy.type === 'enemylevel2' && enemy.auraRadius !== undefined) {
          const enemyCenterX = enemy.x + enemy.width / 2
          const enemyCenterY = enemy.y + enemy.height / 2
          
          // Draw pulsing red aura (lingkaran merah yang membesar mengecil)
          ctx.save()
          
          // Outer glow effect
          const gradient = ctx.createRadialGradient(
            enemyCenterX, enemyCenterY, 0,
            enemyCenterX, enemyCenterY, enemy.auraRadius
          )
          gradient.addColorStop(0, 'rgba(255, 0, 0, 0.6)') // Red center, semi-transparent
          gradient.addColorStop(0.5, 'rgba(255, 0, 0, 0.4)') // Red middle
          gradient.addColorStop(1, 'rgba(255, 0, 0, 0.1)') // Red edge, very transparent
          
          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(enemyCenterX, enemyCenterY, enemy.auraRadius, 0, Math.PI * 2)
          ctx.fill()
          
          // Outer ring for visibility
          ctx.strokeStyle = '#ff0000'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(enemyCenterX, enemyCenterY, enemy.auraRadius, 0, Math.PI * 2)
          ctx.stroke()
          
          ctx.restore()
        }
      })

      // Draw UI with Health Bar - Player 1 (LEFT SIDE)
      ctx.textAlign = 'left'
      ctx.font = 'bold 24px Arial'
      ctx.fillStyle = '#00ff41'
      ctx.fillText(`P1 Score: ${score}`, 20, 40)
      
      // Draw coins counter - Player 1
      ctx.font = 'bold 20px Arial'
      ctx.fillStyle = '#ffd700'
      ctx.fillText(`💰 P1 Coins: ${coins}`, 20, 65)
      
      // Draw Health Bar - Player 1
      const healthBarWidth = 250
      const healthBarHeight = 25
      const healthBarX = 20
      const healthBarY = 90
      const healthPercent = Math.max(0, playerHealthRef.current / playerMaxHealthRef.current)
      
      // Health bar background
      ctx.fillStyle = '#333333'
      ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight)
      
      // Health bar fill (green to red based on health)
      const healthColor = healthPercent > 0.6 ? '#00ff41' : healthPercent > 0.3 ? '#ffaa00' : '#ff0000'
      ctx.fillStyle = healthColor
      ctx.fillRect(healthBarX, healthBarY, healthBarWidth * healthPercent, healthBarHeight)
      
      // Health bar border
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.strokeRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight)
      
      // Health text
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 18px Arial'
      ctx.fillText(`P1 HP: ${Math.max(0, playerHealthRef.current)}/${playerMaxHealthRef.current}`, healthBarX + healthBarWidth + 10, healthBarY + 18)
      
      // Ship stats - Player 1
      ctx.font = 'bold 16px Arial'
      ctx.fillStyle = '#0066ff'
      ctx.fillText(`Ship: ${actualShipRarity}`, 20, isMultiplayer && roomData?.guestAddress ? 150 : 140)
      const shipStatsY = isMultiplayer && roomData?.guestAddress ? 175 : 165
      ctx.fillStyle = '#ffff00'
      ctx.fillText(`⚔️ ATK: ${shipStats.attack}`, 20, shipStatsY)
      ctx.fillStyle = '#00ffff'
      ctx.fillText(`⚡ SPD: ${shipStats.speed}`, 20, shipStatsY + 25)
      ctx.fillStyle = '#ff00ff'
      ctx.fillText(`🛡️ SHD: ${shipStats.shield}`, 20, shipStatsY + 50)
      
      // Power-up status - Player 1
      // Note: 'now' already declared at the beginning of renderLoop
      const powerUpY = isMultiplayer && roomData?.guestAddress ? 275 : 265
      ctx.font = 'bold 14px Arial'
      if (shieldActiveRef.current && now < shieldEndTimeRef.current) {
        const remaining = Math.ceil((shieldEndTimeRef.current - now) / 1000)
        ctx.fillStyle = '#0096ff'
        ctx.fillText(`🛡️ SHIELD: ${remaining}s`, 20, powerUpY)
      }
      if (tripleShotActiveRef.current && now < tripleShotEndTimeRef.current) {
        const remaining = Math.ceil((tripleShotEndTimeRef.current - now) / 1000)
        ctx.fillStyle = '#ff8800'
        ctx.fillText(`🔶 TRIPLE: ${remaining}s`, 20, powerUpY + 20)
      }
      if (laserActiveRef.current && now < laserEndTimeRef.current) {
        const remaining = Math.ceil((laserEndTimeRef.current - now) / 1000)
        ctx.fillStyle = '#ff0000'
        ctx.fillText(`🔴 LASER: ${remaining}s`, 20, powerUpY + 40)
      }
      
      // Draw UI - Player 2 (RIGHT SIDE) - Multiplayer only
      if (isMultiplayer && roomData?.guestAddress) {
        const player2Score = player2ScoreRef.current || 0
        const player2Coins = player2CoinsRef.current || 0
        
        // Player 2 Score (right side)
        ctx.textAlign = 'right'
        ctx.font = 'bold 24px Arial'
        ctx.fillStyle = '#00ff96'
        ctx.fillText(`P2 Score: ${player2Score}`, canvas.width - 20, 40)
        
        // Player 2 Coins (right side)
        ctx.font = 'bold 20px Arial'
        ctx.fillStyle = '#ffd700'
        ctx.fillText(`💰 P2 Coins: ${player2Coins}`, canvas.width - 20, 65)
        
        // Player 2 Health Bar (right side)
        const healthBar2X = canvas.width - healthBarWidth - 20
        const healthBar2Y = 90
        const healthPercent2 = Math.max(0, player2HealthRef.current / 100)
        
        // Health bar background
        ctx.fillStyle = '#333333'
        ctx.fillRect(healthBar2X, healthBar2Y, healthBarWidth, healthBarHeight)
        
        // Health bar fill
        const healthColor2 = healthPercent2 > 0.6 ? '#00ff96' : healthPercent2 > 0.3 ? '#ffaa00' : '#ff0000'
        ctx.fillStyle = healthColor2
        ctx.fillRect(healthBar2X, healthBar2Y, healthBarWidth * healthPercent2, healthBarHeight)
        
        // Health bar border
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.strokeRect(healthBar2X, healthBar2Y, healthBarWidth, healthBarHeight)
        
        // Health text (right side)
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 18px Arial'
        ctx.textAlign = 'left'
        ctx.fillText(`P2 HP: ${Math.max(0, player2HealthRef.current)}/100`, healthBar2X - 120, healthBar2Y + 18)
        
        // Ship stats - Player 2 (right side) - using same ship stats as player 1 (guest uses same ship)
        ctx.textAlign = 'right'
        ctx.font = 'bold 16px Arial'
        ctx.fillStyle = '#00ff96'
        // PERBAIKAN: Gunakan shipRarity dari roomData.guestShip untuk Player 2
        const player2ShipRarity = isMultiplayer && roomData?.guestShip?.rarity ? roomData.guestShip.rarity : shipRarity
        ctx.fillText(`Ship: ${player2ShipRarity}`, canvas.width - 20, 150)
        const shipStats2Y = 175
        ctx.fillStyle = '#ffff00'
        ctx.fillText(`⚔️ ATK: ${shipStats.attack}`, canvas.width - 20, shipStats2Y)
        ctx.fillStyle = '#00ffff'
        ctx.fillText(`⚡ SPD: ${shipStats.speed}`, canvas.width - 20, shipStats2Y + 25)
        ctx.fillStyle = '#ff00ff'
        ctx.fillText(`🛡️ SHD: ${shipStats.shield}`, canvas.width - 20, shipStats2Y + 50)
        
        // Power-up status - Player 2 (right side)
        ctx.font = 'bold 14px Arial'
        if (player2ShieldActiveRef.current && now < player2ShieldEndTimeRef.current) {
          const remaining = Math.ceil((player2ShieldEndTimeRef.current - now) / 1000)
          ctx.fillStyle = '#00ff96'
          ctx.fillText(`🛡️ SHIELD: ${remaining}s`, canvas.width - 20, 275)
        }
        if (player2TripleShotActiveRef.current && now < player2TripleShotEndTimeRef.current) {
          const remaining = Math.ceil((player2TripleShotEndTimeRef.current - now) / 1000)
          ctx.fillStyle = '#ff8800'
          ctx.fillText(`🔶 TRIPLE: ${remaining}s`, canvas.width - 20, 295)
        }
        if (player2LaserActiveRef.current && now < player2LaserEndTimeRef.current) {
          const remaining = Math.ceil((player2LaserEndTimeRef.current - now) / 1000)
          ctx.fillStyle = '#00ff96'
          ctx.fillText(`🔴 LASER: ${remaining}s`, canvas.width - 20, 315)
        }
      }
      
      // Draw power-ups
      powerUpsRef.current.forEach(powerUp => {
        if (powerUp.collected) return
        
        // Draw power-up based on type
        if (powerUp.type === 'shield') {
          // Perisai - biru dengan border
          ctx.fillStyle = '#0096ff'
          ctx.strokeStyle = '#00ffff'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(
            powerUp.x + powerUp.width / 2,
            powerUp.y + powerUp.height / 2,
            powerUp.width / 2,
            0,
            Math.PI * 2
          )
          ctx.fill()
          ctx.stroke()
          // Draw shield icon (diamond shape)
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.moveTo(powerUp.x + powerUp.width / 2, powerUp.y + 5)
          ctx.lineTo(powerUp.x + powerUp.width - 5, powerUp.y + powerUp.height / 2)
          ctx.lineTo(powerUp.x + powerUp.width / 2, powerUp.y + powerUp.height - 5)
          ctx.lineTo(powerUp.x + 5, powerUp.y + powerUp.height / 2)
          ctx.closePath()
          ctx.fill()
        } else if (powerUp.type === 'triple') {
          // Bola oranye - lingkaran oranye
          ctx.fillStyle = '#ff8800'
          ctx.strokeStyle = '#ffaa00'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(
            powerUp.x + powerUp.width / 2,
            powerUp.y + powerUp.height / 2,
            powerUp.width / 2,
            0,
            Math.PI * 2
          )
          ctx.fill()
          ctx.stroke()
          // Draw 3 lines (representing 3-way shot)
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2
          const centerX = powerUp.x + powerUp.width / 2
          const centerY = powerUp.y + powerUp.height / 2
          ctx.beginPath()
          ctx.moveTo(centerX, centerY - 8)
          ctx.lineTo(centerX, centerY + 8)
          ctx.moveTo(centerX - 6, centerY - 4)
          ctx.lineTo(centerX + 6, centerY - 4)
          ctx.stroke()
        } else if (powerUp.type === 'laser') {
          // Laser merah - kotak merah panjang
          ctx.fillStyle = '#ff0000'
          ctx.strokeStyle = '#ff6666'
          ctx.lineWidth = 2
          ctx.fillRect(powerUp.x, powerUp.y, powerUp.width, powerUp.height)
          ctx.strokeRect(powerUp.x, powerUp.y, powerUp.width, powerUp.height)
          // Draw laser line
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(powerUp.x + powerUp.width / 2, powerUp.y + 5)
          ctx.lineTo(powerUp.x + powerUp.width / 2, powerUp.y + powerUp.height - 5)
          ctx.stroke()
        }
      })
      
      // Draw coins
      coinsRef.current.forEach(coin => {
        if (coin.collected) return
        
        // Draw coin (kuning emas dengan glow)
        ctx.save()
        
        // Outer glow
        ctx.shadowBlur = 10
        ctx.shadowColor = '#ffd700'
        
        // Coin body (kuning emas)
        ctx.fillStyle = '#ffd700'
        ctx.beginPath()
        ctx.arc(
          coin.x + coin.width / 2,
          coin.y + coin.height / 2,
          coin.width / 2,
          0,
          Math.PI * 2
        )
        ctx.fill()
        
        // Coin border
        ctx.strokeStyle = '#ffaa00'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(
          coin.x + coin.width / 2,
          coin.y + coin.height / 2,
          coin.width / 2,
          0,
          Math.PI * 2
        )
        ctx.stroke()
        
        // Coin value indicator (angka di tengah)
        ctx.fillStyle = '#000000'
        ctx.font = 'bold 12px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(
          `${coin.value || 1}`,
          coin.x + coin.width / 2,
          coin.y + coin.height / 2
        )
        
        ctx.restore()
      })

      if (isPaused) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#ffffff'
        ctx.font = '36px Arial'
        ctx.textAlign = 'center'
        ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2)
        ctx.font = '18px Arial'
        ctx.fillText('Press P to resume', canvas.width / 2, canvas.height / 2 + 40)
      }

      animationFrameRef.current = requestAnimationFrame(renderLoop)
    }

    // PERBAIKAN: Start rendering loop
    // Rendering akan skip jika tab hidden (solo mode), tapi tetap berjalan untuk multiplayer
    renderLoop()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [gameOver, isPaused, score, coins, shipRarity, shipStats, isMultiplayer, roomData, isHost])

  return (
    <div className="space-shooter-game">
      <canvas ref={canvasRef} className="game-canvas"></canvas>
      {!gameOver && !isPaused && (
        <div className="game-controls-overlay">
          <div className="control-info">
            <p>WASD / Arrow Keys: Move</p>
            <p>AUTO-FIRE: Enabled (shooting automatically)</p>
            <p>P: Pause</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default SpaceShooterGame
