// Deploy script for Scaffold Stellar
import { config } from 'dotenv';
import { execSync } from 'child_process';
import { join } from 'path';

config();

// The canonical contract crate is the `space_stellar_nft` workspace member.
// (`contracts/space_stellar_nft`), which produces `space_stellar_nft.wasm`.
const CONTRACT_NAME = 'space_stellar_nft';
const WASM_PATH = join(process.cwd(), 'target', 'wasm32-unknown-unknown', 'release', `${CONTRACT_NAME}.wasm`);

console.log('🚀 Deploying Space Stellar NFT Contract...\n');

try {
  // Build contract from the `contracts/` directory, which resolves to the
  // root Cargo workspace that owns the canonical `space_stellar_nft` crate.
  console.log('📦 Building contract...');
  execSync('cargo build --target wasm32-unknown-unknown --release --package space_stellar_nft', {
    cwd: join(process.cwd(), 'contracts'),
    stdio: 'inherit'
  });

  console.log('\n✅ Contract built successfully!');
  console.log(`📄 WASM file: ${WASM_PATH}\n`);
  
  console.log('📝 Next steps:');
  console.log('1. Deploy using Stellar CLI:');
  console.log(`   stellar contract deploy --wasm ${WASM_PATH} --source YourAccount --network testnet`);
  console.log('\n2. Or use Scaffold Stellar CLI:');
  console.log('   stellar scaffold deploy');
  console.log('\n3. Update CONTRACT_ID in .env file after deployment\n');

} catch (error) {
  console.error('❌ Deployment error:', error.message);
  process.exit(1);
}
