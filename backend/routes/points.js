// Points/Platform Currency API Routes
// Points adalah koin/platform currency (off-chain) untuk belanja di shop dan mint NFT

import express from 'express';
import { pool } from '../server.js';
import { getNextUserId, formatUserId } from '../utils/userId.js';
import {
  requireSignedAddress,
  rateLimitByAddress,
  authPayload,
} from '../utils/auth.js';
import { deriveMatchReward, isMatchParticipant } from '../utils/matchRules.js';
import {
  ADD_POINTS_SQL,
  DEDUCT_POINTS_SQL,
  evaluateDeduction,
  ledgerParams,
  parseStoredPoints,
  validateAmount,
} from '../utils/pointsLedger.js';

const router = express.Router();

// Every points mutation must prove control of the address it names, and is
// rate-limited per authenticated address.
const requireBodyAddressSignature = requireSignedAddress(
  (req) => req.body?.address,
  authPayload
);
const pointsWriteLimiter = rateLimitByAddress({
  windowMs: 60 * 1000,
  max: 20,
  getAddress: (req) => req.authenticatedAddress,
});

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

    // A stored balance of 0 is valid; only fall back to the welcome bonus when
    // the value is genuinely absent or unparseable.
    const rawPoints = result.rows[0].points;
    const parsedPoints = Number(rawPoints);
    const points =
      rawPoints === null || rawPoints === undefined || !Number.isFinite(parsedPoints)
        ? 2000
        : parsedPoints;
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
router.post('/deduct', requireBodyAddressSignature, pointsWriteLimiter, async (req, res) => {
  try {
    const { address, amount, reason } = req.body;

    if (!address || amount === undefined || amount === null) {
      return res.status(400).json({
        success: false,
        message: 'Address and amount required'
      });
    }

    const deductAmount = Number(amount);
    if (!Number.isFinite(deductAmount) || !Number.isInteger(deductAmount) || deductAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a positive integer'
    const numericAmount = Number(amount);
    if (!address || amount === undefined || amount === null) {
      return res.status(400).json({ 
        success: false, 
        message: 'Address and amount required' 
      });
    }

    if (!Number.isInteger(numericAmount) || numericAmount <= 0 || numericAmount > 1000000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Amount must be a positive integer no greater than 1000000' 
      });
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

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Ensure the user exists (with the welcome bonus) before mutating the
      // balance. `ON CONFLICT (address) DO NOTHING` keeps concurrent first-time
      // deducts from racing on the unique address.
      const nextId = await getNextUserId();
      await client.query(
        `INSERT INTO users (id, address, user_id, points, created_at) 
         VALUES ($1, $2, $3, 2000, NOW())
         ON CONFLICT (address) DO NOTHING`,
        [nextId, address, `USER-${nextId}`]
    let currentPoints = 2000; // Welcome bonus points
    if (userCheck.rows.length === 0) {
      // Create user dengan welcome bonus 2000 points
      const nextId = await getNextUserId(pool);
      await pool.query(
        `INSERT INTO users (id, address, user_id, points, created_at) 
         VALUES ($1, $2, $3, 2000, NOW())`,
        [nextId, address, formatUserId(nextId)]
      );

      // Atomic check-and-decrement. Reading the balance and then updating it in a
      // separate statement lets two concurrent deducts both pass a pre-spend check
      // and overdraw the account; a single `UPDATE ... WHERE points >= $1` makes
      // the check and the decrement one indivisible step. Zero rows means the user
      // is missing or the balance is too low. The `users.points`
      // `CHECK (points >= 0)` constraint remains the final backstop.
      const result = await client.query(
        `UPDATE users 
         SET points = points - $1,
             updated_at = NOW()
         WHERE address = $2
           AND points >= $1
         RETURNING points`,
        [deductAmount, address]
      );
      console.log(`✅ New user created with welcome bonus: 2000 points`);
    } else {
      currentPoints = parseStoredPoints(userCheck.rows[0].points);
    }

    // Check if user has enough points
    if (currentPoints < numericAmount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient points',
        currentPoints,
        required: numericAmount,
        shortage: numericAmount - currentPoints
      });
    const deduction = evaluateDeduction(currentPoints, amountValue);
    if (!deduction.ok) {
      return res.status(deduction.status).json(deduction.body);
    }

    // Deduct points
    const result = await pool.query(
      `UPDATE users 
       SET points = points - $1,
           updated_at = NOW()
       WHERE address = $2
       RETURNING points`,
      [numericAmount, address]
      DEDUCT_POINTS_SQL,
      ledgerParams(amountValue, address)
    );

      if (result.rows.length === 0) {
        const balanceResult = await client.query(
          'SELECT points FROM users WHERE address = $1',
          [address]
        );
        await client.query('ROLLBACK');

        if (balanceResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'User not found'
          });
        }

        const currentPoints = parseInt(balanceResult.rows[0].points) || 0;
        return res.status(400).json({
          success: false,
          message: 'Insufficient points',
          currentPoints,
          required: deductAmount,
          shortage: deductAmount - currentPoints
        });
      }

      await client.query('COMMIT');

      const newPoints = parseInt(result.rows[0].points);

      res.json({
        success: true,
        points: newPoints,
        deducted: deductAmount,
        reason: reason || 'Mint NFT',
        message: `Successfully deducted ${deductAmount} points`
      });
    } catch (txError) {
      await client.query('ROLLBACK').catch(() => {});
      throw txError;
    } finally {
      client.release();
    }

    const newPoints = parseInt(result.rows[0].points);

    res.json({
      success: true,
      points: newPoints,
      deducted: numericAmount,
      reason: reason || 'Mint NFT',
      message: `Successfully deducted ${numericAmount} points`
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
//
// Authenticated: the caller must sign a challenge over the exact request body,
// proving control of `address`. Match/game rewards are server-authoritative:
// when the request is a match reward, the credited amount is derived from the
// stored match row and the body `amount` is ignored.
router.post('/add', requireBodyAddressSignature, pointsWriteLimiter, async (req, res) => {
  try {
    const { address, reason, matchId } = req.body;
    let amount = Number(req.body.amount);

    if (!address) {
      return res.status(400).json({ 
        success: false, 
        message: 'Address required' 
      });
    }

    if (!pool) {
      return res.status(503).json({ 
        success: false, 
        message: 'Database not available' 
      });
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

    // A match/game reward must be backed by a stored match; the amount comes
    // from that record, never from the request body.
    const isMatchReward = Boolean(matchId) || /match|game\s*coins/i.test(String(reason || ''));
    if (isMatchReward) {
      if (!matchId) {
        return res.status(400).json({
          success: false,
          message: 'matchId is required to credit a match reward'
        });
      }

      const matchResult = await pool.query(
        'SELECT * FROM matches WHERE match_id = $1',
        [matchId]
      );
      if (matchResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Match not found' });
      }

      const match = matchResult.rows[0];
      if (!isMatchParticipant(match, address)) {
        return res.status(403).json({
          success: false,
          message: 'Address is not a participant of this match'
        });
      }

      amount = deriveMatchReward(match); // ignore req.body.amount for match rewards
      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Match has no creditable reward'
        });
      }
    } else if (!Number.isInteger(amount) || amount <= 0 || amount > 100000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Amount must be a positive integer no greater than 100000' 
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
      added: amount,
      matchId: matchId || null,
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

export default router;
