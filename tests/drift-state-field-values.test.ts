import { assert, assertEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { PUT } from './in-page-facade.ts';
import { DEV_TOKEN, organizationToken } from
    './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import {
    compareIdentifiers,
    generateIdentifier,
} from '../shared/identifier.ts';
import {
    nowUtc,
    SYSTEM_MEMBER_ID,
} from '../shared/types.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';
import {
    postSeedWorkOrderTransitionOp,
} from '../api/routes.ts';
import {
    formWriteMessagePair,
} from '../api/message-pair.ts';
import { operationIdHeader } from
    './operation-id-header.ts';
import { seedCreatedWorkOrder } from
    './work-order-fixtures.ts';
import { getWorkOrderEvents } from
    './fixtures/work-order-events.ts';


const N_NEXT = generateIdentifier();
const N_CREATE = generateIdentifier();
const FLOW_ID = generateIdentifier();
const TE_LEX = generateIdentifier();
const FV_Z = generateIdentifier();
const FV_A = generateIdentifier();
const FV_M = generateIdentifier();

// Phase Final Task 2: state_field_values dual-write stripped.
// This file no longer compares derive vs row-plane oracles —
// the SFV table is empty after live transitions. Coverage
// re-homes to message-plane derive + wire-byte handleRequest
// assertions. Leaf PUT/DELETE routes retired Phase 15 Task 7;
// GET states/:id/field-values retired (states-URI elimination
// C4) — product reads carry field values on work-order
// events. Task 8 CUT: legacy fieldValues appends stay
// BELOW the gate. RESTRICT no longer reads this fold at
// all — Task 6 (spec § 4) re-anchors the census on live
// instance heads (deriveInstanceCollection).

const LOCK_TIMEOUT_SECONDS = 300;
const TRANSITION_PATTERN = 'organizations/:id/work-orders/:id/transition';

function graphJson(): Record<string, unknown> {
    return {
        name: 'Flow One',
        lockTimeout: LOCK_TIMEOUT_SECONDS,
        nodes: [], edges: [],
    };
}

// Seed via the live create so the WO carries its pairs.
async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await seedCreatedWorkOrder(db, {
        organization: STARK_ORGANIZATION,
        id: 'yNSSnbrpacodQTzUEcdEVA',
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
    // Phase Final Stage B: record_attributes retired.
    await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rbfHGatkwQzGZJVXKJEeyw', {
            name: 'Parent', description: '', position: 0,
            state: 'active',
        },
        DEV_TOKEN,
        operationIdHeader());
    await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rbfHGatkwQzGZJVXKJEeyw'
        + '/attributes/VPckAwjJsTGCEkKaOOGRGw', {
            name: 'Severity', attribute_type: 'text',
            sort_order: 0, options: [], constraints: [],
            read_roles: ['member', 'admin'],
            write_roles: ['member', 'admin'],
        },
        DEV_TOKEN,
        operationIdHeader());
    return db;
}

// Task 8: below-facade legacy append — SFV census pins
// stored fold shape, not the retired live wire.
async function appendLegacyTransition(
    db: MemoryDbAdapter,
    body: Record<string, unknown>,
): Promise<void> {
    const pathSegments = [
        'organizations', STARK_ORGANIZATION,
        'work-orders', 'yNSSnbrpacodQTzUEcdEVA', 'transition',
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
        organization: STARK_ORGANIZATION,
        responseBody: undefined,
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await postSeedWorkOrderTransitionOp(
        db, STARK_ORGANIZATION, 'yNSSnbrpacodQTzUEcdEVA', body,
        SYSTEM_MEMBER_ID, messagePair,
    );
}

// Non-lex field-value ids so collection order is not
// insertion order (byIdAscending craftsmanship).
Deno.test('work-order events field_values are identifier-'
+ 'ordered after non-lex transition fold', async () => {
    const db = await seededDb();
    await appendLegacyTransition(db, {
        transitionEventId: TE_LEX,
        targetState: N_NEXT,
        fieldValues: [
            {
                id: FV_Z,
                fields: {
                    state_event_id: TE_LEX,
                    attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
                    value: 'z',
                },
            },
            {
                id: FV_A,
                fields: {
                    state_event_id: TE_LEX,
                    attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
                    value: 'a',
                },
            },
            {
                id: FV_M,
                fields: {
                    state_event_id: TE_LEX,
                    attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
                    value: 'm',
                },
            },
        ],
        release: null,
        transitionAt: nowUtc(),
    });
    const token = await organizationToken();
    const list = await getWorkOrderEvents(
        db, token, STARK_ORGANIZATION, 'yNSSnbrpacodQTzUEcdEVA',
    );
    const transition = list.find((row) => row.id === TE_LEX);
    assert(transition !== undefined);
    assertEquals(
        transition!.field_values.map(r => r.id),
        [FV_A, FV_M, FV_Z].sort(compareIdentifiers),
    );
});
