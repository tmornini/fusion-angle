import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    PUT,
    DELETE,
    RequestError,
    handleRequest,
} from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';
import { nowUtc } from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import {
    generateIdentifier,
} from '../shared/identifier.ts';

const OTHER = generateIdentifier();
const PRIOR_HOLDER = generateIdentifier();
const STALE = generateIdentifier();
import { workOrderClaimHistoryFor } from
    '../api/derive-states.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';

const BASE = 'http://localhost';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

// PUT organizations/:id/work-orders/:id/claim decides and appends in ONE
// transaction: a live foreign claim is a 409, a live own
// claim an idempotent no-op, an expired claim is superseded
// by 'claim_expired' + 'claimed' atomically. GET returns
// claim facts; 404 only when unclaimed. DELETE releases.

const LOCK_TIMEOUT_SECONDS = 300;

function graphJson(): Record<string, unknown> {
    return {
        name: 'Flow One',
        lockTimeout: LOCK_TIMEOUT_SECONDS,
        nodes: [],
        edges: [],
    };
}

// yNSSnbrpacodQTzUEcdEVA is seeded via a REAL PUT (never a raw
// db.workOrders.put)
// so it carries a genuine organizations/:id/work-orders/:id document pair —
// Phase 14 Task 4's flip needs one: applyClaimPair's
// lockTimeoutAsOf requires a document head before ANY claim
// pair (api/derive-states.ts), an invariant every real work
// order satisfies (postWorkOrderCreationOp always synthesizes
// one beside the create; every seeded work order gets its own,
// api/mock-data/seed-message-pairs.ts's Phase 5 Task 4). A raw
// row poke has no real-world analog, so it stopped being a
// faithful fixture once the gate started reading the pair
// plane.
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
    );
    return db;
}

// workOrderClaimHistoryFor is the claim gate's sole source
// (create/claim/transition/release pairs). Releases ride
// DELETE organizations/:id/work-orders/:id/claim (states/:id retired).
function claimEventsFor(
    db: MemoryDbAdapter,
): Promise<{ state: string; member_id: string }[]> {
    return workOrderClaimHistoryFor(
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

test('a fresh claim appends one claimed event', async () => {
    const db = await seededDb();
    await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA/claim',
        freshClaimBody(), DEV_TOKEN,
    );
    const events = await claimEventsFor(db);
    assert.equal(events.length, 1);
    assert.equal(events[0]!.state, 'claimed');
    assert.equal(events[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
});

test(
    'a repeat claim by the holder is an idempotent no-op',
    async () => {
        const db = await seededDb();
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim',
            freshClaimBody(), DEV_TOKEN,
        );
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim',
            freshClaimBody(), DEV_TOKEN,
        );
        const events = await claimEventsFor(db);
        assert.equal(events.length, 1);
        assert.equal(events[0]!.state, 'claimed');
    },
);

test(
    'a live claim by another member is a 409',
    async () => {
        const db = await seededDb();
        // A live claim by 'other' — via a REAL claim POST, not
        // a raw row poke: the gate's own decision read now
        // sources the pair plane (Phase 14 Task 4), which a
        // row-only write leaves no trace in.
        await seedOrganizationMember(db, OTHER);
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim',
            freshClaimBody(), await devToken(OTHER),
        );
        await assert.rejects(
            () => PUT(
                db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                    + 'yNSSnbrpacodQTzUEcdEVA/claim',
                freshClaimBody(), DEV_TOKEN,
            ),
            (err: unknown) =>
                err instanceof RequestError
                && err.status === 409,
        );
        const events = await claimEventsFor(db);
        assert.equal(events.length, 1);
        assert.equal(events[0]!.member_id, OTHER);
    },
);

test(
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
        );
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim',
            freshClaimBody(), DEV_TOKEN,
        );
        const events = await claimEventsFor(db);
        assert.deepEqual(
            events.map(ev => ev.state),
            ['claimed', 'claim_expired', 'claimed'],
        );
        // claim_expired names the PRIOR claimant; the new
        // claimed names the caller.
        assert.equal(events[1]!.member_id, OTHER);
        assert.equal(events[2]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
    },
);

test(
    'a released claim allows a fresh claim',
    async () => {
        const db = await seededDb();
        // A live claim by 'other', released via the SAME
        // DELETE organizations/:id/work-orders/:id/claim address the live
        // deleteWorkOrderClaim adapter uses (workbox's
        // "release claim" action) — never a raw row poke, so
        // the release is visible to the flipped gate's own
        // pair-plane read (workOrderClaimHistoryFor). This is
        // the hazard-closure scenario itself, driven through
        // postWorkOrderClaimOp end to end, not just at the
        // derive layer.
        await seedOrganizationMember(db, OTHER);
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim',
            freshClaimBody(), await devToken(OTHER),
        );
        await DELETE(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim',
            await devToken(OTHER),
        );
        // 'XXZruirZyAOoRpNxaDnpSA's fresh claim succeeds THROUGH THE LIVE
        // GATE — a foreign live claim would 409 here (see the
        // sibling test above), so success alone proves the
        // release was seen.
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim',
            freshClaimBody(), DEV_TOKEN,
        );
        const events = await claimEventsFor(db);
        assert.deepEqual(
            events.map(ev => ev.state),
            ['claimed', 'claim_released', 'claimed'],
        );
        assert.equal(events[0]!.member_id, OTHER);
        assert.equal(events[2]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
    },
);

test(
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
        );
        const events = await claimEventsFor(db);
        assert.equal(events.length, 1);
        const ev = events[0]!;
        assert.equal(ev.id, claimEventId);
        assert.equal(ev.at, claimAt);
        assert.equal(ev.state, 'claimed');
    },
);

test(
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
        );
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
        );
        const events = await claimEventsFor(db);
        // prior seeded event + expire + new claim = 3.
        assert.equal(events.length, 3);
        const expireEv = events[1]!;
        assert.equal(expireEv.id, expireEventId);
        assert.equal(expireEv.at, expireAt);
        assert.equal(expireEv.state, 'claim_expired');
        // Author of expire = prior claimant, not the caller.
        assert.equal(expireEv.member_id, PRIOR_HOLDER);
        const claimEv = events[2]!;
        assert.equal(claimEv.id, claimEventId);
        assert.equal(claimEv.at, claimAt);
        assert.equal(claimEv.state, 'claimed');
    },
);

// The codebase's FIRST genuine two-actor contention pin (Phase
// 14 Task 4 mandate — every prior "race" test in this suite is
// sequential). Structural assertions ONLY: exactly one 'claimed'
// event lands, and exactly one of the two responses carries the
// byte-exact 409 body — never which actor wins, never a timing
// margin. MemoryDbAdapter serializes whole transaction bodies
// (api/store-serializer.ts's promise-chain tail), so this cannot
// exercise a genuinely interleaved read-then-write — the SAME
// atomicity that makes the gate correct also makes the two
// transaction bodies here run one fully before the other starts.
// It still proves the invariant under Promise.all-driven
// concurrent DISPATCH (two requests in flight at once, racing to
// enqueue), and pins the SAME atomicity: were the gate ever
// changed to read its prior-claim decision outside the
// transaction (or to await a non-row-op mid-transaction —
// AGENTS.md § Transaction bodies await only row ops), this
// test would catch the
// regression even though it cannot force a live interleaving
// today. Pass-first on the OLD (row-plane) path; held unchanged
// through the pair-plane flip.
test(
    'two-actor contention: exactly one claimed event lands and'
    + ' exactly one request gets the byte-exact 409 body — never'
    + ' which actor wins',
    async () => {
        const db = await seededDb();
        await seedOrganizationMember(db, OTHER);
        const tokenOther = await devToken(OTHER);
        const [a, b] = await Promise.all([
            handleRequest(db, req(
                'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                    + 'yNSSnbrpacodQTzUEcdEVA/claim',
                DEV_TOKEN, freshClaimBody(),
            )),
            handleRequest(db, req(
                'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                    + 'yNSSnbrpacodQTzUEcdEVA/claim',
                tokenOther, freshClaimBody(),
            )),
        ]);
        assert.deepEqual([a.status, b.status].sort(), [201, 409]);
        const loser = a.status === 409 ? a : b;
        assert.deepEqual(
            await loser.json(),
            { error: 'work order is already claimed' },
        );
        const events = await claimEventsFor(db);
        assert.equal(
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
test(
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
        ));
        assert.equal(response.status, 404);
        assert.deepEqual(
            await response.json(),
            {
                error:
                    'Not found: work_orders/' + missingId,
            },
        );
    },
);

test('GET claim 404s when unclaimed', async () => {
    const db = await seededDb();
    const res = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA/claim', DEV_TOKEN,
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error: 'Not found: work_order_claims/yNSSnbrpacodQTzUEcdEVA',
    });
});

test('GET claim returns facts; expired is still a row',
async () => {
    const db = await seededDb();
    const expiresAt = '2099-12-31T00:00:00.000000Z';
    await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA/claim', {
            ...freshClaimBody(),
            expires_at: expiresAt,
        }, DEV_TOKEN,
    );
    const live = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA/claim', DEV_TOKEN,
    ));
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), {
        member_id: 'XXZruirZyAOoRpNxaDnpSA',
        expires_at: expiresAt,
    });

    await seedOrganizationMember(db, STALE);
    await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNXXsTEwShOozlQCEWKIIw', {
            display_id: 'efgh',
            flow_graph: graphJson(),
            position: 2,
        },
        DEV_TOKEN,
    );
    await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNXXsTEwShOozlQCEWKIIw/claim', {
            claimEventId: generateIdentifier(),
            claimAt: '2020-01-01T00:00:00.000000Z',
            expireEventId: generateIdentifier(),
            expireAt: '2020-01-01T00:00:00.000000Z',
            expires_at: '2020-01-01T00:05:00.000000Z',
        },
        await devToken(STALE),
    );
    const expired = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNXXsTEwShOozlQCEWKIIw/claim', DEV_TOKEN,
    ));
    assert.equal(expired.status, 200);
    const body = await expired.json() as {
        member_id: string;
        expires_at: string;
    };
    assert.equal(body.member_id, STALE);
    assert.equal(
        body.expires_at, '2020-01-01T00:05:00.000000Z',
    );
});

test('DELETE claim releases; GET then 404s', async () => {
    const db = await seededDb();
    await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA/claim',
        freshClaimBody(), DEV_TOKEN,
    );
    const del = await handleRequest(db, req(
        'DELETE', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA/claim', DEV_TOKEN,
    ));
    assert.equal(del.status, 204);
    const get = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA/claim', DEV_TOKEN,
    ));
    assert.equal(get.status, 404);
});

