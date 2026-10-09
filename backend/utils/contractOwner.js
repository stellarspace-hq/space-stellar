// Pure parser for `backend/utils/getContractOwner.js`.
//
// A failed simulation leaves `result.retval` undefined; the parse path is the
// difference between "no owner" and a crash. Extracted here so it can be unit
// tested without any Soroban RPC access.

import { scValToNative } from '@stellar/stellar-sdk';

// Extract the owner address from a `simulateTransaction` response.
//
// Returns the address string when the response carries a `G...` 56-character
// value, and `null` for every other case (missing return value, unparsable
// ScVal, or a value that is not a Stellar account address). Never throws.
export function extractOwnerAddress(simulateResult) {
  const retval = simulateResult && simulateResult.result
    ? simulateResult.result.retval
    : undefined;

  if (!retval) {
    return null;
  }

  let owner;
  try {
    owner = scValToNative(retval);
  } catch (error) {
    return null;
  }

  if (owner === null || owner === undefined) {
    return null;
  }

  const value = owner.toString();
  if (!value.startsWith('G') || value.length !== 56) {
    return null;
  }

  return value;
}
