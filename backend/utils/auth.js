// Shared authentication helpers used by the points, users and matches routes.
//
// The backend previously had no request-authentication layer at all
// (jsonwebtoken was declared in package.json but never used). Rather than
// inventing a different scheme per route, this module gives every route a
// single way to prove that a caller controls the Stellar address it names:
//
//   1. the client signs a canonical challenge string with its Stellar key
//      (Keypair.sign / wallet signMessage), and
//   2. the server verifies that signature against the claimed public key
//      before the route mutates anything.
//
// A short-lived JWT session can be issued from a verified signature and reused
// for subsequent requests. `verifySignedPayload` is the primitive;
// `requireSignedAddress` is the Express middleware built on it. The rate
// limiter is shared abuse-prevention for the mutation routes.

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Keypair, Networks } from '@stellar/stellar-sdk';

const NETWORK = process.env.STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
export const NETWORK_PASSPHRASE = NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

const JWT_ISSUER = 'space-stellar';
const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 2; // 2 hours
const DEFAULT_MAX_SKEW_MS = 5 * 60 * 1000; // signatures are valid for 5 minutes
const CHALLENGE_PREFIX = 'SPACE_STELLAR_AUTH_V1';

const PROOF_FIELDS = ['signature', 'timestamp', 'nonce'];

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Fail closed: never authenticate anyone if the server is misconfigured.
    throw new AuthError('Server authentication is not configured (JWT_SECRET missing)', 500);
  }
  return secret;
};

// Deterministic JSON so the client and server hash identical bytes regardless
// of object key order.
export const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
};

export const buildChallengeMessage = ({ address, payload, timestamp, nonce }) => {
  const payloadHash = crypto
    .createHash('sha256')
    .update(stableStringify(payload ?? {}))
    .digest('hex');
  return [CHALLENGE_PREFIX, String(address), String(timestamp), String(nonce), payloadHash].join('|');
};

// Strip the proof fields from a request body so the signed payload covers the
// meaningful request data only.
export const authPayload = (body = {}) => {
  const clone = { ...body };
  for (const field of PROOF_FIELDS) delete clone[field];
  return clone;
};

// One-time-use nonce store, scoped to the signature's validity window.
const usedNonces = new Map();

const pruneNonces = (now) => {
  for (const [nonce, expiresAt] of usedNonces) {
    if (expiresAt <= now) usedNonces.delete(nonce);
  }
};

const consumeNonce = (nonce, expiresAt) => {
  const now = Date.now();
  pruneNonces(now);
  const key = String(nonce);
  if (usedNonces.has(key)) throw new AuthError('Signed proof has already been used');
  if (expiresAt <= now) throw new AuthError('Signed proof has expired');
  usedNonces.set(key, expiresAt);
};

// Verify a raw Stellar signature over an arbitrary message string.
export const verifyAddressSignature = ({ address, message, signature }) => {
  let keypair;
  try {
    keypair = Keypair.fromPublicKey(String(address));
  } catch {
    throw new AuthError('Invalid Stellar address');
  }

  const rawSignature = Buffer.from(String(signature || ''), 'base64');
  if (!rawSignature.length) throw new AuthError('Missing signature');

  const valid = keypair.verify(Buffer.from(message, 'utf8'), rawSignature);
  if (!valid) throw new AuthError('Signature does not match the address');
  return true;
};

// Verify a signed challenge over `payload` for `address`. Throws AuthError on
// any failure (missing/expired/replayed proof, wrong address, tampered body).
export const verifySignedPayload = ({
  address,
  payload,
  timestamp,
  nonce,
  signature,
  maxSkewMs = DEFAULT_MAX_SKEW_MS,
}) => {
  if (!address || !timestamp || !nonce || !signature) {
    throw new AuthError('Missing signed proof (address, timestamp, nonce, signature)');
  }

  const signedAt = Number(timestamp);
  const now = Date.now();
  if (!Number.isFinite(signedAt) || Math.abs(now - signedAt) > maxSkewMs) {
    throw new AuthError('Signed proof has expired');
  }
  consumeNonce(nonce, signedAt + maxSkewMs);

  const message = buildChallengeMessage({ address, payload, timestamp, nonce });
  return verifyAddressSignature({ address, message, signature });
};

// Express middleware: require a valid signature over the given address and
// payload. Proof may travel in the JSON body or in headers.
//
//   requireSignedAddress(req => req.params.address)
//   requireSignedAddress(req => req.body.address, req => ({ amount: req.body.amount }))
export const requireSignedAddress = (getAddress, getPayload) => (req, res, next) => {
  try {
    const address = typeof getAddress === 'function' ? getAddress(req) : req.body?.address;
    if (!address) throw new AuthError('Address is required');

    const payload = getPayload ? getPayload(req) : authPayload(req.body || {});
    const timestamp = req.body?.timestamp ?? req.headers['x-stellar-timestamp'];
    const nonce = req.body?.nonce ?? req.headers['x-stellar-nonce'];
    const signature = req.body?.signature ?? req.headers['x-stellar-signature'];

    verifySignedPayload({ address, payload, timestamp, nonce, signature });
    req.authenticatedAddress = address;
    next();
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 401;
    res.status(status).json({ success: false, message: error.message || 'Unauthorized' });
  }
};

export const issueSessionToken = (address, { ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS } = {}) =>
  jwt.sign({ address }, getJwtSecret(), { expiresIn: ttlSeconds, issuer: JWT_ISSUER });

export const verifySessionToken = (token) => {
  try {
    const decoded = jwt.verify(String(token || ''), getJwtSecret(), { issuer: JWT_ISSUER });
    const address = decoded.address || decoded.sub;
    if (!address) throw new AuthError('Session token is missing an address');
    return address;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError('Invalid or expired session token');
  }
};

export const requireSession = (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new AuthError('Missing bearer session token');
    req.authenticatedAddress = verifySessionToken(token);
    next();
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 401;
    res.status(status).json({ success: false, message: error.message || 'Unauthorized' });
  }
};

// Simple fixed-window limiter. Returns true when the call is allowed.
export const createRateLimiter = ({ windowMs = 60000, max = 30 } = {}) => {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const windowStart = now - windowMs;
    const recent = (hits.get(key) || []).filter((t) => t > windowStart);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
};

// Per-address rate limiting for authenticated mutation routes.
export const rateLimitByAddress = ({ windowMs, max, getAddress } = {}) => {
  const allow = createRateLimiter({ windowMs, max });
  return (req, res, next) => {
    const address = (getAddress ? getAddress(req) : req.authenticatedAddress || req.body?.address) || req.ip;
    if (!allow(String(address))) {
      return res.status(429).json({ success: false, message: 'Too many requests' });
    }
    next();
  };
};
