import {
    assert,
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { GET, PUT } from './in-page-facade.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';
import { nowUtc } from '../shared/types.ts';
import {
    apiRequest,
    pairIdOf,
} from './http-fixtures.ts';
import {
    generateIdentifier,
} from '../shared/identifier.ts';

const OTHER = generateIdentifier();
const FLOW_ID = generateIdentifier();
const N_CREATE = generateIdentifier();
import { getWorkOrderEvents } from
    './fixtures/work-order-events.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';
import { operationIdHeader } from
    './operation-id-header.ts';
import { seedCreatedWorkOrder } from
    './work-order-fixtures.ts';


const WO_ID = 'yNSSnbrpacodQTzUEcdEVA';

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
    workOrderId = WO_ID,
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

async function ifMatch(
    db: MemoryDbAdapter,
): Promise<Record<string, string>> {
    return { 'If-Match': '"' + await headTag(db) + '"' };
}

async function latched(
    db: MemoryDbAdapter,
): Promise<readonly (readonly [string, string])[]> {
    return operationIdHeader(Object.entries(await ifMatch(db)));
}

const LOCK_TIMEOUT_SECONDS = 300;

function graphJson(): Record<string, unknown> {
    return {
        name: 'Flow One',
        lockTimeout: LOCK_TIMEOUT_SECONDS,
        nodes: [],
        edges: [],
    };
}

// yNSSnbrpacodQTzUEcdEVA is seeded through the live create
// (never a raw db.workOrders.put)
// so it carries a genuine organizations/:id/work-orders/:id
// document message pair —
// same fixture posture as api-work-order-claim.test.ts.
async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await seedCreatedWorkOrder(db, {
        organization: STARK_ORGANIZATION,
        id: WO_ID,
        fields: {
            display_id: 'abcd',
            flow_graph: graphJson(),
            position: 1,
        },
        flowId: FLOW_ID,
        births: [N_CREATE, N_CREATE],
        at: nowUtc(),
        token: DEV_TOKEN,
        claim: 'released',
    });
    return db;
}

// The three births and the creator's release come with the
// seeded work order; the claim events are what lands after.
const SEEDED_EVENTS = 4;

async function claimEventsFor(
    db: MemoryDbAdapter,
): Promise<{
    id: string;
    state: string;
    member_id: string;
    at: string;
}[]> {
    const all = await getWorkOrderEvents(
        db, DEV_TOKEN, STARK_ORGANIZATION, WO_ID,
    );
    assertEquals(
        all.slice(0, SEEDED_EVENTS).map((event) => event.state),
        [N_CREATE, N_CREATE, 'claimed', 'claim_released'],
    );
    return all.slice(SEEDED_EVENTS);
}

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

// DELETE organizations/:id/work-orders/:id/claim releases:
// an operation on the work order, answering its state. With
// no live claim it answers the head and stores nothing. An
// unknown work order 404s.

Deno.test(
    'release of a live claim is 200 and the claim history'
    + ' shows claim_released',
    async () => {
        const db = await seededDb();
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + WO_ID
                + '/claim',
            freshClaimBody(), DEV_TOKEN,
            await latched(db));
        const res = await handleRequest(db, req(
            'DELETE',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + WO_ID
                + '/claim',
            DEV_TOKEN,
            undefined, await ifMatch(db),
        ));
        assertStrictEquals(res.status, 200);
        await res.body?.cancel();
        const events = await claimEventsFor(db);
        const released = events.find(
            (ev) => ev.state === 'claim_released',
        );
        assert(released !== undefined);
        assertStrictEquals(released!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
    },
);

Deno.test(
    'DELETE claim with no claim is 200; a second DELETE'
    + ' after release is 200',
    async () => {
        const db = await seededDb();
        const missing = await handleRequest(db, req(
            'DELETE',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + WO_ID
                + '/claim',
            DEV_TOKEN,
            undefined, await ifMatch(db),
        ));
        assertStrictEquals(missing.status, 200);
        await missing.body?.cancel();
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + WO_ID
                + '/claim',
            freshClaimBody(), DEV_TOKEN,
            await latched(db));
        const first = await handleRequest(db, req(
            'DELETE',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + WO_ID
                + '/claim',
            DEV_TOKEN,
            undefined, await ifMatch(db),
        ));
        assertStrictEquals(first.status, 200);
        await first.body?.cancel();
        const second = await handleRequest(db, req(
            'DELETE',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + WO_ID
                + '/claim',
            DEV_TOKEN,
            undefined, await ifMatch(db),
        ));
        assertStrictEquals(second.status, 200);
        await second.body?.cancel();
        const events = await claimEventsFor(db);
        assertStrictEquals(
            events.filter(
                (ev) => ev.state === 'claim_released',
            ).length,
            1,
        );
    },
);

Deno.test(
    'release of another member\'s live claim succeeds'
    + ' (member-tier, today\'s open-release posture)',
    async () => {
        const db = await seededDb();
        await seedOrganizationMember(db, OTHER);
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + WO_ID
                + '/claim',
            freshClaimBody(), await devToken(OTHER),
            await latched(db));
        const res = await handleRequest(db, req(
            'DELETE',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + WO_ID
                + '/claim',
            DEV_TOKEN,
            undefined, await ifMatch(db),
        ));
        assertStrictEquals(res.status, 200);
        await res.body?.cancel();
        // claim_released authored by the releasing actor
        // (current), not the prior claimant (other).
        const events = await claimEventsFor(db);
        const released = events.find(
            (ev) => ev.state === 'claim_released',
        );
        assert(released !== undefined);
        assertStrictEquals(released!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
    },
);

Deno.test(
    'DELETE claim of an unknown work order is 404',
    async () => {
        const db = await seededDb();
        const res = await handleRequest(db, req(
            'DELETE',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'oWslHMRoFMtRnPHtccdMeA/claim',
            DEV_TOKEN,
            undefined,
            { 'If-Match': '"' + generateIdentifier() + '"' },
        ));
        assertStrictEquals(res.status, 404);
    },
);

const CLAIM_PATH = '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
    + WO_ID + '/claim';

Deno.test('a release lands one version', async () => {
    const db = await seededDb();
    await PUT(
        db, CLAIM_PATH.slice(1), freshClaimBody(), DEV_TOKEN,
        await latched(db),
    );
    const res = await handleRequest(db, req(
        'DELETE', CLAIM_PATH, DEV_TOKEN,
        undefined, await ifMatch(db),
    ));
    assertStrictEquals(res.status, 200);
    const version = await res.json() as Record<string, unknown>;
    assertStrictEquals(Object.hasOwn(version, 'claim'), false);
    const deletes = (await db.messagePairs.getCollectionPairs(
        CLAIM_PATH + '/',
    )).filter((pair) => pair.method === 'DELETE');
    // The seed's release of the creator's birth claim, then
    // this one.
    assertStrictEquals(deletes.length, 2);
    assertEquals(
        (version['events'] as { id: string; state: string }[])
            .map((event) => [event.id, event.state]),
        [[deletes[1]!.id, 'claim_released']],
    );
    assertStrictEquals(await headTag(db), pairIdOf(res));
});

Deno.test(
    'a release with no live claim answers the head',
    async () => {
        const db = await seededDb();
        const tag = await headTag(db);
        const before = (await db.messagePairs.getAll()).length;
        const res = await handleRequest(db, req(
            'DELETE', CLAIM_PATH, DEV_TOKEN,
            undefined, { 'If-Match': '"' + tag + '"' },
        ));
        assertStrictEquals(res.status, 200);
        assertStrictEquals(pairIdOf(res), tag);
        await res.body?.cancel();
        assertStrictEquals(
            (await db.messagePairs.getAll()).length, before,
        );
    },
);
