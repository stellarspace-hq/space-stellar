/**
 * Game state management untuk multiplayer
 * 
 * Endpoints:
 * - POST /api/game/:roomCode/input - Send player input
 * - GET /api/game/:roomCode/state - Get current game state
 * - POST /api/game/:roomCode/state - Update game state (host only)
 */

import express from 'express';
import { pool } from '../server.js';
import { canUpdateGameState, classifyGameAccess } from '../utils/gameAccess.js';

const router = express.Router();

// In-memory game state storage (bisa diganti dengan Redis di production)
const gameStates = new Map();

// Initialize game state
router.post('/:roomCode/init', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { hostAddress, guestAddress } = req.body;

    console.log('🎮 Initializing game state:', { roomCode, hostAddress, guestAddress });

    // Check if room exists
    const roomResult = await pool.query(
      'SELECT * FROM rooms WHERE room_code = $1',
      [roomCode]
    );

    if (roomResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: `Room not found: ${roomCode}` 
      });
    }

    const room = roomResult.rows[0];

    // Initialize game state
    const gameState = {
      roomCode,
      hostAddress: room.host_address,
      guestAddress: room.guest_address || null,
      players: {
        host: {
          x: 300, // Left side
          y: 500,
          health: 100,
          score: 0,
          coins: 0,
          input: {
            left: false,
            right: false,
            up: false,
            down: false,
            shooting: false
          }
        },
        guest: guestAddress ? {
          x: 500, // Right side
          y: 500,
          health: 100,
          score: 0,
          coins: 0,
          input: {
            left: false,
            right: false,
            up: false,
            down: false,
            shooting: false
          }
        } : null
      },
      enemies: [],
      bullets: [],
      enemyBullets: [],
      powerUps: [],
      coins: [],
      gameOver: false,
      winner: null,
      lastUpdate: Date.now()
    };

    gameStates.set(roomCode, gameState);

    console.log('✅ Game state initialized:', { roomCode });

    res.json({ 
      success: true, 
      gameState 
    });
  } catch (error) {
    console.error('❌ Error initializing game state:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Unknown error' 
    });
  }
});

// Send player input
router.post('/:roomCode/input', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { address, input } = req.body;

    console.log('🎮 Player input:', { roomCode, address, input });

    if (!roomCode || !address || !input) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: roomCode, address, input' 
      });
    }

    // Get game state
    const gameState = gameStates.get(roomCode);

    // Membership is checked before any game state is read or mutated.
    const access = classifyGameAccess(gameState, address, roomCode);
    if (access.status) {
      return res.status(access.status).json(access.body);
    }

    // Determine player role
    const isHost = access.role === 'host';
    const isGuest = access.role === 'guest';

    // Update player input
    if (isHost) {
      gameState.players.host.input = {
        left: input.left || false,
        right: input.right || false,
        up: input.up || false,
        down: input.down || false,
        shooting: input.shooting || false
      };
    } else if (isGuest) {
      if (gameState.players.guest) {
        gameState.players.guest.input = {
          left: input.left || false,
          right: input.right || false,
          up: input.up || false,
          down: input.down || false,
          shooting: input.shooting || false
        };
      }
    }

    gameState.lastUpdate = Date.now();

    res.json({ 
      success: true, 
      message: 'Input updated' 
    });
  } catch (error) {
    console.error('❌ Error updating player input:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Unknown error' 
    });
  }
});

// Get game state
router.get('/:roomCode/state', async (req, res) => {
  try {
    const { roomCode } = req.params;

    const gameState = gameStates.get(roomCode);

    if (!gameState) {
      return res.status(404).json({ 
        success: false, 
        message: `Game state not found for room: ${roomCode}` 
      });
    }

    res.json({ 
      success: true, 
      gameState 
    });
  } catch (error) {
    console.error('❌ Error getting game state:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Unknown error' 
    });
  }
});

// Update game state (host only)
router.post('/:roomCode/state', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { address, gameState: newGameState } = req.body;

    console.log('🎮 Updating game state:', { roomCode, address });

    // Get current game state
    const currentState = gameStates.get(roomCode);

    if (!currentState) {
      return res.status(404).json({ 
        success: false, 
        message: `Game state not found for room: ${roomCode}` 
      });
    }

    // Only host can update game state
    if (!canUpdateGameState(currentState, address)) {
      return res.status(403).json({
        success: false,
        message: 'Only host can update game state'
      });
    }

    // Update game state
    gameStates.set(roomCode, {
      ...newGameState,
      roomCode,
      lastUpdate: Date.now()
    });

    res.json({ 
      success: true, 
      message: 'Game state updated' 
    });
  } catch (error) {
    console.error('❌ Error updating game state:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Unknown error' 
    });
  }
});

// Cleanup game state when game ends
router.post('/:roomCode/end', async (req, res) => {
  try {
    const { roomCode } = req.params;

    console.log('🎮 Ending game:', { roomCode });

    gameStates.delete(roomCode);

    res.json({ 
      success: true, 
      message: 'Game ended' 
    });
  } catch (error) {
    console.error('❌ Error ending game:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Unknown error' 
    });
  }
});

export default router;

