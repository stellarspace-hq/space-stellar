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

// ---------------------------------------------------------------------------
// CORS configuration – explicit allowlist (no production wildcard)
// ---------------------------------------------------------------------------
// Environment variable `CORS_ALLOWLIST` can contain a comma‑separated list of
// origins (e.g. "https://myfrontend.com,https://staging.myfrontend.com").
// For local development we always allow the typical Vite dev ports.
const rawAllowlist = process.env.CORS_ALLOWLIST || '';
const envAllowlist = rawAllowlist
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const defaultDevOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174"
];

// Combine defaults with any origins supplied via the environment.
const allowedOrigins = [...new Set([...defaultDevOrigins, ...envAllowlist])];

// Helper to log rejected origins for easier debugging.
function logCorsRejection(origin) {
  console.warn(`CORS rejection: origin "${origin}" is not in the allowlist`);
}

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., curl, mobile apps)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      logCorsRejection(origin);
      return callback(new Error('Not allowed by CORS'));
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

// ---------------------------------------------------------------------------
// Express middleware – same CORS logic as Socket.IO
// ---------------------------------------------------------------------------
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    logCorsRejection(origin);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
  allowedHeaders: ["*"]
}));

// Parse JSON bodies
app.use(express.json());

// Register API routes
app.use('/api/users', usersRoutes);
app.use('/api/ships', shipsRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/ipfs', ipfsRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/points', pointsRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/multiplayer', multiplayerRoutes);
app.use('/api/pfp', pfpRoutes);

// Socket.IO connection handling (basic placeholder – real logic lives elsewhere)
io.on('connection', socket => {
  console.log('Socket.IO client connected:', socket.id);
  // Example: integrate with GameStateManager if needed
  // GameStateManager.registerSocket(socket);
});

// Start the server
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});