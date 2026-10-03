import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    membershipsOfIdentity,
} from '../api/memberships.ts';
import {
    deriveCredentialsFor,
    deriveIdentityPiiRows,
} from '../api/derive-identity-spine.ts';
import {
    deriveInvitations,
} from '../api/derive-invitations.ts';
import { bodyOf } from '../api/derive-documents.ts';
import {
    getIdentityInvitations,
    getInvitationOnIdentityNest,
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

Deno.test('the seed yields a login-capable identity whose'
+ ' derived membership ledger is empty', async () => {
    const db = await sharedMockDb();
    const unaffiliated = buildUnaffiliatedIdentity();
    assertEquals(
        await membershipsOfIdentity(
            db, unaffiliated.id,
        ),
        [],
    );
    const credentials = await deriveCredentialsFor(
        db, unaffiliated.id,
    );
    assertStrictEquals(credentials.length, 1);
    assertStrictEquals(credentials[0]!.kind, 'password');
    const pii = (await deriveIdentityPiiRows(db)).find(
        (row) => row.id === unaffiliated.id,
    );
    assert(pii, 'unaffiliated identity has a PII row');
    assertStrictEquals(pii.email, 'riley.okafor@example.net');
});

Deno.test('the unaffiliated identity holds exactly one'
+ ' pending Stark invitation', async () => {
    const db = await sharedMockDb();
    const unaffiliated = buildUnaffiliatedIdentity();
    const mine = (await deriveInvitations(db)).filter(
        (row) => row.identity_id === unaffiliated.id,
    );
    assertStrictEquals(mine.length, 1);
    const invitation = mine[0]!;
    assertStrictEquals(
        invitation.organization_id, STARK_ORGANIZATION,
    );
    assertStrictEquals(invitation.state, 'pending');
    // The invitee's own read of the invitation's head agrees.
    const read = await getInvitationOnIdentityNest(
        db, [unaffiliated.id, invitation.id], unaffiliated.id,
        undefined, [],
    );
    assert(read.kind === 'document');
    assertStrictEquals(bodyOf(read.head.response)['state'], 'pending');
});

Deno.test('the invitee view omits the org name and the'
+ ' inviting admin', async () => {
    const db = await sharedMockDb();
    const unaffiliated = buildUnaffiliatedIdentity();
    const views = await getIdentityInvitations(
        db, [unaffiliated.id], unaffiliated.id,
        undefined, [],
    );
    assert(views.kind === 'collection');
    assertStrictEquals(views.heads.length, 1);
    const view = bodyOf(views.heads[0]!.response);
    assertStrictEquals(view['organization_name'], undefined);
    assertStrictEquals(view['invited_by_name'], undefined);
    assertStrictEquals(view['state'], 'pending');
});
