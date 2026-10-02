import {
    assertEquals,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import {
    identityMembershipHeads,
    lastAdminRefusal,
    membershipOf,
    membershipOfHead,
    membershipsOfIdentity,
    membershipTransition,
    organizationMembershipHeads,
    validateMembershipBody,
    type MembershipActor,
} from '../api/memberships.ts';
import {
    buildResponseModel,
    storedWire,
} from '../api/message-form.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    generateIdentifier,
} from '../shared/identifier.ts';
import {
    INVITATION_STATES,
    ValidationError,
    type InvitationState,
    type MembershipEntity,
    type MembershipType,
    type MessagePairEntity,
} from '../shared/types.ts';
import { landMembership } from
    './membership-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

const O = 'AjdvjuECVZEgZoFajaIEkg';
const I = 'XXZruirZyAOoRpNxaDnpSA';
const OTHER_I = 'mFNSxZqywTSMXhgUTdTqtA';
const OTHER_O = 'yXVKeCiguypnNcNelXVldQ';
const NAME = { organizationId: O, identityId: I };
const AT = '2026-10-01T12:00:00.000000Z';
const LATER = '2026-10-02T12:00:00.000000Z';
const LAST_ADMIN =
    'the last accepted admin cannot be removed or demoted';

function held(
    state: InvitationState,
    type: MembershipType = 'member',
): MembershipEntity {
    return {
        id: O + ':' + I,
        organization_id: O,
        identity_id: I,
        type,
        state,
        at: AT,
    };
}

function expectLands(
    state: InvitationState,
    type: MembershipType,
) {
    return {
        kind: 'lands' as const,
        next: {
            id: O + ':' + I,
            organization_id: O,
            identity_id: I,
            type,
            state,
            at: LATER,
        },
    };
}

function expectRefused(
    from: InvitationState | 'none',
    to: InvitationState,
    actor: MembershipActor,
) {
    return {
        kind: 'refused' as const,
        error: 'no transition from ' + from
            + ' to ' + to + ' for the ' + actor,
    };
}

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

Deno.test('an admin grant lands pending from nothing,'
    + ' declined, revoked, or removed', () => {
    for (const from of [
        null,
        held('declined'),
        held('revoked'),
        held('removed'),
    ]) {
        assertEquals(
            membershipTransition('admin', NAME, from, {
                state: 'pending',
                type: 'member',
                at: LATER,
            }),
            expectLands('pending', 'member'),
        );
    }
});

Deno.test('a grant on a pending membership changes'
    + ' nothing; on an accepted one it is refused', () => {
    assertEquals(
        membershipTransition(
            'admin', NAME, held('pending'), {
                state: 'pending',
                type: 'member',
                at: LATER,
            },
        ),
        { kind: 'unchanged' },
    );
    assertEquals(
        membershipTransition(
            'admin', NAME, held('pending', 'admin'), {
                state: 'pending',
                type: 'member',
                at: LATER,
            },
        ),
        { kind: 'unchanged' },
    );
    assertEquals(
        membershipTransition('admin', NAME, held('pending'), {
            state: 'pending',
            at: LATER,
        }),
        { kind: 'unchanged' },
    );
    assertEquals(
        membershipTransition(
            'admin', NAME, held('accepted'), {
                state: 'pending',
                type: 'member',
                at: LATER,
            },
        ),
        expectRefused('accepted', 'pending', 'admin'),
    );
});

Deno.test('an invitee accepts a pending membership'
    + ' and keeps its type', () => {
    assertEquals(
        membershipTransition(
            'invitee', NAME, held('pending', 'admin'), {
                state: 'accepted',
                type: 'admin',
                at: LATER,
            },
        ),
        expectLands('accepted', 'admin'),
    );
    assertEquals(
        membershipTransition(
            'invitee', NAME, held('pending', 'admin'), {
                state: 'accepted',
                at: LATER,
            },
        ),
        expectLands('accepted', 'admin'),
    );
    assertEquals(
        membershipTransition(
            'invitee', NAME, held('pending', 'admin'), {
                state: 'accepted',
                type: 'member',
                at: LATER,
            },
        ),
        expectRefused('pending', 'accepted', 'invitee'),
    );
});

Deno.test('an invitee declines a pending membership'
    + ' and keeps its type', () => {
    assertEquals(
        membershipTransition(
            'invitee', NAME, held('pending', 'admin'), {
                state: 'declined',
                type: 'admin',
                at: LATER,
            },
        ),
        expectLands('declined', 'admin'),
    );
    assertEquals(
        membershipTransition(
            'invitee', NAME, held('pending', 'admin'), {
                state: 'declined',
                at: LATER,
            },
        ),
        expectLands('declined', 'admin'),
    );
    assertEquals(
        membershipTransition(
            'invitee', NAME, held('pending', 'admin'), {
                state: 'declined',
                type: 'member',
                at: LATER,
            },
        ),
        expectRefused('pending', 'declined', 'invitee'),
    );
});

Deno.test('an admin revokes a pending membership'
    + ' and keeps its type', () => {
    assertEquals(
        membershipTransition(
            'admin', NAME, held('pending', 'admin'), {
                state: 'revoked',
                type: 'admin',
                at: LATER,
            },
        ),
        expectLands('revoked', 'admin'),
    );
    assertEquals(
        membershipTransition(
            'admin', NAME, held('pending', 'admin'), {
                state: 'revoked',
                at: LATER,
            },
        ),
        expectLands('revoked', 'admin'),
    );
    assertEquals(
        membershipTransition(
            'admin', NAME, held('pending', 'admin'), {
                state: 'revoked',
                type: 'member',
                at: LATER,
            },
        ),
        expectRefused('pending', 'revoked', 'admin'),
    );
});

Deno.test('an admin removes an accepted membership'
    + ' and keeps its type', () => {
    assertEquals(
        membershipTransition(
            'admin', NAME, held('accepted', 'admin'), {
                state: 'removed',
                type: 'admin',
                at: LATER,
            },
        ),
        expectLands('removed', 'admin'),
    );
    assertEquals(
        membershipTransition(
            'admin', NAME, held('accepted', 'admin'), {
                state: 'removed',
                at: LATER,
            },
        ),
        expectLands('removed', 'admin'),
    );
    assertEquals(
        membershipTransition(
            'admin', NAME, held('accepted', 'admin'), {
                state: 'removed',
                type: 'member',
                at: LATER,
            },
        ),
        expectRefused('accepted', 'removed', 'admin'),
    );
});

Deno.test('an admin retypes an accepted membership', () => {
    assertEquals(
        membershipTransition(
            'admin', NAME, held('accepted', 'member'), {
                state: 'accepted',
                type: 'admin',
                at: LATER,
            },
        ),
        expectLands('accepted', 'admin'),
    );
    assertEquals(
        membershipTransition(
            'admin', NAME, held('accepted', 'admin'), {
                state: 'accepted',
                type: 'member',
                at: LATER,
            },
        ),
        expectLands('accepted', 'member'),
    );
    assertEquals(
        membershipTransition(
            'admin', NAME, held('accepted', 'member'), {
                state: 'accepted',
                at: LATER,
            },
        ),
        expectRefused('accepted', 'accepted', 'admin'),
    );
});

Deno.test('an admin accepts from nothing, revoked,'
    + ' or removed when the request names a type', () => {
    for (const from of [
        null,
        held('revoked'),
        held('removed'),
    ]) {
        const fromState = from === null
            ? 'none'
            : from.state;
        for (const type of ['admin', 'member'] as const) {
            assertEquals(
                membershipTransition('admin', NAME, from, {
                    state: 'accepted',
                    type,
                    at: LATER,
                }),
                expectLands('accepted', type),
            );
        }
        assertEquals(
            membershipTransition('admin', NAME, from, {
                state: 'accepted',
                at: LATER,
            }),
            expectRefused(fromState, 'accepted', 'admin'),
        );
    }
});

// Triples the table lands or leaves unchanged. A same-type
// retype is absent on purpose: that request is refused.
const ALLOWED = new Set([
    'admin|none|pending',
    'admin|declined|pending',
    'admin|revoked|pending',
    'admin|removed|pending',
    'admin|pending|pending',
    'invitee|pending|accepted',
    'invitee|pending|declined',
    'admin|pending|revoked',
    'admin|accepted|removed',
    'admin|none|accepted',
    'admin|revoked|accepted',
    'admin|removed|accepted',
]);

Deno.test('every transition the table does not name'
    + ' is refused', () => {
    const actors = ['invitee', 'admin'] as const;
    const froms: (MembershipEntity | null)[] = [
        null,
        ...INVITATION_STATES.map((state) => held(state)),
    ];
    for (const actor of actors) {
        for (const from of froms) {
            const fromState = from === null
                ? 'none'
                : from.state;
            for (const to of INVITATION_STATES) {
                const key = actor + '|' + fromState
                    + '|' + to;
                if (ALLOWED.has(key)) continue;
                assertEquals(
                    membershipTransition(actor, NAME, from, {
                        state: to,
                        type: 'member',
                        at: LATER,
                    }),
                    expectRefused(fromState, to, actor),
                    key,
                );
            }
        }
    }
});

function removed(membership: MembershipEntity): MembershipEntity {
    return { ...membership, state: 'removed', at: LATER };
}

function demoted(membership: MembershipEntity): MembershipEntity {
    return { ...membership, type: 'member', at: LATER };
}

Deno.test('removing the sole accepted admin'
    + ' is refused', () => {
    const admin = held('accepted', 'admin');
    assertEquals(
        lastAdminRefusal([admin], admin, removed(admin)),
        LAST_ADMIN,
    );
});

Deno.test('demoting the sole accepted admin'
    + ' is refused', () => {
    const admin = held('accepted', 'admin');
    assertEquals(
        lastAdminRefusal([admin], admin, demoted(admin)),
        LAST_ADMIN,
    );
});

Deno.test('a second accepted admin allows removal'
    + ' and demotion', () => {
    const admin = held('accepted', 'admin');
    const other: MembershipEntity = {
        ...admin,
        id: O + ':' + OTHER_I,
        identity_id: OTHER_I,
    };
    const accepted = [admin, other];
    assertStrictEquals(
        lastAdminRefusal(accepted, admin, removed(admin)),
        undefined,
    );
    assertStrictEquals(
        lastAdminRefusal(accepted, admin, demoted(admin)),
        undefined,
    );
});

Deno.test('removing a member is not refused', () => {
    const member = held('accepted', 'member');
    assertStrictEquals(
        lastAdminRefusal([member], member, removed(member)),
        undefined,
    );
});

Deno.test('an accepted admin of another organization'
    + ' does not spare the last one', () => {
    const admin = held('accepted', 'admin');
    const foreign: MembershipEntity = {
        ...admin,
        id: OTHER_O + ':' + OTHER_I,
        organization_id: OTHER_O,
        identity_id: OTHER_I,
    };
    assertEquals(
        lastAdminRefusal(
            [admin, foreign], admin, removed(admin),
        ),
        LAST_ADMIN,
    );
    assertEquals(
        lastAdminRefusal(
            [admin, foreign], admin, demoted(admin),
        ),
        LAST_ADMIN,
    );
});

function headCarrying(
    body: Record<string, unknown>,
): MessagePairEntity {
    return {
        id: I,
        operation_id: I,
        path: '/invitations/',
        name: O + ':' + I,
        supersedes: I,
        requester_identity_id: I,
        method: 'PUT',
        response_at: AT,
        request: '',
        request_salt: '',
        request_hash: '',
        request_secrets: '',
        request_secrets_hash: '',
        response: storedWire(buildResponseModel({
            status: 200,
            fields: [],
            body,
        })),
        response_salt: '',
        response_hash: '',
        response_secrets: '',
        response_secrets_hash: '',
        pair_hash: '',
    };
}

Deno.test('an organization id that is not an'
    + ' identifier is refused', () => {
    // '' concatenates to a name, so only the identifier
    // gate can refuse it.
    const body = {
        id: ':' + I,
        organization_id: '',
        identity_id: I,
        type: 'member',
        state: 'accepted',
        at: AT,
    };
    const gate = 'organization_id must be'
        + ' a 22-character identifier';
    assertEquals(
        assertThrows(
            () => validateMembershipBody(body),
            ValidationError,
        ).message,
        gate,
    );
    assertEquals(
        assertThrows(
            () => membershipOfHead(headCarrying(body)),
            ValidationError,
        ).message,
        gate,
    );
});

Deno.test('membershipOf holds an accepted head and its'
    + ' type, and nothing else', async () => {
    const db = await freshDb();
    assertStrictEquals(await membershipOf(db, O, I), null);
    for (const state of [
        'pending', 'declined', 'revoked', 'removed',
    ] as const) {
        await landMembership(db, O, I, state, 'admin', AT);
        assertStrictEquals(
            await membershipOf(db, O, I), null, state,
        );
    }
    await landMembership(db, O, I, 'accepted', 'admin', AT);
    assertEquals(await membershipOf(db, O, I), {
        id: O + ':' + I,
        organization_id: O,
        identity_id: I,
        type: 'admin',
        state: 'accepted',
        at: AT,
    });
});

Deno.test('an accepted version under a removed head'
    + ' holds nothing in either read', async () => {
    const db = await freshDb();
    await landMembership(db, O, I, 'accepted', 'member', AT);
    await landMembership(
        db, O, I, 'removed', 'member', LATER,
    );
    assertStrictEquals(await membershipOf(db, O, I), null);
    assertEquals(await membershipsOfIdentity(db, I), []);
    assertEquals(
        await organizationMembershipHeads(db, O, {
            kind: 'state',
            state: 'accepted',
        }),
        [],
    );
});

Deno.test('membershipsOfIdentity spans two organizations'
    + ' and orders by head', async () => {
    const db = await freshDb();
    const third = generateIdentifier();
    await landMembership(
        db, O, OTHER_I, 'accepted', 'admin', AT,
    );
    await landMembership(
        db, third, I, 'removed', 'member', AT,
    );
    await landMembership(db, O, I, 'accepted', 'admin', AT);
    await landMembership(
        db, OTHER_O, I, 'accepted', 'member', AT,
    );
    await landMembership(
        db, O, I, 'accepted', 'admin', LATER,
    );
    assertEquals(
        (await membershipsOfIdentity(db, I)).map(
            (membership) => ({
                organization_id: membership.organization_id,
                type: membership.type,
                state: membership.state,
            }),
        ),
        [
            {
                organization_id: OTHER_O,
                type: 'member',
                state: 'accepted',
            },
            {
                organization_id: O,
                type: 'admin',
                state: 'accepted',
            },
        ],
    );
});

Deno.test('each membership view keeps its own nest',
    async () => {
    const db = await freshDb();
    const inOrganization = await landMembership(
        db, O, I, 'pending', 'member', AT,
    );
    const otherOrganization = await landMembership(
        db, OTHER_O, I, 'accepted', 'admin', AT,
    );
    const otherIdentity = await landMembership(
        db, O, OTHER_I, 'revoked', 'member', AT,
    );
    const byOrganization = await organizationMembershipHeads(
        db, O, { kind: 'every' },
    );
    assertEquals(
        byOrganization.map((head) => head.id).toSorted(),
        [inOrganization.id, otherIdentity.id].toSorted(),
    );
    assertEquals(
        byOrganization.some(
            (head) => head.id === otherOrganization.id,
        ),
        false,
    );
    const byIdentity = await identityMembershipHeads(
        db, I, { kind: 'every' },
    );
    assertEquals(
        byIdentity.map((head) => head.id).toSorted(),
        [inOrganization.id, otherOrganization.id]
            .toSorted(),
    );
    assertEquals(
        byIdentity.some(
            (head) => head.id === otherIdentity.id,
        ),
        false,
    );
});

Deno.test('a view returns every state, one state,'
    + ' or the heads in order', async () => {
    const db = await freshDb();
    const planted: {
        state: InvitationState,
        identityId: string,
        headId: string,
    }[] = [];
    for (const state of INVITATION_STATES) {
        const identityId = generateIdentifier();
        const head = await landMembership(
            db, O, identityId, state, 'member', AT,
        );
        planted.push({
            state, identityId, headId: head.id,
        });
    }
    const first = planted[0];
    if (first === undefined) {
        throw new Error('invitation states are empty');
    }
    const revised = await landMembership(
        db, O, first.identityId, first.state, 'member',
        LATER,
    );
    const expected = [
        ...planted.slice(1).map((row) => row.headId),
        revised.id,
    ];
    assertEquals(
        (await organizationMembershipHeads(db, O, {
            kind: 'every',
        })).map((head) => head.id),
        expected,
    );
    for (const row of planted) {
        const selected = await organizationMembershipHeads(
            db, O, { kind: 'state', state: row.state },
        );
        assertEquals(
            selected.map((head) => head.id),
            [
                row.state === first.state
                    ? revised.id
                    : row.headId,
            ],
        );
    }
    assertEquals(
        (await identityMembershipHeads(
            db, first.identityId, { kind: 'every' },
        )).map((head) => head.id),
        [revised.id],
    );
    const otherState = first.state === 'pending'
        ? 'accepted'
        : 'pending';
    assertEquals(
        await identityMembershipHeads(
            db, first.identityId, {
                kind: 'state',
                state: otherState,
            },
        ),
        [],
    );
});
