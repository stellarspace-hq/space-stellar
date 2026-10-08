import express from 'express';
import { pool } from '../server.js';
import { randomUUID } from 'crypto';

const router = express.Router();

// Generate unique user ID (deprecated - now using sequential numeric ID)
const generateUserId = () => {
  return `USER-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
};

// Get next sequential user ID from database
// ID starts from 243681 and auto-increments
const getNextUserId = async () => {
  try {
    // Get the next ID from sequence
    const result = await pool.query("SELECT nextval('user_id_seq') as next_id");
    return parseInt(result.rows[0].next_id);
  } catch (error) {
    // If sequence doesn't exist, fallback to max ID + 1
    console.warn('Sequence not found, using fallback method:', error.message);
    const result = await pool.query('SELECT COALESCE(MAX(id), 243680) + 1 as next_id FROM users');
    return parseInt(result.rows[0].next_id);
  }
};

// Get or create user profile
router.get('/profile/:address', async (req, res) => {
  try {
    // Mock response if database not available
    if (!pool) {
      return res.json({
        success: true,
        user: {
          address: req.params.address,
          userId: `USER-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          username: '',
          stats: { totalMatches: 0, wins: 0, bestScore: 0, shipsOwned: 0 }
        }
      });
    }
    
    const { address } = req.params;

    // Check if user exists
    const userResult = await pool.query(
      'SELECT * FROM users WHERE address = $1',
      [address]
    );

    let user;
    if (userResult.rows.length === 0) {
      // Create new user with sequential numeric ID
      // ID akan auto-generate dari sequence (starting from 243681)
      // Get next ID first, then insert
      const nextId = await getNextUserId();
      
      // Insert user dengan id yang sudah di-generate
      // id column memiliki default dari sequence, tapi kita specify explicit untuk konsistensi
      // Welcome bonus: 2000 points untuk user baru
      const insertResult = await pool.query(
        `INSERT INTO users (id, address, user_id, points, created_at) 
         VALUES ($1, $2, $3, 2000, NOW()) 
         RETURNING *`,
        [nextId, address, `USER-${nextId}`]
      );
      user = insertResult.rows[0];
      
      console.log(`✅ New user created with ID: ${user.id} (address: ${address.slice(0, 8)}...)`);
      console.log(`   Welcome bonus: 2000 points granted!`);
    } else {
      user = userResult.rows[0];
    }

    // Get user stats
    const statsResult = await pool.query(
      `SELECT 
        COUNT(DISTINCT m.match_id) as total_matches,
        COUNT(DISTINCT CASE
          WHEN m.mode IN ('versus', 'multiplayer')
           AND m.p1_score > COALESCE(m.p2_score, 0)
           AND m.p1_address = $1
          THEN m.match_id END) as wins,
        COALESCE(MAX(m.p1_score), 0) as best_score,
        COUNT(DISTINCT s.token_id) as ships_owned
       FROM users u
       LEFT JOIN matches m ON m.p1_address = u.address
       LEFT JOIN ships s ON s.owner_address = u.address
       WHERE u.address = $1
       GROUP BY u.address`,
      [address]
    );

    const stats = statsResult.rows[0] || {
      total_matches: 0,
      wins: 0,
      best_score: 0,
      ships_owned: 0
    };

    res.json({
      success: true,
      user: {
        ...user,
        // Include numeric ID (id) and text user_id
        id: user.id, // Sequential numeric ID (243681, 243682, ...)
        userId: user.user_id, // Text user_id (USER-243681, USER-243682, ...)
        points: parseInt(user.points) || 2000, // Platform points/koin (off-chain)
        stats: {
          totalMatches: parseInt(stats.total_matches) || 0,
          wins: parseInt(stats.wins) || 0,
          bestScore: parseInt(stats.best_score) || 0,
          shipsOwned: parseInt(stats.ships_owned) || 0
        }
      },
      userId: user.user_id,
      id: user.id, // Numeric ID untuk frontend
      points: parseInt(user.points) || 2000 // Points untuk frontend
    });
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update user profile
// NOTE: ID tidak bisa diubah (readonly setelah dibuat)
router.put('/profile/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { username, email, bio, avatarUrl, defaultShipTokenId } = req.body;

    // ID tidak bisa diubah - remove dari update
    // userId juga tidak bisa diubah setelah dibuat
    const result = await pool.query(
      `UPDATE users 
       SET username = COALESCE($1, username),
           email = COALESCE($2, email),
           bio = COALESCE($3, bio),
           avatar_url = COALESCE($4, avatar_url),
           default_ship_token_id = COALESCE($5, default_ship_token_id),
           updated_at = NOW()
       WHERE address = $6
       RETURNING *`,
      [username, email, bio, avatarUrl, defaultShipTokenId, address]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update last login
router.post('/profile/:address/last-login', async (req, res) => {
  try {
    const { address } = req.params;

    const result = await pool.query(
      `UPDATE users 
       SET last_login = NOW()
       WHERE address = $1
       RETURNING *`,
      [address]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Error updating last login:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

