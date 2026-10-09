import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { createServer } from 'http';
import { Server } from 'socket.io';
import usersRoutes from './routes/users.js';
import shipsRoutes from './routes/ships.js';
import matchesRoutes from './routes/matches.js';
import ipfsRoutes from './routes/ipfs.js';
import roomsRoutes from './routes/rooms.js';
import pointsRoutes from './routes/points.js';
import gameRoutes from './routes/game.js';
import multiplayerRoutes from './routes/multiplayer.js';
import pfpRoutes from './routes/pfp.js';
import GameStateManager from './game/GameStateManager.js';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const app = express();
const httpServer = createServer(app);
// CORS configuration - support both local and production
const allowedOrigins = [
  "http://localhost:5173", 
  "http://localhost:5174", 
  "http://127.0.0.1:5173", 
  "http://127.0.0.1:5174",
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null
].filter(Boolean);

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'production') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: ["*"]
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  upgradeTimeout: 10000
});
const PORT = process.env.PORT || 3001;

// Middleware - CORS with production support
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// Database connection
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/space_stellar',
});

// Test database connection and run migrations
(async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connected');
    
    // Run auto-migrations
    try {
      const { runMigrations } = await import('./scripts/auto-migrate.js');
      await runMigrations();
    } catch (migrationError) {
      console.error('⚠️ Migration error (non-fatal):', migrationError.message);
      console.error('Migration stack:', migrationError.stack);
    }
  } catch (err) {
    console.error('Database connection error:', err);
  }
})();

// Routes
app.use('/api/users', usersRoutes);
app.use('/api/ships', shipsRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/ipfs', ipfsRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/points', pointsRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/multiplayer', multiplayerRoutes);
app.use('/api/pfp', pfpRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    success: false, 
    message: err.message || 'Internal server error' 
  });
});

// Store room players for real-time multiplayer
const roomPlayers = new Map(); // roomCode -> Set of socket.id

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('✅ WebSocket client connected:', socket.id);

  // Join room - IMPROVED multiplayer handling
  socket.on('join-room', ({ roomCode, address, isHost }) => {
    socket.join(roomCode);
    
    // Store player info
    socket.roomCode = roomCode;
    socket.address = address;
    socket.isHost = isHost;
    
    // Track players in room
    if (!roomPlayers.has(roomCode)) {
      roomPlayers.set(roomCode, new Set());
    }
    roomPlayers.get(roomCode).add(socket.id);
    
    console.log(`👤 ${address} joined room ${roomCode} (${isHost ? 'host' : 'guest'}) - Players: ${roomPlayers.get(roomCode).size}`);
    
    // Notify other players
    socket.to(roomCode).emit('player-joined', { 
      address, 
      isHost, 
      socketId: socket.id,
      playersCount: roomPlayers.get(roomCode).size 
    });
    
    // Send current room status
    socket.emit('room-status', {
      roomCode,
      playersCount: roomPlayers.get(roomCode).size
    });
  });

  // Player input - REAL-TIME broadcast
  socket.on('player-input', ({ roomCode, address, input }) => {
    // Immediately broadcast to other players
    socket.to(roomCode).emit('player-movement', {
      address,
      input,
      timestamp: Date.now()
    });
  });

  // Full player state sync - REAL-TIME broadcast
  socket.on('player-state', (payload) => {
    if (!payload || !payload.roomCode) return;
    const { roomCode, address, ...state } = payload;
    socket.to(roomCode).emit('player-state', { address, state });
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('❌ WebSocket client disconnected:', socket.id);
    
    if (socket.roomCode && roomPlayers.has(socket.roomCode)) {
      roomPlayers.get(socket.roomCode).delete(socket.id);
      
      socket.to(socket.roomCode).emit('player-left', { 
        socketId: socket.id,
        address: socket.address,
        playersCount: roomPlayers.get(socket.roomCode).size
      });
      
      if (roomPlayers.get(socket.roomCode).size === 0) {
        roomPlayers.delete(socket.roomCode);
      }
    }
  });
});

// Export io for use in routes
export { io };

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.IO ready for connections`);
  console.log(`🎮 REST API multiplayer ready`);
});


