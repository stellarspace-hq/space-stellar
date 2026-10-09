import express from 'express';
import { pool } from '../server.js';
import { randomUUID } from 'crypto';
import { requireSignedAddress, authPayload } from '../utils/auth.js';
import {
  parseScore,
  parseDuration,
  computeWinner,
  deriveCoinsReward,
} from '../utils/matchRules.js';

const router = express.Router();

// Saving a match requires proving control of the participant address, so a
// modified client cannot post scores for someone else.
const requireBodyAddressSignature = requireSignedAddress(
  (req) => req.body?.address,
  authPayload
);

// Submit match result
router.post('/submit', async (req, res) => {
  try {
    const { 
      mode, 
      p1Address, 
      p2Address, 
      p1ShipTokenId, 
      p2ShipTokenId,
      p1Score, 
      p2Score, 
      durationMs 
    } = req.body;

    if (!p1Address || !p1Score || !mode) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }

    const matchId = randomUUID();

    // Insert match
    const matchResult = await pool.query(
      `INSERT INTO matches (
        match_id, mode, p1_address, p2_address, 
        p1_ship_token_id, p2_ship_token_id,
        p1_score, p2_score, duration_ms, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *`,
      [
        matchId, mode, p1Address, p2Address || null,
        p1ShipTokenId || null, p2ShipTokenId || null,
        p1Score, p2Score || null, durationMs || 0
      ]
    );

    // Update leaderboard for player 1
    await pool.query(
      `INSERT INTO leaderboard (address, best_score, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (address) 
       DO UPDATE SET 
         best_score = GREATEST(leaderboard.best_score, $2),
         updated_at = NOW()`,
      [p1Address, p1Score]
    );

    // Update leaderboard for player 2 if exists
    if (p2Address && p2Score) {
      await pool.query(
        `INSERT INTO leaderboard (address, best_score, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (address) 
         DO UPDATE SET 
           best_score = GREATEST(leaderboard.best_score, $2),
           updated_at = NOW()`,
        [p2Address, p2Score]
      );
    }

    res.json({ success: true, match: matchResult.rows[0] });
  } catch (error) {
    console.error('Error submitting match:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const { limit = 100 } = req.query;

    const result = await pool.query(
      `SELECT 
        l.address,
        u.username,
        l.best_score,
        l.updated_at
       FROM leaderboard l
       LEFT JOIN users u ON u.address = l.address
       ORDER BY l.best_score DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ success: true, leaderboard: result.rows });
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get user match history
router.get('/history/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { limit = 50 } = req.query;

    // Query ALL matches for user (all scores, not just best score)
    // Remove duplicates by match_id only
    // Include ship name and rarity for history display
    // PERBAIKAN: Urutkan berdasarkan created_at DESC (terbaru di atas)
    // Gunakan subquery untuk mendapatkan distinct matches yang sudah diurutkan
    const result = await pool.query(
      `SELECT 
        m.match_id,
        COALESCE(m.room_code, 'N/A') as room_code,
        m.mode,
        m.p1_address,
        m.p2_address,
        m.p1_score,
        m.p2_score,
        m.p1_ship_name,
        m.p2_ship_name,
        m.p1_ship_rarity,
        m.p2_ship_rarity,
        m.duration_ms,
        m.created_at,
        u1.username as p1_username,
        u2.username as p2_username
      FROM (
        SELECT DISTINCT ON (match_id) *
        FROM matches
        WHERE p1_address = $1 OR p2_address = $1
        ORDER BY match_id, created_at DESC
      ) m
      LEFT JOIN users u1 ON u1.address = m.p1_address
      LEFT JOIN users u2 ON u2.address = m.p2_address
      ORDER BY m.created_at DESC
      LIMIT $2`,
      [address, limit]
    );

    // Remove duplicates by match_id (double safety check)
    // This ensures we only show unique matches, but ALL matches are included
    const seenMatchIds = new Set();
    const uniqueMatches = result.rows.filter(match => {
      if (seenMatchIds.has(match.match_id)) {
        return false;
      }
      seenMatchIds.add(match.match_id);
      return true;
    });
    
    console.log(`📊 Found ${result.rows.length} total matches, ${uniqueMatches.length} unique matches for ${address}`);

    // Format history for frontend
    const history = uniqueMatches.map(match => {
      // Get ship name and rarity from match data
      const isPlayer1 = match.p1_address === address;
      let shipName = isPlayer1 
        ? (match.p1_ship_name || null)
        : (match.p2_ship_name || null);
      const shipRarity = isPlayer1
        ? (match.p1_ship_rarity || null)
        : (match.p2_ship_rarity || null);
      
      // Use ship name if available, otherwise map rarity to ship name
      let shipType = shipName;
      if (!shipType && shipRarity) {
        // Map rarity to ship name for display
        const rarityToName = {
          'Common': 'Elite Fighter',
          'Elite': 'Elite Fighter',
          'Epic': 'Epic Destroyer',
          'Legendary': 'Legendary Cruiser',
          'Master': 'Master Battleship',
          'Ultra': 'Ultra Command',
          'Classic': 'Classic Fighter'
        };
        shipType = rarityToName[shipRarity] || shipRarity || 'Classic Fighter';
      }
      
      // Final fallback
      if (!shipType) {
        shipType = 'Classic Fighter';
      }
      
      console.log(`📊 Match ${match.match_id}: shipName=${shipName}, shipRarity=${shipRarity}, shipType=${shipType}`);
      
      return {
        matchId: match.match_id,
        playerId: address,
        playerName: isPlayer1 ? (match.p1_username || 'Player') : (match.p2_username || 'Player'),
        roomCode: match.room_code || 'N/A',
        score: isPlayer1 ? match.p1_score : (match.p2_score || 0),
        shipType: shipType,
        shipRarity: shipRarity || 'Classic',
        date: match.created_at
      };
    });

    // PERBAIKAN: Urutkan history berdasarkan date DESC (terbaru di atas) untuk memastikan urutan benar
    history.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA; // DESC: terbaru di atas
    });

    console.log(`✅ History loaded: ${history.length} unique matches for ${address} (sorted by date DESC)`);
    res.json({ success: true, history });
  } catch (error) {
    console.error('Error getting match history:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Save match result (simplified version)
//
// SECURITY: the client-supplied `score`/`coins` are untrusted input. This
// handler requires a signed challenge from `address`, validates the score
// against server bounds, requires a matching server-side session (the room
// record for multiplayer, the authenticated proof for solo), computes the
// winner itself, and derives the coin reward from the validated score. The
// posted `coins` value is never credited.
router.post('/save', requireBodyAddressSignature, async (req, res) => {
  console.log('📥 Received match save request:', req.body);
  
  try {
    const { 
      roomCode,
      mode, 
      address, 
      shipRarity,
      shipName,
      score,
      duration = 0
    } = req.body;

    // Normalize mode value (trim, lowercase, validate)
    const normalizedMode = mode ? mode.toString().trim().toLowerCase() : 'solo';
    
    // Validate mode against database constraint
    const validModes = ['solo', 'versus', 'multiplayer'];
    if (!validModes.includes(normalizedMode)) {
      console.error('❌ Invalid mode value:', mode, '-> normalized:', normalizedMode);
      console.error('   Valid modes:', validModes);
      return res.status(400).json({ 
        success: false, 
        message: `Invalid mode: ${mode}. Must be one of: ${validModes.join(', ')}`,
        received: mode,
        normalized: normalizedMode,
        validModes
      });
    }

    if (!address) {
      console.error('❌ Missing required fields:', { address: !!address });
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required field: address'
      });
    }

    // Validate the score/!duration server-side. parseScore rejects NaN,
    // floats, negatives and absurd values; the posted `coins` is ignored.
    const validatedScore = parseScore(score);
    if (validatedScore === null) {
      console.error('❌ Invalid score:', score);
      return res.status(400).json({ success: false, message: 'Invalid score' });
    }
    const validatedDuration = parseDuration(duration);
    if (validatedDuration === null) {
      console.error('❌ Invalid duration:', duration);
      return res.status(400).json({ success: false, message: 'Invalid duration' });
    }

    console.log('💾 Saving match:', { roomCode, mode: normalizedMode, address, score: validatedScore, shipRarity, shipName, duration: validatedDuration });

    // Check database connection
    if (!pool) {
      console.error('❌ Database pool not available');
      return res.status(503).json({ 
        success: false, 
        message: 'Database not available' 
      });
    }

    // Test database connection
    try {
      await pool.query('SELECT 1');
      console.log('✅ Database connection OK');
    } catch (connError) {
      console.error('❌ Database connection test failed:', connError.message);
      return res.status(503).json({ 
        success: false, 
        message: 'Database connection failed: ' + connError.message 
      });
    }

    // Require a matching server-side session. For a multiplayer/versus room the
    // address must be a recorded participant of that room; for solo the
    // authenticated signed proof above is the session.
    const normalizedRoomCode = roomCode ? String(roomCode).trim() : '';
    const isRoomMatch = normalizedRoomCode !== '' && normalizedRoomCode.toLowerCase() !== 'solo';
    if (isRoomMatch) {
      const roomResult = await pool.query(
        'SELECT host_address, guest_address FROM rooms WHERE room_code = $1',
        [normalizedRoomCode]
      );
      if (roomResult.rows.length === 0) {
        console.error('❌ No room session for room code:', normalizedRoomCode);
        return res.status(403).json({ success: false, message: 'No server-side session found for this room' });
      }
      const room = roomResult.rows[0];
      if (room.host_address !== address && room.guest_address !== address) {
        console.error('❌ Address is not a participant of the room:', { address, room: normalizedRoomCode });
        return res.status(403).json({ success: false, message: 'Address is not a participant of this room' });
      }
    }

    // The server computes the winner and the coin reward from the validated
    // inputs; the posted `coins` value is discarded.
    const winnerAddress = computeWinner({
      p1Address: address,
      p2Address: null,
      p1Score: validatedScore,
      p2Score: null
    });
    const coinsEarned = deriveCoinsReward(validatedScore);

    try {
      console.log('🔄 Step 1: Ensuring user exists...');
      // Ensure user exists first
      try {
        await pool.query(
          `INSERT INTO users (address, user_id, created_at) 
           VALUES ($1, 'USER-' || nextval('user_id_seq'), NOW())
           ON CONFLICT (address) DO NOTHING`,
          [address]
        );
        console.log('✅ User exists or created');
      } catch (userError) {
        console.error('❌ Error ensuring user exists:', userError.message);
        console.error('Error code:', userError.code);
        console.error('Error detail:', userError.detail);
        throw userError;
      }

      console.log('🔄 Step 2: Checking for duplicate match...');
      // Check for duplicate match (same room_code, address, score within last 10 seconds)
      // This prevents duplicate saves from frontend retries or multiple calls
      // Increase time window to 10 seconds to catch all duplicates
      if (normalizedRoomCode) {
        const duplicateCheck = await pool.query(
          `SELECT match_id FROM matches 
           WHERE room_code = $1 
           AND p1_address = $2 
           AND p1_score = $3 
           AND created_at > NOW() - INTERVAL '10 seconds'
           ORDER BY created_at DESC
           LIMIT 1`,
          [normalizedRoomCode, address, validatedScore]
        );
        
        if (duplicateCheck.rows.length > 0) {
          console.log('⚠️ Duplicate match detected (with room_code), returning existing match:', duplicateCheck.rows[0].match_id);
          const existingMatch = await pool.query(
            'SELECT * FROM matches WHERE match_id = $1',
            [duplicateCheck.rows[0].match_id]
          );
          console.log('✅ Returning existing match (duplicate prevented)');
          return res.json({ success: true, match: existingMatch.rows[0], duplicate: true });
        }
      }
      
      // Also check for duplicate without room_code (fallback for games without room)
      // Same address and score within last 10 seconds (only if no room_code provided)
      if (!normalizedRoomCode) {
        const duplicateCheckNoRoom = await pool.query(
          `SELECT match_id FROM matches 
           WHERE p1_address = $1 
           AND p1_score = $2 
           AND created_at > NOW() - INTERVAL '10 seconds'
           AND (room_code IS NULL OR room_code = '')
           ORDER BY created_at DESC
           LIMIT 1`,
          [address, validatedScore]
        );
        
        if (duplicateCheckNoRoom.rows.length > 0) {
          console.log('⚠️ Duplicate match detected (no room_code), returning existing match:', duplicateCheckNoRoom.rows[0].match_id);
          const existingMatch = await pool.query(
            'SELECT * FROM matches WHERE match_id = $1',
            [duplicateCheckNoRoom.rows[0].match_id]
          );
          console.log('✅ Returning existing match (duplicate prevented)');
          return res.json({ success: true, match: existingMatch.rows[0], duplicate: true });
        }
      }

      console.log('🔄 Step 3: Inserting match...');
      const matchId = randomUUID();

      // Insert match (simplified for solo play)
      // Store ship name and rarity for history display
      let matchResult;
      try {
        matchResult = await pool.query(
          `INSERT INTO matches (
            match_id, mode, p1_address, p1_score, duration_ms, room_code, 
            p1_ship_name, p1_ship_rarity, winner_address, coins_awarded,
            seed, checksum, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          RETURNING *`,
          [matchId, normalizedMode, address, validatedScore, validatedDuration, normalizedRoomCode || null, 
           shipName || 'Classic Fighter', shipRarity || 'Classic', winnerAddress, coinsEarned, seed, checksum]
            p1_ship_name, p1_ship_rarity, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          RETURNING *`,
          [matchId, normalizedMode, address, score, duration, roomCode || null, 
           shipName || 'Classic Fighter', shipRarity || 'Classic']
        );
        console.log('✅ Match saved:', matchResult.rows[0].match_id);
      } catch (matchError) {
        console.error('❌ Error inserting match:', matchError.message);
        console.error('Error code:', matchError.code);
        console.error('Error detail:', matchError.detail);
        console.error('Error constraint:', matchError.constraint);
        throw matchError;
      }

      console.log('🔄 Step 4: Updating leaderboard...');
      // Update leaderboard
      try {
        await pool.query(
          `INSERT INTO leaderboard (address, best_score, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (address) 
           DO UPDATE SET 
             best_score = GREATEST(leaderboard.best_score, $2),
             updated_at = NOW()`,
          [address, validatedScore]
        );
        console.log('✅ Leaderboard updated');
      } catch (leaderboardError) {
        console.error('❌ Error updating leaderboard:', leaderboardError.message);
        console.error('Error code:', leaderboardError.code);
        console.error('Error detail:', leaderboardError.detail);
        // Don't throw - match is already saved, leaderboard update is secondary
        console.warn('⚠️ Match saved but leaderboard update failed (non-critical)');
      }

      // Step 5: Credit the server-derived coin reward. This is the only place
      // points are credited for a match, and the amount comes from the
      // validated score - never from the posted body.
      if (coinsEarned > 0) {
        try {
          await pool.query(
            `UPDATE users 
             SET points = points + $1,
                 updated_at = NOW()
             WHERE address = $2`,
            [coinsEarned, address]
          );
          console.log(`✅ Credited ${coinsEarned} points (server-derived) to ${address.slice(0, 8)}...`);
        } catch (pointsError) {
          console.error('❌ Error crediting match reward:', pointsError.message);
          // Match is saved; reward failure is non-critical and logged.
        }
      }

      console.log('✅ Match save completed successfully');
      res.json({
        success: true,
        match: matchResult.rows[0],
        winnerAddress,
        coinsEarned
      });
    } catch (dbError) {
      console.error('❌ Database error saving match:');
      console.error('Error type:', dbError.constructor.name);
      console.error('Error message:', dbError.message);
      console.error('Error code:', dbError.code);
      console.error('Error detail:', dbError.detail);
      console.error('Error constraint:', dbError.constraint);
      console.error('Error stack:', dbError.stack);
      
      // If table doesn't exist
      if (dbError.code === '42P01' || dbError.message.includes('does not exist')) {
        console.error('❌ Matches table does not exist! Please run migration.');
        return res.status(500).json({ 
          success: false, 
          message: 'Database table does not exist. Please run: npm run db:migrate',
          error: dbError.code
        });
      }
      
      // If foreign key constraint (user doesn't exist)
      if (dbError.code === '23503') {
        console.error('❌ Foreign key constraint error:', dbError.message);
        // Try to create user and retry
        try {
          await pool.query(
            `INSERT INTO users (address, user_id, created_at) 
             VALUES ($1, 'USER-' || nextval('user_id_seq'), NOW())
             ON CONFLICT (address) DO NOTHING`,
            [address]
          );
          
          // Retry match insertion
          const matchId = randomUUID();
          const matchResult = await pool.query(
            `INSERT INTO matches (
              match_id, mode, p1_address, p1_score, duration_ms, room_code,
              winner_address, coins_awarded, seed, checksum, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            RETURNING *`,
            [matchId, normalizedMode, address, validatedScore, validatedDuration, normalizedRoomCode || null,
             winnerAddress, coinsEarned, seed, checksum]
              match_id, mode, p1_address, p1_score, duration_ms, room_code, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            RETURNING *`,
            [matchId, normalizedMode, address, score, duration, roomCode || null]
          );
          
          // Update leaderboard
          await pool.query(
            `INSERT INTO leaderboard (address, best_score, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (address) 
             DO UPDATE SET 
               best_score = GREATEST(leaderboard.best_score, $2),
               updated_at = NOW()`,
            [address, validatedScore]
          );

          // Credit the server-derived reward on the retry path too.
          if (coinsEarned > 0) {
            await pool.query(
              `UPDATE users SET points = points + $1, updated_at = NOW() WHERE address = $2`,
              [coinsEarned, address]
            );
          }
          
          return res.json({
            success: true,
            match: matchResult.rows[0],
            winnerAddress,
            coinsEarned
          });
        } catch (retryError) {
          console.error('❌ Retry failed:', retryError.message);
          // Fall through to return error
        }
      }
      
      // Log detailed error for debugging
      console.error('❌ Database error details:', {
        code: dbError.code,
        message: dbError.message,
        detail: dbError.detail,
        constraint: dbError.constraint
      });
      
      res.status(500).json({ 
        success: false, 
        message: dbError.message || 'Failed to save match',
        error: dbError.code,
        detail: dbError.detail,
        constraint: dbError.constraint
      });
    }
  } catch (error) {
    console.error('❌ Error in save match endpoint:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Unknown error',
      error: error.code,
      detail: error.detail || (process.env.NODE_ENV === 'development' ? error.stack : undefined)
    });
  }
});

export default router;
