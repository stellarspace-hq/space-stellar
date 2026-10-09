# 📦 Space Stellar Smart Contracts

<div align="center">

**Soroban Smart Contracts for Space Stellar NFT Game**

[![Soroban](https://img.shields.io/badge/Soroban-23.0.2-purple.svg)](https://soroban.stellar.org/)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-v0.5.1-green.svg)](https://github.com/OpenZeppelin/stellar-contracts)
[![Rust](https://img.shields.io/badge/Rust-2021-orange.svg)](https://www.rust-lang.org/)

</div>

---

## 📋 Overview

This directory contains two Soroban smart contracts built on the Stellar blockchain:

1. **`space_stellar_nft`** - Main NFT contract for ship tokens with custom metadata
2. **`space_stellar_pfp`** - Profile Picture NFT contract (one per address)

Both contracts are built using:
- **Soroban SDK 23.0.2** for Stellar smart contract development
- **OpenZeppelin Stellar Contracts v0.5.1** for standard NFT functionality
- **Rust 2021 Edition** for contract implementation

---

## 🏗️ Contract Architecture

### Workspace Structure

```
contracts/
├── Cargo.toml              # Workspace configuration
├── space_stellar_nft/      # Main NFT contract
│   ├── Cargo.toml
│   ├── src/
│   │   ├── lib.rs         # Contract implementation
│   │   └── test.rs        # Unit tests
│   └── README.md
└── space_stellar_pfp/      # PFP NFT contract
    ├── Cargo.toml
    ├── src/
    │   └── lib.rs         # Contract implementation
    └── DEPLOY.md
```

### Dependencies

**Workspace Dependencies** (`Cargo.toml`):
```toml
soroban-sdk = "23.0.2"
stellar-access = { git = "https://github.com/OpenZeppelin/stellar-contracts", tag = "v0.5.1" }
stellar-tokens = { git = "https://github.com/OpenZeppelin/stellar-contracts", tag = "v0.5.1" }
stellar-macros = { git = "https://github.com/OpenZeppelin/stellar-contracts", tag = "v0.5.1" }
```

---

## 🚀 Contract 1: Space Stellar NFT

### Overview

The main NFT contract for minting and managing ship tokens with rich on-chain metadata.

**Contract Details:**
- **Name**: Space Stellar Ships
- **Symbol**: SSHIP
- **Standard**: OpenZeppelin NonFungibleToken (ERC-721 compatible)
- **License**: MIT

### Features

✅ **Sequential Minting**: Automatic token ID assignment (1, 2, 3, ...)  
✅ **Custom Metadata**: On-chain storage of ship attributes  
✅ **IPFS Integration**: Off-chain metadata via IPFS CID  
✅ **Ownable**: Contract ownership management  
✅ **Transfer Support**: Standard NFT transfer operations  
✅ **Balance Tracking**: Per-address token balance  
✅ **Access Control**: `mint` requires the recipient's authorization  
✅ **Supply Cap**: Configurable maximum supply, owner-settable  

### Contract Interface

#### Constructor

```rust
pub fn __constructor(e: &Env, owner: Address)
```

**Parameters:**
- `e`: Soroban environment
- `owner`: Initial contract owner address

**Initialization:**
- Sets contract metadata (name, symbol, URI)
- Sets contract owner
- Initializes OpenZeppelin base contract

#### Mint Function

```rust
pub fn mint(
    e: &Env,
    to: Address,
    class: String,
    rarity: String,
    tier: String,
    attack: u32,
    speed: u32,
    shield: u32,
    ipfs_cid: String,
    metadata_uri: String,
) -> u32
```

**Parameters:**
- `to`: Recipient address
- `class`: Ship class name (e.g., "Elite", "Epic")
- `rarity`: Rarity level (e.g., "Common", "Epic", "Legendary")
- `tier`: Tier level (e.g., "Tier 1", "Tier 2")
- `attack`: Attack stat (u32)
- `speed`: Speed stat (u32)
- `shield`: Shield stat (u32)
- `ipfs_cid`: IPFS content identifier
- `metadata_uri`: Full metadata URI (e.g., `ipfs://Qm...`)

**Returns:**
- `u32`: The minted token ID

**Behavior:**
- Requires authorization from the recipient: `mint` calls `to.require_auth()`
- Rejects the mint with a `MaxSupplyReached` error once the configured maximum
  supply has been reached
- Mints a new NFT using OpenZeppelin's `sequential_mint`
- Stores all metadata fields in contract storage
- Returns the assigned token ID

**Caller requirements:**
- Any account may submit the transaction, but the `to` address must sign it
  (`require_auth`). Backends that mint on a player's behalf must collect the
  player's signature (or mint from an account the player has authorized).

#### Supply Cap

```rust
pub fn get_max_supply(e: &Env) -> u32
pub fn set_max_supply(e: &Env, max_supply: u32)
```

**Parameters:**
- `e`: Soroban environment
- `max_supply`: New maximum number of mintable ships (owner-only)

**Behavior:**
- The constructor initializes the cap to `10_000`
- `mint` panics with `MaxSupplyReached` once the cap is reached
- `set_max_supply` is owner-gated (`#[only_owner]`) and emits a
  `MaxSupplyUpdated` event carrying the new cap

#### Metadata Getters

```rust
pub fn get_ship_class(e: &Env, token_id: u32) -> Option<String>
pub fn get_ship_rarity(e: &Env, token_id: u32) -> Option<String>
pub fn get_ship_tier(e: &Env, token_id: u32) -> Option<String>
pub fn get_ipfs_cid(e: &Env, token_id: u32) -> Option<String>
pub fn get_metadata_uri(e: &Env, token_id: u32) -> Option<String>
```

**Parameters:**
- `e`: Soroban environment
- `token_id`: Token ID to query

**Returns:**
- `Option<String>`: Metadata value if token exists

### Storage Layout

**Instance Storage:**
- Contract metadata (name, symbol, URI)
- Owner address
- OpenZeppelin base contract state

**Token Metadata Storage:**
- `(SHIP_CLASS, token_id) -> String`
- `(SHIP_RARITY, token_id) -> String`
- `(SHIP_TIER, token_id) -> String`
- `(SHIP_ATTACK, token_id) -> u32`
- `(SHIP_SPEED, token_id) -> u32`
- `(SHIP_SHIELD, token_id) -> u32`
- `(IPFS_CID, token_id) -> String`
- `(METADATA_URI, token_id) -> String`

### OpenZeppelin Traits

The contract implements:

**`NonFungibleToken`** trait (OpenZeppelin Stellar Contracts v0.5.1):
- `balance(e: &Env, account: Address) -> u32`
- `owner_of(e: &Env, token_id: u32) -> Address`
- `transfer(e: &Env, from: Address, to: Address, token_id: u32)`
- `transfer_from(e: &Env, spender: Address, from: Address, to: Address, token_id: u32)`
- `approve(e: &Env, approver: Address, approved: Address, token_id: u32, live_until_ledger: u32)`
- `approve_for_all(e: &Env, owner: Address, operator: Address, live_until_ledger: u32)`
- `get_approved(e: &Env, token_id: u32) -> Option<Address>`
- `is_approved_for_all(e: &Env, owner: Address, operator: Address) -> bool`

**`Ownable`** trait (OpenZeppelin Stellar Contracts v0.5.1):
- `get_owner(e: &Env) -> Option<Address>`
- `transfer_ownership(e: &Env, new_owner: Address, live_until_ledger: u32)`
- `accept_ownership(e: &Env)`
- `renounce_ownership(e: &Env)`

### Building

```bash
# From the repository root
cargo build --release --target wasm32v1-none --package space_stellar_nft
```

**Output:** `target/wasm32v1-none/release/space_stellar_nft.wasm`

### Testing

```bash
cargo test --package space_stellar_nft
```

### Deployment Example

```bash
# Using Scaffold Stellar
stellar registry publish \
  --wasm target/wasm32v1-none/release/space_stellar_nft.wasm \
  --wasm-name space-stellar-nft

stellar registry deploy \
  --contract-name space-stellar-nft-instance \
  --wasm-name space-stellar-nft \
  -- \
  --owner YOUR_OWNER_ADDRESS
```

---

## 🎨 Contract 2: Space Stellar PFP

### Overview

Profile Picture NFT contract that allows one PFP per address.

**Contract Details:**
- **Name**: Space Stellar PFP
- **Symbol**: SSPFP
- **Standard**: OpenZeppelin NonFungibleToken
- **License**: MIT

### Features

✅ **One-Per-Address**: Each address can only mint one PFP  
✅ **Public Minting**: Anyone can mint (no restrictions)  
✅ **Sequential IDs**: Automatic token ID assignment  
✅ **Ownable**: Contract ownership management  

### Contract Interface

#### Constructor

```rust
pub fn __constructor(e: &Env, owner: Address)
```

**Parameters:**
- `e`: Soroban environment
- `owner`: Initial contract owner address

#### Mint Function

```rust
pub fn mint(e: &Env, to: Address) -> u32
```

**Parameters:**
- `e`: Soroban environment
- `to`: Recipient address

**Returns:**
- `u32`: The minted token ID

**Behavior:**
- Checks if address already has a PFP (balance > 0)
- Panics if address already owns a PFP
- Mints new PFP using `sequential_mint`
- Returns the assigned token ID

#### Check Function

```rust
pub fn has_pfp(e: &Env, owner: Address) -> bool
```

**Parameters:**
- `e`: Soroban environment
- `owner`: Address to check

**Returns:**
- `bool`: `true` if address owns a PFP, `false` otherwise

**Implementation:**
```rust
Base::balance(e, &owner) > 0
```

### Building

```bash
# From the repository root
cargo build --release --target wasm32v1-none --package space_stellar_pfp
```

**Output:** `target/wasm32v1-none/release/space_stellar_pfp.wasm`

### Deployment Example

```bash
# Using Scaffold Stellar
stellar registry publish \
  --wasm target/wasm32v1-none/release/space_stellar_pfp.wasm \
  --wasm-name space-stellar-pfp

stellar registry deploy \
  --contract-name space-stellar-pfp-instance \
  --wasm-name space-stellar-pfp \
  -- \
  --owner YOUR_OWNER_ADDRESS
```

---

## 🔧 Development

### Prerequisites

- **Rust 1.70+** with Cargo
- **wasm32v1-none** target
- **Stellar CLI** (for deployment)
- **Scaffold Stellar CLI** (recommended)

### Setup

```bash
# Install Rust (if not installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add wasm32 target
rustup target add wasm32v1-none

# Install Scaffold Stellar CLI
cargo install --locked stellar-scaffold-cli
```

### Build All Contracts

```bash
# From project root
npm run deploy:build

# Or manually
cargo build --release --target wasm32v1-none --workspace
```

### Contract Optimization

The workspace includes optimized release profiles:

```toml
[profile.release]
opt-level = "z"           # Optimize for size
debug = false
lto = true                 # Link-time optimization
debug-assertions = false
codegen-units = 1
panic = "abort"
overflow-checks = true
strip = true               # Strip symbols
```

**Target Size:** Contracts should be < 64KB for optimal deployment.

### Testing

```bash
# Test all contracts
cargo test --workspace

# Test specific contract
cargo test --package space_stellar_nft
```

### Code Quality

```bash
# Format code
cargo fmt

# Lint code
cargo clippy --release --target wasm32v1-none --workspace
```

---

## 📤 Deployment

### Using Scaffold Stellar (Recommended)

**1. Build Contracts:**
```bash
npm run deploy:build
```

**2. Publish to Registry:**
```bash
# NFT Contract
stellar registry publish \
  --wasm target/wasm32v1-none/release/space_stellar_nft.wasm \
  --wasm-name space-stellar-nft

# PFP Contract
stellar registry publish \
  --wasm target/wasm32v1-none/release/space_stellar_pfp.wasm \
  --wasm-name space-stellar-pfp
```

**3. Deploy Instances:**
```bash
# NFT Contract
stellar registry deploy \
  --contract-name space-stellar-nft-instance \
  --wasm-name space-stellar-nft \
  -- \
  --owner YOUR_OWNER_ADDRESS

# PFP Contract
stellar registry deploy \
  --contract-name space-stellar-pfp-instance \
  --wasm-name space-stellar-pfp \
  -- \
  --owner YOUR_OWNER_ADDRESS
```

**4. Create Aliases:**
```bash
stellar registry create-alias space-stellar-nft-instance
stellar registry create-alias space-stellar-pfp-instance
```

### Manual Deployment (Stellar CLI)

```bash
# Deploy NFT Contract
stellar contract deploy \
  --wasm target/wasm32v1-none/release/space_stellar_nft.wasm \
  --source-account YOUR_SECRET_KEY \
  --network testnet

# Initialize
stellar contract invoke \
  --id CONTRACT_ID \
  --source-account YOUR_SECRET_KEY \
  --network testnet \
  -- \
  __constructor \
  --owner YOUR_OWNER_ADDRESS
```

### Network Configuration

**Testnet:**
- RPC URL: `https://soroban-rpc.testnet.stellar.org`
- Network Passphrase: `Test SDF Network ; September 2015`

**Mainnet:**
- RPC URL: `https://soroban-rpc.mainnet.stellar.org`
- Network Passphrase: `Public Global Stellar Network ; September 2015`

---

## 🧪 Testing

### Unit Tests

```bash
cargo test --package space_stellar_nft
```

### Integration Testing

After deployment, test contract functions:

```bash
# Test mint
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

# Check metadata
stellar contract invoke \
  --id space-stellar-nft-instance \
  -- \
  get_ship_class \
  --token_id 1
```

---

## 📚 References

- [Soroban Documentation](https://soroban.stellar.org/docs)
- [OpenZeppelin Stellar Contracts](https://github.com/OpenZeppelin/stellar-contracts)
- [Stellar Developer Docs](https://developers.stellar.org/)
- [Scaffold Stellar](https://scaffoldstellar.org/)

---

## 📄 License

MIT License - See [LICENSE](../LICENSE) file for details.

---

<div align="center">

**Built with ❤️ using Soroban and OpenZeppelin**

</div>
