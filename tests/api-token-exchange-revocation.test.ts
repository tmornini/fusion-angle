import './hmac-test-key.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { PUT } from '../api/api.ts';
import { postToken } from '../api/authentication.ts';
import {
    mintAccessToken,
    TOKEN_AUDIENCE,
} from '../api/access-token.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { devToken } from './token-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { seedOrganizationDocument } from
    './test-fixtures.ts';

const USER_1 = generateIdentifier();
const USER_2 = generateIdentifier();
const ORGANIZATION_A = generateIdentifier();
const LIVE_JTI = generateIdentifier();
const LIVE_TOKEN_ID = generateIdentifier();

// A revoked-but-unexpired token must not be launderable into a
// fresh valid pair by the token-exchange or refresh grants —
// 'sign out everywhere' is enforced at the gate AND on every
// mint path, not just on direct gate traffic.

async function tokenFor(sub: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000) - 10;
    return mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub, roles: [], name: 'X',
        iat: now, ttlSeconds: 900,
        jti: generateIdentifier(),
    });
}

// Below-facade pair formation (the member-fixtures.ts idiom): the
// token-exchange grant's own membership check derives from the
// pair plane once memberships flips, so a raw row here would go
// derivation-invisible. Every id/field value stays IDENTICAL to
// the raw put this replaces — only the write mechanism changes.
async function seedMembershipPair(
    db: MemoryDbAdapter,
    id: string,
    organization: string,
    identityId: string,
    at: string,
): Promise<void> {
    const body = {
        organization_id: organization,
        identity_id: identityId,
        type: identityId === 'XXZruirZyAOoRpNxaDnpSA' ? 'admin' : 'member',
        at,
    };
    await seedSeat(
        db,
        String(body['organization_id'] ?? body.organization_id),
        String(body['identity_id'] ?? body.identity_id),
        (body['type'] ?? body.type) as 'admin' | 'member',
        String(body['at'] ?? body.at),
    );

}

// Pair-wired the same way seedMembershipPair is above, but
// through handleRequest itself (api-token-gate.test.ts's own
// 'a logout-everywhere revokes earlier tokens' precedent) —
// Phase 13 Task 4: a raw store write would leave this
// revocation invisible to deriveTokenRevocationsFor once the
// coarse gate reads it, silently admitting a signed-out
// session. Nested PUT is admin-or-self (ROUTE_POLICY +
// Region B); the writer is seedRootAdmin's 'XXZruirZyAOoRpNxaDnpSA'.
async function seedTokenRevocationPair(
    db: MemoryDbAdapter,
    id: string,
    identityId: string,
    at: string,
): Promise<void> {
    await PUT(
        db,
        'identities/' + identityId + '/token-revocations/' + id,
        { identity_id: identityId, at },
        await devToken(),
    );
}

async function revokedDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedRootAdmin(db);
    await seedOrganizationDocument(db, ORGANIZATION_A, 'Acme');
    await seedMembershipPair(
        db, generateIdentifier(), ORGANIZATION_A, USER_1,
        '2020-01-01T00:00:00.000000Z',
    );
    // logout-everywhere as of now: every USER_1 token minted
    // before this stamp is dead.
    await seedTokenRevocationPair(
        db, 'rOEPOcVMQdJiiiMuiiEhlg', USER_1
        , nowUtc(),
    );
    return db;
}

test('token-exchange rejects a logged-out subject token',
async () => {
    const db = await revokedDb();
    const token = await tokenFor(USER_1);
    const res = await postToken(db, {
        grant_type: 'token-exchange',
        subject_token: token, actor_token: token,
        organization: ORGANIZATION_A,
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 401);
});

test('token-exchange rejects a logged-out actor token',
async () => {
    const db = await revokedDb();
    // u2 is a clean subject and a member; u1 is the
    // logged-out actor. The subject passes every check,
    // so only the actor-revocation check can reject.
    await seedMembershipPair(
        db, generateIdentifier(), ORGANIZATION_A, USER_2,
        '2020-01-01T00:00:00.000000Z',
    );
    const subject = await tokenFor(USER_2);
    const actor = await tokenFor(USER_1);
    const res = await postToken(db, {
        grant_type: 'token-exchange',
        subject_token: subject, actor_token: actor,
        organization: ORGANIZATION_A,
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 401);
});

test('refresh rejects a logged-out token', async () => {
    const db = await revokedDb();
    const token = await tokenFor(USER_1);
    const res = await postToken(db, {
        grant_type: 'refresh', refresh_token: token,
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 401);
});

test('refresh on a logged-out but live jti is the'
    + ' revocation, not reuse', async () => {
    const db = await revokedDb();
    // A LIVE issued jti in the ledger: without the
    // logout-everywhere stamp this would rotate cleanly, so
    // the ONLY thing that can reject it is the revoked-through
    // branch — pinning that branch, not the reuse path. Seeded
    // via the PUT route (not a raw store write, Phase 13 Task 9:
    // the row plane no longer receives writes at all) — revokedDb
    // already grants 'XXZruirZyAOoRpNxaDnpSA' admin, the role this route
    // needs.
    await PUT(db, 'identities/' + USER_1
        + '/tokens/' + LIVE_TOKEN_ID, {
        jti: LIVE_JTI, identity_id: USER_1,
        action: 'issued', chain_id: 'WeXjAaAxGSpLpamfEuvcww',
        at: '2019-01-01T00:00:00.000000Z',
    }, await devToken());
    const iat = Math.floor(
        Date.parse('2019-01-01T00:00:00.000000Z') / 1000);
    const token = await mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: USER_1, roles: [], name: 'X',
        iat, ttlSeconds: 10_000_000_000, jti: LIVE_JTI,
    });
    const res = await postToken(db, {
        grant_type: 'refresh', refresh_token: token,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
        assert.equal(res.status, 401);
        assert.equal(res.error, 'token revoked');
    }
});
