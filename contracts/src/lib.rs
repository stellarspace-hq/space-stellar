// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Stellar Soroban Contracts ^0.4.1

#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env, String, Symbol};
use stellar_access::ownable::{self as ownable, Ownable};
use stellar_macros::{default_impl, only_owner};
use stellar_tokens::non_fungible::{Base, NonFungibleToken};

// Custom metadata symbols
const SHIP_CLASS: Symbol = soroban_sdk::symbol_short!("SHIP_CLASS");
const SHIP_RARITY: Symbol = soroban_sdk::symbol_short!("SHIP_RARITY");
const SHIP_TIER: Symbol = soroban_sdk::symbol_short!("SHIP_TIER");
const SHIP_ATTACK: Symbol = soroban_sdk::symbol_short!("SHIP_ATTACK");
const SHIP_SPEED: Symbol = soroban_sdk::symbol_short!("SHIP_SPEED");
const SHIP_SHIELD: Symbol = soroban_sdk::symbol_short!("SHIP_SHIELD");
const IPFS_CID: Symbol = soroban_sdk::symbol_short!("IPFS_CID");
const METADATA_URI: Symbol = soroban_sdk::symbol_short!("METADATA_URI");

#[contract]
pub struct SpaceStellarNFT;

#[contractimpl]
impl SpaceStellarNFT {
    /// Constructor - Initialize the NFT contract
    pub fn __constructor(e: &Env, owner: Address) {
        let uri = String::from_str(e, "https://space-stellar.app");
        let name = String::from_str(e, "Space Stellar Ships");
        let symbol = String::from_str(e, "SSHIP");

        Base::set_metadata(e, &uri, &name, &symbol);
        ownable::set_owner(e, &owner);
    }

    /// Mint a new NFT ship with custom metadata
    /// Only owner can mint
    /// Returns the token ID of the minted NFT
    #[only_owner]
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
    ) -> u128 {
        // Use OpenZeppelin's sequential mint to get token ID
        let token_id = Base::sequential_mint(e, &to);

        // Store custom metadata in blockchain
        // Using separate storage for each metadata field for simplicity
        e.storage()
            .instance()
            .set(&(soroban_sdk::symbol_short!("CLASS"), &token_id), &class);
        e.storage()
            .instance()
            .set(&(soroban_sdk::symbol_short!("RARITY"), &token_id), &rarity);
        e.storage()
            .instance()
            .set(&(soroban_sdk::symbol_short!("TIER"), &token_id), &tier);
        e.storage()
            .instance()
            .set(&(soroban_sdk::symbol_short!("ATTACK"), &token_id), &attack);
        e.storage()
            .instance()
            .set(&(soroban_sdk::symbol_short!("SPEED"), &token_id), &speed);
        e.storage()
            .instance()
            .set(&(soroban_sdk::symbol_short!("SHIELD"), &token_id), &shield);
        e.storage().instance().set(
            &(soroban_sdk::symbol_short!("IPFS_CID"), &token_id),
            &ipfs_cid,
        );
        e.storage().instance().set(
            &(soroban_sdk::symbol_short!("METADATA_URI"), &token_id),
            &metadata_uri,
        );

        // Emit custom event with metadata
        e.events().publish(
            (
                soroban_sdk::symbol_short!("mint"),
                soroban_sdk::symbol_short!("token_id"),
            ),
            token_id,
        );
        e.events().publish(
            (
                soroban_sdk::symbol_short!("mint"),
                soroban_sdk::symbol_short!("ipfs_cid"),
            ),
            ipfs_cid,
        );

        // Return token ID so frontend can get it from transaction result
        token_id
    }

    /// Get ship class for a token
    pub fn get_ship_class(e: &Env, token_id: u128) -> Option<String> {
        e.storage()
            .instance()
            .get(&(soroban_sdk::symbol_short!("CLASS"), &token_id))
    }

    /// Get ship rarity for a token
    pub fn get_ship_rarity(e: &Env, token_id: u128) -> Option<String> {
        e.storage()
            .instance()
            .get(&(soroban_sdk::symbol_short!("RARITY"), &token_id))
    }

    /// Get ship tier for a token
    pub fn get_ship_tier(e: &Env, token_id: u128) -> Option<String> {
        e.storage()
            .instance()
            .get(&(soroban_sdk::symbol_short!("TIER"), &token_id))
    }

    /// Get IPFS CID for a token
    pub fn get_ipfs_cid(e: &Env, token_id: u128) -> Option<String> {
        e.storage()
            .instance()
            .get(&(soroban_sdk::symbol_short!("IPFS_CID"), &token_id))
    }

    /// Get metadata URI (full IPFS URI to metadata JSON)
    pub fn get_metadata_uri(e: &Env, token_id: u128) -> Option<String> {
        e.storage()
            .instance()
            .get(&(soroban_sdk::symbol_short!("METADATA_URI"), &token_id))
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
