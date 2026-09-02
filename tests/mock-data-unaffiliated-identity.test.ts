import { assert, assertEquals, assertStrictEquals } from '@std/assert';
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

Deno.test('the seed yields a login-capable identity whose'
+ ' derived membership ledger is empty', async () => {
    const db = await sharedMockDb();
    const unaffiliated = buildUnaffiliatedIdentity();
    assertEquals(
        await deriveMembershipsForIdentity(
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
    assertStrictEquals(
        await invitationOpStateFor(db, invitation.id),
        undefined,
    );
});

Deno.test('the invitee view carries the org name and the'
+ ' inviting admin (TEST-PLAN B27 card)', async () => {
    const db = await sharedMockDb();
    const unaffiliated = buildUnaffiliatedIdentity();
    const views = await getIdentityInvitations(
        db, [unaffiliated.id], unaffiliated.id,
        undefined, [],
    ) as Record<string, unknown>[];
    assertStrictEquals(views.length, 1);
    const view = views[0]!;
    assertStrictEquals(
        view['organization_name'], 'Stark Industries',
    );
    assertStrictEquals(view['invited_by_name'], 'Tony Stark');
    assertStrictEquals(view['state'], 'pending');
});
