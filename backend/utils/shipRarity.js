// Single source of truth for ship rarity metadata (backend).
//
// The frontend keeps an identical table in frontend/src/constants/ships.ts;
// the values here must stay in sync with it.

export const SHIP_TABLE = [
  { rarity: 'Classic', tier: 'Classic', name: 'Classic Fighter', className: 'Fighter', image: '/nft-images/ships/ship-classic.gif', stats: { attack: 5, speed: 5, shield: 5, fireRate: 300 } },
  { rarity: 'Common', tier: 'Elite', name: 'Elite Fighter', className: 'Fighter', image: '/nft-images/ships/ship-elite.gif', stats: { attack: 10, speed: 8, shield: 12, fireRate: 250 } },
  { rarity: 'Epic', tier: 'Epic', name: 'Epic Destroyer', className: 'Destroyer', image: '/nft-images/ships/ship-epic.gif', stats: { attack: 20, speed: 6, shield: 18, fireRate: 200 } },
  { rarity: 'Legendary', tier: 'Legendary', name: 'Legendary Cruiser', className: 'Cruiser', image: '/nft-images/ships/ship-legendary.gif', stats: { attack: 30, speed: 15, shield: 25, fireRate: 150 } },
  { rarity: 'Master', tier: 'Master', name: 'Master Battleship', className: 'Battleship', image: '/nft-images/ships/ship-master.gif', stats: { attack: 40, speed: 12, shield: 35, fireRate: 120 } },
  { rarity: 'Ultra', tier: 'Ultra', name: 'Ultra Command', className: 'Command', image: '/nft-images/ships/ship-ultra.gif', stats: { attack: 50, speed: 18, shield: 45, fireRate: 100 } },
];

// Resolve a rarity by either its display value ('Common') or the NFT tier
// ('Elite') so both spellings map to the same row.
const byKey = {};
for (const entry of SHIP_TABLE) {
  byKey[entry.rarity.toLowerCase()] = entry;
  byKey[entry.tier.toLowerCase()] = entry;
}

const FALLBACK = SHIP_TABLE[0];

export function getShipDefinition(rarity) {
  if (!rarity) return FALLBACK;
  return byKey[String(rarity).toLowerCase()] || FALLBACK;
}

export function getShipImage(rarity) {
  return getShipDefinition(rarity).image;
}

export function getShipName(rarity) {
  return getShipDefinition(rarity).name;
}

export function getShipClass(rarity) {
  return getShipDefinition(rarity).className;
}

export function getShipStats(rarity) {
  return getShipDefinition(rarity).stats;
}
