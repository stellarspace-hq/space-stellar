// Rarity -> ship image mapping for `backend/routes/ships.js`.
//
// Extracted from the route so the mapping can be unit tested without booting
// Express or connecting to Postgres. It is used by `POST /index` and by
// `GET /collection/:address`.

// The six ship art files that ship with the repo (assets/nft-images/ships/).
export const SHIP_IMAGE_FILES = [
  'ship-classic.gif',
  'ship-elite.gif',
  'ship-epic.gif',
  'ship-legendary.gif',
  'ship-master.gif',
  'ship-ultra.gif',
];

export const DEFAULT_SHIP_IMAGE = '/nft-images/ships/ship-classic.gif';

// Rarity values as written into the `ships.rarity` column.
const RARITY_TO_IMAGE = {
  Common: '/nft-images/ships/ship-elite.gif',
  Epic: '/nft-images/ships/ship-epic.gif',
  Legendary: '/nft-images/ships/ship-legendary.gif',
  Master: '/nft-images/ships/ship-master.gif',
  Ultra: '/nft-images/ships/ship-ultra.gif',
};

// Map a rarity to its ship image path. Unknown rarities fall back to the
// classic ship so a new rarity never writes `undefined` into a response.
export function getShipImage(rarity) {
  return RARITY_TO_IMAGE[rarity] || DEFAULT_SHIP_IMAGE;
}

// Backwards-compatible alias kept for existing callers.
export function getShipImagePath(rarity) {
  return getShipImage(rarity);
}
