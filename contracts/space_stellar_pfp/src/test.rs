#![cfg(test)]

extern crate std;

use super::SpaceStellarPFP;
use crate::SpaceStellarPFPClient;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn deploy<'a>(env: &'a Env) -> (Address, SpaceStellarPFPClient<'a>) {
    let owner = Address::generate(env);
    let contract_id = env.register(SpaceStellarPFP, (owner.clone(),));
    (owner, SpaceStellarPFPClient::new(env, &contract_id))
}

#[test]
fn test_fresh_address_has_no_pfp() {
    let env = Env::default();
    let (_owner, client) = deploy(&env);

    let user = Address::generate(&env);
    assert!(!client.has_pfp(&user));
    assert_eq!(client.balance(&user), 0);
}

#[test]
fn test_mint_creates_pfp() {
    let env = Env::default();
    let (_owner, client) = deploy(&env);

    let user = Address::generate(&env);
    let token_id = client.mint(&user);

    assert!(client.has_pfp(&user));
    assert_eq!(client.balance(&user), 1);
    assert_eq!(client.owner_of(&token_id), user);
}

#[test]
#[should_panic]
fn test_second_mint_for_same_address_panics() {
    let env = Env::default();
    let (_owner, client) = deploy(&env);

    let user = Address::generate(&env);
    client.mint(&user);
    // A second mint for the same address must panic.
    client.mint(&user);
}

#[test]
fn test_update_metadata_by_owner() {
    let env = Env::default();
    env.mock_all_auths();
    let (_owner, client) = deploy(&env);

    let user = Address::generate(&env);
    let token_id = client.mint(&user);

    let metadata_uri = String::from_str(&env, "ipfs://QmPfpMetadata");
    client.update_metadata(&token_id, &metadata_uri);

    assert_eq!(client.get_pfp(&token_id), Some(metadata_uri));
}

#[test]
#[should_panic]
fn test_update_metadata_requires_owner_auth() {
    let env = Env::default();
    let (_owner, client) = deploy(&env);

    let user = Address::generate(&env);
    let token_id = client.mint(&user);

    // No authorization is mocked, so the owner-only check must reject this.
    let metadata_uri = String::from_str(&env, "ipfs://QmPfpMetadata");
    client.update_metadata(&token_id, &metadata_uri);
}

#[test]
fn test_transfer_moves_ownership() {
    let env = Env::default();
    env.mock_all_auths();
    let (_owner, client) = deploy(&env);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let token_id = client.mint(&alice);

    assert_eq!(client.owner_of(&token_id), alice);
    assert!(client.has_pfp(&alice));
    assert!(!client.has_pfp(&bob));

    client.transfer(&alice, &bob, &token_id);

    assert_eq!(client.owner_of(&token_id), bob);
    assert!(!client.has_pfp(&alice));
    assert!(client.has_pfp(&bob));
}
