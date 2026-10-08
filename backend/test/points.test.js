// Unit tests for the points ledger arithmetic (stellarspace-hq/space-stellar #8).
//
// Run with:  node --test backend/test/points.test.js
//
// The ledger handlers live in `backend/routes/points.js`, which imports the
// Express server module on load. The arithmetic and guards they depend on are
// kept in `backend/utils/pointsLedger.js` so they can be exercised here without
// booting Express or connecting to Postgres.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  ADD_POINTS_SQL,
  DEDUCT_POINTS_SQL,
  DEFAULT_POINTS,
  evaluateAddition,
  evaluateDeduction,
  ledgerParams,
  normaliseAmount,
  parseStoredPoints,
} from '../utils/pointsLedger.js';

const ADDRESS = 'GA2C5IY3V3UX5PIZ4S5G2A7L7W5G2A2X4M3N5W2Q3FZ7H6B5J4K2L';

describe('parseStoredPoints', () => {
  it('does NOT turn a zero balance into the welcome bonus', () => {
    assert.equal(parseStoredPoints('0'), 0);
    assert.notEqual(parseStoredPoints('0'), DEFAULT_POINTS);
    assert.equal(parseStoredPoints(0), 0);
  });

  it('returns the stored balance when it is a positive number', () => {
    assert.equal(parseStoredPoints('1500'), 1500);
    assert.equal(parseStoredPoints(1500), 1500);
  });

  it('falls back to the welcome bonus only when the value is unusable', () => {
    assert.equal(parseStoredPoints(null), DEFAULT_POINTS);
    assert.equal(parseStoredPoints(undefined), DEFAULT_POINTS);
    assert.equal(parseStoredPoints(''), DEFAULT_POINTS);
    assert.equal(parseStoredPoints('not-a-number'), DEFAULT_POINTS);
  });
});

describe('normaliseAmount', () => {
  it('rejects non-numeric amounts instead of coercing them to NaN', () => {
    assert.equal(normaliseAmount('abc'), null);
    assert.equal(normaliseAmount(''), null);
    assert.equal(normaliseAmount(undefined), null);
    assert.equal(normaliseAmount(NaN), null);
    assert.equal(normaliseAmount(Infinity), null);
  });

  it('accepts numeric strings and numbers', () => {
    assert.equal(normaliseAmount('100'), 100);
    assert.equal(normaliseAmount('100.5'), 100.5);
    assert.equal(normaliseAmount(7), 7);
  });
});

describe('evaluateDeduction', () => {
  it('rejects a deduct larger than the balance with a 400 and the shortage', () => {
    const result = evaluateDeduction(50, 100);
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(result.body.message, 'Insufficient points');
    assert.equal(result.body.currentPoints, 50);
    assert.equal(result.body.required, 100);
    assert.equal(result.body.shortage, 50);
  });

  it('rejects a non-numeric amount before any database work', () => {
    const result = evaluateDeduction(500, 'abc');
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(result.body.message, 'Amount must be a number');
  });

  it('rejects a zero or negative amount', () => {
    for (const amount of [0, -1, '0', '-5']) {
      const result = evaluateDeduction(500, amount);
      assert.equal(result.ok, false, `amount ${amount} should be rejected`);
      assert.equal(result.status, 400);
      assert.equal(result.body.message, 'Amount must be greater than 0');
    }
  });

  it('allows a deduct that the balance covers', () => {
    const result = evaluateDeduction(500, 100);
    assert.equal(result.ok, true);
    assert.equal(result.amount, 100);
  });
});

describe('evaluateAddition', () => {
  it('allows a positive amount regardless of balance', () => {
    const result = evaluateAddition(25);
    assert.equal(result.ok, true);
    assert.equal(result.amount, 25);
  });

  it('rejects a non-numeric or non-positive amount', () => {
    assert.equal(evaluateAddition('abc').status, 400);
    assert.equal(evaluateAddition(0).status, 400);
  });
});

describe('SQL statements and parameters', () => {
  it('records the exact SQL parameters sent to the pool', () => {
    assert.deepEqual(ledgerParams(100, ADDRESS), [100, ADDRESS]);
  });

  it('subtracts on deduct and adds on add', () => {
    assert.match(DEDUCT_POINTS_SQL, /points = points - \$1/);
    assert.match(DEDUCT_POINTS_SQL, /WHERE address = \$2/);
    assert.match(ADD_POINTS_SQL, /points = points \+ \$1/);
    assert.match(ADD_POINTS_SQL, /WHERE address = \$2/);
  });
});
