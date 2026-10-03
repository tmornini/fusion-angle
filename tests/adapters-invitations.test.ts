import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import {
    withLocalStorage,
    withLocalStorageAsync,
} from './fixtures/local-storage.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { MemoryStorageBackend } from '../api/backend-memory.ts';
import {
    handleRequest,
    type ClientFacadeAdapter,
} from '../api/api.ts';
import type { DbAdapter } from '../api/db.ts';
import type { NotificationEvent } from '../shared/notifications.ts';
import {
    validateInvitationEntity,
} from '../api/validators.ts';
import {
    HTTP_CONFLICT,
    HTTP_PRECONDITION_FAILED,
    RequestError,
    UnauthorizedError,
} from '../shared/http-errors.ts';
import {
    activeOrganization,
    type RequestContext,
} from '../client/request-context.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import type { ClientSession } from '../client/client-session.ts';
import { responseMessage } from './fixtures/response-message.ts';
import {
    IN_PROCESS_ORIGIN,
    inPageContext,
    inProcessFetch,
    recordedContext,
} from './in-page-facade.ts';
import { createHttpFacade } from '../client/http-facade.ts';
import { createAppClient } from '../web-app/app/client.ts';
import {
    organizationToken,
    reachableToken,
} from './token-fixtures.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import type { MembershipEntity } from '../shared/types.ts';
import {
    postInvitationGrant,
    postInvitationAcceptance,
    postInvitationDecline,
    postInvitationRevocation,
    getInvitations,
    getSentInvitations,
    subscribeInvitationChanges,
    SessionRemintFailedError,
    type InvitationView,
    type SentInvitation,
} from '../client/invitations.ts';
import {
    getHumanMemberProfile,
    postHumanMemberCreation,
    putHumanMember,
    subscribeHumanMemberChanges,
} from '../client/members.ts';
import { deleteBellSession } from '../client/channels.ts';
import { deriveInvitations } from
    '../api/derive-invitations.ts';
import { deriveOrganizations } from
    '../api/derive-organizations.ts';
import {
    membershipOfHead,
    organizationMembershipHeads,
} from '../api/memberships.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { framedRequest } from './http-fixtures.ts';

const AT = '2026-01-01T00:00:00.000000Z';
const WAYNE = 'BBjWJsjYIDkTRKIIPrzWRw';
const SARAH = 'toccYYkLEABmlbpHJalgtQ';

async function invitationOf(
    db: DbAdapter,
    organizationId: string,
    identityId: string,
) {
    const row = (await deriveInvitations(db)).find(
        (item) =>
            item.organization_id === organizationId
            && item.identity_id === identityId,
    );
    assert(row !== undefined);
    return row;
}

// A fresh Map-backed fake per test — session-token adapters
// used throughout this file read/write it lazily.
function accessAnswer<T>(token: string): HttpMessage<T> {
    return responseMessage({ token_type: 'Bearer' }, {
        'authentication-info':
            'access_token="' + token + '"',
    }) as HttpMessage<T>;
}

function freshStorage(): Partial<Storage> {
    const store = new Map<string, string>();
    return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
            store.set(k, v);
        },
        removeItem: (k: string) => {
            store.delete(k);
        },
        clear: () => {
            store.clear();
        },
        key: () => null,
        get length() {
            return store.size;
        },
    };
}

// Below-facade pair formation (the member-fixtures.ts idiom,
// mirroring seedOrganizationDocument's own reasoning just below):
// postInvitationGrant's admin/membership checks derive from the
// message plane once role_grants/memberships flip, so a raw row
// here would go derivation-invisible — and, like
// seedOrganizationDocument, these below-facade ops post no
// notification, so seedWithNotify's counting spy stays clean.
// Every id/field value stays IDENTICAL to the raw puts these
// replace — only the write mechanism changes.
async function seedMembershipPair(
    db: DbAdapter,
    _id: string,
    body: Record<string, unknown>,
): Promise<void> {
    await seedSeat(
        db,
        String(body.organization_id),
        String(body.identity_id),
        body.type as 'admin' | 'member',
        String(body.at),
    );
}

// Two orgs (Stark 'AjdvjuECVZEgZoFajaIEkg', Wayne 'BBjWJsjYIDkTRKIIPrzWRw').
// Tony ('XXZruirZyAOoRpNxaDnpSA') is admin
// and member of both. Sarah is a Stark-only member. Dave is an
// identity with no membership anywhere (a fresh invitee).
async function seedRows(
    db: DbAdapter,
): Promise<{ daveId: string }> {
    await db.postSchemaCreation();
    // Message pairs, not raw rows: getInvitations' own
    // organization_name join (Phase 12 Task 5,
    // api/invitations-domain.ts) derives from the ledger, so a
    // raw db.organizations.put would leave both orgs invisible
    // to it — seedOrganizationDocument's own comment (test-
    // fixtures.ts) on why this rides below the facade rather
    // than a live PUT (this fixture also feeds seedWithNotify's
    // counting spy, which a live PUT's own notification would
    // pollute).
    await seedOrganizationDocument(db, 'AjdvjuECVZEgZoFajaIEkg', 'Stark');
    await seedOrganizationDocument(db, 'BBjWJsjYIDkTRKIIPrzWRw', 'Wayne');
    for (const organization of ['AjdvjuECVZEgZoFajaIEkg'
        , 'BBjWJsjYIDkTRKIIPrzWRw']) {
        await seedMembershipPair(db, generateIdentifier(), {
            organization_id: organization
                , identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'admin',
            at: AT,
        });
    }
    await seedPerson(db, 'XXZruirZyAOoRpNxaDnpSA', 'Tony'
        , 'demo@example.com');
    await seedPerson(db, 'toccYYkLEABmlbpHJalgtQ', 'Sarah', 'sarah@x.com');
    await seedMembershipPair(db, generateIdentifier(), {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg'
            , identity_id: 'toccYYkLEABmlbpHJalgtQ',
        type: 'member', at: AT,
    });
    const daveId = generateIdentifier();
    await seedPerson(db, daveId, 'Dave', 'dave@x.com');
    return { daveId };
}

async function seed(): Promise<{
    db: MemoryDbAdapter;
    daveId: string;
}> {
    const db = memoryDbAdapter();
    const { daveId } = await seedRows(db);
    return { db, daveId };
}

// The same world, over a BackedDbAdapter constructed directly
// so the notify hook (its 4th ctor arg) can be a counting spy —
// MemoryDbAdapter's preset always wires a no-op there.
async function seedWithNotify(
    notify: (event: NotificationEvent) => void,
): Promise<{ db: BackedDbAdapter; daveId: string }> {
    const db = new BackedDbAdapter(
        new MemoryStorageBackend(),
        async () => {},
        async () => {},
        notify,
    );
    const { daveId } = await seedRows(db);
    return { db, daveId };
}

// identities stays a raw put — no GET /identities (or
// /identities/:id) reads it anywhere in this file. identityPii
// DOES feed a flip: getInvitations/getSentInvitations enrich
// invited_by_name/invitee_email by reading the identity_pii
// plane (api/invitations-domain.ts), which Task 8 Step 3
// re-points onto deriveIdentityPiiRows — so this facet forms
// its pair below-facade (finding 18's fixture budget) via the
// SAME exported op the live PUT identities/:id/pii route uses.
async function seedPerson(
    db: DbAdapter,
    id: string,
    name: string,
    email: string,
): Promise<void> {
    await seedPersonIdentity(db, id, {
        name, email, phone: '', bio: '',
    });
}

// Phase Final Task 2: all membership documents (every org).
async function deriveMembershipsAll(db: DbAdapter) {
    const organizations = await deriveOrganizations(db);
    const rows: Array<{
        id: string;
        organization_id: string;
        identity_id: string;
        type: string;
        at: string;
    }> = [];
    const accepted = {
        kind: 'state' as const,
        state: 'accepted' as const,
    };
    for (const organization of organizations) {
        const heads = await organizationMembershipHeads(
            db, organization.id, accepted,
        );
        for (const head of heads) {
            const membership = membershipOfHead(head);
            rows.push({
                id: membership.id,
                organization_id: membership.organization_id,
                identity_id: membership.identity_id,
                type: membership.type,
                at: membership.at,
            });
        }
    }
    return rows;
}

async function ctxFor(sub: string, organization: string) {
    const { db, daveId } = await seed();
    const ctx = inPageContext(
        db, await organizationToken(sub, organization),
    );
    return { db, ctx, daveId };
}

// The invitation's newest version is the last part. The
// author is the pair the statement stored, not a body field.
async function newestVersion(
    db: DbAdapter,
    admin: RequestContext,
    organization: string,
    id: string,
): Promise<{ etag: string; at: string; member_id: string }> {
    const parts = await admin.GETCollection<MembershipEntity>(
        'organizations/' + organization + '/invitations/'
            + id + '/versions/',
    );
    const newest = parts[parts.length - 1];
    assert(newest !== undefined, 'the invitation has no version');
    const etag = newest.query('header.etag').toText();
    const pair = await db.messagePairs.getById(
        etag.slice(1, -1),
    );
    assert(pair !== null);
    return {
        etag,
        at: newest.body().toValue().at,
        member_id: pair.requester_identity_id,
    };
}

// A context bound to an existing db (for two actors in one test).
async function ctxOn(
    db: ClientFacadeAdapter,
    sub: string,
    organization: string,
) {
    return inPageContext(
        db, await organizationToken(sub, organization),
    );
}

async function recordingOn(
    db: ClientFacadeAdapter,
    sub: string,
    organization: string,
) {
    return recordedContext(
        db, await organizationToken(sub, organization),
    );
}

function inviteeFrom(
    message: HttpMessage<MembershipEntity>,
): InvitationView {
    const row = message.body().toValue();
    return {
        id: row.id,
        organizationId: row.organization_id,
        invitedAt: row.at,
        state: row.state,
        message,
    };
}

function sentFrom(
    message: HttpMessage<MembershipEntity>,
): SentInvitation {
    const row = message.body().toValue();
    return {
        id: row.id,
        organizationId: row.organization_id,
        identityId: row.identity_id,
        invitedAt: row.at,
        state: row.state,
        message,
    };
}

async function heldInvitee(
    ctx: RequestContext,
    id: string,
): Promise<InvitationView> {
    return inviteeFrom(await ctx.GET<MembershipEntity>(
        'identities/' + ctx.identity.id
            + '/invitations/' + id,
    ));
}

async function heldSent(
    ctx: RequestContext,
    id: string,
): Promise<SentInvitation> {
    return sentFrom(await ctx.GET<MembershipEntity>(
        'organizations/' + activeOrganization(ctx)
            + '/invitations/' + id,
    ));
}

function itemRequests(
    sent: readonly {
        method: string;
        path: string;
        ifMatch: string | null;
    }[],
    id: string,
) {
    const suffix = '/invitations/' + id;
    return sent.filter((request) =>
        request.path.endsWith(suffix));
}

// Erase a pii slot through the LIVE facade (Phase 10 Task 8
// Session B), not a raw db.identityPii.delete: the enrichment
// joins below now read deriveIdentityPiiRows (the message
// ledger), so a raw row delete leaves the slot's message pair
// intact and the "erased" identity would still show up in the
// derived read. The live DELETE appends a bodyless
// tombstone pair, matching what an actual erasure does.
// `actor` is the caller (self or admin);
// `organization` only needs to resolve a valid fenced token —
// authorizeIdentityPii's self-or-admin check does not itself
// consult org membership.
async function eraseIdentityPii(
    db: DbAdapter,
    actor: string,
    organization: string,
    target: string,
): Promise<void> {
    const token = await organizationToken(actor, organization);
    const response = await handleRequest(db, framedRequest(
        `http://localhost/identities/${target}/pii`,
        {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + token,
                'operation-id': generateIdentifier(),
            },
        },
    ));
    assertStrictEquals(response.status, 204);
}

Deno.test('validateInvitationEntity accepts a full body',
() => withLocalStorage(freshStorage(), () => {
    assertEquals(
        validateInvitationEntity({
            organization_id: 'BBjWJsjYIDkTRKIIPrzWRw',
            identity_id: 'toccYYkLEABmlbpHJalgtQ',
            at: AT, state: 'pending',
        }),
        {
            organization_id: 'BBjWJsjYIDkTRKIIPrzWRw',
            identity_id: 'toccYYkLEABmlbpHJalgtQ',
            at: AT, state: 'pending',
        },
    );
}));

Deno.test('validateInvitationEntity rejects an extra key',
() => withLocalStorage(freshStorage(), () => {
    assertThrows(() =>
        validateInvitationEntity({
            organization_id: 'BBjWJsjYIDkTRKIIPrzWRw'
                , identity_id: 'toccYYkLEABmlbpHJalgtQ',
            at: AT, state: 'pending', email: 'sarah@x.com',
        }));
}));

Deno.test('validateInvitationEntity rejects a bad timestamp',
() => withLocalStorage(freshStorage(), () => {
    assertThrows(() =>
        validateInvitationEntity({
            organization_id: 'BBjWJsjYIDkTRKIIPrzWRw'
                , identity_id: 'toccYYkLEABmlbpHJalgtQ',
            at: 'not-a-date', state: 'pending',
        }));
}));

Deno.test('validateInvitationEntity rejects a missing state',
    () => {
        assertThrows(() => validateInvitationEntity({
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            identity_id: 'toccYYkLEABmlbpHJalgtQ',
            at: '2026-01-01T00:00:00.000000Z',
        }));
    });

Deno.test('validateInvitationEntity rejects an unknown state',
    () => {
        assertThrows(() => validateInvitationEntity({
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            identity_id: 'toccYYkLEABmlbpHJalgtQ',
            at: '2026-01-01T00:00:00.000000Z',
            state: 'lost',
        }));
    });

// Phase Final Stage B: invitations table retired — store
// round-trip pins live on message-plane document tests.

Deno.test('grant by email appends a pending invitation',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db, ctx } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    assertStrictEquals(
        await postInvitationGrant(ctx, 'sarah@x.com'), 'sent');
    // Phase Final Task 2: invitations ROW half stripped.
    const rows = await deriveInvitations(db);
    assertStrictEquals(rows.length, 4);
    const grant = await invitationOf(db, WAYNE, SARAH);
    assertStrictEquals(grant.organization_id, WAYNE);
    assertStrictEquals(grant.identity_id, SARAH);
    assertStrictEquals(grant.state, 'pending');
    // Phase Final Stage B: roster tables retired.
}));

Deno.test('grant stamps the org from the verified token',
() => withLocalStorageAsync(freshStorage(), async () => {
    // Tony is admin of both, but his token is scoped to Wayne;
    // the invitation must land in Wayne, never Stark.
    const { db, ctx } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(ctx, 'sarah@x.com');
    const grant = await invitationOf(db, WAYNE, SARAH);
    assertStrictEquals(grant.organization_id, WAYNE);
}));

Deno.test('grant by unknown email returns no-identity',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { ctx } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    assertStrictEquals(
        await postInvitationGrant(ctx, 'nobody@x.com'),
        'no-identity');
}));

Deno.test('grant for an existing member returns already-member',
() => withLocalStorageAsync(freshStorage(), async () => {
    // The seeded seat is the accepted membership.
    const { ctx } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'AjdvjuECVZEgZoFajaIEkg');
    assertStrictEquals(
        await postInvitationGrant(ctx, 'sarah@x.com'),
        'already-member');
}));

Deno.test('a non-admin cannot grant',
() => withLocalStorageAsync(freshStorage(), async () => {
    // Sarah is a Stark member but not an admin.
    const { ctx } = await ctxFor('toccYYkLEABmlbpHJalgtQ'
        , 'AjdvjuECVZEgZoFajaIEkg');
    await assertRejects(
        async () => postInvitationGrant(ctx, 'dave@x.com'));
}));

Deno.test('the invitee reads their own pending invitation',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    const toccYYkLEABmlbpHJalgtQ = await ctxOn(db, 'toccYYkLEABmlbpHJalgtQ'
        , 'AjdvjuECVZEgZoFajaIEkg');
    const mine = await getInvitations(toccYYkLEABmlbpHJalgtQ);
    assertStrictEquals(mine.length, 2);
    const wayne = mine.find(
        (row) => row.organizationId === WAYNE,
    );
    const stark = mine.find(
        (row) => row.organizationId === 'AjdvjuECVZEgZoFajaIEkg',
    );
    assert(wayne !== undefined);
    assert(stark !== undefined);
    assertStrictEquals(wayne.organizationId, WAYNE);
    assertStrictEquals(wayne.state, 'pending');
    assert(!('organizationName' in wayne));
    assertStrictEquals(stark.state, 'accepted');
}));

Deno.test('the view omits the inviter name when PII is erased',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    await eraseIdentityPii(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw', 'XXZruirZyAOoRpNxaDnpSA');
    const toccYYkLEABmlbpHJalgtQ = await ctxOn(db, 'toccYYkLEABmlbpHJalgtQ'
        , 'AjdvjuECVZEgZoFajaIEkg');
    const mine = await getInvitations(toccYYkLEABmlbpHJalgtQ);
    assertStrictEquals(mine.length, 2);
    const wayne = mine.find(
        (row) => row.organizationId === WAYNE
            && row.state === 'pending',
    );
    assert(wayne !== undefined);
    assert(!('invitedByName' in wayne));
}));

Deno.test('accept writes a membership in the invitation org',
() => withLocalStorageAsync(freshStorage(), async () => {
    // THE security crux: Sarah is scoped to Stark, but accepting
    // a Wayne invite must write a WAYNE membership, never Stark.
    const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = await invitationOf(db, WAYNE, SARAH);
    const toccYYkLEABmlbpHJalgtQ = await ctxOn(db, 'toccYYkLEABmlbpHJalgtQ'
        , 'AjdvjuECVZEgZoFajaIEkg');
    const held = await heldInvitee(
        toccYYkLEABmlbpHJalgtQ, inv.id,
    );
    const { ctx, sent } = await recordingOn(
        db, 'toccYYkLEABmlbpHJalgtQ', 'AjdvjuECVZEgZoFajaIEkg',
    );
    sent.length = 0;
    await postInvitationAcceptance(ctx, held);
    assertEquals(
        itemRequests(sent, inv.id).map((request) => [
            request.method, request.ifMatch,
        ]),
        [[
            'PUT',
            held.message.query('header.etag').toText(),
        ]],
    );
    const memberships = (await deriveMembershipsAll(db))
        .filter(m => m.identity_id === 'toccYYkLEABmlbpHJalgtQ');
    const organizations = memberships.map(m => m.organization_id).sort();
    assertEquals(organizations, ['AjdvjuECVZEgZoFajaIEkg'
        , 'BBjWJsjYIDkTRKIIPrzWRw']);
    const views = await getInvitations(toccYYkLEABmlbpHJalgtQ);
    assertStrictEquals(
        views.find(v => v.id === inv.id)?.state, 'accepted');
}));

Deno.test('accept by a non-invitee is rejected',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db, daveId } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = await invitationOf(db, WAYNE, SARAH);
    // Dave tries to accept Sarah's invitation.
    const sarah = await ctxOn(db, 'toccYYkLEABmlbpHJalgtQ'
        , 'AjdvjuECVZEgZoFajaIEkg');
    const held = await heldInvitee(sarah, inv.id);
    const dave = await ctxOn(db, daveId, 'AjdvjuECVZEgZoFajaIEkg');
    await assertRejects(
        async () => postInvitationAcceptance(dave, held));
}));

Deno.test('decline records declined and writes no membership',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db, daveId } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'dave@x.com');
    const inv = await invitationOf(db, WAYNE, daveId);
    // Decline is identity-gated, not org-gated: Dave acts on his
    // own invitation regardless of any active org.
    const dave = await ctxOn(db, daveId, 'AjdvjuECVZEgZoFajaIEkg');
    const held = await heldInvitee(dave, inv.id);
    const { ctx, sent } = await recordingOn(
        db, daveId, 'AjdvjuECVZEgZoFajaIEkg',
    );
    sent.length = 0;
    await postInvitationDecline(ctx, held);
    assertEquals(
        itemRequests(sent, inv.id).map((request) => [
            request.method, request.ifMatch,
        ]),
        [[
            'PUT',
            held.message.query('header.etag').toText(),
        ]],
    );
    const views = await getInvitations(dave);
    assertStrictEquals(
        views.find(v => v.id === inv.id)?.state, 'declined');
    const memberships = (await deriveMembershipsAll(db))
        .filter(m => m.identity_id === daveId);
    assertStrictEquals(memberships.length, 0);
}));

Deno.test('revoke records revoked (admin only)',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = await invitationOf(db, WAYNE, SARAH);
    const held = await heldSent(tony, inv.id);
    const { ctx, sent } = await recordingOn(
        db, 'XXZruirZyAOoRpNxaDnpSA', 'BBjWJsjYIDkTRKIIPrzWRw',
    );
    sent.length = 0;
    await postInvitationRevocation(ctx, held);
    assertEquals(
        itemRequests(sent, inv.id).map((request) => [
            request.method, request.ifMatch,
        ]),
        [[
            'PUT',
            held.message.query('header.etag').toText(),
        ]],
    );
    const toccYYkLEABmlbpHJalgtQ = await ctxOn(db, 'toccYYkLEABmlbpHJalgtQ'
        , 'AjdvjuECVZEgZoFajaIEkg');
    const views = await getInvitations(toccYYkLEABmlbpHJalgtQ);
    assertStrictEquals(
        views.find(v => v.id === inv.id)?.state, 'revoked');
}));

Deno.test('a non-admin cannot revoke',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = await invitationOf(db, WAYNE, SARAH);
    const held = await heldSent(tony, inv.id);
    const toccYYkLEABmlbpHJalgtQ = await ctxOn(db, 'toccYYkLEABmlbpHJalgtQ'
        , 'AjdvjuECVZEgZoFajaIEkg');
    await assertRejects(
        async () => postInvitationRevocation(
            toccYYkLEABmlbpHJalgtQ, held,
        ));
}));

Deno.test('accept after revoke is rejected, no membership',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = await invitationOf(db, WAYNE, SARAH);
    await postInvitationRevocation(
        tony, await heldSent(tony, inv.id),
    );
    const toccYYkLEABmlbpHJalgtQ = await ctxOn(db, 'toccYYkLEABmlbpHJalgtQ'
        , 'AjdvjuECVZEgZoFajaIEkg');
    const current = await heldInvitee(
        toccYYkLEABmlbpHJalgtQ, inv.id,
    );
    const err = await assertRejects(
        async () => postInvitationAcceptance(
            toccYYkLEABmlbpHJalgtQ, current,
        )) as RequestError;
    assertInstanceOf(err, RequestError);
    assertStrictEquals(err.status, HTTP_CONFLICT);
    const wayne = (await deriveMembershipsAll(db))
        .filter(m => m.identity_id === 'toccYYkLEABmlbpHJalgtQ'
            && m.organization_id === 'BBjWJsjYIDkTRKIIPrzWRw');
    assertStrictEquals(wayne.length, 0);
}));

Deno.test('accept after decline is rejected',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = await invitationOf(db, WAYNE, SARAH);
    const toccYYkLEABmlbpHJalgtQ = await ctxOn(db, 'toccYYkLEABmlbpHJalgtQ'
        , 'AjdvjuECVZEgZoFajaIEkg');
    await postInvitationDecline(
        toccYYkLEABmlbpHJalgtQ,
        await heldInvitee(toccYYkLEABmlbpHJalgtQ, inv.id),
    );
    const err = await assertRejects(
        async () => postInvitationAcceptance(
            toccYYkLEABmlbpHJalgtQ,
            await heldInvitee(toccYYkLEABmlbpHJalgtQ, inv.id),
        )) as RequestError;
    assertInstanceOf(err, RequestError);
    assertStrictEquals(err.status, HTTP_CONFLICT);
}));

Deno.test('decline after accept is rejected',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = await invitationOf(db, WAYNE, SARAH);
    const toccYYkLEABmlbpHJalgtQ = await ctxOn(db, 'toccYYkLEABmlbpHJalgtQ'
        , 'AjdvjuECVZEgZoFajaIEkg');
    await postInvitationAcceptance(
        toccYYkLEABmlbpHJalgtQ,
        await heldInvitee(toccYYkLEABmlbpHJalgtQ, inv.id),
    );
    const err = await assertRejects(
        async () => postInvitationDecline(
            toccYYkLEABmlbpHJalgtQ,
            await heldInvitee(toccYYkLEABmlbpHJalgtQ, inv.id),
        )) as RequestError;
    assertInstanceOf(err, RequestError);
    assertStrictEquals(err.status, HTTP_CONFLICT);
}));

Deno.test('granting the same email twice is idempotent',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    await postInvitationGrant(tony, 'sarah@x.com');
    assertStrictEquals((await deriveInvitations(db)).length, 4);
}));

// A declined membership is the same document. A later grant
// lands pending on it.
Deno.test('re-inviting a declined invitee lands pending on the'
+ ' same membership',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    const first = await invitationOf(db, WAYNE, SARAH);
    const toccYYkLEABmlbpHJalgtQ = await ctxOn(db, 'toccYYkLEABmlbpHJalgtQ'
        , 'AjdvjuECVZEgZoFajaIEkg');
    await postInvitationDecline(
        toccYYkLEABmlbpHJalgtQ,
        await heldInvitee(toccYYkLEABmlbpHJalgtQ, first.id),
    );

    assertStrictEquals(
        await postInvitationGrant(tony, 'sarah@x.com'), 'sent');

    const invs = await deriveInvitations(db);
    assertStrictEquals(invs.length, 4);
    const pending = await invitationOf(db, WAYNE, SARAH);
    assertStrictEquals(pending.id, first.id);
    assertStrictEquals(pending.state, 'pending');
    const mine = await getInvitations(toccYYkLEABmlbpHJalgtQ);
    assertStrictEquals(
        mine.find(v => v.id === first.id)?.state, 'pending');
}));

Deno.test('getSentInvitations reads ?state=declined',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db } = await seed();
    const urls: string[] = [];
    const inner = inProcessFetch(db);
    const recording: typeof fetch = async (input, init) => {
        const request = new Request(input, init);
        urls.push(request.url);
        return inner(request);
    };
    const ctx = createAppClient(createHttpFacade(
        IN_PROCESS_ORIGIN, recording,
    )).requestContext(await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA',
        'BBjWJsjYIDkTRKIIPrzWRw',
    ));
    await getSentInvitations(ctx, 'declined');
    assertStrictEquals(urls.length, 1);
    const url = new URL(urls[0]!);
    assertStrictEquals(
        url.pathname,
        '/api/organizations/BBjWJsjYIDkTRKIIPrzWRw'
            + '/invitations/',
    );
    assertStrictEquals(url.search, '?state=declined');
    assertStrictEquals(
        url.search.match(/state=/g)?.length, 1,
    );
}));

Deno.test('sent invitations list the active org pending only',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tonyWayne = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tonyWayne, 'sarah@x.com');
    const sent = await getSentInvitations(
        tonyWayne, 'pending',
    );
    assertStrictEquals(sent.length, 1);
    assertStrictEquals(
        sent[0]!.identityId, 'toccYYkLEABmlbpHJalgtQ',
    );
    assert(!('inviteeEmail' in sent[0]!));
    // Switched to Stark, the Wayne invitation is out of scope.
    const tonyStark = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'AjdvjuECVZEgZoFajaIEkg');
    assertStrictEquals(
        (await getSentInvitations(tonyStark, 'pending'))
            .length,
        0,
    );
}));

Deno.test('the sent view omits the email when PII is erased',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    await eraseIdentityPii(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw', 'toccYYkLEABmlbpHJalgtQ');
    const sent = await getSentInvitations(tony, 'pending');
    assertStrictEquals(sent.length, 1);
    assert(!('inviteeEmail' in sent[0]!));
}));

// Caller-minted ids + at (T11)
// Adapters mint unconditionally; the adapter-level tests assert:
// - entity lands and carries a state event with an `at`
// - author (member_id) is server-derived, not a body field
// Replay idempotency is tested at the API level (fixed-body
// POST twice), where the exact id is controllable — see
// tests/api-invitations-fence.test.ts.

Deno.test('grant: entity lands and event author is server-derived',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    const invs = await deriveInvitations(db);
    assertStrictEquals(invs.length, 4);
    const grant = await invitationOf(db, WAYNE, SARAH);
    // Entity landed with a non-empty id.
    assert(grant.id !== '');
    // The newest version exists and carries an at.
    const ev = await newestVersion(
        db, tony, 'BBjWJsjYIDkTRKIIPrzWRw', grant.id,
    );
    assert(ev.at !== '');
    assertStrictEquals(ev.member_id, 'XXZruirZyAOoRpNxaDnpSA');
}));

Deno.test('accept: event author is server-derived, membership lands',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = await invitationOf(db, WAYNE, SARAH);
    const toccYYkLEABmlbpHJalgtQ = await ctxOn(db, 'toccYYkLEABmlbpHJalgtQ'
        , 'AjdvjuECVZEgZoFajaIEkg');
    await postInvitationAcceptance(
        toccYYkLEABmlbpHJalgtQ,
        await heldInvitee(toccYYkLEABmlbpHJalgtQ, inv.id),
    );
    // The version landed with a non-empty etag + at.
    const ev = await newestVersion(
        db, tony, 'BBjWJsjYIDkTRKIIPrzWRw', inv.id,
    );
    assert(ev.etag !== '');
    assert(ev.at !== '');
    assertStrictEquals(ev.member_id, 'toccYYkLEABmlbpHJalgtQ');
    // Membership landed at a non-empty id.
    const wayne = (await deriveMembershipsAll(db))
        .filter(m => m.identity_id === 'toccYYkLEABmlbpHJalgtQ'
            && m.organization_id === 'BBjWJsjYIDkTRKIIPrzWRw');
    assertStrictEquals(wayne.length, 1);
    assert(wayne[0]!.id !== '');
}));

Deno.test('decline: event author is server-derived',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db, daveId } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'dave@x.com');
    const inv = await invitationOf(db, WAYNE, daveId);
    const dave = await ctxOn(db, daveId, 'AjdvjuECVZEgZoFajaIEkg');
    await postInvitationDecline(
        dave, await heldInvitee(dave, inv.id),
    );
    const ev = await newestVersion(
        db, tony, 'BBjWJsjYIDkTRKIIPrzWRw', inv.id,
    );
    assert(ev.etag !== '');
    assert(ev.at !== '');
    assertStrictEquals(ev.member_id, daveId);
}));

Deno.test('revoke: event author is server-derived',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = await invitationOf(db, WAYNE, SARAH);
    await postInvitationRevocation(
        tony, await heldSent(tony, inv.id),
    );
    const ev = await newestVersion(
        db, tony, 'BBjWJsjYIDkTRKIIPrzWRw', inv.id,
    );
    assert(ev.etag !== '');
    assert(ev.at !== '');
    assertStrictEquals(ev.member_id, 'XXZruirZyAOoRpNxaDnpSA');
}));

// A notify fires only after a write commits — an idempotent
// no-op writes nothing, so it must ring nothing.

Deno.test('a repeated grant (existing pending) posts no notification',
() => withLocalStorageAsync(freshStorage(), async () => {
    const posted: NotificationEvent[] = [];
    const { db } = await seedWithNotify(e => posted.push(e));
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    assertStrictEquals(posted.length, 1);
    await postInvitationGrant(tony, 'sarah@x.com');
    assertStrictEquals(posted.length, 1);
}));

Deno.test('a repeated accept posts no notification',
() => withLocalStorageAsync(freshStorage(), async () => {
    const posted: NotificationEvent[] = [];
    const { db } = await seedWithNotify(e => posted.push(e));
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = await invitationOf(db, WAYNE, SARAH);
    const toccYYkLEABmlbpHJalgtQ = await ctxOn(db, 'toccYYkLEABmlbpHJalgtQ'
        , 'AjdvjuECVZEgZoFajaIEkg');
    const pending = await toccYYkLEABmlbpHJalgtQ
        .GET<MembershipEntity>(
        'identities/toccYYkLEABmlbpHJalgtQ/invitations/'
            + inv.id,
    );
    await postInvitationAcceptance(
        toccYYkLEABmlbpHJalgtQ, inviteeFrom(pending),
    );
    assertStrictEquals(posted.length, 2);   // grant, accept
    const err = await assertRejects(
        () => toccYYkLEABmlbpHJalgtQ.PUT(
            'identities/toccYYkLEABmlbpHJalgtQ/invitations/'
                + inv.id,
            {
                state: 'accepted',
                at: '2026-01-01T00:00:02.000000Z',
            },
            [pending],
        ),
    ) as RequestError;
    assertInstanceOf(err, RequestError);
    assertStrictEquals(err.status, HTTP_PRECONDITION_FAILED);
    assertStrictEquals(posted.length, 2);
}));

Deno.test('a repeated decline posts no notification',
() => withLocalStorageAsync(freshStorage(), async () => {
    const posted: NotificationEvent[] = [];
    const { db, daveId } = await seedWithNotify(
        e => posted.push(e),
    );
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'dave@x.com');
    const inv = await invitationOf(db, WAYNE, daveId);
    const dave = await ctxOn(db, daveId, 'AjdvjuECVZEgZoFajaIEkg');
    await postInvitationDecline(
        dave, await heldInvitee(dave, inv.id),
    );
    assertStrictEquals(posted.length, 2);   // grant, decline
    const err = await assertRejects(
        async () => postInvitationDecline(
            dave, await heldInvitee(dave, inv.id),
        ),
    ) as RequestError;
    assertInstanceOf(err, RequestError);
    assertStrictEquals(err.status, HTTP_CONFLICT);
    assertStrictEquals(posted.length, 2);
}));

Deno.test('a repeated revoke posts no notification',
() => withLocalStorageAsync(freshStorage(), async () => {
    const posted: NotificationEvent[] = [];
    const { db } = await seedWithNotify(e => posted.push(e));
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = await invitationOf(db, WAYNE, SARAH);
    await postInvitationRevocation(
        tony, await heldSent(tony, inv.id),
    );
    assertStrictEquals(posted.length, 2);   // grant, revoke
    const err = await assertRejects(
        async () => postInvitationRevocation(
            tony, await heldSent(tony, inv.id),
        ),
    ) as RequestError;
    assertInstanceOf(err, RequestError);
    assertStrictEquals(err.status, HTTP_CONFLICT);
    assertStrictEquals(posted.length, 2);
}));

Deno.test('cookie-session accept remints via refresh POST',
() => withLocalStorageAsync(freshStorage(), async () => {
    let session: ClientSession | undefined;
    try {
        const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw');
        const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw');
        await postInvitationGrant(tony, 'sarah@x.com');
        const inv = await invitationOf(db, WAYNE, SARAH);
        const toccYYkLEABmlbpHJalgtQ = await ctxOn(db
            , 'toccYYkLEABmlbpHJalgtQ', 'AjdvjuECVZEgZoFajaIEkg');
        session = toccYYkLEABmlbpHJalgtQ.session;
        session.setCookieSession(true);
        const minted = await reachableToken(
            'toccYYkLEABmlbpHJalgtQ',
            ['AjdvjuECVZEgZoFajaIEkg', 'BBjWJsjYIDkTRKIIPrzWRw'],
        );
        const refreshBodies: unknown[] = [];
        const recording: RequestContext = {
            ...toccYYkLEABmlbpHJalgtQ,
            POSTUnauthenticated: async (
                resource,
                body,
                headerFields,
            ) => {
                if (resource === 'authentication/token') {
                    refreshBodies.push(body);
                    return accessAnswer(minted);
                }
                return toccYYkLEABmlbpHJalgtQ
                    .POSTUnauthenticated(
                        resource, body, headerFields,
                    );
            },
        };
        await postInvitationAcceptance(
            recording,
            await heldInvitee(toccYYkLEABmlbpHJalgtQ, inv.id),
        );
        assertStrictEquals(refreshBodies.length, 1);
        assertEquals(refreshBodies[0], {
            grant_type: 'refresh',
        });
        assertStrictEquals(session.getSessionToken(), minted);
    } finally {
        session?.deleteRefreshChannel();
    }
}));

Deno.test('a failed re-mint after accept surfaces, seat kept',
() => withLocalStorageAsync(freshStorage(), async () => {
    let session: ClientSession | undefined;
    try {
        const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw');
        const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw');
        await postInvitationGrant(tony, 'sarah@x.com');
        const inv = await invitationOf(db, WAYNE, SARAH);
        const sarah = await ctxOn(db
            , 'toccYYkLEABmlbpHJalgtQ', 'AjdvjuECVZEgZoFajaIEkg');
        session = sarah.session;
        session.setCookieSession(true);
        session.putSessionToken('pre-accept');
        const refused = new UnauthorizedError(
            'invalid_grant',
            responseMessage({ error: 'invalid_grant' }, {}, 401),
        );
        const recording: RequestContext = {
            ...sarah,
            POSTUnauthenticated: (
                resource,
                body,
                headerFields,
            ) => {
                if (resource === 'authentication/token') {
                    return Promise.reject(refused);
                }
                return sarah.POSTUnauthenticated(
                    resource, body, headerFields,
                );
            },
        };
        const err = await assertRejects(
            async () => postInvitationAcceptance(
                recording, await heldInvitee(sarah, inv.id),
            ),
        ) as Error;
        assertInstanceOf(err, SessionRemintFailedError);
        assertStrictEquals(err.cause, refused);
        const organizations =
            (await deriveMembershipsAll(db))
                .filter(m =>
                    m.identity_id === 'toccYYkLEABmlbpHJalgtQ')
                .map(m => m.organization_id)
                .sort();
        assertEquals(organizations, [
            'AjdvjuECVZEgZoFajaIEkg',
            'BBjWJsjYIDkTRKIIPrzWRw',
        ]);
        assertStrictEquals(session.getSessionToken(), 'pre-accept');
    } finally {
        session?.deleteRefreshChannel();
    }
}));

// The remint FOLLOWS an in-flight facade refresh. Latch the
// mutex with a grant only the test can settle, start the
// accept, and prove the remint has not presented a jti
// while the flight is open; settle, and it runs once.
Deno.test('the remint waits for an in-flight facade refresh',
() => withLocalStorageAsync(freshStorage(), async () => {
    let session: ClientSession | undefined;
    let releaseFlight = (): void => {};
    try {
        const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw');
        const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw');
        await postInvitationGrant(tony, 'sarah@x.com');
        const inv = await invitationOf(db, WAYNE, SARAH);
        const sarah = await ctxOn(db
            , 'toccYYkLEABmlbpHJalgtQ', 'AjdvjuECVZEgZoFajaIEkg');
        const held = await heldInvitee(sarah, inv.id);
        session = sarah.session;
        session.setCookieSession(true);
        const minted = await reachableToken(
            'toccYYkLEABmlbpHJalgtQ',
            ['AjdvjuECVZEgZoFajaIEkg', 'BBjWJsjYIDkTRKIIPrzWRw'],
        );
        // The resolver exists before the flight is
        // latched. The lock callback runs later, and a
        // throw before it starts must still settle the
        // grant or the process-wide lock stays held.
        const gate = new Promise<string | null>(
            (resolve) => {
                releaseFlight = () => resolve(minted);
            },
        );
        const facadeFlight = session.runSingleFlightRefresh(
            () => gate,
        );
        const refreshBodies: unknown[] = [];
        const recording: RequestContext = {
            ...sarah,
            POSTUnauthenticated: (
                resource,
                body,
                headerFields,
            ) => {
                if (resource === 'authentication/token') {
                    refreshBodies.push(body);
                    return Promise.resolve(
                        accessAnswer(minted),
                    );
                }
                return sarah.POSTUnauthenticated(
                    resource, body, headerFields,
                );
            },
        };
        const accepting = postInvitationAcceptance(
            recording, held,
        );
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setImmediate(r));
        }
        assertStrictEquals(
            refreshBodies.length, 0,
            'the remint must not present a jti while a'
            + ' refresh is in flight',
        );
        releaseFlight();
        await facadeFlight;
        await accepting;
        assertStrictEquals(refreshBodies.length, 1);
        assertStrictEquals(session.getSessionToken(), minted);
    } finally {
        releaseFlight();
        session?.deleteRefreshChannel();
    }
}));

// A peer tab's broadcast can hand the mutex a token minted
// before the seat: the remint runs once more, then stops.
Deno.test('a re-minted token without the seat earns one more'
+ ' attempt',
() => withLocalStorageAsync(freshStorage(), async () => {
    let session: ClientSession | undefined;
    try {
        const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw');
        const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw');
        await postInvitationGrant(tony, 'sarah@x.com');
        const inv = await invitationOf(db, WAYNE, SARAH);
        const sarah = await ctxOn(db
            , 'toccYYkLEABmlbpHJalgtQ', 'AjdvjuECVZEgZoFajaIEkg');
        session = sarah.session;
        session.setCookieSession(true);
        const stale = await reachableToken(
            'toccYYkLEABmlbpHJalgtQ', ['AjdvjuECVZEgZoFajaIEkg'],
        );
        const fresh = await reachableToken(
            'toccYYkLEABmlbpHJalgtQ',
            ['AjdvjuECVZEgZoFajaIEkg', 'BBjWJsjYIDkTRKIIPrzWRw'],
        );
        const tokens = [stale, fresh];
        const refreshBodies: unknown[] = [];
        const recording: RequestContext = {
            ...sarah,
            POSTUnauthenticated: (
                resource,
                body,
                headerFields,
            ) => {
                if (resource === 'authentication/token') {
                    refreshBodies.push(body);
                    const token = tokens[
                        refreshBodies.length - 1
                    ] ?? fresh;
                    return Promise.resolve(
                        accessAnswer(token),
                    );
                }
                return sarah.POSTUnauthenticated(
                    resource, body, headerFields,
                );
            },
        };
        await postInvitationAcceptance(
            recording, await heldInvitee(sarah, inv.id),
        );
        assertStrictEquals(refreshBodies.length, 2);
        assertStrictEquals(session.getSessionToken(), fresh);
    } finally {
        session?.deleteRefreshChannel();
    }
}));

Deno.test('two re-minted tokens without the seat surface a'
+ ' named failure',
() => withLocalStorageAsync(freshStorage(), async () => {
    let session: ClientSession | undefined;
    try {
        const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw');
        const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw');
        await postInvitationGrant(tony, 'sarah@x.com');
        const inv = await invitationOf(db, WAYNE, SARAH);
        const sarah = await ctxOn(db
            , 'toccYYkLEABmlbpHJalgtQ', 'AjdvjuECVZEgZoFajaIEkg');
        session = sarah.session;
        session.setCookieSession(true);
        const stale = await reachableToken(
            'toccYYkLEABmlbpHJalgtQ', ['AjdvjuECVZEgZoFajaIEkg'],
        );
        const refreshBodies: unknown[] = [];
        const recording: RequestContext = {
            ...sarah,
            POSTUnauthenticated: (
                resource,
                body,
                headerFields,
            ) => {
                if (resource === 'authentication/token') {
                    refreshBodies.push(body);
                    return Promise.resolve(
                        accessAnswer(stale),
                    );
                }
                return sarah.POSTUnauthenticated(
                    resource, body, headerFields,
                );
            },
        };
        const err = await assertRejects(
            async () => postInvitationAcceptance(
                recording, await heldInvitee(sarah, inv.id),
            ),
        ) as Error;
        assertInstanceOf(err, SessionRemintFailedError);
        assertStrictEquals(refreshBodies.length, 2);
    } finally {
        session?.deleteRefreshChannel();
    }
}));

// Another tab revoked the invitation this tab still holds.
// The accept names that part, so the stale tag is 412 and
// the revoked head stays the head.
Deno.test('a stale held invitation answers 412'
    + ' and stores nothing',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = await invitationOf(db, WAYNE, SARAH);
    const sarah = await ctxOn(db, 'toccYYkLEABmlbpHJalgtQ'
        , 'AjdvjuECVZEgZoFajaIEkg');
    const pending = await heldInvitee(sarah, inv.id);
    await postInvitationRevocation(
        tony, await heldSent(tony, inv.id),
    );
    const before = (await db.messagePairs.getAll()).length;
    const err = await assertRejects(
        async () => postInvitationAcceptance(sarah, pending),
    ) as RequestError;
    assertInstanceOf(err, RequestError);
    assertStrictEquals(err.status, HTTP_PRECONDITION_FAILED);
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
    assertStrictEquals(
        (await invitationOf(db, WAYNE, SARAH)).state,
        'revoked',
    );
}));

Deno.test('a membership write notifies both channels',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { ctx } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    deleteBellSession();
    let invitations = 0;
    let humans = 0;
    const stopInvitations = subscribeInvitationChanges(
        () => {
            invitations += 1;
        },
    );
    const stopHumans = subscribeHumanMemberChanges(
        () => {
            humans += 1;
        },
    );
    try {
        const id = generateIdentifier();
        await postHumanMemberCreation(ctx, id, {
            name: 'New Member',
            email: 'new-member@example.com',
            title: 'Engineer',
            department: 'Product',
            strengths: [],
            team_dimensions: {},
            phone: '',
            bio: '',
        });
        assertStrictEquals(invitations, 1);
        assertStrictEquals(humans, 1);
        invitations = 0;
        humans = 0;
        const { read } = await getHumanMemberProfile(
            ctx, id,
        );
        await putHumanMember(ctx, id, {
            held: read,
            body: {
                title: 'Lead',
                department: 'Product',
                strengths: [],
                team_dimensions: {},
            },
        });
        assertStrictEquals(invitations, 0);
        assertStrictEquals(humans, 1);
    } finally {
        stopInvitations();
        stopHumans();
        deleteBellSession();
    }
}));
