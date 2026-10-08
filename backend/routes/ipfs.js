import express from 'express';
import multer from 'multer';
import FormData from 'form-data';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../assets/uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Upload image to IPFS using Pinata
router.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }

    // Check if Pinata credentials are set
    const pinataApiKey = process.env.PINATA_API_KEY;
    const pinataSecretKey = process.env.PINATA_SECRET_KEY;

    if (!pinataApiKey || !pinataSecretKey) {
      // Return mock CID for development
      const mockCid = `Qm${Math.random().toString(36).substr(2, 44)}`;
      const mockUrl = `https://gateway.pinata.cloud/ipfs/${mockCid}`;
      
      // Clean up temp file
      fs.unlinkSync(file.path);
      
      return res.json({
        success: true,
        ipfsHash: mockCid,
        ipfsUrl: mockUrl,
        cid: mockCid,
        message: 'Mock IPFS upload (Pinata not configured)'
      });
    }

    // Upload to Pinata IPFS
    const formData = new FormData();
    formData.append('file', fs.createReadStream(file.path));
    
    // Add metadata
    const metadata = JSON.stringify({
      name: file.originalname,
      keyvalues: {
        type: 'nft-image',
        uploadedAt: new Date().toISOString()
      }
    });
    formData.append('pinataMetadata', metadata);

    const pinataResponse = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      formData,
      {
        headers: {
          'pinata_api_key': pinataApiKey,
          'pinata_secret_api_key': pinataSecretKey,
          ...formData.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    const ipfsHash = pinataResponse.data.IpfsHash;
    const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;

    // Clean up temp file
    fs.unlinkSync(file.path);

    console.log('✅ Image uploaded to IPFS:', ipfsHash);

    res.json({
      success: true,
      ipfsHash,
      ipfsUrl,
      cid: ipfsHash,
      gatewayUrl: ipfsUrl
    });
  } catch (error) {
    console.error('IPFS upload error:', error);
    
    // Clean up temp file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      success: false, 
      message: error.response?.data?.error || error.message || 'Failed to upload to IPFS' 
    });
  }
});

// Create NFT metadata JSON and upload to IPFS
router.post('/upload-metadata', async (req, res) => {
  try {
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
      shield
    } = req.body;
    
    // Build metadata according to OpenZeppelin/ERC-721 standard
    const metadata = {
      name: name || `Space Stellar Ship #${Date.now()}`,
      description: description || 'A unique NFT ship for Space Stellar game',
      image: image || (imageCid ? `ipfs://${imageCid}` : ''),
      external_url: 'https://space-stellar.app',
      attributes: attributes || [
        {
          trait_type: 'Tier',
          value: tier || 'Classic'
        },
        {
          trait_type: 'Class',
          value: shipClass || 'Fighter'
        },
        {
          trait_type: 'Rarity',
          value: rarity || 'Common'
        },
        {
          trait_type: 'Attack',
          value: attack || 10,
          display_type: 'number'
        },
        {
          trait_type: 'Speed',
          value: speed || 8,
          display_type: 'number'
        },
        {
          trait_type: 'Shield',
          value: shield || 12,
          display_type: 'number'
        }
      ]
    };

    const pinataApiKey = process.env.PINATA_API_KEY;
    const pinataSecretKey = process.env.PINATA_SECRET_KEY;

    if (!pinataApiKey || !pinataSecretKey) {
      // Return mock CID for development
      const mockCid = `Qm${Math.random().toString(36).substr(2, 44)}`;
      const mockUrl = `https://gateway.pinata.cloud/ipfs/${mockCid}`;
      
      return res.json({
        success: true,
        metadataCid: mockCid,
        metadataUrl: mockUrl,
        metadata: metadata,
        ipfsUri: `ipfs://${mockCid}`,
        message: 'Mock metadata upload (Pinata not configured)'
      });
    }

    // Upload metadata JSON to IPFS
    const formData = new FormData();
    const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2));
    formData.append('file', metadataBuffer, {
      filename: 'metadata.json',
      contentType: 'application/json'
    });

    const metadataObj = JSON.stringify({
      name: `Space Stellar NFT Metadata - ${name}`,
      keyvalues: {
        type: 'nft-metadata',
        tier: tier || 'Classic',
        rarity: rarity || 'Common'
      }
    });
    formData.append('pinataMetadata', metadataObj);

    let pinataResponse;
    try {
      pinataResponse = await axios.post(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        formData,
        {
          headers: {
            'pinata_api_key': pinataApiKey,
            'pinata_secret_api_key': pinataSecretKey,
            ...formData.getHeaders()
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      const metadataCid = pinataResponse.data?.IpfsHash;
      if (!metadataCid) {
        throw new Error('Failed to get IPFS hash from Pinata response');
      }
      
      const metadataUrl = `https://gateway.pinata.cloud/ipfs/${metadataCid}`;

      console.log('✅ Metadata uploaded to IPFS:', metadataCid);

      res.json({
        success: true,
        metadataCid,
        metadataUrl,
        metadata: metadata,
        ipfsUri: `ipfs://${metadataCid}`
      });
    } catch (pinataError) {
      // Never fabricate a CID: a pinning outage must surface to the caller so the
      // frontend can retry instead of persisting an unresolvable token URI.
      const requestId =
        pinataError.response?.headers?.['x-request-id'] ||
        pinataError.response?.data?.id ||
        null;
      console.error('Pinata upload error:', {
        message: pinataError.message,
        status: pinataError.response?.status,
        requestId,
        response: pinataError.response?.data
      });
      return res.status(502).json({
        success: false,
        code: 'PINATA_UNAVAILABLE',
        message: 'Failed to upload metadata to IPFS (Pinata unavailable). Please retry.',
        requestId
      });
    }
  } catch (error) {
    console.error('Metadata upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.response?.data?.error || error.message || 'Failed to upload metadata to IPFS' 
    });
  }
});

// Get IPFS file by CID
router.get('/:cid', async (req, res) => {
  try {
    const { cid } = req.params;
    const gateway = req.query.gateway || 'pinata';
    
    let url;
    switch (gateway) {
      case 'pinata':
        url = `https://gateway.pinata.cloud/ipfs/${cid}`;
        break;
      case 'ipfs':
        url = `https://ipfs.io/ipfs/${cid}`;
        break;
      default:
        url = `https://gateway.pinata.cloud/ipfs/${cid}`;
    }

    const response = await axios.get(url, { responseType: 'stream' });
    response.data.pipe(res);
  } catch (error) {
    console.error('IPFS fetch error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch from IPFS' 
    });
  }
});

export default router;

