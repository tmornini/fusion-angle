import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    deriveMembershipsForIdentity,
} from '../api/derive-memberships.ts';
import {
    deriveCredentialsFor,
    deriveIdentityPiiRows,
} from '../api/derive-identity-spine.ts';
import {
    deriveInvitations,
    invitationOpStateFor,
} from '../api/derive-invitations.ts';
import {
    getIdentityInvitations,
} from '../api/invitations-domain.ts';
import {
    buildUnaffiliatedIdentity,
} from '../api/mock-data/members.ts';
import {
    STARK_ORGANIZATION,
} from '../api/mock-data/seed-constants.ts';
import { sharedMockDb } from './mock-seed.ts';

// The zero-membership identity: TEST-PLAN B25–B29's
// fixture. These pin the WORLD the seed creates — the
// projection/gate logic is pinned elsewhere
// (boot-organization-gate, presenter-invitation-list,
// api-invitations-fence).

test('the seed yields a login-capable identity whose'
+ ' derived membership ledger is empty', async () => {
    const db = await sharedMockDb();
    const unaffiliated = buildUnaffiliatedIdentity();
    assert.deepEqual(
        await deriveMembershipsForIdentity(
            db, unaffiliated.id,
        ),
        [],
    );
    const credentials = await deriveCredentialsFor(
        db, unaffiliated.id,
    );
    assert.equal(credentials.length, 1);
    assert.equal(credentials[0]!.kind, 'password');
    const pii = (await deriveIdentityPiiRows(db)).find(
        (row) => row.id === unaffiliated.id,
    );
    assert.ok(pii, 'unaffiliated identity has a PII row');
    assert.equal(pii.email, 'riley.okafor@example.net');
});

test('the unaffiliated identity holds exactly one'
+ ' pending Stark invitation', async () => {
    const db = await sharedMockDb();
    const unaffiliated = buildUnaffiliatedIdentity();
    const mine = (await deriveInvitations(db)).filter(
        (row) => row.identity_id === unaffiliated.id,
    );
    assert.equal(mine.length, 1);
    const invitation = mine[0]!;
    assert.equal(
        invitation.organization_id, STARK_ORGANIZATION,
    );
    assert.equal(invitation.state, 'pending');
    assert.equal(
        await invitationOpStateFor(db, invitation.id),
        undefined,
    );
});

test('the invitee view carries the org name and the'
+ ' inviting admin (TEST-PLAN B27 card)', async () => {
    const db = await sharedMockDb();
    const unaffiliated = buildUnaffiliatedIdentity();
    const views = await getIdentityInvitations(
        db, [unaffiliated.id], unaffiliated.id,
        undefined, [],
    ) as Record<string, unknown>[];
    assert.equal(views.length, 1);
    const view = views[0]!;
    assert.equal(
        view['organization_name'], 'Stark Industries',
    );
    assert.equal(view['invited_by_name'], 'Tony Stark');
    assert.equal(view['state'], 'pending');
});
