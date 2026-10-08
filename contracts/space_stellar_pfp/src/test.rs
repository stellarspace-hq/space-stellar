#![cfg(test)]

extern crate std;

use super::SpaceStellarPFP;
use crate::SpaceStellarPFPClient;
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    Address, Env, TryFromVal, Val, Vec,
};

fn deploy<'a>(env: &'a Env) -> SpaceStellarPFPClient<'a> {
    let owner = Address::generate(env);
    let contract_id = env.register(SpaceStellarPFP, (owner,));
    SpaceStellarPFPClient::new(env, &contract_id)
}

fn topic_u32(env: &Env, topics: &Vec<Val>, index: u32) -> Option<u32> {
    topics
        .get(index)
        .and_then(|v| u32::try_from_val(env, &v).ok())
}

fn topic_address(env: &Env, topics: &Vec<Val>, index: u32) -> Option<Address> {
    topics
        .get(index)
        .and_then(|v| Address::try_from_val(env, &v).ok())
}

#[test]
fn test_mint_emits_typed_event_with_token_id_and_owner() {
    let env = Env::default();
    let client = deploy(&env);
    let user = Address::generate(&env);

    let token_id = client.mint(&user);

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
    let token_id = client.mint(&alice);

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
}
