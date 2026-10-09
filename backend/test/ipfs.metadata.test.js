// Tests for NFT metadata assembly in `backend/routes/ipfs.js`
// (stellarspace-hq/space-stellar #18).
//
// Run with:  node --test backend/test/ipfs.metadata.test.js
//
// `backend/routes/ipfs.js` only depends on Express and friends (not the server
// module), so its router can be exercised directly. Pinata is never contacted:
// the credentials are unset and `axios.post` is stubbed to fail loudly if the
// handler tried to upload.

import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

import axios from 'axios';

import {
  buildShipMetadata,
  validateMetadataRequest,
} from '../utils/ipfsMetadata.js';

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function callRouter(router, method, url, body = {}) {
  const req = { method, url, body, headers: {}, get() {}, on() {} };
  const res = makeRes();
  await new Promise((resolve) => {
    router(req, res, () => resolve());
    queueMicrotask(resolve);
  });
  return res;
}

const FIXTURE = {
  name: 'Elite Fighter #7',
  description: 'A test ship',
  image: 'ipfs://QmImage',
  tier: 'Elite',
  class: 'Fighter',
  rarity: 'Common',
  attack: 12,
  speed: 7,
  shield: 3,
};

describe('buildShipMetadata', () => {
  it('assembles name, description, image and an attributes array', () => {
    const metadata = buildShipMetadata(FIXTURE);

    assert.equal(metadata.name, 'Elite Fighter #7');
    assert.equal(metadata.description, 'A test ship');
    assert.equal(metadata.image, 'ipfs://QmImage');
    assert.ok(Array.isArray(metadata.attributes));
    for (const attribute of metadata.attributes) {
      assert.ok('trait_type' in attribute, 'each attribute carries trait_type');
      assert.ok('value' in attribute, 'each attribute carries value');
    }
  });

  it('copies every fixture value into its attribute entry by entry', () => {
    const metadata = buildShipMetadata(FIXTURE);
    const byTrait = Object.fromEntries(
      metadata.attributes.map((attribute) => [attribute.trait_type, attribute.value]),
    );

    assert.equal(byTrait.Tier, 'Elite');
    assert.equal(byTrait.Class, 'Fighter');
    assert.equal(byTrait.Rarity, 'Common');
    assert.equal(byTrait.Attack, 12);
    assert.equal(byTrait.Speed, 7);
    assert.equal(byTrait.Shield, 3);
  });

  it('derives the image from an imageCid when no image is given', () => {
    const metadata = buildShipMetadata({ name: 'X', imageCid: 'QmAbc' });
    assert.equal(metadata.image, 'ipfs://QmAbc');
  });
});

describe('validateMetadataRequest', () => {
  it('rejects a missing name with a 400 payload', () => {
    const result = validateMetadataRequest({ tier: 'Elite' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(result.body.success, false);
  });

  it('accepts a body with a name', () => {
    assert.equal(validateMetadataRequest({ name: 'ok' }).ok, true);
  });
});

describe('POST /upload-metadata handler', () => {
  let uploads;

  beforeEach(() => {
    delete process.env.PINATA_API_KEY;
    delete process.env.PINATA_SECRET_KEY;
    uploads = 0;
    axios.post = async () => {
      uploads += 1;
      throw new Error('Pinata must not be called in tests');
    };
  });

  it('returns the assembled metadata without attempting an upload', async () => {
    const router = (await import('../routes/ipfs.js')).default;
    const res = await callRouter(router, 'POST', '/upload-metadata', FIXTURE);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.metadata.name, FIXTURE.name);
    assert.equal(uploads, 0);
  });

  it('rejects a missing name with a 400 without uploading', async () => {
    const router = (await import('../routes/ipfs.js')).default;
    const res = await callRouter(router, 'POST', '/upload-metadata', {
      tier: 'Elite',
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(uploads, 0);
  });
});
