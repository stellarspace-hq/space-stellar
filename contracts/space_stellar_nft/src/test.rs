#![cfg(test)]

extern crate std;

use super::SpaceStellarNFT;
use crate::SpaceStellarNFTClient;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

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
fn test_mint() {
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

    // The token-ID type used here (u32) matches the contract signature.
    assert_eq!(client.owner_of(&token_id), user);
    assert_eq!(client.get_ship_class(&token_id), Some(class));
    assert_eq!(client.get_ship_rarity(&token_id), Some(rarity));
    assert_eq!(client.get_ipfs_cid(&token_id), Some(ipfs_cid));
}
