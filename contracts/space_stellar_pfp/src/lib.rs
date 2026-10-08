// SPDX-License-Identifier: MIT
// NFT Profile Picture Contract for Space Stellar
// Based on OpenZeppelin Stellar Contracts example
// Reference: https://developers.stellar.org/docs/build/smart-contracts/example-contracts/non-fungible-token#usage

#![no_std]

use soroban_sdk::{contract, contractevent, contractimpl, Address, Env, String};
use stellar_access::ownable::{self as ownable, Ownable};
use stellar_macros::default_impl;
use stellar_tokens::non_fungible::{Base, NonFungibleToken};

/// Emitted when a PFP NFT is minted.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintEvent {
    #[topic]
    pub token_id: u32,
    #[topic]
    pub owner: Address,
}

/// Emitted when a PFP NFT changes owner.
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
pub struct SpaceStellarPFP;

#[contractimpl]
impl SpaceStellarPFP {
    /// Constructor - Initialize the PFP NFT contract
    pub fn __constructor(e: &Env, owner: Address) {
        // Set token metadata
        Base::set_metadata(
            e,
            String::from_str(e, "https://spacestellar.com/pfp/"),
            String::from_str(e, "Space Stellar PFP"),
            String::from_str(e, "SSPFP"),
        );

        // Set the contract owner
        ownable::set_owner(e, &owner);
    }

    /// Mint a PFP NFT - Anyone can mint
    /// Each address can only mint once (checked in contract)
    pub fn mint(e: &Env, to: Address) -> u32 {
        // Check if address already has a PFP
        let balance = Base::balance(e, &to);

        if balance > 0 {
            panic!("Address already owns a PFP NFT");
        }

        // Mint the NFT using sequential_mint (returns token ID)
        // sequential_mint returns u32, which matches our return type
        let token_id = Base::sequential_mint(e, &to);

        // Emit a structured mint event so indexers can follow the collection
        // without polling storage.
        MintEvent {
            token_id,
            owner: to.clone(),
        }
        .publish(e);

        token_id
    }

    /// Check if address already has a PFP
    pub fn has_pfp(e: &Env, owner: Address) -> bool {
        Base::balance(e, &owner) > 0
    }
}

/// Overrides the default `transfer` so a structured ownership-transfer event
/// is emitted alongside the OpenZeppelin base behaviour.
pub struct SpaceStellarPFPContractOverrides;

impl stellar_tokens::non_fungible::ContractOverrides for SpaceStellarPFPContractOverrides {
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
impl NonFungibleToken for SpaceStellarPFP {
    type ContractType = SpaceStellarPFPContractOverrides;
}

/// Implement OpenZeppelin Ownable trait
#[default_impl]
#[contractimpl]
impl Ownable for SpaceStellarPFP {}

#[cfg(test)]
mod test;
