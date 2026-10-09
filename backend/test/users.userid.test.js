// Unit tests for the `getNextUserId` fallback and `generateUserId` padding
// (stellarspace-hq/space-stellar #13).
//
// Run with:  node --test backend/test/users.userid.test.js
//
// No live database is required: `resolveNextUserId` accepts any client with a
// `query()` method, so the tests pass a small in-memory stub.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  FALLBACK_USER_ID,
  formatUserId,
  generateUserId,
  resolveNextUserId,
} from '../utils/userIds.js';

// A tiny pg-like client stub. `responses` are consumed in order; an Error
// entry makes the corresponding query reject.
function makeClient(responses) {
  const calls = [];
  return {
    calls,
    async query(text) {
      calls.push(text);
      const next = responses.shift();
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
}

describe('resolveNextUserId', () => {
  it('returns max + 1 from the sequence when the first query succeeds', () => {
    const client = makeClient([{ rows: [{ next_id: '243690' }] }]);
    return resolveNextUserId(client).then((id) => {
      assert.equal(id, 243690);
      assert.equal(client.calls.length, 1);
      assert.match(client.calls[0], /nextval\('user_id_seq'\)/);
    });
  });

  it('falls back to MAX(id) + 1 and returns 243681 when the sequence query rejects', async () => {
    const client = makeClient([
      new Error('relation "user_id_seq" does not exist'),
      { rows: [{ next_id: '243681' }] },
    ]);

    const id = await resolveNextUserId(client);

    assert.equal(id, FALLBACK_USER_ID);
    assert.equal(id, 243681);
    assert.equal(client.calls.length, 2);
    assert.match(client.calls[1], /COALESCE\(MAX\(id\), 243680\) \+ 1/);
  });

  it('returns 243681 when the users table is empty', async () => {
    const client = makeClient([
      new Error('sequence missing'),
      { rows: [{ next_id: String(FALLBACK_USER_ID) }] },
    ]);

    assert.equal(await resolveNextUserId(client), 243681);
  });

  it('honours a non-empty MAX(id) from the fallback query', async () => {
    const client = makeClient([
      new Error('sequence missing'),
      { rows: [{ next_id: '243682' }] },
    ]);

    assert.equal(await resolveNextUserId(client), 243682);
  });
});

describe('generateUserId / formatUserId padding', () => {
  it('pads below six digits', () => {
    assert.equal(formatUserId(7), 'USER-000007');
    assert.equal(generateUserId(7), 'USER-000007');
  });

  it('does not pad above six digits', () => {
    assert.equal(formatUserId(243681), 'USER-243681');
    assert.equal(generateUserId(243681), 'USER-243681');
  });

  it('still produces a random id when no numeric id is supplied', () => {
    const id = generateUserId();
    assert.match(id, /^USER-[A-Z0-9]+$/);
    assert.ok(id.length > 'USER-'.length);
  });
});
