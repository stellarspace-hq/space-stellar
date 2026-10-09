// Simple REST API untuk multiplayer peer-to-peer
// Menghindari kompleksitas WebSocket

import express from 'express';
import { mergePlayerUpdate, otherPlayers } from '../utils/playerDataMerge.js';
const router = express.Router();

// Store player data in-memory
const playerData = new Map(); // roomCode -> { [address]: { x, y, health, bullets, shipImage, shipRarity, timestamp } }

// Update player data (position, health, bullets, ship, score, coins)
router.post('/update-player', (req, res) => {
  const { roomCode, address, x, y, health, bullets, shipImage, shipRarity, score, coins } = req.body;
  
  if (!roomCode || !address) {
    return res.status(400).json({ success: false, message: 'Missing roomCode or address' });
  }
  
  if (!playerData.has(roomCode)) {
    playerData.set(roomCode, {});
  }
  
  const roomPlayers = playerData.get(roomCode);

  // Merge the partial update over the last known player object so fields
  // that are not part of this tick (position, health, ...) are preserved.
  roomPlayers[address] = mergePlayerUpdate(roomPlayers[address], {
    x,
    y,
    health,
    bullets,
    shipImage,
    shipRarity,
    score,
    coins,
  });

  res.json({ success: true });
});

// Get other players' data (positions, health, bullets, ship)
router.get('/get-players/:roomCode/:address', (req, res) => {
  const { roomCode, address } = req.params;
  
  if (!playerData.has(roomCode)) {
    return res.json({ success: true, players: [] });
  }
  
  const roomPlayers = playerData.get(roomCode);
  const players = otherPlayers(roomPlayers, address);

  res.json({ success: true, players });
});

// Legacy endpoint for backward compatibility
router.post('/update-position', (req, res) => {
  const { roomCode, address, x, y } = req.body;
  
  if (!roomCode || !address || x === undefined || y === undefined) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }
  
  if (!playerData.has(roomCode)) {
    playerData.set(roomCode, {});
  }
  
  const roomPlayers = playerData.get(roomCode);
  if (!roomPlayers[address]) {
    roomPlayers[address] = {};
  }
  
  roomPlayers[address].x = x;
  roomPlayers[address].y = y;
  roomPlayers[address].timestamp = Date.now();
  
  res.json({ success: true });
});

// Legacy endpoint for backward compatibility
router.get('/get-positions/:roomCode/:address', (req, res) => {
  const { roomCode, address } = req.params;
  
  if (!playerData.has(roomCode)) {
    return res.json({ success: true, players: [] });
  }
  
  const roomPlayers = playerData.get(roomCode);
  const otherPlayers = Object.entries(roomPlayers)
    .filter(([playerAddress]) => playerAddress !== address)
    .map(([playerAddress, data]) => ({
      address: playerAddress,
      x: data.x,
      y: data.y,
      timestamp: data.timestamp
    }));
  
  res.json({ success: true, players: otherPlayers });
});

// Clean up old data (called by cron or manually)
router.post('/cleanup', (req, res) => {
  const now = Date.now();
  const timeout = 60000; // 1 minute
  
  for (const [roomCode, players] of playerData.entries()) {
    for (const [address, data] of Object.entries(players)) {
      if (now - (data.timestamp || 0) > timeout) {
        delete players[address];
      }
    }
    
    if (Object.keys(players).length === 0) {
      playerData.delete(roomCode);
    }
  }
  
  res.json({ success: true, message: 'Cleanup completed' });
});

export default router;

