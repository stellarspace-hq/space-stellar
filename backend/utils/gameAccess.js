// Pure membership checks for `backend/routes/game.js`.
//
// Game-state endpoints are the only access control on room-scoped game data:
// `/input` rejects callers that are not the host or guest, and the host-only
// `POST /:roomCode/state` rejects non-hosts. Both checks are extracted here so
// they can be unit tested without booting Express or Postgres.

// Classify access to `gameState` for `address`.
//
// Returns `{ role: 'host' | 'guest' }` for a member, or
// `{ status, body }` (401-style rejection) with the exact JSON the route
// should send back otherwise. Comparison is case-sensitive, matching the
// addresses stored on the game state.
export function classifyGameAccess(gameState, address, roomCode) {
  if (!gameState) {
    return {
      status: 404,
      body: {
        success: false,
        message: `Game state not found for room: ${roomCode}`,
      },
    };
  }

  if (gameState.hostAddress === address) {
    return { role: 'host' };
  }

  if (gameState.guestAddress === address) {
    return { role: 'guest' };
  }

  return {
    status: 403,
    body: { success: false, message: 'You are not a member of this game' },
  };
}

// Only the host may update the shared game state.
export function canUpdateGameState(gameState, address) {
  return Boolean(gameState) && gameState.hostAddress === address;
}
