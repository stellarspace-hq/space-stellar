// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Stellar Soroban Contracts ^0.5.1

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, panic_with_error, Address, Env, String,
    Symbol,
};
use stellar_access::ownable::{self as ownable, Ownable};
use stellar_macros::{default_impl, only_owner};
use stellar_tokens::non_fungible::{sequential, Base, NonFungibleToken};

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
    }

    /// Get ship class for a token
    pub fn get_ship_class(e: &Env, token_id: u32) -> Option<String> {
        e.storage().instance().get(&(SHIP_CLASS, &token_id))
    }

    /// Get ship rarity for a token
    pub fn get_ship_rarity(e: &Env, token_id: u32) -> Option<String> {
        e.storage().instance().get(&(SHIP_RARITY, &token_id))
    }

    /// Get ship tier for a token
    pub fn get_ship_tier(e: &Env, token_id: u32) -> Option<String> {
        e.storage().instance().get(&(SHIP_TIER, &token_id))
    }

    /// Get IPFS CID for a token
    pub fn get_ipfs_cid(e: &Env, token_id: u32) -> Option<String> {
        e.storage().instance().get(&(IPFS_CID, &token_id))
    }

    /// Get metadata URI (full IPFS URI to metadata JSON)
    pub fn get_metadata_uri(e: &Env, token_id: u32) -> Option<String> {
        e.storage().instance().get(&(METADATA_URI, &token_id))
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
