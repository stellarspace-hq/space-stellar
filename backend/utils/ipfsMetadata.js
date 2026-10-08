// Pure metadata assembly for `POST /api/ipfs/upload-metadata` in
// `backend/routes/ipfs.js`.
//
// The assembled document is what the on-chain `token_uri` resolves to, so the
// shape is extracted here to be unit tested without Pinata or a network.

// Validate the request body before assembling metadata.
export function validateMetadataRequest(input = {}) {
  if (!input.name) {
    return {
      ok: false,
      status: 400,
      body: { success: false, message: 'Missing required field: name' },
    };
  }
  return { ok: true };
}

// Build the OpenZeppelin/ERC-721 style metadata document from a request body.
export function buildShipMetadata(input = {}) {
  const {
    name,
    description,
    image,
    imageCid,
    attributes,
    tier,
    class: shipClass,
    rarity,
    attack,
    speed,
    shield,
  } = input;

  return {
    name: name || `Space Stellar Ship #${Date.now()}`,
    description: description || 'A unique NFT ship for Space Stellar game',
    image: image || (imageCid ? `ipfs://${imageCid}` : ''),
    external_url: 'https://space-stellar.app',
    attributes: attributes || [
      { trait_type: 'Tier', value: tier || 'Classic' },
      { trait_type: 'Class', value: shipClass || 'Fighter' },
      { trait_type: 'Rarity', value: rarity || 'Common' },
      { trait_type: 'Attack', value: attack || 10, display_type: 'number' },
      { trait_type: 'Speed', value: speed || 8, display_type: 'number' },
      { trait_type: 'Shield', value: shield || 12, display_type: 'number' },
    ],
  };
}
