import express from 'express';
import { pool } from '../server.js';
import { randomUUID } from 'crypto';
import {
  readyUpdate,
  validateCreateRoom,
  validateJoin,
  validateMode,
} from '../utils/roomRules.js';

const router = express.Router();

// PERBAIKAN: Store ship info in memory (roomCode -> { hostShip, guestShip })
// Ini memungkinkan backend mengembalikan ship yang benar saat GET room
const shipStore = new Map(); // roomCode -> { hostShip: {...}, guestShip: {...} }

// Create room
router.post('/create', async (req, res) => {
  try {
    const { 
      roomCode, 
      mode, 
      address, 
      shipRarity, 
      shipName, 
      shipClass,
      shipImage
    } = req.body;

      // Normalize mode value (trim, lowercase, validate)
      const modeCheck = validateMode(mode);
      if (!modeCheck.ok) {
        return res.status(modeCheck.status).json(modeCheck.body);
      }
      const normalizedMode = modeCheck.mode;

      // Normalize room_code (trim whitespace)
      const normalizedRoomCode = roomCode ? roomCode.toString().trim() : roomCode;
      
      console.log('📦 Creating room:', { roomCode: normalizedRoomCode, mode: normalizedMode, address });

      const createCheck = validateCreateRoom({ roomCode, address });
      if (!createCheck.ok) {
        return res.status(createCheck.status).json(createCheck.body);
      }

    // Check database connection
    if (!pool) {
      console.error('❌ Database pool not available');
      return res.status(503).json({
        success: false,
        message: 'Database not available'
      });
    }

    try {
      // Ensure user exists first (required for foreign key constraint)
      console.log('🔄 Ensuring user exists in database...');
      await pool.query(
        `INSERT INTO users (address, user_id, created_at) 
         VALUES ($1, 'USER-' || nextval('user_id_seq'), NOW())
         ON CONFLICT (address) DO NOTHING`,
        [address]
      );
      console.log('✅ User exists in database');

      // Check if room already exists (use normalized room code)
      const existingRoom = await pool.query(
        'SELECT * FROM rooms WHERE room_code = $1',
        [normalizedRoomCode]
      );

      if (existingRoom.rows.length > 0) {
        const room = existingRoom.rows[0];
        console.log('✅ Room already exists:', room.room_code, 'current mode:', room.mode, 'requested mode:', normalizedMode);
        
        // If mode is different, update it in database
        if (normalizedMode && room.mode !== normalizedMode) {
          console.log('🔄 Updating room mode from', room.mode, 'to', normalizedMode);
          await pool.query(
            'UPDATE rooms SET mode = $1 WHERE room_code = $2',
            [normalizedMode, normalizedRoomCode]
          );
          room.mode = normalizedMode;
        }
        
        // Use the mode from database (updated if changed)
        const roomMode = room.mode || normalizedMode || 'solo';
        
        console.log('✅ Returning room with mode:', roomMode);
        
        // PERBAIKAN: Store host ship info in memory saat update existing room
        const hostShipInfo = {
          rarity: shipRarity || 'Classic',
          name: shipName || 'Classic Fighter',
          class: shipClass || 'Fighter',
          image: shipImage || '/nft-images/ships/ship-classic.gif'
        }
        const storedShips = shipStore.get(normalizedRoomCode) || { hostShip: undefined, guestShip: undefined }
        storedShips.hostShip = hostShipInfo
        shipStore.set(normalizedRoomCode, storedShips)
        console.log('✅ Host ship stored in memory for existing room:', normalizedRoomCode, hostShipInfo)
        
        // Get guest ship from store if available
        const guestShipInfo = storedShips.guestShip || (room.guest_address ? {
          rarity: 'Classic',
          name: 'Classic Fighter',
          class: 'Fighter',
          image: '/nft-images/ships/ship-classic.gif'
        } : undefined)
        
        return res.json({ 
          success: true, 
          room: {
            roomCode: room.room_code || normalizedRoomCode,
            mode: roomMode,
            hostAddress: room.host_address,
            guestAddress: room.guest_address || null,
            hostReady: room.host_ready || false,
            guestReady: room.guest_ready || false,
            status: room.status || 'waiting',
            createdAt: room.created_at,
            hostShip: hostShipInfo,
            guestShip: guestShipInfo
          }
        });
      }

      // Create new room
      const roomId = randomUUID();
      const seed = Math.floor(Math.random() * 1000000);

      console.log('🔄 Inserting new room into database...');
      console.log('📋 Room data to insert:', {
        room_id: roomId,
        room_code: normalizedRoomCode,
        host_address: address,
        mode: normalizedMode,
        seed: seed
      });
      
      const result = await pool.query(
        `INSERT INTO rooms (
          room_id, room_code, host_address, mode, seed, status, host_ready, guest_ready, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'waiting', FALSE, FALSE, NOW())
        RETURNING *`,
        [roomId, normalizedRoomCode, address, normalizedMode, seed]
      );

      if (!result || !result.rows || result.rows.length === 0) {
        throw new Error('Room insertion failed: No rows returned');
      }

      const room = result.rows[0];
      console.log('✅ Room created successfully in database:', {
        room_code: room.room_code,
        room_id: room.room_id,
        host_address: room.host_address
      });
      
      // Verify room was saved by querying it back (with retry for eventual consistency)
      let verifyRoom = await pool.query(
        'SELECT * FROM rooms WHERE room_code = $1',
        [normalizedRoomCode]
      );
      
      // If room not found immediately, wait a bit and retry (for eventual consistency)
      if (verifyRoom.rows.length === 0) {
        console.warn('⚠️ Room not found immediately after insertion, retrying...');
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
        verifyRoom = await pool.query(
          'SELECT * FROM rooms WHERE room_code = $1',
          [normalizedRoomCode]
        );
      }
      
      if (verifyRoom.rows.length === 0) {
        console.error('❌ Room was not saved to database after retry!');
        console.error('❌ Inserted room_code:', normalizedRoomCode);
        console.error('❌ Inserted room_id:', roomId);
        console.error('❌ Inserted host_address:', address);
        // Try to query all rooms to see what's in the database
        const allRooms = await pool.query('SELECT room_code, room_id, host_address FROM rooms ORDER BY created_at DESC LIMIT 10');
        console.error('❌ All rooms in database:', allRooms.rows);
        throw new Error('Room creation failed: Room not found after insertion');
      }
      
      // Use verified room data
      const verifiedRoom = verifyRoom.rows[0];
      console.log('✅ Room verified in database');
      console.log('✅ Room created successfully, mode:', normalizedMode);
      console.log('📋 Room details:', {
        room_code: verifiedRoom.room_code,
        room_id: verifiedRoom.room_id,
        host_address: verifiedRoom.host_address,
        mode: verifiedRoom.mode,
        status: verifiedRoom.status
      });
      
      // PERBAIKAN: Store host ship info in memory saat create new room
      const hostShipInfo = {
        rarity: shipRarity || 'Classic',
        name: shipName || 'Classic Fighter',
        class: shipClass || 'Fighter',
        image: shipImage || '/nft-images/ships/ship-classic.gif'
      }
      shipStore.set(normalizedRoomCode, {
        hostShip: hostShipInfo,
        guestShip: undefined
      })
      console.log('✅ Host ship stored in memory for new room:', normalizedRoomCode, hostShipInfo)
      
      // Return verified room data
      res.json({ 
        success: true, 
        room: {
          roomCode: verifiedRoom.room_code || normalizedRoomCode,
          mode: verifiedRoom.mode || normalizedMode, // Use verified mode from database
          hostAddress: verifiedRoom.host_address,
          guestAddress: verifiedRoom.guest_address || null,
          hostReady: verifiedRoom.host_ready || false,
          guestReady: verifiedRoom.guest_ready || false,
          status: verifiedRoom.status || 'waiting',
          createdAt: verifiedRoom.created_at,
          hostShip: hostShipInfo,
          guestShip: verifiedRoom.guest_address ? {
            rarity: 'Classic',
            name: 'Classic Fighter',
            class: 'Fighter',
            image: '/nft-images/ships/ship-classic.gif'
          } : undefined
        }
      });
    } catch (dbError) {
      console.error('❌ Database error creating room:', dbError);
      
      // If unique constraint violation, room already exists
      if (dbError.code === '23505' || (dbError.message && dbError.message.includes('unique'))) {
        console.log('🔄 Room already exists (unique constraint), fetching...');
        try {
          const existingResult = await pool.query(
            'SELECT * FROM rooms WHERE room_code = $1',
            [roomCode]
          );
          
          if (existingResult.rows.length > 0) {
            const room = existingResult.rows[0];
            return res.json({ 
              success: true, 
              room: {
                roomCode: room.room_code || roomCode,
                mode: room.mode || 'solo',
                hostAddress: room.host_address,
                guestAddress: room.guest_address || null,
                status: room.status || 'waiting',
                createdAt: room.created_at,
                hostShip: {
                  rarity: shipRarity || 'Classic',
                  name: shipName || 'Classic Fighter',
                  class: shipClass || 'Fighter',
                  image: shipImage || '/nft-images/ships/ship-classic.gif'
                }
              }
            });
          }
        } catch (fetchError) {
          console.error('❌ Error fetching existing room:', fetchError);
        }
      }
      
      // If table doesn't exist or other database error
      if (dbError.code === '42P01' || dbError.message.includes('does not exist')) {
        console.error('❌ Rooms table does not exist! Please run migration.');
        console.error('   Run: npm run db:migrate');
        
        // Still return mock room so frontend can continue
        // But log the error clearly
        return res.json({
          success: true,
          room: {
            roomCode,
            mode,
            hostAddress: address,
            guestAddress: null,
            status: 'waiting',
            createdAt: new Date().toISOString(),
            hostShip: {
              rarity: shipRarity || 'Classic',
              name: shipName || 'Classic Fighter',
              class: shipClass || 'Fighter',
              image: shipImage || '/nft-images/ships/ship-classic.gif'
            }
          },
          warning: 'Room created in memory only (database table does not exist)'
        });
      }
      
      // Check if it's a foreign key constraint error (user doesn't exist)
      if (dbError.code === '23503') {
        console.error('❌ Foreign key constraint error:', dbError.message);
        console.error('   User might not exist in database. Creating user first...');
        
        // Try to create user first, then retry room creation
        try {
          // Import users route function or create user directly
          await pool.query(
            `INSERT INTO users (address, user_id, created_at) 
             VALUES ($1, 'USER-' || nextval('user_id_seq'), NOW())
             ON CONFLICT (address) DO NOTHING`,
            [address]
          );
          
          // Retry room creation
          const retryResult = await pool.query(
            `INSERT INTO rooms (
              room_id, room_code, host_address, mode, seed, status, host_ready, guest_ready, created_at
            ) VALUES ($1, $2, $3, $4, $5, 'waiting', FALSE, FALSE, NOW())
            RETURNING *`,
            [randomUUID(), roomCode, address, mode, Math.floor(Math.random() * 1000000)]
          );
          
          const room = retryResult.rows[0];
          return res.json({ 
            success: true, 
            room: {
              roomCode: room.room_code || roomCode,
              mode: room.mode || 'solo',
              hostAddress: room.host_address,
              guestAddress: room.guest_address || null,
              status: room.status || 'waiting',
              createdAt: room.created_at,
              hostShip: {
                rarity: shipRarity || 'Classic',
                name: shipName || 'Classic Fighter',
                class: shipClass || 'Fighter',
                image: shipImage || '/nft-images/ships/ship-classic.gif'
              }
            }
          });
        } catch (retryError) {
          console.error('❌ Retry failed:', retryError.message);
        }
      }
      
      // Return error with details
      console.error('❌ Database error details:', {
        code: dbError.code,
        message: dbError.message,
        detail: dbError.detail,
        constraint: dbError.constraint
      });
      
      res.status(500).json({ 
        success: false, 
        message: dbError.message || 'Failed to create room',
        error: dbError.code,
        detail: dbError.detail,
        constraint: dbError.constraint,
        details: process.env.NODE_ENV === 'development' ? dbError.stack : undefined
      });
    }
  } catch (error) {
    console.error('❌ Error in create room endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get room by code
router.get('/:roomCode', async (req, res) => {
  try {
    const { roomCode } = req.params;
    console.log('🔍 Getting room:', roomCode);

    // Check database connection
    if (!pool) {
      console.warn('⚠️ Database pool not available, returning 404');
      return res.status(404).json({ 
        success: false, 
        message: 'Room not found (database not available)' 
      });
    }

    try {
      // Normalize room_code (trim whitespace)
      const normalizedRoomCode = roomCode ? roomCode.trim() : roomCode;
      console.log('🔍 Searching for room with code:', normalizedRoomCode);
      
      // Simplify query - hanya ambil dari rooms table, tanpa JOIN users (untuk menghindari error)
      let result = await pool.query(
        `SELECT * FROM rooms WHERE room_code = $1 LIMIT 1`,
        [normalizedRoomCode]
      );

      // If not found, try case-insensitive search
      if (result.rows.length === 0) {
        console.log('⚠️ Room not found with exact match, trying case-insensitive...');
        result = await pool.query(
          `SELECT * FROM rooms WHERE LOWER(room_code) = LOWER($1) LIMIT 1`,
          [normalizedRoomCode]
        );
      }

      if (result.rows.length === 0) {
        console.log('⚠️ Room not found in database:', normalizedRoomCode);
        // Safe query untuk debug - handle error jika table tidak ada
        try {
          const allRooms = await pool.query(
            'SELECT room_code, mode, host_address, guest_address FROM rooms ORDER BY created_at DESC LIMIT 10'
          );
          console.log('📋 Recent rooms in database:', allRooms.rows.map(r => ({
            code: r.room_code,
            mode: r.mode,
            host: r.host_address?.slice(0, 8),
            guest: r.guest_address?.slice(0, 8) || 'none'
          })));
        } catch (debugError) {
          console.error('⚠️ Could not fetch debug rooms:', debugError.message);
        }
        return res.status(404).json({ 
          success: false, 
          message: `Room not found: ${normalizedRoomCode}` 
        });
      }

      const room = result.rows[0];
      console.log('✅ Room found:', room.room_code);
      console.log('📋 Room details from GET:', {
        room_code: room.room_code,
        room_id: room.room_id,
        host_address: room.host_address,
        guest_address: room.guest_address,
        mode: room.mode,
        status: room.status
      });
      
      // PERBAIKAN: Get ship info from memory store, jika tidak ada gunakan default
      // Ini memungkinkan backend mengembalikan ship yang benar yang disimpan saat create/join room
      const storedShips = shipStore.get(normalizedRoomCode)
      let hostShip = {
        rarity: 'Classic',
        name: 'Classic Fighter',
        class: 'Fighter',
        image: '/nft-images/ships/ship-classic.gif'
      }
      let guestShip = undefined
      
      if (storedShips) {
        if (storedShips.hostShip) {
          hostShip = storedShips.hostShip
          console.log('✅ Using stored host ship from memory:', hostShip)
        }
        if (storedShips.guestShip && room.guest_address) {
          guestShip = storedShips.guestShip
          console.log('✅ Using stored guest ship from memory:', guestShip)
        }
      } else {
        console.log('⚠️ No stored ships found, using defaults')
      }
      
      // Jika ada guest tapi tidak ada guestShip di store, gunakan default
      if (room.guest_address && !guestShip) {
        guestShip = {
          rarity: 'Classic',
          name: 'Classic Fighter',
          class: 'Fighter',
          image: '/nft-images/ships/ship-classic.gif'
        }
        console.log('⚠️ Guest exists but no stored guest ship, using default')
      }
      
      res.json({ 
        success: true, 
        room: {
          roomCode: room.room_code || normalizedRoomCode,
          mode: room.mode || 'solo',
          hostAddress: room.host_address,
          guestAddress: room.guest_address || null,
          hostReady: room.host_ready || false,
          guestReady: room.guest_ready || false,
          status: room.status || 'waiting',
          createdAt: room.created_at,
          hostShip,
          guestShip
        }
      });
    } catch (dbError) {
      console.error('❌ Database error getting room:', dbError);
      console.error('Error details:', {
        code: dbError.code,
        message: dbError.message,
        detail: dbError.detail,
        stack: dbError.stack
      });
      
      // If table doesn't exist
      if (dbError.code === '42P01' || dbError.message.includes('does not exist')) {
        console.error('❌ Rooms table does not exist! Please run migration.');
        console.error('   Run: npm run db:migrate');
        return res.status(500).json({ 
          success: false, 
          message: 'Database table does not exist. Please run: npm run db:migrate',
          error: dbError.code
        });
      }
      
      res.status(500).json({ 
        success: false, 
        message: dbError.message || 'Error getting room',
        error: dbError.code,
        detail: dbError.detail
      });
    }
  } catch (error) {
    console.error('❌ Error in get room endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Unknown error' 
    });
  }
});

// Start room (update status to playing)
// If room doesn't exist, create it first (idempotent)
router.post('/:roomCode/start', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { address, mode = 'solo' } = req.body; // Optional: address and mode from request body

    // Normalize mode value (trim, lowercase, validate)
    const normalizedMode = mode ? mode.toString().trim().toLowerCase() : 'solo';
    
    // Validate mode against database constraint
    const validModes = ['solo', 'versus', 'multiplayer'];
    if (!validModes.includes(normalizedMode)) {
      console.error('❌ Invalid mode value:', mode, '-> normalized:', normalizedMode);
      return res.status(400).json({ 
        success: false, 
        message: `Invalid mode: ${mode}. Must be one of: ${validModes.join(', ')}`,
        received: mode,
        normalized: normalizedMode,
        validModes
      });
    }

    console.log('▶️ Starting room:', roomCode, 'mode:', normalizedMode);

    // Check database connection
    if (!pool) {
      console.warn('⚠️ Database pool not available');
      return res.status(503).json({ 
        success: false, 
        message: 'Database not available' 
      });
    }

    try {
      // First, try to update existing room
      const updateResult = await pool.query(
        `UPDATE rooms 
         SET status = 'playing'
         WHERE room_code = $1
         RETURNING *`,
        [roomCode]
      );

      if (updateResult.rows.length > 0) {
        console.log('✅ Room status updated to playing:', roomCode);
        return res.json({ success: true, room: updateResult.rows[0] });
      }

      // Room doesn't exist, create it if we have address
      if (address) {
        console.log('📦 Room not found, creating room before starting:', roomCode);
        
        // Ensure user exists first
        await pool.query(
          `INSERT INTO users (address, user_id, created_at) 
           VALUES ($1, 'USER-' || nextval('user_id_seq'), NOW())
           ON CONFLICT (address) DO NOTHING`,
          [address]
        );

        // Create room with playing status
        const roomId = randomUUID();
        const seed = Math.floor(Math.random() * 1000000);

        const createResult = await pool.query(
          `INSERT INTO rooms (
            room_id, room_code, host_address, mode, seed, status, host_ready, guest_ready, created_at
          ) VALUES ($1, $2, $3, $4, $5, 'playing', FALSE, FALSE, NOW())
          RETURNING *`,
          [roomId, roomCode, address, normalizedMode, seed]
        );

        console.log('✅ Room created and started:', roomCode);
        return res.json({ success: true, room: createResult.rows[0] });
      }

      // No address provided, just return success (room might be in cache only)
      console.log('⚠️ Room not found in database and no address provided, returning success');
      return res.json({ 
        success: true, 
        message: 'Room started (room not in database, but operation completed)',
        room: { room_code: roomCode, status: 'playing' }
      });

    } catch (dbError) {
      console.error('❌ Database error starting room:');
      console.error('Error type:', dbError.constructor.name);
      console.error('Error message:', dbError.message);
      console.error('Error code:', dbError.code);
      console.error('Error detail:', dbError.detail);
      console.error('Error constraint:', dbError.constraint);
      console.error('Error stack:', dbError.stack);
      
      // If table doesn't exist
      if (dbError.code === '42P01' || dbError.message.includes('does not exist')) {
        console.error('❌ Rooms table does not exist! Please run migration.');
        return res.status(500).json({ 
          success: false, 
          message: 'Database table does not exist. Please run: npm run db:migrate',
          error: dbError.code,
          detail: dbError.message
        });
      }
      
      throw dbError;
    }

  } catch (error) {
    console.error('❌ Error starting room:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Unknown error',
      error: error.code,
      detail: error.detail
    });
  }
});

// Finish room (update status to finished)
// If room doesn't exist, create it first (idempotent)
router.post('/:roomCode/finish', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { address, mode = 'solo' } = req.body; // Optional: address and mode from request body

    // Normalize mode value
    const normalizedMode = mode ? mode.toString().trim().toLowerCase() : 'solo';
    const validModes = ['solo', 'versus', 'multiplayer'];
    if (!validModes.includes(normalizedMode)) {
      console.error('❌ Invalid mode value:', mode);
      return res.status(400).json({ 
        success: false, 
        message: `Invalid mode: ${mode}. Must be one of: ${validModes.join(', ')}` 
      });
    }

    console.log('🏁 Finishing room:', roomCode, 'mode:', normalizedMode);

    // Check database connection
    if (!pool) {
      console.warn('⚠️ Database pool not available');
      return res.status(503).json({ 
        success: false, 
        message: 'Database not available' 
      });
    }

    try {
      // First, try to update existing room
      const updateResult = await pool.query(
        `UPDATE rooms 
         SET status = 'finished'
         WHERE room_code = $1
         RETURNING *`,
        [roomCode]
      );

      if (updateResult.rows.length > 0) {
        console.log('✅ Room status updated to finished:', roomCode);
        return res.json({ success: true, room: updateResult.rows[0] });
      }

      // Room doesn't exist, create it if we have address
      if (address) {
        console.log('📦 Room not found, creating room before finishing:', roomCode);
        
        // Ensure user exists first
        await pool.query(
          `INSERT INTO users (address, user_id, created_at) 
           VALUES ($1, 'USER-' || nextval('user_id_seq'), NOW())
           ON CONFLICT (address) DO NOTHING`,
          [address]
        );

        // Create room with finished status
        const roomId = randomUUID();
        const seed = Math.floor(Math.random() * 1000000);

        const createResult = await pool.query(
          `INSERT INTO rooms (
            room_id, room_code, host_address, mode, seed, status, host_ready, guest_ready, created_at
          ) VALUES ($1, $2, $3, $4, $5, 'finished', FALSE, FALSE, NOW())
          RETURNING *`,
          [roomId, roomCode, address, normalizedMode, seed]
        );

        console.log('✅ Room created and finished:', roomCode);
        return res.json({ success: true, room: createResult.rows[0] });
      }

      // No address provided, just return success (room might be in cache only)
      console.log('⚠️ Room not found in database and no address provided, returning success');
      return res.json({ 
        success: true, 
        message: 'Room finished (room not in database, but operation completed)',
        room: { room_code: roomCode, status: 'finished' }
      });

    } catch (dbError) {
      console.error('❌ Database error finishing room:');
      console.error('Error type:', dbError.constructor.name);
      console.error('Error message:', dbError.message);
      console.error('Error code:', dbError.code);
      console.error('Error detail:', dbError.detail);
      console.error('Error constraint:', dbError.constraint);
      console.error('Error stack:', dbError.stack);
      
      // If table doesn't exist
      if (dbError.code === '42P01' || dbError.message.includes('does not exist')) {
        console.error('❌ Rooms table does not exist! Please run migration.');
        return res.status(500).json({ 
          success: false, 
          message: 'Database table does not exist. Please run: npm run db:migrate',
          error: dbError.code,
          detail: dbError.message
        });
      }
      
      throw dbError;
    }

  } catch (error) {
    console.error('❌ Error finishing room:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Unknown error',
      error: error.code,
      detail: error.detail
    });
  }
});

// Join room (add guest to multiplayer room)
router.post('/:roomCode/join', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { 
      address, 
      shipRarity, 
      shipName, 
      shipClass,
      shipImage
    } = req.body;

    console.log('🔗 Joining room:', roomCode, 'address:', address);

    if (!roomCode || !address) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: roomCode, address' 
      });
    }

    // Check database connection
    if (!pool) {
      console.error('❌ Database pool not available');
      return res.status(503).json({
        success: false,
        message: 'Database not available'
      });
    }

    try {
      // Ensure user exists first
      console.log('🔄 Ensuring user exists in database...');
      await pool.query(
        `INSERT INTO users (address, user_id, created_at) 
         VALUES ($1, 'USER-' || nextval('user_id_seq'), NOW())
         ON CONFLICT (address) DO NOTHING`,
        [address]
      );
      console.log('✅ User exists in database');

      // Normalize room_code (trim whitespace)
      const normalizedRoomCode = roomCode ? roomCode.trim() : roomCode;
      console.log('🔍 Joining room with code:', normalizedRoomCode);
      
      // Check if room exists (case-sensitive first)
      let roomResult = await pool.query(
        'SELECT * FROM rooms WHERE room_code = $1',
        [normalizedRoomCode]
      );

      // If not found, try case-insensitive search
      if (roomResult.rows.length === 0) {
        console.log('⚠️ Room not found with exact match, trying case-insensitive...');
        roomResult = await pool.query(
          'SELECT * FROM rooms WHERE LOWER(room_code) = LOWER($1)',
          [normalizedRoomCode]
        );
      }

      if (roomResult.rows.length === 0) {
        console.log('❌ Room not found for join:', normalizedRoomCode);
        console.log('🔍 Attempted to join room with code:', normalizedRoomCode);
        // Try to find similar room codes for debugging
        const allRooms = await pool.query('SELECT room_code, mode, host_address, guest_address FROM rooms ORDER BY created_at DESC LIMIT 10');
        console.log('📋 Recent rooms in database:', allRooms.rows.map(r => ({
          code: r.room_code,
          mode: r.mode,
          host: r.host_address?.slice(0, 8),
          guest: r.guest_address?.slice(0, 8) || 'none'
        })));
        return res.status(404).json({ 
          success: false, 
          message: `Room not found: ${normalizedRoomCode}` 
        });
      }

      const room = roomResult.rows[0];
      console.log('✅ Room found for join:', room.room_code);
      console.log('📋 Room details for join:', {
        room_code: room.room_code,
        mode: room.mode,
        host_address: room.host_address,
        guest_address: room.guest_address,
        status: room.status
      });

      // Validate the join against the room (mode, capacity, self-join).
      const joinCheck = validateJoin(room, address);
      if (!joinCheck.ok) {
        return res.status(joinCheck.status).json(joinCheck.body);
      }
      if (joinCheck.alreadyGuest) {
          console.log('✅ User is already the guest in this room');
          // PERBAIKAN: Return guest ship info dari request body (ship info guest saat join)
          const guestShipInfo = {
            rarity: shipRarity || 'Classic',
            name: shipName || 'Classic Fighter',
            class: shipClass || 'Fighter',
            image: shipImage || '/nft-images/ships/ship-classic.gif'
          }
          
          // PERBAIKAN: Store guest ship info in memory untuk digunakan saat GET room
          const storedShips = shipStore.get(normalizedRoomCode) || { hostShip: undefined, guestShip: undefined }
          storedShips.guestShip = guestShipInfo
          shipStore.set(normalizedRoomCode, storedShips)
          console.log('✅ Guest ship stored in memory for room (already in room):', normalizedRoomCode)
          
          return res.json({ 
            success: true, 
            room: {
              roomCode: room.room_code,
              mode: room.mode,
              hostAddress: room.host_address,
              guestAddress: room.guest_address,
              hostReady: room.host_ready || false,
              guestReady: room.guest_ready || false,
              status: room.status,
              createdAt: room.created_at,
              hostShip: {
                rarity: 'Classic',
                name: 'Classic Fighter',
                class: 'Fighter',
                image: '/nft-images/ships/ship-classic.gif'
              },
              guestShip: guestShipInfo // PERBAIKAN: Return guest ship info
            },
            message: 'Already in room'
          });
      }

      // Add guest to room (use normalized room code)
      const updateResult = await pool.query(
        `UPDATE rooms 
         SET guest_address = $1,
             status = 'waiting'
         WHERE room_code = $2
         RETURNING *`,
        [address, normalizedRoomCode]
      );

      if (updateResult.rows.length === 0) {
        throw new Error('Failed to update room');
      }

      const updatedRoom = updateResult.rows[0];
      console.log('✅ Guest joined room successfully:', roomCode);

      // PERBAIKAN: Get host ship info - perlu query dari database atau gunakan default
      // Untuk sekarang, gunakan default (frontend akan override dengan localStorage)
      const hostShipInfo = {
        rarity: 'Classic', // TODO: Get from database or request
        name: 'Classic Fighter',
        class: 'Fighter',
        image: '/nft-images/ships/ship-classic.gif'
      }

      // PERBAIKAN: Get guest ship info dari request body (ship info guest saat join)
      // Ini adalah ship info guest yang dikirim saat join room
      const guestShipInfo = {
        rarity: shipRarity || 'Classic',
        name: shipName || 'Classic Fighter',
        class: shipClass || 'Fighter',
        image: shipImage || '/nft-images/ships/ship-classic.gif'
      }

      // PERBAIKAN: Store guest ship info in memory untuk digunakan saat GET room
      const storedShips = shipStore.get(normalizedRoomCode) || { hostShip: undefined, guestShip: undefined }
      storedShips.guestShip = guestShipInfo
      shipStore.set(normalizedRoomCode, storedShips)
      console.log('✅ Guest joined with ship:', guestShipInfo)
      console.log('✅ Guest ship stored in memory for room:', normalizedRoomCode)

      res.json({ 
        success: true, 
        room: {
          roomCode: updatedRoom.room_code,
          mode: updatedRoom.mode,
          hostAddress: updatedRoom.host_address,
          guestAddress: updatedRoom.guest_address,
          hostReady: updatedRoom.host_ready || false,
          guestReady: updatedRoom.guest_ready || false,
          status: updatedRoom.status,
          createdAt: updatedRoom.created_at,
          hostShip: hostShipInfo,
          guestShip: guestShipInfo // PERBAIKAN: Return guest ship info dari request
        }
      });
    } catch (dbError) {
      console.error('❌ Database error joining room:', dbError);
      res.status(500).json({ 
        success: false, 
        message: dbError.message || 'Failed to join room',
        error: dbError.code
      });
    }
  } catch (error) {
    console.error('❌ Error in join room endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Unknown error' 
    });
  }
});

// Update ready status
router.post('/:roomCode/ready', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { address, ready } = req.body;

    console.log('🎮 Updating ready status:', { roomCode, address, ready });

    if (!roomCode || !address || typeof ready !== 'boolean') {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: roomCode, address, ready (boolean)' 
      });
    }

    // Check database connection
    if (!pool) {
      console.error('❌ Database pool not available');
      return res.status(503).json({
        success: false,
        message: 'Database not available'
      });
    }

    try {
      // Normalize room_code
      const normalizedRoomCode = roomCode ? roomCode.trim() : roomCode;

      // Get room
      const roomResult = await pool.query(
        'SELECT * FROM rooms WHERE room_code = $1',
        [normalizedRoomCode]
      );

      if (roomResult.rows.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: `Room not found: ${normalizedRoomCode}` 
        });
      }

      const room = roomResult.rows[0];

      // Determine if user is host or guest and which column to update.
      const readyCheck = readyUpdate(room, address, ready);
      if (!readyCheck.ok) {
        return res.status(readyCheck.status).json(readyCheck.body);
      }

      // Update ready status
      const updateQuery = await pool.query(
        readyCheck.field === 'host_ready'
          ? `UPDATE rooms
           SET host_ready = $1
           WHERE room_code = $2
           RETURNING *`
          : `UPDATE rooms
           SET guest_ready = $1
           WHERE room_code = $2
           RETURNING *`,
        readyCheck.params
      );

      const updatedRoom = updateQuery.rows[0];
      console.log('✅ Ready status updated:', {
        room_code: updatedRoom.room_code,
        host_ready: updatedRoom.host_ready,
        guest_ready: updatedRoom.guest_ready
      });

      res.json({ 
        success: true, 
        room: {
          roomCode: updatedRoom.room_code,
          mode: updatedRoom.mode,
          hostAddress: updatedRoom.host_address,
          guestAddress: updatedRoom.guest_address,
          hostReady: updatedRoom.host_ready,
          guestReady: updatedRoom.guest_ready,
          status: updatedRoom.status
        }
      });
    } catch (dbError) {
      console.error('❌ Database error updating ready status:', dbError);
      res.status(500).json({ 
        success: false, 
        message: dbError.message || 'Failed to update ready status',
        error: dbError.code
      });
    }
  } catch (error) {
    console.error('❌ Error in ready status endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Unknown error' 
    });
  }
});

export default router;

