// Pure merge helpers for `backend/routes/multiplayer.js`.
//
// `POST /update-player` receives frequent partial updates
// (`{ position, health, score, state }`-style payloads) and must merge them
// over the last known player object instead of replacing it, otherwise the two
// clients desync. `GET /get-players/:roomCode/:address` then projects the other
// players. Both are extracted here so they can be unit tested directly.

// Fields that a partial update may carry. `x`/`y` are treated as a pair: a
// lone `x` without `y` is ignored, matching the handler.
const PAIRED_POSITION_FIELDS = ['x', 'y'];
const SCALAR_FIELDS = [
  'health',
  'bullets',
  'shipImage',
  'shipRarity',
  'score',
  'coins',
];

// Merge a partial update over the previously stored player object. Previously
// stored keys that the update does not mention are preserved.
export function mergePlayerUpdate(existing, update = {}, now = Date.now()) {
  const merged = { ...(existing || {}) };

  if (update.x !== undefined && update.y !== undefined) {
    for (const field of PAIRED_POSITION_FIELDS) {
      merged[field] = update[field];
    }
  }

  for (const field of SCALAR_FIELDS) {
    if (update[field] !== undefined) {
      merged[field] = update[field];
    }
  }

  merged.timestamp = now;
  return merged;
}

// Project every player except `address` into the shape the client expects.
export function otherPlayers(roomPlayers, address) {
  return Object.entries(roomPlayers || {})
    .filter(([playerAddress]) => playerAddress !== address)
    .map(([playerAddress, data]) => ({
      address: playerAddress,
      x: data.x,
      y: data.y,
      health: data.health,
      bullets: data.bullets || [],
      shipImage: data.shipImage,
      shipRarity: data.shipRarity,
      score: data.score,
      coins: data.coins,
      timestamp: data.timestamp,
    }));
}
