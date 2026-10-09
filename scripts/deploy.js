// Deploy script for Scaffold Stellar
import { config } from 'dotenv';
import { execSync } from 'child_process';
import { join } from 'path';
#!/usr/bin/env node
'use strict';

/*
 * Build the canonical `space_stellar_nft` workspace contract and locate the
 * wasm artifact that `stellar registry publish` consumes.
 *
 * The build target is read from rust-toolchain.toml so we always use a target
 * the pin actually installs (currently wasm32v1-none) instead of the
 * wasm32-unknown-unknown target that `rustup` never adds. The artifact path is
 * resolved from Cargo's own metadata rather than a hand-typed, hyphenated
 * file name, so a rename of the crate cannot silently point the publish step
 * at a stale artifact.
 */

// The canonical contract crate is the `space_stellar_nft` workspace member.
// (`contracts/space_stellar_nft`), which produces `space_stellar_nft.wasm`.
const CONTRACT_NAME = 'space_stellar_nft';
const WASM_PATH = join(process.cwd(), 'target', 'wasm32-unknown-unknown', 'release', `${CONTRACT_NAME}.wasm`);

console.log('🚀 Deploying Space Stellar NFT Contract...\n');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// dotenv is optional: the script also works with plain environment variables.
try {
  // Build contract from the `contracts/` directory, which resolves to the
  // root Cargo workspace that owns the canonical `space_stellar_nft` crate.
  console.log('📦 Building contract...');
  execSync('cargo build --target wasm32-unknown-unknown --release --package space_stellar_nft', {
    cwd: join(process.cwd(), 'contracts'),
    stdio: 'inherit'
  });
  require('dotenv').config();
} catch {
  /* no dotenv installed, nothing to load */
}

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_NAME = 'space_stellar_nft';

function readToolchainTarget() {
  const toolchainFile = path.join(ROOT, 'rust-toolchain.toml');
  if (!fs.existsSync(toolchainFile)) {
    throw new Error('rust-toolchain.toml is missing; cannot determine the wasm target');
  }
  const match = fs
    .readFileSync(toolchainFile, 'utf8')
    .match(/^\s*targets\s*=\s*\[([^\]]*)\]/m);
  if (!match) {
    throw new Error('rust-toolchain.toml does not declare a `targets` list');
  }
  const targets = match[1]
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
  if (targets.length === 0) {
    throw new Error('rust-toolchain.toml declares an empty `targets` list');
  }
  return targets[0];
}

function loadWorkspaceCrate(name) {
  const raw = execSync('cargo metadata --format-version 1 --no-deps', {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const metadata = JSON.parse(raw);
  const pkg = metadata.packages.find((p) => p.name === name);
  if (!pkg) {
    throw new Error(
      `the Cargo workspace at ${ROOT} does not contain a package named "${name}"`,
    );
  }
  return { targetDirectory: metadata.target_directory };
}

function main() {
  const target = readToolchainTarget();
  const { targetDirectory } = loadWorkspaceCrate(CONTRACT_NAME);

  console.log(`🚀 Deploying ${CONTRACT_NAME} (wasm target: ${target})...\n`);
  console.log('📦 Building the canonical workspace contract...');

  execSync(
    `cargo build --release --target ${target} --package ${CONTRACT_NAME}`,
    { cwd: ROOT, stdio: 'inherit' },
  );

  const wasmPath = path.join(targetDirectory, target, 'release', `${CONTRACT_NAME}.wasm`);
  if (!fs.existsSync(wasmPath)) {
    console.error(`\n❌ Expected wasm artifact was not produced: ${wasmPath}`);
    console.error(
      `   Build it explicitly with:\n` +
        `     cargo build --release --target ${target} --package ${CONTRACT_NAME}`,
    );
    process.exit(1);
  }

  const rel = path.relative(ROOT, wasmPath);
  console.log(`\n✅ Built ${rel} (${fs.statSync(wasmPath).size} bytes)\n`);
  console.log('📝 Next steps:');
  console.log('1. Publish to the registry:');
  console.log(`   stellar registry publish --wasm ${rel} --wasm-name space-stellar-nft`);
  console.log('\n2. Deploy a contract instance:');
  console.log(
    '   stellar registry deploy --contract-name space-stellar-nft-instance --wasm-name space-stellar-nft',
  );
  console.log('\n3. Update CONTRACT_ID in your .env files after deployment');
}

try {
  main();
} catch (error) {
  console.error(`\n❌ Deployment error: ${error.message}`);
  process.exit(1);
}
