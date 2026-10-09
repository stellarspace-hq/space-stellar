export interface PFPVariant {
  id: number
  name: string
  rarity: string
  image: string
  weight: number
}

// Weighted gacha table for the Special Launch Event. The weights sum to 100 and
// decide the rarity a player mints, so they are pinned by gacha.test.ts.
export const PFP_VARIANTS: PFPVariant[] = [
  { id: 1, name: 'Cosmic Warrior', rarity: 'Common', image: '/nft-images/pfp/pfp-1.png', weight: 40 },
  { id: 2, name: 'Stellar Explorer', rarity: 'Uncommon', image: '/nft-images/pfp/pfp-2.png', weight: 25 },
  { id: 3, name: 'Nebula Guardian', rarity: 'Rare', image: '/nft-images/pfp/pfp-3.png', weight: 15 },
  { id: 4, name: 'Galaxy Commander', rarity: 'Epic', image: '/nft-images/pfp/pfp-4.png', weight: 10 },
  { id: 5, name: 'Void Master', rarity: 'Legendary', image: '/nft-images/pfp/pfp-5.png', weight: 7 },
  { id: 6, name: 'Cosmic Legend', rarity: 'Mythic', image: '/nft-images/pfp/pfp-6.png', weight: 3 },
]

// Weighted random selection
export const getRandomPFP = (): PFPVariant => {
  const totalWeight = PFP_VARIANTS.reduce((sum, pfp) => sum + pfp.weight, 0)
  let random = Math.random() * totalWeight

  for (const pfp of PFP_VARIANTS) {
    random -= pfp.weight
    if (random <= 0) {
      return pfp
    }
  }

  return PFP_VARIANTS[0] // Fallback
}
