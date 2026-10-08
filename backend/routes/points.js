// Points/Platform Currency API Routes
// Points adalah koin/platform currency (off-chain) untuk belanja di shop dan mint NFT

import express from 'express';
import { pool } from '../server.js';
import {
  ADD_POINTS_SQL,
  DEDUCT_POINTS_SQL,
  evaluateDeduction,
  ledgerParams,
  parseStoredPoints,
  validateAmount,
} from '../utils/pointsLedger.js';

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

    const points = parseStoredPoints(result.rows[0].points);

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

    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Address and amount required'
      });
    }

    const amountCheck = validateAmount(amount);
    if (!amountCheck.ok) {
      return res.status(amountCheck.status).json(amountCheck.body);
    }
    const amountValue = amountCheck.amount;

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
      const nextId = await getNextUserId();
      await pool.query(
        `INSERT INTO users (id, address, user_id, points, created_at) 
         VALUES ($1, $2, $3, 2000, NOW())`,
        [nextId, address, `USER-${nextId}`]
      );
      console.log(`✅ New user created with welcome bonus: 2000 points`);
    } else {
      currentPoints = parseStoredPoints(userCheck.rows[0].points);
    }

    // Check if user has enough points
    const deduction = evaluateDeduction(currentPoints, amountValue);
    if (!deduction.ok) {
      return res.status(deduction.status).json(deduction.body);
    }

    // Deduct points
    const result = await pool.query(
      DEDUCT_POINTS_SQL,
      ledgerParams(amountValue, address)
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
      deducted: amountValue,
      reason: reason || 'Mint NFT',
      message: `Successfully deducted ${amountValue} points`
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

    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Address and amount required'
      });
    }

    const amountCheck = validateAmount(amount);
    if (!amountCheck.ok) {
      return res.status(amountCheck.status).json(amountCheck.body);
    }
    const amountValue = amountCheck.amount;

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
      const nextId = await getNextUserId();
      await pool.query(
        `INSERT INTO users (id, address, user_id, points, created_at) 
         VALUES ($1, $2, $3, 2000, NOW())`,
        [nextId, address, `USER-${nextId}`]
      );
      console.log(`✅ New user created with welcome bonus: 2000 points`);
    }

    // Add points
    const result = await pool.query(
      ADD_POINTS_SQL,
      ledgerParams(amountValue, address)
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
      added: amountValue,
      reason: reason || 'Reward',
      message: `Successfully added ${amountValue} points`
    });
  } catch (error) {
    console.error('Error adding points:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Helper function untuk get next user ID
const getNextUserId = async () => {
  try {
    const result = await pool.query("SELECT nextval('user_id_seq') as next_id");
    return parseInt(result.rows[0].next_id);
  } catch (error) {
    const result = await pool.query('SELECT COALESCE(MAX(id), 243680) + 1 as next_id FROM users');
    return parseInt(result.rows[0].next_id);
  }
};

export default router;

