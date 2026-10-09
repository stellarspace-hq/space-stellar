#![cfg(test)]

extern crate std;

use super::SpaceStellarNFT;
use super::{SpaceStellarNFT, SHIP_CLASS};
use crate::SpaceStellarNFTClient;
use soroban_sdk::{testutils::Address as _, Address, Env, String};
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    Address, Env, String, TryFromVal, Val, Vec,
};

fn deploy<'a>(env: &'a Env) -> SpaceStellarNFTClient<'a> {
    let owner = Address::generate(env);
    let contract_id = env.register(SpaceStellarNFT, (owner,));
    SpaceStellarNFTClient::new(env, &contract_id)
}

fn mint_ship(env: &Env, client: &SpaceStellarNFTClient, to: &Address) -> u32 {
    client.mint(
        to,
        &String::from_str(env, "Fighter"),
        &String::from_str(env, "Common"),
        &String::from_str(env, "Elite"),
        &10u32,
        &8u32,
        &12u32,
        &String::from_str(env, "QmTest123"),
        &String::from_str(env, "ipfs://QmTest123"),
    )
}

fn topic_u32(env: &Env, topics: &Vec<Val>, index: u32) -> Option<u32> {
    topics
        .get(index)
        .and_then(|v| u32::try_from_val(env, &v).ok())
}

fn deploy<'a>(env: &'a Env) -> (Address, SpaceStellarNFTClient<'a>) {
    let owner = Address::generate(env);
    let contract_id = env.register(SpaceStellarNFT, (owner.clone(),));
    (owner, SpaceStellarNFTClient::new(env, &contract_id))
}

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
fn test_default_max_supply_is_set() {
    let env = Env::default();
    let (owner, client) = deploy(&env);

    assert_eq!(client.get_owner(), Some(owner));
    let client = deploy(&env);

    assert_eq!(client.get_max_supply(), 10_000);
}

#[test]
fn test_mint_requires_recipient_auth() {
    let env = Env::default();
    let (_owner, client) = deploy(&env);
    env.mock_all_auths();
    let client = deploy(&env);

fn deploy<'a>(env: &'a Env) -> (Address, SpaceStellarNFTClient<'a>) {
    let owner = Address::generate(env);
    let contract_id = env.register(SpaceStellarNFT, (owner,));
    (
        contract_id.clone(),
        SpaceStellarNFTClient::new(env, &contract_id),
    )
}

fn mint_ship(env: &Env, client: &SpaceStellarNFTClient, to: &Address) -> u32 {
    client.mint(
        to,
        &String::from_str(env, "Fighter"),
        &String::from_str(env, "Common"),
        &String::from_str(env, "Elite"),
        &10u32,
        &8u32,
        &12u32,
        &String::from_str(env, "QmTest123"),
        &String::from_str(env, "ipfs://QmTest123"),
    )
}

fn deploy<'a>(env: &'a Env) -> (Address, SpaceStellarNFTClient<'a>) {
    let owner = Address::generate(env);
    let contract_id = env.register(SpaceStellarNFT, (owner.clone(),));
    (owner, SpaceStellarNFTClient::new(env, &contract_id))
}

#[test]
fn test_getters_read_the_minted_values() {
    let env = Env::default();
    let (_contract_id, client) = deploy(&env);
use crate::SpaceStellarNFTClient;
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    Address, Env, String, TryFromVal,
};

fn deploy<'a>(env: &'a Env) -> SpaceStellarNFTClient<'a> {
    let owner = Address::generate(env);
    let contract_id = env.register(SpaceStellarNFT, (owner,));
    SpaceStellarNFTClient::new(env, &contract_id)
}

fn mint_ship(env: &Env, client: &SpaceStellarNFTClient, to: &Address) -> u32 {
    client.mint(
        to,
        &String::from_str(env, "Fighter"),
        &String::from_str(env, "Common"),
        &String::from_str(env, "Elite"),
        &10u32,
        &8u32,
        &12u32,
        &String::from_str(env, "QmTest123"),
        &String::from_str(env, "ipfs://QmTest123"),
    )
}

fn topic_u32(env: &Env, topics: &soroban_sdk::Vec<soroban_sdk::Val>, index: u32) -> Option<u32> {
    topics
        .get(index)
        .and_then(|v| u32::try_from_val(env, &v).ok())
}

fn topic_address(
    env: &Env,
    topics: &soroban_sdk::Vec<soroban_sdk::Val>,
    index: u32,
) -> Option<Address> {
    topics
        .get(index)
        .and_then(|v| Address::try_from_val(env, &v).ok())
    let (owner, client) = deploy(&env);

    assert_eq!(client.get_owner(), Some(owner));
}

#[test]
fn test_mint_emits_typed_event_with_token_id_and_owner() {
    let env = Env::default();
    let client = deploy(&env);
}

#[test]
fn test_mint_metadata_round_trip_and_event() {
    let env = Env::default();
    let (_owner, client) = deploy(&env);

    let user = Address::generate(&env);
    let token_id = mint_ship(&env, &client, &user);

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
    assert_eq!(client.owner_of(&token_id), user);
}

#[test]
#[should_panic]
fn test_mint_without_recipient_auth_panics() {
    let env = Env::default();
    let client = deploy(&env);

    let user = Address::generate(&env);
    // No authorization is mocked, so `to.require_auth()` must reject this.
    mint_ship(&env, &client, &user);
}

#[test]
fn test_mint_up_to_cap_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);

    client.set_max_supply(&3u32);

    let user = Address::generate(&env);
    mint_ship(&env, &client, &user);
    mint_ship(&env, &client, &user);
    mint_ship(&env, &client, &user);
}

#[test]
#[should_panic]
fn test_mint_past_cap_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);

    client.set_max_supply(&1u32);

    let user = Address::generate(&env);
    mint_ship(&env, &client, &user);
    // The cap is reached, so a second mint must panic.
    mint_ship(&env, &client, &user);
}

#[test]
fn test_set_max_supply_emits_event() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);

    client.set_max_supply(&7u32);
    let events = env.events().all();
    let found = events.iter().any(|(_contract, topics, _data)| {
        topics.len() >= 2 && topic_u32(&env, &topics, 1) == Some(7u32)
    });
    assert!(
        found,
        "expected a max-supply-updated event carrying the new cap"
    let token_id = mint_ship(&env, &client, &user);

    assert_eq!(
        client.get_ship_class(&token_id),
        Some(String::from_str(&env, "Fighter"))
    );
    assert_eq!(
        client.get_ship_rarity(&token_id),
        Some(String::from_str(&env, "Common"))
    );
    assert_eq!(
        client.get_ship_tier(&token_id),
        Some(String::from_str(&env, "Elite"))
    );
    assert_eq!(
        client.get_ipfs_cid(&token_id),
        Some(String::from_str(&env, "QmTest123"))
    );
    assert_eq!(
        client.get_metadata_uri(&token_id),
        Some(String::from_str(&env, "ipfs://QmTest123"))
    );
}

#[test]
#[should_panic]
fn test_set_max_supply_requires_owner_auth() {
    let env = Env::default();
    let client = deploy(&env);

    // The token-ID type used here (u32) matches the contract signature.
    assert_eq!(client.owner_of(&token_id), user);
    assert_eq!(client.get_ship_class(&token_id), Some(class));
    assert_eq!(client.get_ship_rarity(&token_id), Some(rarity));
    assert_eq!(client.get_ipfs_cid(&token_id), Some(ipfs_cid));
    // No authorization is mocked, so the owner-only check must reject this.
    client.set_max_supply(&7u32);
fn test_metadata_is_stored_in_persistent_not_instance() {
    let env = Env::default();
    let (contract_id, client) = deploy(&env);
    let user = Address::generate(&env);

    let token_id = mint_ship(&env, &client, &user);

    env.as_contract(&contract_id, || {
        let key = (SHIP_CLASS, token_id);
        assert!(
            env.storage().persistent().has(&key),
            "metadata must be persistent"
        );
        assert!(
            !env.storage().instance().has(&key),
            "metadata must not be instance"
        );
    });
    let token_id = mint_ship(&env, &client, &user);

    // Read the event log for the `mint` invocation before any other call.
    let events = env.events().all();
    let found = events.iter().any(|(_contract, topics, _data)| {
        topics.len() >= 3
            && topic_u32(&env, &topics, 1) == Some(token_id)
            && topic_address(&env, &topics, 2) == Some(user.clone())
    });
    assert!(
        found,
        "expected a typed mint event with topics [, token_id, owner]"
    );
}

#[test]
fn test_transfer_emits_typed_event_with_from_and_to() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let token_id = mint_ship(&env, &client, &alice);

    client.transfer(&alice, &bob, &token_id);
    let events = env.events().all();
    let found = events.iter().any(|(_contract, topics, _data)| {
        topics.len() >= 4
            && topic_u32(&env, &topics, 1) == Some(token_id)
            && topic_address(&env, &topics, 2) == Some(alice.clone())
            && topic_address(&env, &topics, 3) == Some(bob.clone())
    });
    assert!(
        found,
        "expected a typed transfer event with topics [, token_id, from, to]"
    );
    // Read the event log for the mint invocation before issuing any other
    // contract call, so the assertion is scoped to the mint.
    let events = env.events().all();

    // owner_of tracks the minted address.
    assert_eq!(client.owner_of(&token_id), user.clone());

    // Every metadata field written by `mint` is asserted after the round-trip.
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

    // The individual getters agree with the aggregate getter.
    assert_eq!(client.get_ship_class(&token_id), Some(class));
    assert_eq!(client.get_ship_rarity(&token_id), Some(rarity));
    assert_eq!(client.get_ship_tier(&token_id), Some(tier));
    assert_eq!(client.get_ipfs_cid(&token_id), Some(ipfs_cid));
    assert_eq!(client.get_metadata_uri(&token_id), Some(metadata_uri));

    // The mint event topics are asserted: the event name is the first topic and
    // the recipient is the second topic.
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
fn test_unminted_token_metadata_is_none() {
    let env = Env::default();
    let (_owner, client) = deploy(&env);

    let unknown = 42u32;
    assert_eq!(client.get_ship_metadata(&unknown), None);
    assert_eq!(client.get_ship_class(&unknown), None);
    assert_eq!(client.get_ship_rarity(&unknown), None);
    assert_eq!(client.get_ship_tier(&unknown), None);
    assert_eq!(client.get_ipfs_cid(&unknown), None);
    assert_eq!(client.get_metadata_uri(&unknown), None);
}

#[test]
#[should_panic]
fn test_owner_of_unminted_token_panics() {
    let env = Env::default();
    let (_owner, client) = deploy(&env);

    client.owner_of(&42u32);
}

#[test]
#[should_panic]
fn test_token_uri_unminted_token_panics() {
    let env = Env::default();
    let (_owner, client) = deploy(&env);

    client.token_uri(&42u32);
    // The token-ID type used here (u32) matches the contract signature.
    assert_eq!(client.owner_of(&token_id), user);
    assert_eq!(client.get_ship_class(&token_id), Some(class));
    assert_eq!(client.get_ship_rarity(&token_id), Some(rarity));
    assert_eq!(client.get_ipfs_cid(&token_id), Some(ipfs_cid));
}
