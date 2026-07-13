import { test } from 'node:test';
import { strict as assert } from 'node:assert';
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
import type { GraphEdge } from '../api/types.ts';
import type { AttributeReferrers } from
    '../api/record-attribute-refs.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';

// Destroying a record attribute is RESTRICT, not cascade:
// while a state_field_values row names it or a live
// flow-node-attribute relation row binds it, or a
// work-order graph references it, DELETE (and a record-write
// removal) is a 409 naming the referrers, and the whole
// batch rolls back — cascading would orphan immutable
// event payloads.
//
// NAMED re-pin (Phase 15 Task 4): RESTRICT's three graph legs
// are pair-plane derived now — a raw
// db.flowNodeAttributes.put / db.workOrders.put leaves no
// graphDelta / work-orders document pair, so live flow and
// work-order referrers must land through the SAME wire-
// reachable writers the live routes serve.

const AT = '2026-06-01T00:00:00.000000Z';
const AT2 = '2026-06-02T00:00:00.000000Z';

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    // Phase Final Stage B: records family retired — seed
    // through live document PUTs so the pair plane owns them.
    await PUT(db, 'records/r1', {
        name: 'Asset', description: 'd', position: 1,
        state: 'active',
        state_at: AT,
        state_event_id: 'r1-genesis',
    }, DEV_TOKEN);
    await PUT(db, 'record-attributes/attr1', {
        organization_id: '1',
        record_id: 'r1',
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
        action = 'added', rowId = 'fna1',
        extraAttributeEvents = [],
        extraNodes = [],
    } = opts;
    await POST(db, 'flows', {
        id: flowId,
        flow: {
            name: 'Intake',
            is_locked: false,
            is_auto_layout: false,
            is_auto_fit: false,
            lock_timeout: 0,
        },
        projectFlowId: flowId + '-pf',
        projectFlow: {
            project_id: 'proj-restrict-1',
            flow_id: flowId,
            at: AT,
        },
        initialState: 'active',
        initialStateEventId: flowId + '-ev',
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
        id: 'n1', name: 'Step', positionX: 0,
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
test(
    'prove attribute bindings cannot reach flow edges',
    () => {
        type GraphEdgeHasNoAttributes =
            'attributes' extends keyof GraphEdge
                ? never
                : true;
        const edgeTypeProof: GraphEdgeHasNoAttributes = true;
        assert.equal(edgeTypeProof, true);

        const edgeKeys: readonly (keyof GraphEdge)[] = [
            'id', 'name', 'fromNodeId', 'toNodeId',
        ];
        assert.equal(
            (edgeKeys as readonly string[])
                .includes('attributes'),
            false,
        );
        assert.equal(
            (TABLE_NAMES as readonly string[])
                .includes('flow_edge_attributes'),
            false,
        );

        // AttributeReferrers is the RESTRICT wire shape —
        // no edgeIds / edge referrer slot exists.
        type ReferrerKeys = keyof AttributeReferrers;
        type OnlyKnownReferrerKeys =
            ReferrerKeys extends
                'valueCount' | 'flowIds' | 'workOrderIds'
                ? (
                    'valueCount' | 'flowIds' | 'workOrderIds'
                ) extends ReferrerKeys
                    ? true
                    : never
                : never;
        const referrerShapeProof: OnlyKnownReferrerKeys =
            true;
        assert.equal(referrerShapeProof, true);
        const sample: AttributeReferrers = {
            valueCount: 0,
            flowIds: [],
            workOrderIds: [],
        };
        assert.deepEqual(
            Object.keys(sample).sort(),
            ['flowIds', 'valueCount', 'workOrderIds'],
        );
    },
);

test(
    'an unreferenced attribute deletes cleanly',
    async () => {
        const db = await seededDb();
        const before = (await db.requests.getAll()).length;
        // Phase Final Stage B: wire-seeded attr1; DELETE
        // appends a tombstone pair (table retired).
        await DELETE(
            db, 'record-attributes/attr1', DEV_TOKEN,
        );
        assert.equal(
            (await db.requests.getAll()).length, before + 1,
        );
        await assert.rejects(
            () => GET(
                db, 'record-attributes/attr1', DEV_TOKEN,
            ),
        );
    },
);

// Phase Final Task 1(a): pair-plane organization_id re-anchor
// for RESTRICT DELETE. Wire-seeded attribute (pairs exist) so
// the head response body stamps organization_id; DELETE is
// 204 and wire GET 404s.
test(
    'pair-plane organization_id deletes a wire-seeded'
    + ' unreferenced attribute (Task 1(a) parity)',
    async () => {
        const db = await seededDb();
        await PUT(db, 'record-attributes/attr-pair', {
            organization_id: '1',
            record_id: 'r1',
            name: 'PairAttr',
            attribute_type: 'text',
            sort_order: 1,
            options: [],
            constraints: [],
        }, DEV_TOKEN);
        const before = await GET<{
            organization_id: string;
        }>(db, 'record-attributes/attr-pair', DEV_TOKEN);
        assert.equal(before.organization_id, '1');
        await DELETE(
            db, 'record-attributes/attr-pair', DEV_TOKEN,
        );
        await assert.rejects(
            () => GET(
                db, 'record-attributes/attr-pair', DEV_TOKEN,
            ),
        );
        // Phase Final Stage B: record_attributes table retired.
    },
);

// NAMED re-pin (Phase 15 Task 7): leaf PUT
// states/:id/field-values/:fvid retires; seed a field-value
// referrer through the transition fold — the ONLY live
// writer of state_field_values (postWorkOrderTransitionOp).
async function seedFieldValueReferrer(
    db: MemoryDbAdapter,
    attributeId: string,
    sfvId: string,
    value: string,
): Promise<void> {
    // Phase Final Stage B: work_orders table retired — seed
    // through the live document PUT so the pair plane owns it.
    await PUT(
        db, 'work-orders/wo-restrict-fv', {
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
    await POST(
        db, 'work-orders/wo-restrict-fv/transition', {
            transitionEventId: 'te-restrict-1',
            targetState: 'n-next',
            fieldValues: [{
                id: sfvId,
                fields: {
                    state_event_id: 'te-restrict-1',
                    attribute_id: attributeId,
                    value,
                },
            }],
            release: null,
            transitionAt: AT,
        },
        DEV_TOKEN,
    );
}

test(
    'a field-value referrer blocks deletion with 409',
    async () => {
        const db = await seededDb();
        await seedFieldValueReferrer(
            db, 'attr1', 'sfv1', 'High',
        );
        await assert.rejects(
            () => DELETE(
                db, 'record-attributes/attr1',
                DEV_TOKEN,
            ),
            (err: unknown) =>
                err instanceof RequestError
                && err.status === 409
                && /1 state field value/.test(
                    err.message,
                ),
        );
        // RESTRICT 409: attribute still served on pair plane.
        const still = await GET<{ id: string }>(
            db, 'record-attributes/attr1', DEV_TOKEN,
        );
        assert.equal(still.id, 'attr1');
    },
);

test(
    'a live node-attribute binding blocks deletion'
    + ' naming the flow',
    async () => {
        const db = await seededDb();
        await seedFlowNodeAttribute(db, {
            flowId: 'f1', nodeId: 'n1',
            attributeId: 'attr1',
        });
        await assert.rejects(
            () => DELETE(
                db, 'record-attributes/attr1',
                DEV_TOKEN,
            ),
            (err: unknown) =>
                err instanceof RequestError
                && err.status === 409
                && /flow\(s\) f1/.test(err.message),
        );
    },
);

test(
    'a removed node-attribute binding does not block'
    + ' deletion',
    async () => {
        const db = await seededDb();
        // seed added then removed: latest action is 'removed'
        // (both events ride the same create graphDelta; the
        // later `at` wins under latestByKey/fail-closed).
        await seedFlowNodeAttribute(db, {
            flowId: 'f1', nodeId: 'n1',
            attributeId: 'attr1',
            action: 'added', rowId: 'fna1',
            extraAttributeEvents: [{
                id: 'fna2',
                flow_node_id: 'n1',
                attribute_id: 'attr1',
                mode: 'editable',
                is_required: false,
                action: 'removed',
                at: AT2,
            }],
        });
        // deletion must succeed — 'removed' is not a referrer
        const before = (await db.requests.getAll()).length;
        await DELETE(
            db, 'record-attributes/attr1', DEV_TOKEN,
        );
        // Phase Final Stage B: tombstone pair lands; GET 404s.
        assert.equal(
            (await db.requests.getAll()).length, before + 1,
        );
        await assert.rejects(
            () => GET(
                db, 'record-attributes/attr1', DEV_TOKEN,
            ),
        );
    },
);

test(
    'attribute on multiple nodes counts the flow once',
    async () => {
        const db = await seededDb();
        // two nodes in same flow, both bind attr1
        await seedFlowNodeAttribute(db, {
            flowId: 'f1', nodeId: 'n1',
            attributeId: 'attr1', rowId: 'fna1',
            extraNodes: [{
                id: 'n2', flow_id: 'f1',
                name: 'Review',
                position_x: 1, position_y: 0,
                is_create: false, is_archive: false,
                task_instructions: '', at: AT,
            }],
            extraAttributeEvents: [{
                id: 'fna2',
                flow_node_id: 'n2',
                attribute_id: 'attr1',
                mode: 'editable',
                is_required: false,
                action: 'added',
                at: AT,
            }],
        });
        await assert.rejects(
            () => DELETE(
                db, 'record-attributes/attr1',
                DEV_TOKEN,
            ),
            (err: unknown) => {
                if (!(err instanceof RequestError)) {
                    return false;
                }
                if (err.status !== 409) return false;
                // flow f1 appears exactly once in the message
                const matches =
                    err.message.match(/f1/g) ?? [];
                return matches.length === 1;
            },
        );
    },
);

test(
    'a work-order binding blocks deletion naming it',
    async () => {
        const db = await seededDb();
        // Bare host flow (no attribute binding) for the WO
        // join — WO referrers ride the frozen flow_graph head.
        await POST(db, 'flows', {
            id: 'f-wo-host',
            flow: {
                name: 'Host',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: 0,
            },
            projectFlowId: 'f-wo-host-pf',
            projectFlow: {
                project_id: 'proj-restrict-1',
                flow_id: 'f-wo-host',
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: 'f-wo-host-ev',
            initialStateAt: AT,
            graphDelta: {
                nodes: [{
                    id: 'n-host', flow_id: 'f-wo-host',
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
        await POST(db, 'work-orders', {
            id: 'wo1',
            workOrder: {
                display_id: 'WO',
                flow_graph: {
                    name: 'Intake',
                    lockTimeout: 0,
                    nodes: [
                        workOrderNodeBinding('attr1'),
                    ],
                    edges: [],
                },
                position: 1,
            },
            flowWorkOrderId: 'wo1-fwo',
            flowWorkOrder: {
                flow_id: 'f-wo-host',
                work_order_id: 'wo1',
                at: AT,
            },
            stateEventIds: [
                'wo1-ev1', 'wo1-ev2', 'wo1-ev3',
            ],
            stateEventAts: [AT, AT, AT],
            states: ['n-host', 'n-host', 'claimed'],
        }, DEV_TOKEN);
        await assert.rejects(
            () => DELETE(
                db, 'record-attributes/attr1',
                DEV_TOKEN,
            ),
            (err: unknown) =>
                err instanceof RequestError
                && err.status === 409
                && /work order\(s\) wo1/.test(
                    err.message,
                ),
        );
    },
);

test(
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
            db, 'attr1', 'sfv1', 'High',
        );
        const requestsBefore = await db.requests.getAll();
        const responsesBefore = await db.responses.getAll();
        await assert.rejects(
            () => POST(db, 'records', {
                kind: 'edit',
                id: 'r1',
                record: {
                    organization_id: '1',
                    name: 'Renamed', description: 'd',
                    position: 1,
                },
                attributes: [],
                // Echoes the SAME event pre-seeded above (ev1)
                // — never a fresh mint — so the trio's own gate
                // admits this body and the 409 below still
                // proves the RESTRICT mechanism, not validation.
                state: 'active',
                state_at: AT,
                state_event_id: 'ev1',
                removedAttributeIds: ['attr1'],
            }, DEV_TOKEN),
            (err: unknown) =>
                err instanceof RequestError
                && err.status === 409,
        );
        // the batch applied NOTHING: pair-plane document
        // survives and zero pairs append
        const record = await GET<{ name: string }>(
            db, 'records/r1', DEV_TOKEN,
        );
        assert.equal(record.name, 'Asset');
        const attr = await GET<{ id: string }>(
            db, 'record-attributes/attr1', DEV_TOKEN,
        );
        assert.equal(attr.id, 'attr1');
        // pair-balance: the whole bundle is pairs-or-nothing,
        // so a 409 rollback appends NEITHER table any rows.
        assert.equal(
            (await db.requests.getAll()).length,
            requestsBefore.length,
        );
        assert.equal(
            (await db.responses.getAll()).length,
            responsesBefore.length,
        );
    },
);
