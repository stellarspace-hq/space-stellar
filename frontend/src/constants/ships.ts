// Single source of truth for ship rarity metadata (frontend).
//
// The backend keeps an identical table in backend/utils/shipRarity.js; the
// values here must stay in sync with it.

export interface ShipStats {
  attack: number
  speed: number
  shield: number
  fireRate: number
}

export interface ShipDefinition {
  rarity: string
  tier: string
  name: string
  className: string
  image: string
  stats: ShipStats
}

export const SHIP_TABLE: ShipDefinition[] = [
  { rarity: 'Classic', tier: 'Classic', name: 'Classic Fighter', className: 'Fighter', image: '/nft-images/ships/ship-classic.gif', stats: { attack: 5, speed: 5, shield: 5, fireRate: 300 } },
  { rarity: 'Common', tier: 'Elite', name: 'Elite Fighter', className: 'Fighter', image: '/nft-images/ships/ship-elite.gif', stats: { attack: 10, speed: 8, shield: 12, fireRate: 250 } },
  { rarity: 'Epic', tier: 'Epic', name: 'Epic Destroyer', className: 'Destroyer', image: '/nft-images/ships/ship-epic.gif', stats: { attack: 20, speed: 6, shield: 18, fireRate: 200 } },
  { rarity: 'Legendary', tier: 'Legendary', name: 'Legendary Cruiser', className: 'Cruiser', image: '/nft-images/ships/ship-legendary.gif', stats: { attack: 30, speed: 15, shield: 25, fireRate: 150 } },
  { rarity: 'Master', tier: 'Master', name: 'Master Battleship', className: 'Battleship', image: '/nft-images/ships/ship-master.gif', stats: { attack: 40, speed: 12, shield: 35, fireRate: 120 } },
  { rarity: 'Ultra', tier: 'Ultra', name: 'Ultra Command', className: 'Command', image: '/nft-images/ships/ship-ultra.gif', stats: { attack: 50, speed: 18, shield: 45, fireRate: 100 } },
]

// Resolve a rarity by either its display value ('Common') or the NFT tier
// ('Elite') so both spellings map to the same row.
const byKey: { [key: string]: ShipDefinition } = {}
for (const entry of SHIP_TABLE) {
  byKey[entry.rarity.toLowerCase()] = entry
  byKey[entry.tier.toLowerCase()] = entry
}

const FALLBACK: ShipDefinition = SHIP_TABLE[0]

export function getShipDefinition(rarity?: string | null): ShipDefinition {
  if (!rarity) return FALLBACK
  return byKey[String(rarity).toLowerCase()] || FALLBACK
}

export function getShipImage(rarity?: string | null): string {
  return getShipDefinition(rarity).image
}

export function getShipName(rarity?: string | null): string {
  return getShipDefinition(rarity).name
}

export function getShipClass(rarity?: string | null): string {
  return getShipDefinition(rarity).className
}

export function getShipStats(rarity?: string | null): ShipStats {
  return getShipDefinition(rarity).stats
}
