// Equipped-ship state helpers.
//
// The equipped ship is identified by its NFT token id, which is the same
// identity the backend stores as `users.default_ship_token_id` and the same
// value Collection.tsx / Home.tsx already have for every owned ship. Using the
// token id avoids the old rarity/tier comparison that broke for Elite ships
// (tier 'Elite', rarity 'Common').
//
// Rooms/game pages still read the legacy `equipped_ship_<address>` key and
// expect a rarity/tier label, so optional legacy labels are written alongside
// the canonical token id while those pages migrate.

export const equippedTokenIdKey = (address: string) => `equipped_ship_token_id_${address}`
export const legacyEquippedShipKey = (address: string) => `equipped_ship_${address}`

export const readEquippedTokenId = (address?: string | null): number | null => {
  if (!address || typeof window === 'undefined') return null

  const raw = window.localStorage.getItem(equippedTokenIdKey(address))
  if (!raw) return null

  const tokenId = Number(raw)
  return Number.isFinite(tokenId) ? tokenId : null
}

export const writeEquippedTokenId = (
  address: string,
  tokenId: number,
  legacyLabel?: string
) => {
  if (!address || typeof window === 'undefined') return

  window.localStorage.setItem(equippedTokenIdKey(address), String(tokenId))

  // Keep the legacy key working for room/game pages that read a rarity label.
  if (legacyLabel) {
    window.localStorage.setItem(legacyEquippedShipKey(address), legacyLabel)
  }
}

export const isShipEquipped = (
  address: string | null | undefined,
  tokenId: number | null | undefined,
  equippedTokenId?: number | null
): boolean => {
  const equipped = equippedTokenId === undefined ? readEquippedTokenId(address) : equippedTokenId
  if (equipped === null || equipped === undefined) return false
  if (tokenId === null || tokenId === undefined) return false
  return Number(equipped) === Number(tokenId)
}
