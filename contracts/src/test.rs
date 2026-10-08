#![cfg(test)]

use super::SpaceStellarNFT;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn test_constructor() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SpaceStellarNFT);
    let client = SpaceStellarNFTClient::new(&env, &contract_id);

    let owner = Address::generate(&env);

    client.__constructor(&owner);

    // Test that owner is set using OpenZeppelin's owner function
    let contract_owner = client.owner();
    assert_eq!(contract_owner, owner);
}

#[test]
fn test_mint() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SpaceStellarNFT);
    let client = SpaceStellarNFTClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let user = Address::generate(&env);

    // Initialize contract
    client.__constructor(&owner);

    let class = String::from_str(&env, "Fighter");
    let rarity = String::from_str(&env, "Common");
    let tier = String::from_str(&env, "Elite");
    let ipfs_cid = String::from_str(&env, "QmTest123");
    let metadata_uri = String::from_str(&env, "ipfs://QmTest123");

    // Mint as owner (only owner can mint)
    client.mint(
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

    // Check ownership using OpenZeppelin's owner_of
    // Sequential mint starts at 1
    let token_id = 1u128;
    let owner_result = client.owner_of(&token_id);
    assert_eq!(owner_result, Some(user));

    // Check custom metadata
    let ship_class = client.get_ship_class(&token_id);
    assert_eq!(ship_class, Some(class));

    let ship_rarity = client.get_ship_rarity(&token_id);
    assert_eq!(ship_rarity, Some(rarity));

    let ipfs_result = client.get_ipfs_cid(&token_id);
    assert_eq!(ipfs_result, Some(ipfs_cid));
}
