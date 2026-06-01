import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { populateMockData } from
    '../api/mock-data.ts';
import {
    asStoredGraph,
    parseOrThrow,
} from '../api/validators.ts';
import {
    validateWorkOrderFlowGraphJson,
} from '../api/validators.ts';

async function seeded(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await populateMockData(db);
    return db;
}

test(
    'populateMockData seeds at least two Records',
    async () => {
        const db = await seeded();
        const records = await db.records.getAll();
        assert.ok(
            records.length >= 2,
            'expected >=2 records, got '
            + records.length,
        );
    },
);

test(
    'each seeded Record has at least three'
    + ' attributes',
    async () => {
        const db = await seeded();
        const records = await db.records.getAll();
        const attrs =
            await db.recordAttributes.getAll();
        for (const rec of records) {
            const own = attrs.filter(
                a => a.record_id === rec.id,
            );
            assert.ok(
                own.length >= 3,
                'record ' + rec.id + ' has '
                + own.length + ' attrs',
            );
        }
    },
);

test(
    'seeded attributes span at least three'
    + ' attribute_types',
    async () => {
        const db = await seeded();
        const attrs =
            await db.recordAttributes.getAll();
        const types = new Set(
            attrs.map(a => a.attribute_type),
        );
        assert.ok(
            types.size >= 3,
            'expected >=3 distinct types, got '
            + types.size,
        );
    },
);

test(
    'seeded constraints include at least one of'
    + ' each: regex, range_min, range_max',
    async () => {
        const db = await seeded();
        const attrs =
            await db.recordAttributes.getAll();
        const allKinds = new Set<string>();
        for (const attr of attrs) {
            const parsed = parseOrThrow(
                attr.constraints,
                'attr.constraints',
            );
            if (!Array.isArray(parsed)) continue;
            for (const c of parsed) {
                if (
                    typeof c === 'object'
                    && c !== null
                    && 'kind' in c
                    && typeof (c as { kind: unknown })
                        .kind === 'string'
                ) {
                    allKinds.add(
                        (c as { kind: string }).kind,
                    );
                }
            }
        }
        assert.ok(
            allKinds.has('regex'),
            'expected a regex constraint',
        );
        assert.ok(
            allKinds.has('range_min'),
            'expected a range_min constraint',
        );
        assert.ok(
            allKinds.has('range_max'),
            'expected a range_max constraint',
        );
    },
);

test(
    'at least one seeded Record is bound to'
    + ' multiple flows via flow_records',
    async () => {
        const db = await seeded();
        const bindings =
            await db.flowRecords.getAll();
        const counts = new Map<string, number>();
        for (const b of bindings) {
            counts.set(
                b.record_id,
                (counts.get(b.record_id) ?? 0) + 1,
            );
        }
        const max = Math.max(0, ...counts.values());
        assert.ok(
            max >= 2,
            'expected >=2 bindings for some record,'
            + ' got max=' + max,
        );
    },
);

test(
    'the gate-violation work order has a current'
    + ' node whose next-edge target has at least'
    + ' one required attribute with a null stored'
    + ' value',
    async () => {
        const db = await seeded();
        const woId = 'gateV101W0rkOrd3rXY0a1';
        const wo = await db.workOrders.getById(
            woId,
        );
        const flowGraph =
            validateWorkOrderFlowGraphJson(
                wo.flow_graph,
                'wo.flow_graph',
            );

        // Compute current node from the state log.
        const events = await db.states.allFor(woId);
        const transitions = events.filter(
            e => e.state !== 'claimed'
                && e.state !== 'claim_released'
                && e.state !== 'claim_expired',
        );
        const latest = transitions
            .toSorted(
                (a, b) =>
                    a.at.localeCompare(b.at),
            )
            .at(-1);
        assert.ok(
            latest,
            'gate WO must have at least one'
            + ' transition',
        );
        const currentNodeId = latest!.state;

        // Find an outgoing target node.
        const outgoing = flowGraph.edges.filter(
            e => e.fromNodeId === currentNodeId,
        );
        assert.ok(
            outgoing.length > 0,
            'current node should have outgoing'
            + ' edges so the gate is reachable',
        );
        const targetIds = new Set(
            outgoing.map(e => e.toNodeId),
        );
        const targetNodes = flowGraph.nodes.filter(
            n => targetIds.has(n.id),
        );

        // Stored values seeded on this WO.
        const values =
            await db.stateFieldValues.getAll();
        const eventIds = new Set(
            transitions.map(t => t.id),
        );
        const storedAttrIds = new Set(
            values
                .filter(
                    v => eventIds.has(
                        v.state_event_id,
                    ),
                )
                .map(v => v.field_id),
        );

        // At least one target node must reference a
        // required attribute whose value is not yet
        // stored.
        const violations: string[] = [];
        for (const node of targetNodes) {
            for (const ref of node.attributes) {
                if (
                    ref.isRequired
                    && !storedAttrIds.has(
                        ref.attribute_id,
                    )
                ) {
                    violations.push(
                        ref.attribute_id,
                    );
                }
            }
        }
        assert.ok(
            violations.length > 0,
            'gate WO must trip on at least one'
            + ' required attribute',
        );
    },
);

test(
    'every seeded flow.graph parses as a valid'
    + ' StoredGraph (post-Records shape, no'
    + ' fields[])',
    async () => {
        const db = await seeded();
        const flows = await db.flows.getAll();
        for (const flow of flows) {
            const parsed = parseOrThrow(
                flow.graph, 'flow.graph',
            );
            const stored = asStoredGraph(
                parsed, 'flow.graph',
            );
            for (const node of stored.nodes) {
                assert.ok(
                    Array.isArray(node.attributes),
                    'node ' + node.id
                    + ' is missing attributes[]',
                );
                assert.ok(
                    !('fields' in node),
                    'node ' + node.id
                    + ' must not carry fields[]',
                );
            }
        }
    },
);
