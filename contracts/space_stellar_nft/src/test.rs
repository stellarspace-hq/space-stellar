#![cfg(test)]

extern crate std;

use super::SpaceStellarNFT;
use crate::SpaceStellarNFTClient;
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

#[test]
fn test_default_max_supply_is_set() {
    let env = Env::default();
    let client = deploy(&env);

    assert_eq!(client.get_max_supply(), 10_000);
}

#[test]
fn test_mint_requires_recipient_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);

    let user = Address::generate(&env);
    let token_id = mint_ship(&env, &client, &user);

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
    );
}

#[test]
#[should_panic]
fn test_set_max_supply_requires_owner_auth() {
    let env = Env::default();
    let client = deploy(&env);

    // No authorization is mocked, so the owner-only check must reject this.
    client.set_max_supply(&7u32);
}
