// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Stellar Soroban Contracts ^0.4.1

#![no_std]

use soroban_sdk::{contract, contractevent, contractimpl, Address, Env, String, Symbol};
use stellar_access::ownable::{self as ownable, Ownable};
use stellar_macros::default_impl;
use stellar_tokens::non_fungible::{Base, NonFungibleToken};

// Custom metadata symbols (max 9 chars for symbol_short!)
const SHIP_CLASS: Symbol = soroban_sdk::symbol_short!("SHIP_CLS");
const SHIP_RARITY: Symbol = soroban_sdk::symbol_short!("SHIP_RAR");
const SHIP_TIER: Symbol = soroban_sdk::symbol_short!("SHIP_TIER");
const SHIP_ATTACK: Symbol = soroban_sdk::symbol_short!("SHIP_ATK");
const SHIP_SPEED: Symbol = soroban_sdk::symbol_short!("SHIP_SPD");
const SHIP_SHIELD: Symbol = soroban_sdk::symbol_short!("SHIP_SHD");
const IPFS_CID: Symbol = soroban_sdk::symbol_short!("IPFS_CID");
const METADATA_URI: Symbol = soroban_sdk::symbol_short!("META_URI");

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
