#![cfg(test)]

extern crate std;

use super::SpaceStellarNFT;
use crate::{ShipMetadata, SpaceStellarNFTClient};
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    Address, Env, String, Symbol, TryFromVal,
};

fn deploy<'a>(env: &'a Env) -> (Address, SpaceStellarNFTClient<'a>) {
    let owner = Address::generate(env);
    let contract_id = env.register(SpaceStellarNFT, (owner.clone(),));
    (owner, SpaceStellarNFTClient::new(env, &contract_id))
}

#[test]
fn test_constructor() {
    let env = Env::default();
    let (owner, client) = deploy(&env);

    assert_eq!(client.get_owner(), Some(owner));
}

#[test]
fn test_mint_metadata_round_trip_and_event() {
    let env = Env::default();
    let (_owner, client) = deploy(&env);

    let user = Address::generate(&env);

    let class = String::from_str(&env, "Fighter");
    let rarity = String::from_str(&env, "Common");
    let tier = String::from_str(&env, "Elite");
    let ipfs_cid = String::from_str(&env, "QmTest123");
    let metadata_uri = String::from_str(&env, "ipfs://QmTest123");

    let token_id = client.mint(
        &user,
        &class,
        &rarity,
        &tier,
        &10u32,
        &8u32,
        &12u32,
        &ipfs_cid,
        &metadata_uri,
    );

    // Read the event log for the mint invocation before any other call.
    let events = env.events().all();

    // The token-ID type used here (u32) matches the contract signature.
    assert_eq!(client.owner_of(&token_id), user.clone());

    // Every metadata field written by `mint` round-trips.
    let expected = ShipMetadata {
        class: class.clone(),
        rarity: rarity.clone(),
        tier: tier.clone(),
        attack: 10u32,
        speed: 8u32,
        shield: 12u32,
        ipfs_cid: ipfs_cid.clone(),
        metadata_uri: metadata_uri.clone(),
    };
    assert_eq!(client.get_ship_metadata(&token_id), Some(expected));
    assert_eq!(client.get_ship_class(&token_id), Some(class));
    assert_eq!(client.get_ipfs_cid(&token_id), Some(ipfs_cid));

    // The mint event topics are asserted.
    let mint_symbol = Symbol::new(&env, "mint");
    let found = events.iter().any(|(_contract, topics, _data)| {
        if topics.len() < 2 {
            return false;
        }
        let topic0 = Symbol::try_from_val(&env, &topics.get(0).unwrap());
        let topic1 = Address::try_from_val(&env, &topics.get(1).unwrap());
        topic0.map(|s| s == mint_symbol).unwrap_or(false)
            && topic1.map(|a| a == user).unwrap_or(false)
    });
    assert!(found, "expected a mint event with topics [mint, recipient]");
}

#[test]
fn test_get_ship_metadata_for_unminted_token_is_none() {
    let env = Env::default();
    let (_owner, client) = deploy(&env);

    assert_eq!(client.get_ship_metadata(&42u32), None);
}
