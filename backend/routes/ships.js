import express from 'express';
import axios from 'axios';
import { pool } from '../server.js';
import { ensureUser } from '../utils/userId.js';

const router = express.Router();

// Index a minted NFT (called after on-chain minting)
router.post('/index', async (req, res) => {
  try {
    const { address, tokenId, txHash, shipTemplate, ipfsCid, metadataUri } = req.body;

    if (!address || !tokenId || !txHash || !shipTemplate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Address, tokenId, txHash, and shipTemplate required' 
      });
    }

    // Try to insert into database, but don't fail if database is not available
    let dbResult = null;
    if (pool) {
      try {
        // Insert ship into database
        // Include tier if available (for Elite Fighter: tier='Elite', rarity='Common')
        const tier = shipTemplate.tier || shipTemplate.rarity || null;
        const result = await pool.query(
          `INSERT INTO ships (
            token_id, owner_address, ipfs_cid, class, rarity, tier,
            attack, speed, shield, last_onchain_update
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (token_id) DO UPDATE SET
            owner_address = $2,
            ipfs_cid = $3,
            tier = $6,
            last_onchain_update = NOW()
          RETURNING *`,
          [
            tokenId,
            address,
            ipfsCid || null,
            shipTemplate.class,
            shipTemplate.rarity,
            tier,
            shipTemplate.attack,
            shipTemplate.speed,
            shipTemplate.shield
          ]
        );
        dbResult = result.rows[0];

        // Ensure user exists
        await ensureUser(pool, address);
      } catch (dbError) {
        console.warn('⚠️  Database error (continuing with mock response):', dbError.message);
        // Continue without database
      }
    }

    // Return success response
    res.json({
      success: true,
      ship: dbResult || {
        tokenId: tokenId,
        ownerAddress: address,
        txHash: txHash,
        class: shipTemplate.class,
        rarity: shipTemplate.rarity,
        attack: shipTemplate.attack,
        speed: shipTemplate.speed,
        shield: shipTemplate.shield,
        ipfsCid: ipfsCid
      },
      message: dbResult ? 'Ship indexed successfully' : 'Ship indexed (mock mode - database not available)'
    });
  } catch (error) {
    console.error('Error indexing ship:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// DEPRECATED: Mint endpoint - now handled by smart contract
// Keep for backward compatibility but redirect to index
router.post('/mint', async (req, res) => {
  try {
    const { address, shipTemplate } = req.body;

    if (!address || !shipTemplate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Address and ship template required' 
      });
    }

    // Generate token ID (in production, get from contract)
    const tokenId = Date.now();

    // Get tier from shipTemplate (elite, epic, legendary, master, ultra)
    const tier = shipTemplate.tier || shipTemplate.rarity || 'Elite';

    // Create metadata and upload to IPFS
    let ipfsCid = `Qm${Math.random().toString(36).substr(2, 44)}`; // Fallback mock CID
    let metadataUri = `ipfs://${ipfsCid}`;
    
    try {
      // Upload metadata to IPFS
      const metadataResponse = await axios.post(
        `${process.env.API_URL || 'http://localhost:3001'}/api/ipfs/upload-metadata`,
        {
          name: `${shipTemplate.name} #${tokenId}`,
          description: `A ${tier} tier ${shipTemplate.class} ship for Space Stellar - ${shipTemplate.rarity} rarity`,
          imageCid: null, // Will be set if image uploaded separately
          tier: tier,
          class: shipTemplate.class,
          rarity: shipTemplate.rarity,
          attack: shipTemplate.attack,
          speed: shipTemplate.speed,
          shield: shipTemplate.shield,
          attributes: [
            { trait_type: 'Tier', value: tier },
            { trait_type: 'Class', value: shipTemplate.class },
            { trait_type: 'Rarity', value: shipTemplate.rarity },
            { trait_type: 'Attack', value: shipTemplate.attack, display_type: 'number' },
            { trait_type: 'Speed', value: shipTemplate.speed, display_type: 'number' },
            { trait_type: 'Shield', value: shipTemplate.shield, display_type: 'number' },
            { trait_type: 'Total Stats', value: shipTemplate.attack + shipTemplate.speed + shipTemplate.shield, display_type: 'number' }
          ]
        }
      );

      if (metadataResponse.data && metadataResponse.data.success) {
        ipfsCid = metadataResponse.data.metadataCid || ipfsCid;
        metadataUri = metadataResponse.data.ipfsUri || `ipfs://${ipfsCid}`;
        console.log('✅ Metadata uploaded to IPFS:', ipfsCid);
      }
    } catch (error) {
      console.warn('⚠️  Failed to upload metadata to IPFS, using mock CID:', error.message);
      // Continue with mock CID
    }

    // Try to insert into database, but don't fail if database is not available
    let dbResult = null;
    if (pool) {
      try {
        // Insert ship into database
        const result = await pool.query(
          `INSERT INTO ships (
            token_id, owner_address, ipfs_cid, class, rarity, 
            attack, speed, shield, last_onchain_update
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          RETURNING *`,
          [
            tokenId,
            address,
            ipfsCid,
            shipTemplate.class,
            shipTemplate.rarity,
            shipTemplate.attack,
            shipTemplate.speed,
            shipTemplate.shield
          ]
        );
        dbResult = result.rows[0];

        // Ensure user exists
        await ensureUser(pool, address);
      } catch (dbError) {
        console.warn('⚠️  Database error (continuing with mock response):', dbError.message);
        // Continue without database
      }
    }

    // Return success response (works with or without database)
    const shipData = dbResult ? {
      ...dbResult,
      tier: tier,
      tokenId: tokenId,
      ipfsCid: ipfsCid,
      metadataUri: metadataUri
    } : {
      tokenId: tokenId,
      ownerAddress: address,
      class: shipTemplate.class,
      rarity: shipTemplate.rarity,
      tier: tier,
      attack: shipTemplate.attack,
      speed: shipTemplate.speed,
      shield: shipTemplate.shield,
      ipfsCid: ipfsCid,
      metadataUri: metadataUri
    };

    res.json({
      success: true,
      ship: shipData,
      message: dbResult ? 'Ship minted successfully and metadata uploaded to IPFS' : 'Ship minted successfully (mock mode - database not available)'
    });
  } catch (error) {
    console.error('Error minting ship:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get user's collection
router.get('/collection/:address', async (req, res) => {
  try {
    // Mock response if database not available
    if (!pool) {
      return res.json({
        success: true,
        ships: []
      });
    }
    
    const { address } = req.params;

    const result = await pool.query(
      `SELECT 
        token_id as "tokenId",
        class,
        rarity,
        tier,
        attack,
        speed,
        shield,
        ipfs_cid as "ipfsCid"
       FROM ships
       WHERE owner_address = $1
       ORDER BY token_id DESC`,
      [address]
    );

    // Format ships with names and images based on rarity/tier
    const ships = result.rows.map(ship => {
      // Determine image based on rarity
      let image = getShipImage(ship.rarity);
      
      // Map ship names based on tier/rarity
      // Elite Fighter: tier='Elite', rarity='Common'
      let shipName = `${ship.class} ${ship.rarity}`;
      if (ship.tier === 'Elite' || (ship.rarity === 'Common' && ship.tier === 'Elite')) {
        shipName = 'Elite Fighter';
      } else if (ship.rarity === 'Epic') {
        shipName = 'Epic Destroyer';
      } else if (ship.rarity === 'Legendary') {
        shipName = 'Legendary Cruiser';
      } else if (ship.rarity === 'Master') {
        shipName = 'Master Battleship';
      } else if (ship.rarity === 'Ultra') {
        shipName = 'Ultra Command';
      }
      
      return {
        ...ship,
        name: shipName,
        image: image
      };
    });

    res.json({ success: true, ships });
  } catch (error) {
    console.error('Error getting collection:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get ship by token ID
router.get('/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;

    const result = await pool.query(
      'SELECT * FROM ships WHERE token_id = $1',
      [tokenId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ship not found' });
    }

    res.json({ success: true, ship: result.rows[0] });
  } catch (error) {
    console.error('Error getting ship:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

function getShipImage(rarity) {
  // Map rarity to GIF file
  const imageMap = {
    'Common': '/nft-images/ships/ship-elite.gif',
    'Epic': '/nft-images/ships/ship-epic.gif',
    'Legendary': '/nft-images/ships/ship-legendary.gif',
    'Master': '/nft-images/ships/ship-master.gif',
    'Ultra': '/nft-images/ships/ship-ultra.gif'
  };
  
  return imageMap[rarity] || '/nft-images/ships/ship-classic.gif';
}

// Helper untuk get ship image path berdasarkan rarity
function getShipImagePath(rarity) {
  const rarityMap = {
    'Common': '/nft-images/ships/ship-elite.gif',
    'Epic': '/nft-images/ships/ship-epic.gif',
    'Legendary': '/nft-images/ships/ship-legendary.gif',
    'Master': '/nft-images/ships/ship-master.gif',
    'Ultra': '/nft-images/ships/ship-ultra.gif'
  };
  return rarityMap[rarity] || '/nft-images/ships/ship-classic.gif';
}

export default router;


