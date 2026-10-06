import { assertEquals, assertStrictEquals } from '@std/assert';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { fromFileUrl, join, relative } from '@std/path';
import { handleRequest } from '../api/api.ts';
import { GET } from './in-page-facade.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import {
    postSeedWorkOrderTransitionOp,
} from '../api/routes.ts';
import {
    formWriteMessagePair,
} from '../api/message-pair.ts';
import {
    nowUtc,
    SYSTEM_MEMBER_ID,
    DEFAULT_LOCK_TIMEOUT,
} from '../shared/types.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';
import { getWorkOrderEvents } from
    './fixtures/work-order-events.ts';
import {
    apiRequest,
} from './http-fixtures.ts';
import { operationIdHeader } from
    './operation-id-header.ts';
import { seedCreatedWorkOrder } from
    './work-order-fixtures.ts';


// Task 8 CUT — hard-cut at the gate for the legacy
// fieldValues transition wire. Spec W2 / plan Task 8:
// POST with the fieldValues key → 400; the below-facade
// postSeedWorkOrderTransitionOp stays dual-tolerant for the
// seed's 569 pure moves.
// Gate-path rejection lives ONLY in the dispatch arrow.

const ORGANIZATION = STARK_ORGANIZATION;
const WO_ID = generateIdentifier();
const NODE_NEXT = generateIdentifier();
const FLOW_ID = generateIdentifier();
const CREATE_NODE = generateIdentifier();
const FIELD_VALUE_ID = generateIdentifier();
const INSTANCE_ID = generateIdentifier();
const TRANSITION_EVENT_ID = generateIdentifier();
const TRANSITION =
    '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + WO_ID
        + '/transition';
const TRANSITION_PATTERN = 'organizations/:id/work-orders/:id/transition';
const RETIRED_MESSAGE =
    'WorkOrderTransitionBody.fieldValues'
    + ' is retired: send set/clear against'
    + ' the bound instance';

const repoRoot = fromFileUrl(
    new URL('..', import.meta.url),
);

// NAMED exceptions for the G7 /fieldValues/ source sweep.
// Plan lists the dual-accept / stored-data tier; routes is
// the gate-path retirement reject (this task); web-app
// history entry shape is fold presentation, not the wire.
const NAMED_EXCEPTIONS: ReadonlySet<string> = new Set([
    'api/validators.ts',
    'api/mock-data/seed-message-pairs.ts',
    'api/routes.ts',
    'client/work-orders-queries.ts',
    'web-app/app/presenters/workbox-detail.ts',
]);

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
async function workOrderTag(
    db: MemoryDbAdapter,
): Promise<Record<string, string>> {
    const read = await GET(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + WO_ID,
        DEV_TOKEN, operationIdHeader(),
    );
    return { 'If-Match': read.query('header.etag').toText() };
}

function graphJson(): Record<string, unknown> {
    return {
        name: 'Legacy Cut Flow',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [],
        edges: [],
    };
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await seedCreatedWorkOrder(db, {
        organization: ORGANIZATION,
        id: WO_ID,
        fields: {
            display_id: 'cut1',
            flow_graph: graphJson(),
            position: 1,
        },
        flowId: FLOW_ID,
        births: [CREATE_NODE, CREATE_NODE],
        at: nowUtc(),
        token: DEV_TOKEN,
        claim: 'released',
    });
    return db;
}

function legacyBody(
    extras: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        transitionEventId: TRANSITION_EVENT_ID,
        targetState: NODE_NEXT,
        fieldValues: [],
        release: null,
        transitionAt: nowUtc(),
        ...extras,
    };
}

function walkTs(dir: string): string[] {
    const out: string[] = [];
    for (const entry of Deno.readDirSync(dir)) {
        const full = join(dir, entry.name);
        if (entry.isDirectory) {
            out.push(...walkTs(full));
        } else if (entry.name.endsWith('.ts')) {
            out.push(full);
        }
    }
    return out;
}

Deno.test('gate POST with fieldValues: [] → 400 retired',
async () => {
    const db = await seededDb();
    const res = await handleRequest(
        db,
        req(
            'POST', TRANSITION, DEV_TOKEN, legacyBody(),
            await workOrderTag(db),
        ),
    );
    assertStrictEquals(res.status, 400);
    const err = await res.json() as { error: string };
    assertStrictEquals(err.error, RETIRED_MESSAGE);
    const events = await getWorkOrderEvents(
        db, DEV_TOKEN, ORGANIZATION, WO_ID,
    );
    // The three births and the release; the 400 adds none.
    assertStrictEquals(events.length, 4);
});

Deno.test('gate POST with fieldValues bag AND set → 400',
async () => {
    const db = await seededDb();
    const res = await handleRequest(
        db,
        req(
            'POST',
            TRANSITION,
            DEV_TOKEN,
            legacyBody({
                fieldValues: [{
                    id: FIELD_VALUE_ID,
                    fields: {
                        state_event_id: TRANSITION_EVENT_ID,
                        attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
                        value: 'high',
                    },
                }],
                set: [{
                    attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
                    value: 'high',
                }],
                instance_id: INSTANCE_ID,
                record_type_id: 'sjWcXwYGlgxxJOHxzMoUow',
            }),
            await workOrderTag(db),
        ),
    );
    assertStrictEquals(res.status, 400);
    const err = await res.json() as { error: string };
    assertStrictEquals(err.error, RETIRED_MESSAGE);
});

Deno.test('below-facade postSeedWorkOrderTransitionOp still'
+ ' appends a legacy body',
async () => {
    const db = await seededDb();
    const body = legacyBody({
        transitionEventId: 'te-seed-legacy',
    });
    const pathSegments = [
        'organizations', ORGANIZATION,
        'work-orders', WO_ID, 'transition',
    ];
    const messagePair = await formWriteMessagePair({
        method: 'POST',
        pathname: '/' + pathSegments.join('/'),
        routePattern: TRANSITION_PATTERN,
        routeSegments: TRANSITION_PATTERN.split('/'),
        pathSegments,
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization: ORGANIZATION,
        responseBody: undefined,
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await postSeedWorkOrderTransitionOp(
        db,
        ORGANIZATION,
        WO_ID,
        body,
        SYSTEM_MEMBER_ID,
        messagePair,
    );
    // Below-facade appends the pair; lifecycle derives from
    // the stored body (seed tier dual-tolerant).
    const requests = await db.messagePairs.getAll();
    const hit = requests.some((r) => r.id === messagePair.id);
    assertStrictEquals(hit, true);
});

// G7 source sweep (pair-write-coverage sourceText idiom):
// /fieldValues/ hits under api/ + web-app/app/ equal the
// named exception list — no silent dual-SoT producer.
Deno.test('G7: fieldValues hits equal named exceptions',
() => {
    const hits = new Set<string>();
    for (const root of [
        join(repoRoot, 'api'),
        join(repoRoot, 'web-app', 'app'),
        join(repoRoot, 'client'),
        join(repoRoot, 'shared'),
    ]) {
        for (const full of walkTs(root)) {
            const text = Deno.readTextFileSync(full);
            if (/fieldValues/.test(text)) {
                hits.add(relative(repoRoot, full));
            }
        }
    }
    assertEquals(
        [...hits].sort(),
        [...NAMED_EXCEPTIONS].sort(),
        'unexpected fieldValues hit files: '
        + [...hits]
            .filter((p) => !NAMED_EXCEPTIONS.has(p))
            .sort()
            .join(', '),
    );
});
