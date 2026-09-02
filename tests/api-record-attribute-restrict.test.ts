import {
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
    assertStringIncludes,
} from '@std/assert';
import { generateIdentifier } from
    '../shared/identifier.ts';
import {
    DELETE,
    GET,
    POST,
    PUT,
    RequestError,
} from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { TABLE_NAMES } from '../api/db.ts';
import type {
    GraphEdge,
} from '../api/types.ts';
import {
    SYSTEM_MEMBER_ID,
} from '../api/types.ts';
import type { AttributeReferrers } from
    '../api/record-attribute-refs.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import {
    postWorkOrderTransitionOp,
} from '../api/routes.ts';
import {
    formWriteMessagePair,
} from '../api/message-pair.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';

// Destroying a record attribute is RESTRICT, not cascade:
// while a state_field_values row names it or a live
// flow-node-attribute relation row binds it, or a
// work-order graph references it, DELETE (and a record-write
// removal) is a 409 naming the referrers, and the whole
// batch rolls back — cascading would orphan immutable
// event payloads.
//
// NAMED re-pin (Phase 15 Task 4): RESTRICT's three graph legs
// are message-plane derived now — a raw
// db.flowNodeAttributes.put / db.workOrders.put leaves no
// graphDelta / work-orders document message pair, so live
// flow and work-order referrers must land through the SAME
// wire-reachable writers the live routes serve.

const TYPE_PATH =
    'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
        + 'rOEPOcVMQdJiiiMuiiEhlg';
const ATTR1_PATH = TYPE_PATH + '/attributes/VXTdVVRluJDRBqbXWZBntA';
const ATTR_PAIR_PATH =
    TYPE_PATH + '/attributes/VQIOxpHjDOwLkDSFuazQVw';
const AT = '2026-06-01T00:00:00.000000Z';
const AT2 = '2026-06-02T00:00:00.000000Z';
const WORK_ORDER_ID = generateIdentifier();
const TRANSITION_EVENT_ID = generateIdentifier();
const FIELD_VALUE_ID = generateIdentifier();
const NODE_1 = generateIdentifier();
const NODE_2 = generateIdentifier();
const NODE_HOST = generateIdentifier();
const NODE_NEXT = generateIdentifier();
const FNA_1 = generateIdentifier();
const FNA_2 = generateIdentifier();
const FLOW_HOST = generateIdentifier();
const PROJECT_ID = generateIdentifier();

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    // Phase Final Stage B: records family retired — seed
    // through live document PUTs so the message plane owns them.
    await PUT(db, TYPE_PATH, {
        name: 'Asset', description: 'd', position: 1,
        state: 'active',
    }, DEV_TOKEN);
    await PUT(db, ATTR1_PATH, {
        name: 'Priority',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
    }, DEV_TOKEN);
    return db;
}

// Seed a live flow with one node bound to `attributeId` via
// the wire-reachable POST /flows graphDelta. Returns after
// the create succeeds so the caller can continue.
async function seedFlowNodeAttribute(
    db: MemoryDbAdapter,
    opts: {
        flowId: string;
        nodeId: string;
        attributeId: string;
        action?: 'added' | 'removed';
        rowId?: string;
        // Extra attributeEvents folded into the same create
        // (e.g. an add then remove chain, or a second node).
        extraAttributeEvents?: readonly Record<
            string, unknown
        >[];
        extraNodes?: readonly Record<string, unknown>[];
    },
): Promise<void> {
    const {
        flowId, nodeId, attributeId,
        action = 'added', rowId = FNA_1,
        extraAttributeEvents = [],
        extraNodes = [],
    } = opts;
    await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/', {
        id: flowId,
        flow: {
            name: 'Intake',
            is_locked: false,
            is_auto_layout: false,
            is_auto_fit: false,
            lock_timeout: 0,
        },
        projectFlowId: generateIdentifier(),
        projectFlow: {
            project_id: PROJECT_ID,
            flow_id: flowId,
            at: AT,
        },
        initialState: 'active',
        initialStateEventId: generateIdentifier(),
        initialStateAt: AT,
        graphDelta: {
            nodes: [
                {
                    id: nodeId, flow_id: flowId,
                    name: 'Step',
                    position_x: 0, position_y: 0,
                    is_create: false, is_archive: false,
                    task_instructions: '', at: AT,
                },
                ...extraNodes,
            ],
            edges: [],
            deletions: [],
            memberEvents: [],
            attributeEvents: [
                {
                    id: rowId,
                    flow_node_id: nodeId,
                    attribute_id: attributeId,
                    mode: 'editable',
                    is_required: false,
                    action,
                    at: AT,
                },
                ...extraAttributeEvents,
            ],
        },
    }, DEV_TOKEN);
}

function workOrderNodeBinding(
    attributeId: string,
): Record<string, unknown> {
    return {
        id: NODE_1, name: 'Step', positionX: 0,
        positionY: 0, isCreate: false,
        isArchive: false, memberIds: [],
        attributes: [{
            attribute_id: attributeId,
            mode: 'editable', isRequired: false,
        }],
        taskInstructions: '',
    };
}

// Author gate 5 (Phase 15 Task 4): attribute bindings cannot
// reach flow edges — GraphEdge has no attributes field and no
// flow_edge_attributes table exists. RESTRICT therefore grows
// NO edges leg; AttributeReferrers names only valueCount /
// flowIds / workOrderIds. Short type-level + unit proof, not
// an edges scan.
Deno.test(
    'prove attribute bindings cannot reach flow edges',
    () => {
        type GraphEdgeHasNoAttributes =
            'attributes' extends keyof GraphEdge
                ? never
                : true;
        const edgeTypeProof: GraphEdgeHasNoAttributes = true;
        assertStrictEquals(edgeTypeProof, true);

        const edgeKeys: readonly (keyof GraphEdge)[] = [
            'id', 'name', 'fromNodeId', 'toNodeId',
        ];
        assertStrictEquals(
            (edgeKeys as readonly string[])
                .includes('attributes'),
            false,
        );
        assertStrictEquals(
            (TABLE_NAMES as readonly string[])
                .includes('flow_edge_attributes'),
            false,
        );

        // AttributeReferrers is the RESTRICT wire shape —
        // no edgeIds / edge referrer slot exists. Task 7
        // adds instanceIds (fourth leg under the parent
        // type); still no edges leg.
        type ReferrerKeys = keyof AttributeReferrers;
        type OnlyKnownReferrerKeys =
            ReferrerKeys extends
                | 'valueCount'
                | 'flowIds'
                | 'workOrderIds'
                | 'instanceIds'
                ? (
                    | 'valueCount'
                    | 'flowIds'
                    | 'workOrderIds'
                    | 'instanceIds'
                ) extends ReferrerKeys
                    ? true
                    : never
                : never;
        const referrerShapeProof: OnlyKnownReferrerKeys =
            true;
        assertStrictEquals(referrerShapeProof, true);
        const sample: AttributeReferrers = {
            valueCount: 0,
            flowIds: [],
            workOrderIds: [],
            instanceIds: [],
        };
        assertEquals(
            Object.keys(sample).sort(),
            [
                'flowIds',
                'instanceIds',
                'valueCount',
                'workOrderIds',
            ],
        );
    },
);

Deno.test(
    'an unreferenced attribute deletes cleanly',
    async () => {
        const db = await seededDb();
        const before = (await db.messagePairs.getAll()).length;
        // Phase Final Stage B: wire-seeded VXTdVVRluJDRBqbXWZBntA; DELETE
        // appends a tombstone pair (table retired).
        await DELETE(
            db, ATTR1_PATH, DEV_TOKEN,
        );
        assertStrictEquals(
            (await db.messagePairs.getAll()).length, before + 1,
        );
        await assertRejects(
            () => GET(
                db, ATTR1_PATH, DEV_TOKEN,
            ),
        );
    },
);

// Phase Final Task 1(a): message-plane organization_id re-anchor
// for RESTRICT DELETE. Wire-seeded attribute (pairs exist) so
// the head response body stamps organization_id; DELETE is
// 204 and wire GET 404s.
Deno.test(
    'message-plane organization_id deletes a wire-seeded'
    + ' unreferenced attribute (Task 1(a) parity)',
    async () => {
        const db = await seededDb();
        await PUT(db, ATTR_PAIR_PATH, {
            name: 'PairAttr',
            attribute_type: 'text',
            sort_order: 1,
            options: [],
            constraints: [],
        }, DEV_TOKEN);
        const before = await GET<{
            organization_id: string;
        }>(db, ATTR_PAIR_PATH, DEV_TOKEN);
        assertStrictEquals(before.organization_id, 'AjdvjuECVZEgZoFajaIEkg');
        await DELETE(
            db, ATTR_PAIR_PATH, DEV_TOKEN,
        );
        await assertRejects(
            () => GET(
                db, ATTR_PAIR_PATH, DEV_TOKEN,
            ),
        );
        // Phase Final Stage B: record_attributes table retired.
    },
);

// NAMED re-pin (Phase 15 Task 7): leaf PUT
// states/:id/field-values/:fvid retires; seed a field-value
// referrer through the transition fold. Task 8 CUT: legacy
// fieldValues appends stay below the gate (stored-data SFV
// truth); the live wire rejects the key.
async function seedFieldValueReferrer(
    db: MemoryDbAdapter,
    attributeId: string,
    sfvId: string,
    value: string,
): Promise<void> {
    // Phase Final Stage B: work_orders table retired — seed
    // through the live document PUT so the message plane owns it.
    await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + WORK_ORDER_ID, {
            display_id: 'rfv1',
            flow_graph: {
                name: 'Restrict FV',
                lockTimeout: 0,
                nodes: [],
                edges: [],
            },
            position: 1,
        },
        DEV_TOKEN,
    );
    const body: Record<string, unknown> = {
        transitionEventId: TRANSITION_EVENT_ID,
        targetState: NODE_NEXT,
        fieldValues: [{
            id: sfvId,
            fields: {
                state_event_id: TRANSITION_EVENT_ID,
                attribute_id: attributeId,
                value,
            },
        }],
        release: null,
        transitionAt: AT,
    };
    const pathSegments = [
        'organizations', STARK_ORGANIZATION,
        'work-orders', WORK_ORDER_ID, 'transition',
    ];
    const pattern = 'organizations/:id/work-orders/:id/transition';
    const messagePair = await formWriteMessagePair({
        method: 'POST',
        pathname: '/' + pathSegments.join('/'),
        routePattern: pattern,
        routeSegments: pattern.split('/'),
        pathSegments,
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: AT,
        organization: STARK_ORGANIZATION,
        responseStatus: 204,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await postWorkOrderTransitionOp(
        db, WORK_ORDER_ID, body, SYSTEM_MEMBER_ID,
        undefined, [], messagePair,
    );
}

Deno.test(
    'a field-value referrer blocks deletion with 409',
    async () => {
        const db = await seededDb();
        await seedFieldValueReferrer(
            db, 'VXTdVVRluJDRBqbXWZBntA', FIELD_VALUE_ID,
            'High',
        );
        const err = await assertRejects(
            () => DELETE(
                db, ATTR1_PATH,
                DEV_TOKEN,
            ),
        ) as RequestError;
        assertInstanceOf(err, RequestError);
        assertStrictEquals(err.status, 409);
        assertStringIncludes(err.message, '1 state field value');
        // RESTRICT 409: attribute still served on message plane.
        const still = await GET<{ id: string }>(
            db, ATTR1_PATH, DEV_TOKEN,
        );
        assertStrictEquals(still.id, 'VXTdVVRluJDRBqbXWZBntA');
    },
);

Deno.test(
    'a live node-attribute binding blocks deletion'
    + ' naming the flow',
    async () => {
        const db = await seededDb();
        await seedFlowNodeAttribute(db, {
            flowId: 'ZOousbbnzpqlxJExVAruYQ', nodeId: NODE_1,
            attributeId: 'VXTdVVRluJDRBqbXWZBntA',
        });
        const err = await assertRejects(
            () => DELETE(
                db, ATTR1_PATH,
                DEV_TOKEN,
            ),
        ) as RequestError;
        assertInstanceOf(err, RequestError);
        assertStrictEquals(err.status, 409);
        assertStringIncludes(
            err.message, 'flow(s) ZOousbbnzpqlxJExVAruYQ',
        );
    },
);

Deno.test(
    'a removed node-attribute binding does not block'
    + ' deletion',
    async () => {
        const db = await seededDb();
        // seed added then removed: latest action is 'removed'
        // (both events ride the same create graphDelta; the
        // later `at` wins under latestByKey/fail-closed).
        await seedFlowNodeAttribute(db, {
            flowId: 'ZOousbbnzpqlxJExVAruYQ', nodeId: NODE_1,
            attributeId: 'VXTdVVRluJDRBqbXWZBntA',
            action: 'added', rowId: FNA_1,
            extraAttributeEvents: [{
                id: FNA_2,
                flow_node_id: NODE_1,
                attribute_id: 'VXTdVVRluJDRBqbXWZBntA',
                mode: 'editable',
                is_required: false,
                action: 'removed',
                at: AT2,
            }],
        });
        // deletion must succeed — 'removed' is not a referrer
        const before = (await db.messagePairs.getAll()).length;
        await DELETE(
            db, ATTR1_PATH, DEV_TOKEN,
        );
        // Phase Final Stage B: tombstone pair lands; GET 404s.
        assertStrictEquals(
            (await db.messagePairs.getAll()).length, before + 1,
        );
        await assertRejects(
            () => GET(
                db, ATTR1_PATH, DEV_TOKEN,
            ),
        );
    },
);

Deno.test(
    'attribute on multiple nodes counts the flow once',
    async () => {
        const db = await seededDb();
        // two nodes in same flow, both bind VXTdVVRluJDRBqbXWZBntA
        await seedFlowNodeAttribute(db, {
            flowId: 'ZOousbbnzpqlxJExVAruYQ', nodeId: NODE_1,
            attributeId: 'VXTdVVRluJDRBqbXWZBntA', rowId: FNA_1,
            extraNodes: [{
                id: NODE_2, flow_id: 'ZOousbbnzpqlxJExVAruYQ',
                name: 'Review',
                position_x: 1, position_y: 0,
                is_create: false, is_archive: false,
                task_instructions: '', at: AT,
            }],
            extraAttributeEvents: [{
                id: FNA_2,
                flow_node_id: NODE_2,
                attribute_id: 'VXTdVVRluJDRBqbXWZBntA',
                mode: 'editable',
                is_required: false,
                action: 'added',
                at: AT,
            }],
        });
        const err = await assertRejects(
            () => DELETE(
                db, ATTR1_PATH,
                DEV_TOKEN,
            ),
        ) as RequestError;
        assertInstanceOf(err, RequestError);
        assertStrictEquals(err.status, 409);
        // flow ZOousbbnzpqlxJExVAruYQ appears exactly once in the
        // message
        const matches =
            err.message.match(/ZOousbbnzpqlxJExVAruYQ/g) ?? [];
        assertStrictEquals(matches.length, 1);
    },
);

Deno.test(
    'a work-order binding blocks deletion naming it',
    async () => {
        const db = await seededDb();
        // Bare host flow (no attribute binding) for the WO
        // join — WO referrers ride the frozen flow_graph head.
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/', {
            id: FLOW_HOST,
            flow: {
                name: 'Host',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: 0,
            },
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: PROJECT_ID,
                flow_id: FLOW_HOST,
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt: AT,
            graphDelta: {
                nodes: [{
                    id: NODE_HOST, flow_id: FLOW_HOST,
                    name: 'Host',
                    position_x: 0, position_y: 0,
                    is_create: true, is_archive: false,
                    task_instructions: '', at: AT,
                }],
                edges: [],
                deletions: [],
                memberEvents: [],
                attributeEvents: [],
            },
        }, DEV_TOKEN);
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', {
            id: 'yNSSnbrpacodQTzUEcdEVA',
            workOrder: {
                display_id: 'WO',
                flow_graph: {
                    name: 'Intake',
                    lockTimeout: 0,
                    nodes: [
                        workOrderNodeBinding('VXTdVVRluJDRBqbXWZBntA'),
                    ],
                    edges: [],
                },
                position: 1,
            },
            flowWorkOrderId: generateIdentifier(),
            flowWorkOrder: {
                flow_id: FLOW_HOST,
                work_order_id: 'yNSSnbrpacodQTzUEcdEVA',
                at: AT,
            },
            stateEventIds: [
                generateIdentifier(),
                generateIdentifier(),
                generateIdentifier(),
            ],
            stateEventAts: [AT, AT, AT],
            states: [NODE_HOST, NODE_HOST, 'claimed'],
        }, DEV_TOKEN);
        const err = await assertRejects(
            () => DELETE(
                db, ATTR1_PATH,
                DEV_TOKEN,
            ),
        ) as RequestError;
        assertInstanceOf(err, RequestError);
        assertStrictEquals(err.status, 409);
        assertStringIncludes(
            err.message, 'work order(s) yNSSnbrpacodQTzUEcdEVA',
        );
    },
);

Deno.test(
    'a referenced removal rolls back the whole'
    + ' record-write batch',
    async () => {
        const db = await seededDb();
        // Record-edit trio echo still needs a sameEvent head
        // on the RECORD (not the field-value parent). SFV
        // referrer lands through the transition fold (Phase
        // 15 Task 7) — leaf PUT retires.
    // Phase Final Stage B: states table retired.
        await seedFieldValueReferrer(
            db, 'VXTdVVRluJDRBqbXWZBntA', FIELD_VALUE_ID,
            'High',
        );
        const requestsBefore = await db.messagePairs.getAll();
        const responsesBefore = await db.messagePairs.getAll();
        const err = await assertRejects(
            () => POST(db
                , 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
                kind: 'edit',
                id: 'rOEPOcVMQdJiiiMuiiEhlg',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'Renamed', description: 'd',
                    position: 1,
                },
                attributes: [],
                // Echoes the SAME event pre-seeded above (ev1)
                // — never a fresh mint — so the trio's own gate
                // admits this body and the 409 below still
                // proves the RESTRICT mechanism, not validation.
                state: 'active',
                removedAttributeIds: ['VXTdVVRluJDRBqbXWZBntA'],
            }, DEV_TOKEN),
        ) as RequestError;
        assertInstanceOf(err, RequestError);
        assertStrictEquals(err.status, 409);
        // the batch applied NOTHING: message-plane document
        // survives and zero pairs append
        const record = await GET<{ name: string }>(
            db, TYPE_PATH, DEV_TOKEN,
        );
        assertStrictEquals(record.name, 'Asset');
        const attr = await GET<{ id: string }>(
            db, ATTR1_PATH, DEV_TOKEN,
        );
        assertStrictEquals(attr.id, 'VXTdVVRluJDRBqbXWZBntA');
        // pair-balance: the whole bundle is pairs-or-nothing,
        // so a 409 rollback appends NEITHER table any rows.
        assertStrictEquals(
            (await db.messagePairs.getAll()).length,
            requestsBefore.length,
        );
        assertStrictEquals(
            (await db.messagePairs.getAll()).length,
            responsesBefore.length,
        );
    },
);
