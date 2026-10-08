// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Stellar Soroban Contracts ^0.4.1

#![no_std]

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
    }

    /// Mint a new NFT ship with custom metadata
    /// Public function - anyone can mint
    /// Returns the token ID of the minted NFT
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
        // Use OpenZeppelin's sequential mint - returns token ID
        // Based on OpenZeppelin Wizard: https://wizard.openzeppelin.com/stellar#nonfungible
        let token_id = Base::sequential_mint(e, &to);

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

        // Return token ID so frontend can get it from transaction result
        token_id
    }

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

/// Implement OpenZeppelin NonFungibleToken trait
#[default_impl]
#[contractimpl]
impl NonFungibleToken for SpaceStellarNFT {
    type ContractType = Base;
}

/// Implement OpenZeppelin Ownable trait
#[default_impl]
#[contractimpl]
impl Ownable for SpaceStellarNFT {}

#[cfg(test)]
mod test;
