# 🚀 Space Stellar

<div align="center">

**A Next-Generation NFT-Based Space Shooter Game on Stellar Blockchain**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Stellar](https://img.shields.io/badge/Stellar-Testnet-orange.svg)](https://www.stellar.org/)
[![Soroban](https://img.shields.io/badge/Soroban-Smart%20Contracts-purple.svg)](https://soroban.stellar.org/)
[![Scaffold Stellar](https://img.shields.io/badge/Scaffold%20Stellar-Registry-green.svg)](https://scaffoldstellar.org/docs/registry)
[![React](https://img.shields.io/badge/React-19.1.1-61DAFB.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-3178C6.svg)](https://www.typescriptlang.org/)

[Features](#-features) • [Installation](#-installation) • [Smart Contracts](#-smart-contracts) • [Deployment](#-deployment) • [Documentation](#-documentation)

</div>

---

https://youtu.be/auC2VgekLhI?si=E9sW-NqZyDuW604C

## 📖 What is Space Stellar?

**Space Stellar** is a decentralized web3 game built on the Stellar blockchain, combining NFT collectibles with real-time space shooter gameplay. This project uses [Scaffold Stellar Registry](https://scaffoldstellar.org/docs/registry) to easily manage and deploy smart contracts.

### 🎯 Project Concept

Space Stellar is a **Play-to-Earn NFT Game** where:

1. **Players Collect NFT Ships** - Each ship is a unique NFT with different attributes (Attack, Speed, Shield)
2. **Play Space Shooter Game** - Use NFT ships to play real-time games
3. **Global Competition** - Climb the leaderboard rankings and earn rewards
4. **Multiplayer Support** - Play solo or versus with other players

### 🏗️ Technology Architecture

This project uses the **Scaffold Stellar Registry System** for smart contract deployment:

- **Registry Contract**: On-chain contract for publishing, deploying, and managing smart contracts
- **Registry CLI**: Tool for interacting with the registry (`stellar registry` commands)
- **OpenZeppelin Standards**: Uses OpenZeppelin Stellar Contracts for NFT standards
- **Soroban Smart Contracts**: Smart contracts written in Rust using Soroban SDK

### 🔑 Why Use Scaffold Stellar Registry?

1. **Simplified Deployment**: No need to manage contract IDs manually
2. **Version Management**: Registry stores all published contract versions
3. **Easy Updates**: Update contracts easily without losing data
4. **Alias System**: Use alias names to simplify development
5. **On-chain Registry**: All contracts are registered on the blockchain for transparency

**Full Documentation**: [Scaffold Stellar Registry Guide](https://scaffoldstellar.org/docs/registry)

---

## ✨ Features

### 🎮 Game Features

- **Space Shooter Mechanics**
  - Player ship movement (WASD/Arrow Keys)
  - Shooting system with customizable fire rate
  - Enemy spawning with difficulty scaling
  - Collision detection and health system
  - Score tracking and coin collection
  - Power-ups and special abilities

- **Game Modes**
  - **Solo Mode**: Single-player gameplay with global leaderboard
  - **Multiplayer Mode**: Room-based versus matches with real-time synchronization

- **Ship System**
  - 6-tier rarity system (Classic, Elite, Epic, Legendary, Master, Ultra)
  - Unique stats per tier (Attack, Speed, Shield)
  - Dynamic ship attributes that affect gameplay
  - Visual ship representation with GIF animations

### 🎨 NFT Features

- **NFT Minting**
  - Mint unique ship NFTs directly from the store
  - IPFS-based metadata storage
  - On-chain attribute storage (class, rarity, tier, stats)
  - Sequential token ID assignment
  - **NFT Ship Contract (Testnet)**: `CC7MQ3BSNULZ4YX62OMZOZ2RYTZEMUJEWITQJH7YBVXJL75QIZMS2PTX`

- **Collection Management**
  - View owned NFTs in the collection page
  - Ship equipping system
  - Profile picture (PFP) NFT support
  - Transfer and ownership tracking

### 🏆 Social Features

- **Leaderboards**
  - Global top players ranking
  - Best score tracking per player
  - Real-time leaderboard updates

- **Match History**
  - Complete game history per player
  - Match statistics (score, duration, mode)
  - Room code tracking

- **Profile System**
  - User profile with statistics
  - NFT ownership display
  - Achievement tracking

---

## 🏗️ Architecture

```
space-stellar/
├── frontend/                 # React + TypeScript frontend
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/          # Route pages
│   │   ├── contexts/       # React contexts (Wallet)
│   │   ├── contracts/      # Generated contract clients
│   │   └── utils/          # Utility functions
│   ├── public/             # Static assets
│   └── package.json
│
├── backend/                 # Node.js + Express backend
│   ├── routes/             # API routes
│   ├── scripts/            # Migration & utility scripts
│   ├── utils/              # Utility functions
│   └── server.js           # Express server
│
├── contracts/               # Soroban smart contracts (Rust)
│   ├── space_stellar_nft/  # Main NFT contract (Ships)
│   │   ├── src/lib.rs      # Contract implementation
│   │   └── Cargo.toml
│   ├── space_stellar_pfp/  # Profile Picture NFT contract
│   │   ├── src/lib.rs      # PFP contract implementation
│   │   └── Cargo.toml
│   └── Cargo.toml          # Workspace configuration
│
├── scripts/                # Deployment scripts
├── scaffold.config.js      # Scaffold Stellar configuration
└── package.json            # Root package.json
```

### Technology Stack

**Frontend:**
- React 19.1.1 with TypeScript
- Vite 7.1.11 for build tooling
- Stellar Wallet Kit for wallet integration
- React Router for navigation
- TanStack Query for data fetching

**Backend:**
- Node.js with Express
- PostgreSQL for data persistence (optional)
- Socket.io for real-time multiplayer

**Smart Contracts:**
- Rust with Soroban SDK 23.0.2
- OpenZeppelin Stellar Contracts v0.5.1
- **Scaffold Stellar Registry** for deployment and management

**Blockchain:**
- Stellar Network (Testnet/Mainnet)
- Soroban for smart contract execution
- IPFS for metadata storage

---

## 🚀 Installation

### Prerequisites

- **Node.js** 18+ and npm
- **Rust** 1.70+ and Cargo
- **PostgreSQL** 14+ (optional, backend can run in mock mode)
- **Stellar CLI** - for contract deployment
- **Scaffold Stellar CLI** - for registry management

### Step 1: Clone Repository

```bash
git clone https://github.com/enyekk7/space-stellar.git
cd space-stellar
```

### Step 2: Install Dependencies

```bash
# Install root dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Install backend dependencies
cd backend && npm install && cd ..
```

### Step 3: Install Rust & Build Tools

```bash
# Install Rust toolchain (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm32 target for contract compilation
rustup target add wasm32-unknown-unknown
```

### Step 4: Install Scaffold Stellar CLI

```bash
# Install Scaffold Stellar CLI
cargo install --locked stellar-scaffold-cli

# Install Registry CLI (for registry management)
cargo install --git https://github.com/theahaco/scaffold-stellar stellar-registry-cli
```

**Reference**: [Scaffold Stellar Registry Installation](https://scaffoldstellar.org/docs/registry#prerequisites)

### Step 5: Environment Configuration

Create environment files:

**Frontend (`frontend/.env`):**
```env
VITE_STELLAR_NETWORK=testnet
VITE_CONTRACT_ID=your_nft_contract_id_here
VITE_PFP_CONTRACT_ID=your_pfp_contract_id_here
VITE_API_URL=http://localhost:3001
VITE_TREASURY_ADDRESS=your_treasury_address_here
```

**Backend (`backend/.env`):**
```env
PORT=3001
NODE_ENV=development
STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=https://soroban-rpc.testnet.stellar.org

# Contract IDs (fill after deployment)
CONTRACT_ID=your_nft_contract_id
PFP_CONTRACT_ID=your_pfp_contract_id

# Database (optional)
DATABASE_URL=postgresql://user:password@localhost:5432/space_stellar

# JWT Secret

# IPFS (if using Pinata)
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret_key

# Contract Owner (for PFP minting)
PFP_CONTRACT_OWNER_SECRET=your_owner_secret_key_here
```

### Step 6: Build Smart Contracts

```bash
# Build all contracts
npm run deploy:build

# Or build individually
cd contracts/space_stellar_nft
cargo build --target wasm32-unknown-unknown --release
cd ../space_stellar_pfp
cargo build --target wasm32-unknown-unknown --release
cd ../..
```

### Step 7: Run Development Servers

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

**Terminal 3 - Scaffold Stellar Watch (Optional):**
```bash
npm run dev
# This will watch for contract changes and rebuild clients
```

Open your browser at `http://localhost:5173`

---

## 📝 Smart Contracts

This project uses **2 smart contracts** deployed using **Scaffold Stellar Registry**:

### 🚀 Contract 1: Space Stellar NFT (`space_stellar_nft`)

**Main NFT contract for ship tokens with custom metadata.**

#### Contract Details

- **Name**: Space Stellar Ships
- **Symbol**: SSHIP
- **Standard**: OpenZeppelin NonFungibleToken
- **Features**: Ownable, Sequential Minting, Custom Metadata
- **Deployment**: Uses Scaffold Stellar Registry

#### How the NFT Ship Contract Works

1. **Initialization (Constructor)**
   ```rust
   pub fn __constructor(e: &Env, owner: Address)
   ```
   - Sets contract metadata (name, symbol, URI)
   - Sets contract owner
   - Initializes OpenZeppelin base contract

2. **Minting Process**
   ```rust
   pub fn mint(
       e: &Env,
       to: Address,
       class: String,        // Ship class (Elite, Epic, etc.)
       rarity: String,       // Rarity level
       tier: String,         // Tier level
       attack: u32,          // Attack stat
       speed: u32,           // Speed stat
       shield: u32,          // Shield stat
       ipfs_cid: String,     // IPFS content ID
       metadata_uri: String  // Full metadata URI
   ) -> u32                  // Returns token ID
   ```
   
   **Minting Flow:**
   1. User selects ship tier on Store page
   2. Frontend creates payment transaction to Treasury address
   3. After payment is confirmed, frontend calls `mint()` function
   4. Contract uses `Base::sequential_mint()` to mint NFT
   5. Metadata is stored on-chain (class, rarity, tier, stats, IPFS CID)
   6. Token ID is returned and displayed to user

3. **Metadata Storage**
   - Ship attributes stored on-chain using instance storage
   - IPFS CID for off-chain metadata JSON
   - Full metadata URI for external access

4. **OpenZeppelin Traits**
   - `NonFungibleToken`: Standard NFT operations (transfer, approve, etc.)
   - `Ownable`: Contract ownership management

#### Main Functions

```rust
// Get ship metadata
pub fn get_ship_class(e: &Env, token_id: u32) -> Option<String>
pub fn get_ship_rarity(e: &Env, token_id: u32) -> Option<String>
pub fn get_ship_tier(e: &Env, token_id: u32) -> Option<String>
pub fn get_ipfs_cid(e: &Env, token_id: u32) -> Option<String>
pub fn get_metadata_uri(e: &Env, token_id: u32) -> Option<String>
```

### 🎨 Contract 2: Space Stellar PFP (`space_stellar_pfp`)

**NFT contract for Profile Picture - one PFP per address.**

#### Contract Details

- **Name**: Space Stellar PFP
- **Symbol**: SSPFP
- **Standard**: OpenZeppelin NonFungibleToken
- **Features**: One-per-address minting, Sequential IDs
- **Deployment**: Uses Scaffold Stellar Registry

#### How the PFP Contract Works

1. **Initialization**
   ```rust
   pub fn __constructor(e: &Env, owner: Address)
   ```
   - Sets contract metadata
   - Sets contract owner

2. **Minting Process**
   ```rust
   pub fn mint(e: &Env, to: Address) -> u32
   ```
   
   **Minting Flow:**
   1. User selects PFP on Profile page
   2. Frontend/Backend calls `mint()` function
   3. Contract checks if address already has PFP (`balance > 0`)
   4. If not, contract mints PFP using `Base::sequential_mint()`
   5. Token ID is returned

3. **Minting Rules**
   - Each address can only mint **one PFP**
   - Public minting (anyone can call)
   - Sequential token IDs (1, 2, 3, ...)

4. **Check Function**
   ```rust
   pub fn has_pfp(e: &Env, owner: Address) -> bool
   ```
   - Checks if address already has PFP
   - Uses `Base::balance()` for checking

---

## 🚀 Deployment with Scaffold Stellar Registry

This project uses [Scaffold Stellar Registry](https://scaffoldstellar.org/docs/registry) for smart contract deployment. The registry system simplifies publishing, deploying, and managing contracts.

### Prerequisites for Deployment

1. **Install Registry CLI:**
   ```bash
   cargo install --git https://github.com/theahaco/scaffold-stellar stellar-registry-cli
   ```

2. **Setup Stellar Account:**
   ```bash
   stellar keys use alice
   stellar network use testnet
   ```

3. **Fund Account:**
   - Testnet: Use [Friendbot](https://laboratory.stellar.org/#account-creator)
   - Mainnet: Transfer XLM to account

### Registry Contract Addresses


### Deployment Workflow

#### 1. Build Contracts

```bash
# Build NFT contract
cd contracts/space_stellar_nft
cargo build --target wasm32-unknown-unknown --release

# Build PFP contract
cd ../space_stellar_pfp
cargo build --target wasm32-unknown-unknown --release
cd ../..
```

#### 2. Publish Contracts to Registry

**Publish NFT Contract:**
```bash
stellar registry publish \
  --wasm target/wasm32-unknown-unknown/release/space_stellar_nft.wasm \
  --wasm-name space-stellar-nft \
  --binver "1.0.0" \
  --network testnet
```

**Publish PFP Contract:**
```bash
stellar registry publish \
  --wasm target/wasm32-unknown-unknown/release/space_stellar_pfp.wasm \
  --wasm-name space-stellar-pfp \
  --binver "1.0.0" \
  --network testnet
```

**Explanation:**
- `--wasm`: Path to compiled WASM file
- `--wasm-name`: Name for published contract (will be used for deployment)
- `--binver`: Binary version (follows semantic versioning)
- `--network`: Target network (testnet/mainnet)

#### 3. Deploy Contract Instances

**Deploy NFT Contract:**
```bash
stellar registry deploy \
  --contract-name space-stellar-nft-instance \
  --wasm-name space-stellar-nft \
  --version "1.0.0" \
  --network testnet \
  -- \
  __constructor \
  --owner YOUR_OWNER_ADDRESS
```

**Deploy PFP Contract:**
```bash
stellar registry deploy \
  --contract-name space-stellar-pfp-instance \
  --wasm-name space-stellar-pfp \
  --version "1.0.0" \
  --network testnet \
  -- \
  __constructor \
  --owner YOUR_OWNER_ADDRESS
```

**Explanation:**
- `--contract-name`: Name for deployed contract instance
- `--wasm-name`: Name of published contract to deploy
- `--version`: Specific version (optional, default: latest)
- `--`: Separator for constructor function and arguments
- `__constructor`: Constructor function name
- `--owner`: Owner address for contract

#### 4. Create Aliases (Optional)

Aliases simplify contract usage with memorable names:

```bash
# Create alias for NFT contract
stellar registry create-alias space-stellar-nft-instance

# Create alias for PFP contract
stellar registry create-alias space-stellar-pfp-instance
```

After creating aliases, you can use them directly:
```bash
stellar contract invoke --id space-stellar-nft-instance -- --help
```

#### 5. Get Contract IDs

After deployment, get the Contract ID:

```bash
# Get Contract ID from alias
stellar keys lookup space-stellar-nft-instance

# Or from registry
stellar registry info space-stellar-nft-instance
```

Update Contract IDs in environment files:
- `frontend/.env`: `VITE_CONTRACT_ID` and `VITE_PFP_CONTRACT_ID`
- `backend/.env`: `CONTRACT_ID` and `PFP_CONTRACT_ID`

### Using Deployment Scripts

This project provides deployment scripts:

**PowerShell (Windows):**
```powershell
.\scripts\deploy-scaffold.ps1 -Network testnet
```

**Bash (Linux/Mac):**
```bash
./scripts/deploy-scaffold.sh testnet
```

### Verify Deployment

```bash
# Check contract metadata
stellar contract invoke --id space-stellar-nft-instance -- name
stellar contract invoke --id space-stellar-nft-instance -- symbol

# Test mint NFT
stellar contract invoke \
  --id space-stellar-nft-instance \
  -- \
  mint \
  --to RECIPIENT_ADDRESS \
  --class "Elite" \
  --rarity "Common" \
  --tier "Tier 1" \
  --attack 10 \
  --speed 8 \
  --shield 12 \
  --ipfs_cid "QmExample..." \
  --metadata_uri "ipfs://QmExample..."

# Test mint PFP
stellar contract invoke \
  --id space-stellar-pfp-instance \
  -- \
  mint \
  --to RECIPIENT_ADDRESS
```

### Best Practices

1. **Semantic Versioning**: Use semantic versioning for contract versions
2. **Test on Testnet**: Always test deployment on testnet before mainnet
3. **Dry Run**: Use `--dry-run` flag to simulate operations
4. **Documentation**: Document initialization parameters for each deployment
5. **Environment Variables**: Use environment variables for network configurations

**Full Reference**: [Scaffold Stellar Registry Guide](https://scaffoldstellar.org/docs/registry)

---

## 🎮 Game Mechanics

### Ship Tiers

| Tier | Rarity | Price (XLM) | Attack | Speed | Shield | Total Stats |
|------|--------|-------------|--------|-------|--------|-------------|
| Classic | Default | Free | 5 | 5 | 5 | 15 |
| Elite | Common | 10 | 10 | 8 | 12 | 30 |
| Epic | Epic | 50 | 20 | 6 | 18 | 44 |
| Legendary | Legendary | 100 | 30 | 15 | 25 | 70 |
| Master | Master | 200 | 40 | 12 | 35 | 87 |
| Ultra | Ultra | 500 | 50 | 18 | 45 | 113 |

### Game Stats Impact

Ship stats affect gameplay:

- **Speed**: Movement velocity (pixels per frame)
- **Fire Rate**: Bullet firing interval (milliseconds)
- **Health**: Hit points before game over

**Rarity-based Stats:**
- Classic: Speed 5, Fire Rate 300ms, Health 3
- Common/Elite: Speed 6, Fire Rate 250ms, Health 4
- Epic: Speed 7, Fire Rate 200ms, Health 5
- Legendary: Speed 8, Fire Rate 150ms, Health 6
- Master: Speed 9, Fire Rate 120ms, Health 7
- Ultra: Speed 10, Fire Rate 100ms, Health 8

### Controls

- **Movement**: `WASD` or `Arrow Keys`
- **Shoot**: `Space`
- **Pause**: `P`

### Scoring System

- Enemy destroyed: +10 points
- Coin collected: +5 points
- Difficulty scaling: Enemy speed increases with score

---

## 🔌 API Documentation

### Backend API Endpoints

#### Rooms API

```typescript
// Create a new game room
POST /api/rooms/create
Body: {
  hostAddress: string
  mode: 'solo' | 'versus' | 'multiplayer'
  seed?: number
}
Response: {
  roomCode: string
  roomId: string
  status: 'waiting' | 'playing' | 'finished'
}

// Get room data
GET /api/rooms/:roomCode
Response: {
  roomId: string
  hostAddress: string
  guestAddress?: string
  mode: string
  status: string
  seed: number
  created_at: string
}
```

#### Matches API

```typescript
// Save match result
POST /api/matches/save
Body: {
  mode: string
  p1_address: string
  p2_address?: string
  p1_score: number
  p2_score?: number
  duration_ms: number
  room_code: string
}
Response: {
  matchId: string
  success: boolean
}

// Get leaderboard
GET /api/matches/leaderboard
Query: ?limit=10
Response: {
  leaderboard: Array<{
    address: string
    best_score: number
    updated_at: string
  }>
}
```

---

## 🛠️ Development

### Project Scripts

```bash
# Development
npm run dev              # Run frontend + scaffold watch
npm start                # Same as dev

# Building
npm run build            # Build frontend + contracts
npm run deploy:build     # Build contracts only

# Contract Deployment
npm run deploy:testnet   # Deploy to testnet
npm run deploy:mainnet   # Deploy to mainnet
```

### Contract Development

```bash
# Build contract
cd contracts/space_stellar_nft
cargo build --target wasm32-unknown-unknown --release

# Test contract
cargo test

# Check contract size
ls -lh target/wasm32-unknown-unknown/release/space_stellar_nft.wasm
```

---

## 📚 Documentation

### Additional Resources

- [Stellar Documentation](https://developers.stellar.org/)
- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Scaffold Stellar](https://scaffoldstellar.org/)
- **[Scaffold Stellar Registry Guide](https://scaffoldstellar.org/docs/registry)** ⭐
- [Stellar Wallet Kit](https://github.com/stellar/wallet-kit)
- [OpenZeppelin Stellar Contracts](https://github.com/OpenZeppelin/stellar-contracts)

### Project Documentation

- `contracts/README.md` - Detailed smart contracts documentation
- `GIT_FILTER.md` - Git filter documentation

---

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Code Style

- Follow TypeScript/JavaScript best practices
- Use ESLint and Prettier configurations
- Write meaningful commit messages
- Add tests for new features

### Contract Contributions

- Follow Rust best practices
- Ensure contracts are optimized for size
- Add comprehensive tests
- Document all public functions

---

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Stellar Development Foundation** for the amazing blockchain platform
- **OpenZeppelin** for Stellar smart contract standards
- **Scaffold Stellar** team for the development framework and registry system
- All contributors and community members

---

## 📞 Support

- **Repository**: [GitHub](https://github.com/enyekk7/space-stellar)
- **Issues**: [GitHub Issues](https://github.com/enyekk7/space-stellar/issues)
- **Discussions**: [GitHub Discussions](https://github.com/enyekk7/space-stellar/discussions)

---

<div align="center">

**Built with ❤️ on Stellar using Scaffold Stellar Registry**

[Website](https://spacestellar.app) • [Documentation](https://docs.spacestellar.app)

</div>
