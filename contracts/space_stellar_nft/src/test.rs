#![cfg(test)]

extern crate std;

use super::{SpaceStellarNFT, SHIP_CLASS};
use crate::SpaceStellarNFTClient;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

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

#[test]
fn test_getters_read_the_minted_values() {
    let env = Env::default();
    let (_contract_id, client) = deploy(&env);
    let user = Address::generate(&env);

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
}
