import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useWalletKit } from '../contexts/WalletContext'
import axios from 'axios'
import SpaceShooterGame from '../components/SpaceShooterGame'
import GameSpaceBackground from '../components/GameSpaceBackground'
import { getShipImage, getShipStats as getSharedShipStats } from '../constants/ships'
import './Game.css'

const Game = () => {
  const { roomCode } = useParams<{ roomCode: string }>()
  const navigate = useNavigate()
  const { address } = useWalletKit()
  const [roomData, setRoomData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [gameScore, setGameScore] = useState(0)
  const [gamePlayer2Score, setGamePlayer2Score] = useState(0) // Player 2 score for multiplayer
  const [gameCoins, setGameCoins] = useState(0) // Coins collected in game
  const [gameStarted, setGameStarted] = useState(false)
  const [hasStartedOnce, setHasStartedOnce] = useState(false) // Track if game has started at least once
  const [matchSaved, setMatchSaved] = useState(false) // Track if match has been saved to prevent duplicates
  const [isMultiplayer, setIsMultiplayer] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [guestAddress, setGuestAddress] = useState<string | null>(null)

  // Update multiplayer state when roomData changes
  useEffect(() => {
    if (roomData) {
      const mode = roomData.mode || 'solo'
      const multiplayer = mode === 'multiplayer'
      setIsMultiplayer(multiplayer)
      
      if (address && roomData.hostAddress) {
        setIsHost(address === roomData.hostAddress || address.toLowerCase() === roomData.hostAddress.toLowerCase())
      }
      
      if (roomData.guestAddress) {
        setGuestAddress(roomData.guestAddress)
      } else {
        setGuestAddress(null)
      }
      
      console.log('🎮 Game.tsx - Room data updated:', {
        mode,
        multiplayer,
        isHost: address === roomData.hostAddress,
        hostAddress: roomData.hostAddress,
        guestAddress: roomData.guestAddress,
        currentAddress: address
      })
    }
  }, [roomData, address])

  useEffect(() => {
    if (roomCode) {
      // Always try to load room data if roomCode exists (with or without address)
      // Cache will be checked first in loadRoomData()
      loadRoomData()
    } else {
      // No roomCode, just start game immediately
      console.log('⚠️ No roomCode, starting game without room data')
      setLoading(false)
      setGameStarted(true)
      setHasStartedOnce(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, address])

  const createFallbackRoomData = () => {
    // Get ship info from localStorage
    const equippedShip = address 
      ? localStorage.getItem(`equipped_ship_${address}`) || 'Classic'
      : 'Classic'
    
    const shipImage = getShipImage(equippedShip)
    const shipName = `${equippedShip} Fighter`
    
    const fallbackRoomData = {
      roomCode: roomCode || 'unknown',
      mode: 'solo',
      hostAddress: address || '',
      guestAddress: null,
      status: 'waiting',
      createdAt: new Date().toISOString(),
      hostShip: {
        rarity: equippedShip,
        name: shipName,
        class: 'Fighter',
        image: shipImage
      }
    }
    
    console.log('✅ Fallback room data created:', fallbackRoomData)
    setRoomData(fallbackRoomData)
    
    // Cache fallback room data
    if (roomCode) {
      const cachedRoomKey = `room_${roomCode}`
      localStorage.setItem(cachedRoomKey, JSON.stringify({
        ...fallbackRoomData,
        _cachedAt: Date.now()
      }))
      console.log('✅ Fallback room data cached')
    }
  }

  const updateRoomStatus = async (status: 'playing' | 'finished') => {
    if (!roomCode) return
    
    try {
      const endpoint = status === 'playing' 
        ? `/api/rooms/${roomCode}/start`
        : `/api/rooms/${roomCode}/finish`
      
      // Include address and mode in request body so backend can create room if needed
      const requestData = address && roomData
        ? {
            address,
            mode: roomData.mode || 'solo'
          }
        : address
        ? {
            address,
            mode: 'solo'
          }
        : {}
      
      await axios.post(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}${endpoint}`,
        requestData,
        { timeout: 5000 } // 5 second timeout
      )
      console.log(`✅ Room status updated to ${status}`)
    } catch (error: any) {
      // Non-critical error, just log it
      if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED' || error.message.includes('ERR_CONNECTION_REFUSED')) {
        console.warn(`⚠️ Backend not available, room status update skipped (non-critical)`)
      } else {
        console.warn(`⚠️ Could not update room status to ${status}:`, error.message)
      }
      // Don't throw, game should continue even if status update fails
    }
  }

  const loadRoomData = async () => {
    if (!roomCode) {
      setLoading(false)
      return
    }

    // ALWAYS load from backend first for multiplayer (to get latest guestAddress)
    // Only use cache for solo mode
    try {
      console.log('🔍 Loading room from backend for game:', roomCode)
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/rooms/${roomCode}`,
        { timeout: 5000 }
      )
      
      if (response.data && response.data.success) {
        console.log('✅ Room loaded from backend for game:', response.data.room)
        const room = response.data.room
        
        // Update multiplayer state immediately
        const mode = room.mode || 'solo'
        setIsMultiplayer(mode === 'multiplayer')
        if (address && room.hostAddress) {
          setIsHost(address === room.hostAddress || address.toLowerCase() === room.hostAddress.toLowerCase())
        }
        if (room.guestAddress) {
          setGuestAddress(room.guestAddress)
          console.log('✅ Guest address found:', room.guestAddress)
        } else {
          setGuestAddress(null)
          console.log('⚠️ No guest address in room data')
        }
        
        console.log('🎮 Game.tsx - Multiplayer state:', {
          mode,
          isMultiplayer: mode === 'multiplayer',
          isHost: address === room.hostAddress,
          guestAddress: room.guestAddress,
          hostAddress: room.hostAddress,
          currentAddress: address
        })
        
        setRoomData(room)
        
        // Cache room data (for future use)
        const cachedRoomKey = `room_${roomCode}`
        localStorage.setItem(cachedRoomKey, JSON.stringify({
          ...room,
          _cachedAt: Date.now()
        }))
      } else {
        // Create fallback room data
        console.log('⚠️ Room response not successful, using fallback data')
        createFallbackRoomData()
      }
    } catch (error: any) {
      console.error('❌ Error loading room from backend:', error)
      
      // Try cache as fallback
      const cachedRoomKey = `room_${roomCode}`
      const cachedRoom = localStorage.getItem(cachedRoomKey)
      
      if (cachedRoom) {
        try {
          const parsedRoom = JSON.parse(cachedRoom)
          const { _cachedAt, ...roomData } = parsedRoom
          console.log('✅ Using cached room data as fallback:', roomData)
          setRoomData(roomData)
          
          // Update multiplayer state from cache
          const mode = roomData.mode || 'solo'
          setIsMultiplayer(mode === 'multiplayer')
          if (address && roomData.hostAddress) {
            setIsHost(address === roomData.hostAddress || address.toLowerCase() === roomData.hostAddress.toLowerCase())
          }
          if (roomData.guestAddress) {
            setGuestAddress(roomData.guestAddress)
          }
        } catch (e) {
          console.warn('⚠️ Invalid cache format, creating fallback')
          createFallbackRoomData()
        }
      } else {
        // No cache, create fallback
        console.log('🔄 Creating fallback room data (no backend, no cache)')
        createFallbackRoomData()
      }
    } finally {
      setLoading(false)
      // Auto start game immediately (no popup, no delay)
      setGameStarted(true)
      setHasStartedOnce(true)
      // Update room status to playing (non-blocking)
      if (roomCode) {
        updateRoomStatus('playing').catch(err => 
          console.warn('⚠️ Could not update room status (non-critical):', err)
        )
      }
    }
  }

  // Add XP after game
  const addXP = (score: number, coins: number, isWin: boolean) => {
    if (!address) return
    
    // Base XP from score (1 XP per 10 points)
    let xpGained = Math.floor(score / 10)
    
    // Bonus XP from coins (1 XP per coin)
    xpGained += coins
    
    // Win bonus (50 XP)
    if (isWin) {
      xpGained += 50
    }
    
    // Minimum XP (at least 10 XP per game)
    xpGained = Math.max(10, xpGained)
    
    // Get current XP from localStorage
    const currentXP = parseInt(localStorage.getItem(`xp_${address}`) || '0', 10)
    const newXP = currentXP + xpGained
    
    // Save to localStorage
    localStorage.setItem(`xp_${address}`, newXP.toString())
    
    console.log(`🎮 XP Gained: +${xpGained} XP (Score: ${score}, Coins: ${coins}, Win: ${isWin})`)
    console.log(`📊 Total XP: ${currentXP} → ${newXP}`)
    
    return newXP
  }

  const handleGameOver = async (finalScore: number, coinsCollected: number, player2Score?: number) => {
    setGameScore(finalScore)
    setGamePlayer2Score(player2Score || 0)
    setGameCoins(coinsCollected)
    setGameStarted(false) // Stop game, but don't show GET READY popup again

    if (!address) {
      console.warn('⚠️ Cannot save game result: missing address')
      return
    }

    // Add XP based on game result
    const isWin = isMultiplayer 
      ? (finalScore > (player2Score || 0))
      : (finalScore > 0) // Solo: any score > 0 is considered a "win"
    addXP(finalScore, coinsCollected, isWin)

    // Update mission progress
    if (address) {
      import('../utils/missionTracker').then(({ updateMatchStats }) => {
        updateMatchStats(address, {
          isMultiplayer: isMultiplayer,
          isWin: isWin,
          coins: coinsCollected
        })
      }).catch(err => {
        console.warn('⚠️ Could not update mission stats:', err)
      })
    }

    // Prevent duplicate saves
    if (matchSaved) {
      console.log('⚠️ Match already saved, skipping duplicate save')
      return
    }

    setMatchSaved(true) // Mark as saved to prevent duplicates

    // Add coins to player points
    if (coinsCollected > 0) {
      try {
        console.log(`💰 Adding ${coinsCollected} coins to player points...`)
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'
        const addCoinsResponse = await fetch(`${apiUrl}/api/points/add`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            address: address,
            amount: coinsCollected,
            reason: 'Game Coins'
          })
        })
        
        const addCoinsResult = await addCoinsResponse.json()
        
        if (addCoinsResult.success) {
          console.log(`✅ Added ${coinsCollected} coins to player points`)
          console.log(`   New points balance: ${addCoinsResult.points}`)
        } else {
          console.warn('⚠️ Failed to add coins to points:', addCoinsResult)
        }
      } catch (coinsError: any) {
        console.error('❌ Could not add coins to points:', coinsError)
        // Non-critical error, continue with match save
      }
    }

    // Update room status to finished and reset ready status (non-blocking)
    if (roomCode) {
      updateRoomStatus('finished').catch(err => 
        console.warn('⚠️ Could not update room status to finished:', err)
      )
      
      // Reset ready status after game over (both players need to ready again)
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'
        await axios.post(`${apiUrl}/api/rooms/${roomCode}/ready`, {
          address: address,
          ready: false
        })
        console.log('✅ Ready status reset after game over')
      } catch (err) {
        console.warn('⚠️ Could not reset ready status:', err)
      }
    }

    // Save match to database (non-blocking, only once)
    // IMPORTANT: All scores are saved, not just best score
    try {
      const shipRarity = roomData?.hostShip?.rarity || getShipRarity()
      const shipName = roomData?.hostShip?.name || `${shipRarity} Fighter`
      const mode = roomData?.mode || 'solo'

      console.log('💾 Saving game result (ALL SCORES SAVED):', { roomCode, mode, address, shipRarity, score: finalScore, coins: coinsCollected })
      
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/matches/save`,
        {
          roomCode: roomCode || 'solo',
          mode,
          address,
          shipRarity,
          shipName,
          score: finalScore,
          coins: coinsCollected,
          duration: 0
        },
        { timeout: 10000 } // 10 second timeout for save operation
      )
      
      if (response.data && response.data.success) {
        if (response.data.duplicate) {
          console.log('⚠️ Duplicate match detected by backend, match not saved again')
        } else {
          console.log('✅ Game result saved successfully:', response.data.match)
        }
      } else {
        console.warn('⚠️ Match save returned unsuccessful:', response.data)
        setMatchSaved(false) // Allow retry if save failed
      }
    } catch (error: any) {
      // Non-critical error, game already finished
      console.error('❌ Could not save game result:', error.message)
      setMatchSaved(false) // Allow retry if save failed
      if (error.response) {
        console.error('   Status:', error.response.status)
        console.error('   Data:', error.response.data)
        // If duplicate, that's OK - backend already has the match
        if (error.response.data?.duplicate) {
          console.log('✅ Match already exists in database (duplicate prevented)')
          return
        }
      } else if (error.request) {
        console.error('   No response received from server')
        console.error('   Backend might be down or unreachable')
        console.error('   💡 TIP: Start backend server with: cd backend && npm start')
      } else if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED' || error.message.includes('ERR_CONNECTION_REFUSED')) {
        console.error('   Backend server is not running!')
        console.error('   💡 TIP: Start backend server with: cd backend && npm start')
      }
    }
  }

  const getShipRarity = () => {
    // PERBAIKAN: Untuk solo mode, SELALU gunakan ship dari localStorage (prioritas tertinggi)
    if (!isMultiplayer && address) {
      const equippedShip = localStorage.getItem(`equipped_ship_${address}`) || 'Classic'
      console.log('✅ Solo mode: Using ship rarity from localStorage:', equippedShip)
      return equippedShip
    }
    
    // PERBAIKAN: Prioritaskan roomData untuk multiplayer (authoritative)
    // Ini memastikan bahwa host menggunakan ship dari roomData.hostShip, dan guest menggunakan ship dari roomData.guestShip
    if (isMultiplayer && isHost && roomData?.hostShip?.rarity) {
      console.log('✅ Host: Using ship rarity from roomData.hostShip:', roomData.hostShip.rarity)
      return roomData.hostShip.rarity
    }
    if (isMultiplayer && !isHost && roomData?.guestShip?.rarity) {
      console.log('✅ Guest: Using ship rarity from roomData.guestShip:', roomData.guestShip.rarity)
      return roomData.guestShip.rarity
    }
    if (!isMultiplayer && roomData?.hostShip?.rarity) {
      // Fallback untuk solo mode jika roomData ada
      return roomData.hostShip.rarity
    }
    
    // Fallback: gunakan ship dari localStorage untuk current user
    const equippedShip = address ? localStorage.getItem(`equipped_ship_${address}`) : null
    if (equippedShip) {
      console.log('✅ Using ship rarity from localStorage:', equippedShip)
      return equippedShip
    }
    
    // Default fallback
    console.log('⚠️ Using default ship rarity: Classic')
    return 'Classic'
  }

  const getShipImagePath = () => {
    // PERBAIKAN: Untuk solo mode, SELALU gunakan ship dari localStorage (prioritas tertinggi)
    if (!isMultiplayer && address) {
      const equippedShip = localStorage.getItem(`equipped_ship_${address}`) || 'Classic'
      const image = getShipImage(equippedShip)
      console.log('✅ Solo mode: Using ship image from localStorage:', equippedShip, '→', image)
      return image
    }
    
    // PERBAIKAN: Prioritaskan roomData untuk multiplayer (authoritative)
    // Ini memastikan bahwa host menggunakan ship dari roomData.hostShip, dan guest menggunakan ship dari roomData.guestShip
    if (isMultiplayer && isHost && roomData?.hostShip) {
      if (roomData.hostShip.image) {
        console.log('✅ Host: Using ship image from roomData.hostShip.image:', roomData.hostShip.image)
        return roomData.hostShip.image
      } else if (roomData.hostShip.rarity) {
        const image = getShipImage(roomData.hostShip.rarity)
        console.log('✅ Host: Generated ship image from roomData.hostShip.rarity:', roomData.hostShip.rarity, '→', image)
        return image
      }
    }
    if (isMultiplayer && !isHost && roomData?.guestShip) {
      if (roomData.guestShip.image) {
        console.log('✅ Guest: Using ship image from roomData.guestShip.image:', roomData.guestShip.image)
        return roomData.guestShip.image
      } else if (roomData.guestShip.rarity) {
        const image = getShipImage(roomData.guestShip.rarity)
        console.log('✅ Guest: Generated ship image from roomData.guestShip.rarity:', roomData.guestShip.rarity, '→', image)
        return image
      }
    }
    if (!isMultiplayer && roomData?.hostShip) {
      // Fallback untuk solo mode jika roomData ada
      if (roomData.hostShip.image) {
        return roomData.hostShip.image
      } else if (roomData.hostShip.rarity) {
        return getShipImage(roomData.hostShip.rarity)
      }
    }
    
    // Fallback: gunakan ship dari localStorage untuk current user
    const equippedShip = address ? localStorage.getItem(`equipped_ship_${address}`) : null
    if (equippedShip) {
      console.log('✅ Using ship image from localStorage:', equippedShip)
      return getShipImage(equippedShip)
    }
    
    return getShipImage(getShipRarity())
  }

  // Get ship stats from the shared rarity table
  const getShipStats = () => {
    return getSharedShipStats(getShipRarity())
  }

  if (loading) {
    return (
      <div className="game-loading">
        <div className="loading-content">
          <h1>LOADING GAME...</h1>
          <p>Room: {roomCode}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="game-page">
      <GameSpaceBackground />
      {gameScore > 0 ? (
        // Game Over Screen - show only after game is finished
        <div className="game-over-screen">
          <div className="game-over-content">
            <h1>GAME OVER</h1>
            {isMultiplayer && gamePlayer2Score >= 0 ? (
              // Multiplayer: show both player scores
              <div className="multiplayer-scores">
                <p className="final-score player1-score" style={{ color: '#00ff41', fontSize: '36px', margin: '20px 0', fontWeight: 'bold' }}>
                  Player 1 Score: {gameScore}
                </p>
                <p className="final-score player2-score" style={{ color: '#ffaa00', fontSize: '36px', margin: '20px 0', fontWeight: 'bold' }}>
                  Player 2 Score: {gamePlayer2Score}
                </p>
                <p className="winner-text" style={{ 
                  color: gameScore > gamePlayer2Score ? '#00ff41' : gameScore < gamePlayer2Score ? '#ffaa00' : '#ffffff',
                  fontSize: '28px',
                  marginTop: '30px',
                  fontWeight: 'bold',
                  textShadow: '0 0 20px currentColor'
                }}>
                  {gameScore > gamePlayer2Score ? '🏆 Player 1 Wins!' : 
                   gameScore < gamePlayer2Score ? '🏆 Player 2 Wins!' : 
                   '🤝 Draw!'}
                </p>
              </div>
            ) : (
              // Solo mode: show single score
              <p className="final-score">Final Score: {gameScore}</p>
            )}
            {gameCoins > 0 && (
              <p className="final-coins" style={{ color: '#ffd700', fontSize: '20px', marginTop: '10px' }}>
                💰 Coins Collected: {gameCoins}
              </p>
            )}
            <div className="game-over-actions">
              <button 
                className="btn-play-again"
                onClick={() => {
                  setGameScore(0)
                  setGamePlayer2Score(0)
                  setGameCoins(0)
                  setMatchSaved(false) // Reset match saved flag for new game
                  setGameStarted(true)
                }}
              >
                PLAY AGAIN
              </button>
              <button 
                className="btn-back-to-room"
                onClick={() => {
                  setGameScore(0)
                  setGamePlayer2Score(0)
                  setGameCoins(0)
                  navigate(`/room/${roomCode}`)
                }}
              >
                BACK TO ROOM
              </button>
              <button 
                className="btn-back-to-home"
                onClick={() => {
                  setGameScore(0)
                  setGamePlayer2Score(0)
                  setGameCoins(0)
                  navigate('/')
                }}
              >
                BACK TO HOME
              </button>
            </div>
          </div>
        </div>
      ) : gameStarted ? (
        // Game is running
        <div className="game-container-fullscreen">
          <SpaceShooterGame
            onGameOver={handleGameOver}
            shipRarity={getShipRarity()}
            shipImage={getShipImagePath()}
            shipStats={getShipStats()}
            roomCode={roomCode || undefined}
            isMultiplayer={isMultiplayer}
            isHost={isHost}
            address={address || undefined}
            guestAddress={guestAddress || undefined}
            roomData={roomData}
          />
        </div>
      ) : loading ? (
        // Loading screen
        <div className="game-loading">
          <div className="loading-content">
            <h1>LOADING GAME...</h1>
            <p>Room: {roomCode}</p>
            {isMultiplayer && (
              <p>{isHost ? 'Host' : 'Guest'} - {guestAddress ? 'Multiplayer' : 'Waiting for player 2...'}</p>
            )}
          </div>
        </div>
      ) : (
        // Fallback: start game immediately if not loading and not started
        <div className="game-container-fullscreen">
          <SpaceShooterGame
            onGameOver={handleGameOver}
            shipRarity={getShipRarity()}
            shipImage={getShipImagePath()}
            shipStats={getShipStats()}
            roomCode={roomCode || undefined}
            isMultiplayer={isMultiplayer}
            isHost={isHost}
            address={address || undefined}
            guestAddress={guestAddress || undefined}
            roomData={roomData}
          />
        </div>
      )}
    </div>
  )
}

export default Game

