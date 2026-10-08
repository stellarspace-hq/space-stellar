// Pure helpers for deriving match results and rewards server-side.
//
// The matches table stores p1_score / p2_score (see backend/scripts/
// auto-migrate.js). Everything the client posts is treated as untrusted: scores
// must be integers within bounds, the winner is computed here, and the coin
// reward is derived from the validated score. No caller-supplied score or coin
// value is ever credited directly.

export const MAX_MATCH_SCORE = 10000000;
export const MAX_MATCH_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours
export const COINS_PER_SCORE = 1;

// Returns a bounded non-negative integer, or null when the input is not a
// valid score.
export const parseScore = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(number) || number < 0 || number > MAX_MATCH_SCORE) return null;
  return number;
};

export const parseDuration = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number < 0 || number > MAX_MATCH_DURATION_MS) return null;
  return Math.floor(number);
};

// The server decides the winner; the client's opinion is never stored. A
// participant-less match (no p2) is won by the only participant.
export const computeWinner = ({ p1Address, p2Address, p1Score, p2Score }) => {
  if (!p2Address || p2Score === null || p2Score === undefined) return p1Address;
  if (p1Score > p2Score) return p1Address;
  if (p2Score > p1Score) return p2Address;
  return null; // draw
};

// Coins are a function of the validated score, never of the posted body.
export const deriveCoinsReward = (score) => {
  if (!Number.isInteger(score) || score <= 0) return 0;
  return Math.floor(score * COINS_PER_SCORE);
};

// Reward for a persisted match row, derived only from stored columns.
export const deriveMatchReward = (match) => {
  if (!match) return 0;
  const score = Number(match.p1_score);
  return deriveCoinsReward(Number.isFinite(score) ? Math.floor(score) : 0);
};

export const isMatchParticipant = (match, address) =>
  Boolean(match && address && (match.p1_address === address || match.p2_address === address));
