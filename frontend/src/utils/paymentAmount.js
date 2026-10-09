// Payment amount normalisation for Stellar operations.
//
// `Operation.payment` (from @stellar/stellar-sdk) accepts a *decimal* amount
// string and scales it to stroops internally. The previous code pre-scaled the
// amount by 10000000 before handing it to `Operation.payment`, so an in-app XLM
// payment was multiplied by ten million. This helper simply passes the decimal
// amount through unchanged. Callers that hit a raw API which genuinely expects
// integer stroops must do that scaling themselves.

/**
 * @param {string | undefined} asset Asset identifier ('native' or 'CODE:ISSUER').
 * @param {string | number} amount Decimal amount, e.g. `1` or `'1'`.
 * @returns {string} The decimal amount string to place on the operation.
 */
export function normalizePaymentAmount(asset, amount) {
  const decimal = typeof amount === 'number' ? amount.toString() : String(amount).trim()
  if (decimal === '' || Number.isNaN(Number(decimal))) {
    throw new Error(`Invalid payment amount: ${amount}`)
  }
  return decimal
}
