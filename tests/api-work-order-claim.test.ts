import {
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { RequestError, handleRequest } from '../api/api.ts';
import { DELETE, GET, PUT } from './in-page-facade.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';
import {
    nowUtc,
    resetClock,
    setClockForTest,
    type StateEntity,
} from '../shared/types.ts';
import {
    apiRequest,
    pairIdOf,
} from './http-fixtures.ts';
import {
    generateIdentifier,
} from '../shared/identifier.ts';

const OTHER = generateIdentifier();
const PRIOR_HOLDER = generateIdentifier();
import { workOrderLifecycleStatesFor } from
    '../api/derive-states.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';
import { operationIdHeader } from
    './operation-id-header.ts';


function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    headers?: Readonly<Record<string, string>>,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(headers !== undefined ? { headers } : {}),
    });
}

// An operation on a work order names the head it read.
async function headTag(
    db: MemoryDbAdapter,
    workOrderId = 'yNSSnbrpacodQTzUEcdEVA',
): Promise<string> {
    const read = await GET(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + workOrderId,
        DEV_TOKEN, operationIdHeader(),
    );
    const tag = read.query('header.etag');
    if (!tag.exists()) {
        throw new Error('the work order GET carried no ETag');
    }
    return tag.toText().slice(1, -1);
}

async function latched(
    db: MemoryDbAdapter,
    workOrderId?: string,
): Promise<readonly (readonly [string, string])[]> {
    return operationIdHeader([[
        'If-Match', '"' + await headTag(db, workOrderId) + '"',
    ]]);
}

// PUT organizations/:id/work-orders/:id/claim lands the work
// order's next version on the head it names: a live foreign
// claim is a 409; the holder's fresh claim records a renewal,
// and an exact resend stores nothing; an expired claim is
// superseded by 'claim_expired' + 'claimed' in one version.
// The claim offers no GET: the work order's head carries
// its claim. DELETE releases.

const LOCK_TIMEOUT_SECONDS = 300;

function graphJson(): Record<string, unknown> {
    return {
        name: 'Flow One',
        lockTimeout: LOCK_TIMEOUT_SECONDS,
        nodes: [],
        edges: [],
    };
}

// yNSSnbrpacodQTzUEcdEVA is seeded via a REAL conditional PUT
// (never a raw db.workOrders.put), so it carries a genuine
// head: every claim reads and latches the work order's head.
// A raw row poke has no real-world analog.
async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA', {
            display_id: 'abcd',
            flow_graph: graphJson(),
            position: 1,
        },
        DEV_TOKEN,
        operationIdHeader([['If-None-Match', '*']]));
    return db;
}

// The claim events the version chain recorded. Releases ride
// DELETE organizations/:id/work-orders/:id/claim.
function claimEventsFor(
    db: MemoryDbAdapter,
): Promise<StateEntity[]> {
    return workOrderLifecycleStatesFor(
        db, STARK_ORGANIZATION, 'yNSSnbrpacodQTzUEcdEVA',
    );
}

// Fresh caller-minted body for tests that don't assert
// specific ids — just need a well-formed request.
function freshClaimBody() {
    const expireAt = nowUtc();
    const claimAt = nowUtc();
    return {
        claimEventId: generateIdentifier(),
        claimAt,
        expireEventId: generateIdentifier(),
        expireAt,
    };
}

Deno.test('a fresh claim appends one claimed event', async () => {
    const db = await seededDb();
    await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA/claim',
        freshClaimBody(), DEV_TOKEN,
        await latched(db));
    const events = await claimEventsFor(db);
    assertStrictEquals(events.length, 1);
    assertStrictEquals(events[0]!.state, 'claimed');
    assertStrictEquals(events[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
});

Deno.test(
    'a repeat claim by the holder is an idempotent no-op',
    async () => {
        const db = await seededDb();
        const body = freshClaimBody();
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim',
            body, DEV_TOKEN,
            await latched(db));
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim',
            body, DEV_TOKEN,
            await latched(db));
        const events = await claimEventsFor(db);
        assertStrictEquals(events.length, 1);
        assertStrictEquals(events[0]!.state, 'claimed');
    },
);

Deno.test(
    'a live claim by another member is a 409',
    async () => {
        const db = await seededDb();
        // A live claim by 'other' — via a REAL claim POST, not
        // a raw row poke: the gate's own decision read now
        // sources the message plane (Phase 14 Task 4), which a
        // row-only write leaves no trace in.
        await seedOrganizationMember(db, OTHER);
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim',
            freshClaimBody(), await devToken(OTHER),
            await latched(db));
        const foreignClaim = await latched(db);
        const err = await assertRejects(
            () => PUT(
                db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                    + 'yNSSnbrpacodQTzUEcdEVA/claim',
                freshClaimBody(), DEV_TOKEN,
                foreignClaim),
        ) as RequestError;
        assertInstanceOf(err, RequestError);
        assertStrictEquals(err.status, 409);
        const events = await claimEventsFor(db);
        assertStrictEquals(events.length, 1);
        assertStrictEquals(events[0]!.member_id, OTHER);
    },
);

Deno.test(
    'an expired claim is superseded atomically',
    async () => {
        const db = await seededDb();
        // A stale 'claimed' by 'other' — old enough to have
        // expired relative to lockTimeout — via a REAL claim
        // POST with a caller-minted past claimAt (see the test
        // above for why a raw row poke no longer reaches the
        // gate).
        await seedOrganizationMember(db, OTHER);
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim', {
                claimEventId: generateIdentifier(),
                claimAt: '2020-01-01T00:00:00.000000Z',
                expireEventId: generateIdentifier(),
                expireAt: '2020-01-01T00:00:00.000000Z',
            },
            await devToken(OTHER),
            await latched(db));
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim',
            freshClaimBody(), DEV_TOKEN,
            await latched(db));
        const events = await claimEventsFor(db);
        assertEquals(
            events.map(ev => ev.state),
            ['claimed', 'claim_expired', 'claimed'],
        );
        // claim_expired names the PRIOR claimant; the new
        // claimed names the caller.
        assertStrictEquals(events[1]!.member_id, OTHER);
        assertStrictEquals(events[2]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
    },
);

Deno.test(
    'a released claim allows a fresh claim',
    async () => {
        const db = await seededDb();
        // A live claim by 'other', released via the SAME
        // DELETE organizations/:id/work-orders/:id/claim path the live
        // deleteWorkOrderClaim adapter uses (workbox's
        // "release claim" action) — never a raw row poke, so
        // the release lands on the head the next claim reads.
        // This is the hazard-closure scenario itself, driven
        // through postWorkOrderClaimOp end to end.
        await seedOrganizationMember(db, OTHER);
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim',
            freshClaimBody(), await devToken(OTHER),
            await latched(db));
        await DELETE(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim',
            await devToken(OTHER),
            await latched(db));
        // 'XXZruirZyAOoRpNxaDnpSA's fresh claim succeeds THROUGH THE LIVE
        // GATE — a foreign live claim would 409 here (see the
        // sibling test above), so success alone proves the
        // release was seen.
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim',
            freshClaimBody(), DEV_TOKEN,
            await latched(db));
        const events = await claimEventsFor(db);
        assertEquals(
            events.map(ev => ev.state),
            ['claimed', 'claim_released', 'claimed'],
        );
        assertStrictEquals(events[0]!.member_id, OTHER);
        assertStrictEquals(events[2]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
    },
);

Deno.test(
    'claim stamps the caller-minted claimed id + at',
    async () => {
        const db = await seededDb();
        const claimEventId = generateIdentifier();
        // far-future at avoids lock-timeout expiry in the
        // test; we want a live claim to assert the exact id.
        const claimAt = '2099-01-01T00:00:01.000000Z';
        const expireEventId = generateIdentifier();
        const expireAt = '2099-01-01T00:00:00.000000Z';
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim', {
                claimEventId,
                claimAt,
                expireEventId,
                expireAt,
            },
            DEV_TOKEN,
            await latched(db));
        const events = await claimEventsFor(db);
        assertStrictEquals(events.length, 1);
        const ev = events[0]!;
        assertStrictEquals(ev.id, claimEventId);
        assertStrictEquals(ev.at, claimAt);
        assertStrictEquals(ev.state, 'claimed');
    },
);

Deno.test(
    'claim over a stale prior consumes the expire pair',
    async () => {
        const db = await seededDb();
        // A stale 'claimed' by 'prior-holder' — old enough to
        // have expired relative to lockTimeout — via a REAL
        // claim POST (see the expired-claim test above for why
        // a raw row poke no longer reaches the gate).
        await seedOrganizationMember(db, PRIOR_HOLDER);
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim', {
                claimEventId: generateIdentifier(),
                claimAt: '2020-01-01T00:00:00.000000Z',
                expireEventId: generateIdentifier(),
                expireAt: '2020-01-01T00:00:00.000000Z',
            },
            await devToken(PRIOR_HOLDER),
            await latched(db));
        const claimEventId = generateIdentifier();
        const claimAt = '2099-01-01T00:00:01.000000Z';
        const expireEventId = generateIdentifier();
        // far-future expireAt; ordering: expireAt < claimAt.
        const expireAt = '2099-01-01T00:00:00.000000Z';
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim', {
                claimEventId,
                claimAt,
                expireEventId,
                expireAt,
            },
            DEV_TOKEN,
            await latched(db));
        const events = await claimEventsFor(db);
        // prior seeded event + expire + new claim = 3.
        assertStrictEquals(events.length, 3);
        const expireEv = events[1]!;
        assertStrictEquals(expireEv.id, expireEventId);
        assertStrictEquals(expireEv.at, expireAt);
        assertStrictEquals(expireEv.state, 'claim_expired');
        // Author of expire = prior claimant, not the caller.
        assertStrictEquals(expireEv.member_id, PRIOR_HOLDER);
        const claimEv = events[2]!;
        assertStrictEquals(claimEv.id, claimEventId);
        assertStrictEquals(claimEv.at, claimAt);
        assertStrictEquals(claimEv.state, 'claimed');
    },
);

// Two members read the same head and claim. The first lands
// (200); the second names the head the first replaced, so
// the statement refuses it (412) and one claimed event
// stands. Sequenced, so the pin cannot flake.
Deno.test(
    'two-actor contention: the second claim on a stale tag'
    + ' is 412 and exactly one claimed event lands',
    async () => {
        const db = await seededDb();
        await seedOrganizationMember(db, OTHER);
        const tokenOther = await devToken(OTHER);
        const tag = { 'If-Match': '"' + await headTag(db) + '"' };
        const a = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim',
            DEV_TOKEN, freshClaimBody(), tag,
        ));
        assertStrictEquals(a.status, 200);
        await a.body?.cancel();
        const b = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim',
            tokenOther, freshClaimBody(), tag,
        ));
        assertStrictEquals(b.status, 412);
        await b.body?.cancel();
        const events = await claimEventsFor(db);
        assertStrictEquals(
            events.filter((ev) => ev.state === 'claimed').length,
            1,
        );
    },
);

// Phase 15 Task 2 Author gate 4 — pass-first pin on the OLD
// workOrders.getById path: a claim against a work order that
// does not exist must map to the SAME EntityNotFoundError
// bytes the store already emits. Held unchanged through the
// document-head re-anchor (null head → same throw).
Deno.test(
    'claim on a nonexistent work order is a byte-exact 404',
    async () => {
        const db = await seededDb();
        const missingId = 'oYnbiWXzroVnyolOhmkBIQ';
        const response = await handleRequest(db, req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + missingId + '/claim',
            DEV_TOKEN,
            freshClaimBody(),
            { 'If-Match': '"' + generateIdentifier() + '"' },
        ));
        assertStrictEquals(response.status, 404);
        assertEquals(
            await response.json(),
            {
                error:
                    'Not found: work_orders/' + missingId,
            },
        );
    },
);

Deno.test('GET claim is not a route', async () => {
    const db = await seededDb();
    const res = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA/claim', DEV_TOKEN,
    ));
    assertStrictEquals(res.status, 405);
    await res.body?.cancel();
});

Deno.test('the work order carries a live claim\'s facts',
async () => {
    const db = await seededDb();
    const expiresAt = '2099-12-31T00:00:00.000000Z';
    await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA/claim', {
            ...freshClaimBody(),
            expires_at: expiresAt,
        }, DEV_TOKEN,
        await latched(db));
    const head = await GET<{
        claim: { member_id: string; expires_at: string };
    }>(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA',
        DEV_TOKEN, operationIdHeader(),
    );
    assertEquals(
        {
            member_id: head.body().toValue().claim.member_id,
            expires_at: head.body().toValue().claim.expires_at,
        },
        {
            member_id: 'XXZruirZyAOoRpNxaDnpSA',
            expires_at: expiresAt,
        },
    );
});

Deno.test('DELETE claim releases; the work order carries no claim',
async () => {
    const db = await seededDb();
    await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA/claim',
        freshClaimBody(), DEV_TOKEN,
        await latched(db));
    const del = await handleRequest(db, req(
        'DELETE', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA/claim', DEV_TOKEN,
        undefined, { 'If-Match': '"' + await headTag(db) + '"' },
    ));
    assertStrictEquals(del.status, 200);
    await del.body?.cancel();
    const head = await GET<Record<string, unknown>>(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA',
        DEV_TOKEN, operationIdHeader(),
    );
    assertStrictEquals(Object.hasOwn(head.body().toValue(), 'claim'), false);
});


const CLAIM_PATH = '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
    + 'yNSSnbrpacodQTzUEcdEVA/claim';

Deno.test('a claim without If-Match is 428', async () => {
    const db = await seededDb();
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, req(
        'PUT', CLAIM_PATH, DEV_TOKEN, freshClaimBody(),
    ));
    assertStrictEquals(res.status, 428);
    await res.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

Deno.test('a claim lands one version', async () => {
    const db = await seededDb();
    const body = freshClaimBody();
    const res = await handleRequest(db, req(
        'PUT', CLAIM_PATH, DEV_TOKEN, body,
        { 'If-Match': '"' + await headTag(db) + '"' },
    ));
    assertStrictEquals(res.status, 200);
    const version = await res.json() as {
        claim: { member_id: string; at: string };
        events: { id: string; state: string }[];
    };
    assertStrictEquals(
        version.claim.member_id, 'XXZruirZyAOoRpNxaDnpSA',
    );
    assertStrictEquals(version.claim.at, body.claimAt);
    assertEquals(
        version.events.map((event) => [event.id, event.state]),
        [[body.claimEventId, 'claimed']],
    );
    assertStrictEquals(await headTag(db), pairIdOf(res));
});

// Decision 11: a PUT equal to the head stores nothing, so an
// operation holding the head's tag still lands.
Deno.test('a PUT of the claimed head\'s fields answers the'
+ ' head', async () => {
    const db = await seededDb();
    await PUT(
        db, CLAIM_PATH.slice(1), freshClaimBody(), DEV_TOKEN,
        await latched(db),
    );
    const tag = await headTag(db);
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA',
        DEV_TOKEN,
        { display_id: 'abcd', flow_graph: graphJson(), position: 1 },
        { 'If-Match': '"' + tag + '"' },
    ));
    assertStrictEquals(res.status, 200);
    assertStrictEquals(pairIdOf(res), tag);
    await res.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
    const claim = await handleRequest(db, req(
        'PUT', CLAIM_PATH, DEV_TOKEN, freshClaimBody(),
        { 'If-Match': '"' + tag + '"' },
    ));
    assertStrictEquals(claim.status, 200);
    await claim.body?.cancel();
    assertStrictEquals(await headTag(db), pairIdOf(claim));
});

Deno.test('a foreign live claim is 409 from the head', async () => {
    const db = await seededDb();
    await seedOrganizationMember(db, OTHER);
    await PUT(
        db, CLAIM_PATH.slice(1), freshClaimBody(),
        await devToken(OTHER), await latched(db),
    );
    const tag = await headTag(db);
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, req(
        'PUT', CLAIM_PATH, DEV_TOKEN, freshClaimBody(),
        { 'If-Match': '"' + tag + '"' },
    ));
    assertStrictEquals(res.status, 409);
    assertEquals(
        await res.json(),
        { error: 'work order is already claimed' },
    );
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
    assertStrictEquals(await headTag(db), tag);
});

Deno.test(
    'a claim over a lapsed claim records its expiry',
    async () => {
        const db = await seededDb();
        await seedOrganizationMember(db, PRIOR_HOLDER);
        await PUT(
            db, CLAIM_PATH.slice(1), freshClaimBody(),
            await devToken(PRIOR_HOLDER), await latched(db),
        );
        const tag = await headTag(db);
        const pastExpiry = Date.now()
            + (LOCK_TIMEOUT_SECONDS + 1) * 1000;
        setClockForTest(() => pastExpiry);
        try {
            const body = freshClaimBody();
            const res = await handleRequest(db, req(
                'PUT', CLAIM_PATH, DEV_TOKEN, body,
                { 'If-Match': '"' + tag + '"' },
            ));
            assertStrictEquals(res.status, 200);
            const version = await res.json() as {
                events: {
                    id: string;
                    state: string;
                    member_id: string;
                }[];
            };
            assertEquals(
                version.events.map((event) => [
                    event.id, event.state, event.member_id,
                ]),
                [
                    [
                        body.expireEventId, 'claim_expired',
                        PRIOR_HOLDER,
                    ],
                    [
                        body.claimEventId, 'claimed',
                        'XXZruirZyAOoRpNxaDnpSA',
                    ],
                ],
            );
        } finally {
            resetClock();
        }
    },
);
