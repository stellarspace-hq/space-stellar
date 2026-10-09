// Unit tests for the rarity -> ship image mapping
// (stellarspace-hq/space-stellar #10).
//
// Run with:  node --test backend/test/ships.mapping.test.js
//
// `backend/routes/ships.js` imports the Express server on load, so the mapping
// it relies on lives in `backend/utils/shipMapping.js` and is tested here.

import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  DEFAULT_SHIP_IMAGE,
  SHIP_IMAGE_FILES,
  getShipImage,
  getShipImagePath,
} from '../utils/shipMapping.js';

const here = dirname(fileURLToPath(import.meta.url));
const shipsDir = join(here, '..', '..', 'assets', 'nft-images', 'ships');

const EXPECTED = {
  Common: '/nft-images/ships/ship-elite.gif',
  Epic: '/nft-images/ships/ship-epic.gif',
  Legendary: '/nft-images/ships/ship-legendary.gif',
  Master: '/nft-images/ships/ship-master.gif',
  Ultra: '/nft-images/ships/ship-ultra.gif',
};

describe('getShipImage', () => {
  it('maps every known rarity to its image path', () => {
    for (const [rarity, image] of Object.entries(EXPECTED)) {
      assert.equal(getShipImage(rarity), image, `rarity ${rarity}`);
    }
  });

  it('falls back to the classic ship for an unknown rarity', () => {
    assert.equal(getShipImage('Mythic'), DEFAULT_SHIP_IMAGE);
    assert.equal(getShipImage(undefined), DEFAULT_SHIP_IMAGE);
    assert.equal(getShipImage(''), DEFAULT_SHIP_IMAGE);
  });
});

describe('getShipImagePath', () => {
  it('is an alias of getShipImage for every rarity', () => {
    for (const rarity of Object.keys(EXPECTED)) {
      assert.equal(getShipImagePath(rarity), getShipImage(rarity));
    }
    assert.equal(getShipImagePath('unknown'), DEFAULT_SHIP_IMAGE);
  });
});

describe('image files exist in the repo', () => {
  it('every mapped image path points at one of the six real files', () => {
    const rarities = [...Object.keys(EXPECTED), 'unknown'];
    for (const rarity of rarities) {
      const name = basename(getShipImage(rarity));
      assert.ok(
        SHIP_IMAGE_FILES.includes(name),
        `${name} should be one of the six known ship files`,
      );
    }
  });

  it('each of the six ship files exists on disk', () => {
    for (const name of SHIP_IMAGE_FILES) {
      assert.ok(existsSync(join(shipsDir, name)), `missing ${name}`);
    }
  });
});
