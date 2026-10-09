// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Stellar Soroban Contracts ^0.5.1

#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env, String, Symbol};
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, panic_with_error, Address, Env, String,
    Symbol,
};
use soroban_sdk::{contract, contractevent, contractimpl, Address, Env, String, Symbol};
use stellar_access::ownable::{self as ownable, Ownable};
use stellar_macros::{default_impl, only_owner};
use stellar_tokens::non_fungible::{sequential, Base, NonFungibleToken};
use soroban_sdk::{contract, contractimpl, Address, Env, IntoVal, String, Symbol, TryFromVal, Val};
use stellar_access::ownable::{self as ownable, Ownable};
use stellar_macros::{default_impl, only_owner};
use stellar_tokens::non_fungible::{
    Base, NonFungibleToken, TOKEN_EXTEND_AMOUNT, TOKEN_TTL_THRESHOLD,
};

// Custom metadata symbols (max 9 chars for symbol_short!)
const SHIP_CLASS: Symbol = soroban_sdk::symbol_short!("SHIP_CLS");
const SHIP_RARITY: Symbol = soroban_sdk::symbol_short!("SHIP_RAR");
const SHIP_TIER: Symbol = soroban_sdk::symbol_short!("SHIP_TIER");
const SHIP_ATTACK: Symbol = soroban_sdk::symbol_short!("SHIP_ATK");
const SHIP_SPEED: Symbol = soroban_sdk::symbol_short!("SHIP_SPD");
const SHIP_SHIELD: Symbol = soroban_sdk::symbol_short!("SHIP_SHD");
const IPFS_CID: Symbol = soroban_sdk::symbol_short!("IPFS_CID");
const METADATA_URI: Symbol = soroban_sdk::symbol_short!("META_URI");

/// Maximum number of ships mintable by default.
const DEFAULT_MAX_SUPPLY: u32 = 10_000;

/// Contract errors.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum SpaceStellarNFTError {
    /// The configured maximum supply has already been reached.
    MaxSupplyReached = 1,
}

/// Emitted when the admin updates the maximum supply.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MaxSupplyUpdated {
    #[topic]
    pub max_supply: u32,
/// Read a per-token metadata field from persistent storage.
///
/// The entry's TTL is refreshed on every read so an actively used token's
/// metadata does not expire. The TTL policy mirrors the one OpenZeppelin uses
/// for token ownership: extend to `TOKEN_EXTEND_AMOUNT` ledgers once the
/// remaining TTL falls below `TOKEN_TTL_THRESHOLD`.
fn read_metadata<T: TryFromVal<Env, Val>>(e: &Env, field: &Symbol, token_id: u32) -> Option<T> {
    let key = (field.clone(), token_id);
    let value: Option<T> = e.storage().persistent().get(&key);
    if value.is_some() {
        e.storage()
            .persistent()
            .extend_ttl(&key, TOKEN_TTL_THRESHOLD, TOKEN_EXTEND_AMOUNT);
    }
    value
}

/// Write a per-token metadata field to persistent storage and extend its TTL.
fn write_metadata<T: IntoVal<Env, Val>>(e: &Env, field: &Symbol, token_id: u32, value: &T) {
    let key = (field.clone(), token_id);
    e.storage().persistent().set(&key, value);
    e.storage()
        .persistent()
        .extend_ttl(&key, TOKEN_TTL_THRESHOLD, TOKEN_EXTEND_AMOUNT);
/// Emitted when a ship NFT is minted.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintEvent {
    #[topic]
    pub token_id: u32,
    #[topic]
    pub owner: Address,
}

/// Emitted when a ship NFT changes owner.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransferEvent {
    #[topic]
    pub token_id: u32,
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
}

#[contract]
pub struct SpaceStellarNFT;

#[contractimpl]
impl SpaceStellarNFT {
    /// Constructor - Initialize the NFT contract
    pub fn __constructor(e: &Env, owner: Address) {
        let uri = String::from_str(e, "https://space-stellar.app");
        let name = String::from_str(e, "Space Stellar Ships");
        let symbol = String::from_str(e, "SSHIP");

        Base::set_metadata(e, uri, name, symbol);
        ownable::set_owner(e, &owner);

        // Bound the collection from the start; the admin can change this later.
        write_max_supply(e, DEFAULT_MAX_SUPPLY);
    }

    /// Mint a new NFT ship with custom metadata.
    ///
    /// The recipient must authorize the call, and minting is rejected once the
    /// configured maximum supply has been reached.
    ///
    /// Returns the token ID of the minted NFT.
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
    ) -> u32 {
        // The recipient (or an authorized minter acting for them) must sign.
        to.require_auth();

        // Enforce the supply cap before allocating a new token ID.
        let minted_so_far = sequential::next_token_id(e);
        if minted_so_far >= read_max_supply(e) {
            panic_with_error!(e, SpaceStellarNFTError::MaxSupplyReached);
        }

        // Use OpenZeppelin's sequential mint - returns token ID
        // Based on OpenZeppelin Wizard: https://wizard.openzeppelin.com/stellar#nonfungible
        let token_id = Base::sequential_mint(e, &to);

        // Store custom metadata in blockchain
        // Using separate storage for each metadata field for simplicity
        e.storage().instance().set(&(SHIP_CLASS, &token_id), &class);
        e.storage()
            .instance()
            .set(&(SHIP_RARITY, &token_id), &rarity);
        e.storage().instance().set(&(SHIP_TIER, &token_id), &tier);
        e.storage()
            .instance()
            .set(&(SHIP_ATTACK, &token_id), &attack);
        e.storage().instance().set(&(SHIP_SPEED, &token_id), &speed);
        e.storage()
            .instance()
            .set(&(SHIP_SHIELD, &token_id), &shield);
        e.storage()
            .instance()
            .set(&(IPFS_CID, &token_id), &ipfs_cid);
        e.storage()
            .instance()
            .set(&(METADATA_URI, &token_id), &metadata_uri);
        // Store custom metadata in persistent storage, keyed by token ID.
        //
        // Per-token data must not live in instance storage: the instance entry
        // is loaded on every invocation and grows with total supply, so both
        // the rent and the footprint paid by every call would grow with the
        // collection. Persistent entries are only touched by the calls that
        // need them.
        write_metadata(e, &SHIP_CLASS, token_id, &class);
        write_metadata(e, &SHIP_RARITY, token_id, &rarity);
        write_metadata(e, &SHIP_TIER, token_id, &tier);
        write_metadata(e, &SHIP_ATTACK, token_id, &attack);
        write_metadata(e, &SHIP_SPEED, token_id, &speed);
        write_metadata(e, &SHIP_SHIELD, token_id, &shield);
        write_metadata(e, &IPFS_CID, token_id, &ipfs_cid);
        write_metadata(e, &METADATA_URI, token_id, &metadata_uri);

        // Emit a structured mint event so indexers can follow the collection
        // without polling storage.
        MintEvent {
            token_id,
            owner: to.clone(),
        }
        .publish(e);

        // Return token ID so frontend can get it from transaction result
        token_id
    }

    /// Update the maximum supply. Owner-gated, and emits [`MaxSupplyUpdated`].
    #[only_owner]
    pub fn set_max_supply(e: &Env, max_supply: u32) {
        write_max_supply(e, max_supply);
        MaxSupplyUpdated { max_supply }.publish(e);
    }

    /// Read the configured maximum supply.
    pub fn get_max_supply(e: &Env) -> u32 {
        read_max_supply(e)
    /// One-off migration for tokens minted before metadata moved out of
    /// instance storage. Copies each per-token field from instance storage to
    /// persistent storage (extending its TTL) and removes the stale instance
    /// entry. Only the contract owner may run it.
    #[only_owner]
    pub fn migrate_ship_metadata(e: &Env, token_id: u32) {
        migrate_field::<String>(e, &SHIP_CLASS, token_id);
        migrate_field::<String>(e, &SHIP_RARITY, token_id);
        migrate_field::<String>(e, &SHIP_TIER, token_id);
        migrate_field::<u32>(e, &SHIP_ATTACK, token_id);
        migrate_field::<u32>(e, &SHIP_SPEED, token_id);
        migrate_field::<u32>(e, &SHIP_SHIELD, token_id);
        migrate_field::<String>(e, &IPFS_CID, token_id);
        migrate_field::<String>(e, &METADATA_URI, token_id);
    }

    /// Get ship class for a token
    pub fn get_ship_class(e: &Env, token_id: u32) -> Option<String> {
        read_metadata(e, &SHIP_CLASS, token_id)
    }

    /// Get ship rarity for a token
    pub fn get_ship_rarity(e: &Env, token_id: u32) -> Option<String> {
        read_metadata(e, &SHIP_RARITY, token_id)
    }

    /// Get ship tier for a token
    pub fn get_ship_tier(e: &Env, token_id: u32) -> Option<String> {
        read_metadata(e, &SHIP_TIER, token_id)
    }

    /// Get IPFS CID for a token
    pub fn get_ipfs_cid(e: &Env, token_id: u32) -> Option<String> {
        read_metadata(e, &IPFS_CID, token_id)
    }

    /// Get metadata URI (full IPFS URI to metadata JSON)
    pub fn get_metadata_uri(e: &Env, token_id: u32) -> Option<String> {
        read_metadata(e, &METADATA_URI, token_id)
    }
}

/// Copy a single field from instance storage to persistent storage (if the
/// instance entry still exists) and delete the instance entry.
fn migrate_field<T: TryFromVal<Env, Val> + IntoVal<Env, Val>>(
    e: &Env,
    field: &Symbol,
    token_id: u32,
) {
    let key = (field.clone(), token_id);
    if let Some(value) = e.storage().instance().get::<_, T>(&key) {
        e.storage().persistent().set(&key, &value);
        e.storage()
            .persistent()
            .extend_ttl(&key, TOKEN_TTL_THRESHOLD, TOKEN_EXTEND_AMOUNT);
        e.storage().instance().remove(&key);
    }
}

/// Instance storage key holding the configured maximum supply.
fn max_supply_key(e: &Env) -> Symbol {
    Symbol::new(e, "MAX_SUPPLY")
}

fn read_max_supply(e: &Env) -> u32 {
    e.storage()
        .instance()
        .get(&max_supply_key(e))
        .unwrap_or(DEFAULT_MAX_SUPPLY)
}

fn write_max_supply(e: &Env, max_supply: u32) {
    e.storage().instance().set(&max_supply_key(e), &max_supply);
/// Overrides the default `transfer` so a structured ownership-transfer event
/// is emitted alongside the OpenZeppelin base behaviour.
pub struct SpaceStellarNFTContractOverrides;

impl stellar_tokens::non_fungible::ContractOverrides for SpaceStellarNFTContractOverrides {
    fn transfer(e: &Env, from: &Address, to: &Address, token_id: u32) {
        Base::transfer(e, from, to, token_id);
        TransferEvent {
            token_id,
            from: from.clone(),
            to: to.clone(),
        }
        .publish(e);
    }
}

/// Implement OpenZeppelin NonFungibleToken trait
#[default_impl]
#[contractimpl]
impl NonFungibleToken for SpaceStellarNFT {
    type ContractType = SpaceStellarNFTContractOverrides;
}

/// Implement OpenZeppelin Ownable trait
#[default_impl]
#[contractimpl]
impl Ownable for SpaceStellarNFT {}

#[cfg(test)]
mod test;
