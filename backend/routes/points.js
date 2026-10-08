// Points/Platform Currency API Routes
// Points adalah koin/platform currency (off-chain) untuk belanja di shop dan mint NFT

import express from 'express';
import { pool } from '../server.js';
import { getNextUserId, formatUserId } from '../utils/userId.js';

const router = express.Router();

// Get user points
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;

    if (!pool) {
      return res.json({
        success: true,
        points: 2000, // Welcome bonus points jika database tidak tersedia
        address
      });
    }

    // Get user points
    const result = await pool.query(
      'SELECT points FROM users WHERE address = $1',
      [address]
    );

    if (result.rows.length === 0) {
      // User belum ada, return default points (welcome bonus)
      return res.json({
        success: true,
        points: 2000,
        address,
        message: 'User not found, using default welcome bonus points'
      });
    }

    const points = parseInt(result.rows[0].points) || 2000;

    res.json({
      success: true,
      points,
      address
    });
  } catch (error) {
    console.error('Error getting user points:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Deduct points (untuk mint NFT atau belanja)
router.post('/deduct', async (req, res) => {
  try {
    const { address, amount, reason } = req.body;

    if (!address || !amount) {
      return res.status(400).json({ 
        success: false, 
        message: 'Address and amount required' 
      });
    }

    if (amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Amount must be greater than 0' 
      });
    }

    if (!pool) {
      return res.status(503).json({ 
        success: false, 
        message: 'Database not available' 
      });
    }

    // Check if user exists, create if not
    const userCheck = await pool.query(
      'SELECT points FROM users WHERE address = $1',
      [address]
    );

    let currentPoints = 2000; // Welcome bonus points
    if (userCheck.rows.length === 0) {
      // Create user dengan welcome bonus 2000 points
      const nextId = await getNextUserId(pool);
      await pool.query(
        `INSERT INTO users (id, address, user_id, points, created_at) 
         VALUES ($1, $2, $3, 2000, NOW())`,
        [nextId, address, formatUserId(nextId)]
      );
      console.log(`✅ New user created with welcome bonus: 2000 points`);
    } else {
      currentPoints = parseInt(userCheck.rows[0].points) || 2000;
    }

    // Check if user has enough points
    if (currentPoints < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient points',
        currentPoints,
        required: amount,
        shortage: amount - currentPoints
      });
    }

    // Deduct points
    const result = await pool.query(
      `UPDATE users 
       SET points = points - $1,
           updated_at = NOW()
       WHERE address = $2
       RETURNING points`,
      [amount, address]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const newPoints = parseInt(result.rows[0].points);

    res.json({
      success: true,
      points: newPoints,
      deducted: amount,
      reason: reason || 'Mint NFT',
      message: `Successfully deducted ${amount} points`
    });
  } catch (error) {
    console.error('Error deducting points:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Add points (untuk reward, bonus, dll)
router.post('/add', async (req, res) => {
  try {
    const { address, amount, reason } = req.body;

    if (!address || !amount) {
      return res.status(400).json({ 
        success: false, 
        message: 'Address and amount required' 
      });
    }

    if (amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Amount must be greater than 0' 
      });
    }

    if (!pool) {
      return res.status(503).json({ 
        success: false, 
        message: 'Database not available' 
      });
    }

    // Check if user exists, create if not
    const userCheck = await pool.query(
      'SELECT points FROM users WHERE address = $1',
      [address]
    );

    if (userCheck.rows.length === 0) {
      // Create user dengan welcome bonus 2000 points
      const nextId = await getNextUserId(pool);
      await pool.query(
        `INSERT INTO users (id, address, user_id, points, created_at) 
         VALUES ($1, $2, $3, 2000, NOW())`,
        [nextId, address, formatUserId(nextId)]
      );
      console.log(`✅ New user created with welcome bonus: 2000 points`);
    }

    // Add points
    const result = await pool.query(
      `UPDATE users 
       SET points = points + $1,
           updated_at = NOW()
       WHERE address = $2
       RETURNING points`,
      [amount, address]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const newPoints = parseInt(result.rows[0].points);

    res.json({
      success: true,
      points: newPoints,
      added: amount,
      reason: reason || 'Reward',
      message: `Successfully added ${amount} points`
    });
  } catch (error) {
    console.error('Error adding points:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

export default router;

