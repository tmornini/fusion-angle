import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    workOrderLifecycleStatesFor,
    workOrderHistoryFor,
} from '../api/derive-states.ts';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    asWorkOrderFlowGraph,
} from '../api/validators.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    documentCollectionGetHandler,
    type DocumentFamilyWiring,
} from '../api/document-family.ts';
import {
    validateRecordDocumentBody,
} from '../api/validators.ts';
import {
    loadAttributeSchemaById,
    postRecordDocumentOp,
} from '../api/routes.ts';
import {
    deriveFlowRecords,
} from '../api/derive-flow-records.ts';
import { deriveFlows } from '../api/derive-flows.ts';
import type {
    RecordEntity,
    RecordAttributeEntity,
} from '../api/types.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import {
    customerProfileRecordId,
    projectBriefRecordId,
} from '../api/mock-data/records.ts';
import { seededMockDb } from './mock-seed.ts';

// Phase Final Task 2: records(+attributes+flow_records) seed
// row halves stripped — assertions ride the message plane.

async function seeded(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

const RECORDS_WIRING: DocumentFamilyWiring = {
    family: 'record-types',
    httpNest: 'organization',
    lifecycle: 'trio',
    notFoundTable: 'records',
    validateDocument: validateRecordDocumentBody,
    documentOp: postRecordDocumentOp,
    entityOf: (document, organization, current) => ({
        id: document.uriId,
        organization_id: organization,
        name: String(document.body['name'] ?? ''),
        description: String(
            document.body['description'] ?? '',
        ),
        position: Number(document.body['position'] ?? 0),
        state: current!.state,
    }),
};

async function allRecords(
    db: MemoryDbAdapter,
): Promise<RecordEntity[]> {
    const out: RecordEntity[] = [];
    for (const organization of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        out.push(
            ...await documentCollectionGetHandler(
                RECORDS_WIRING,
            )(
                db, [], 'XXZruirZyAOoRpNxaDnpSA', organization,
                [],
            ) as RecordEntity[],
        );
    }
    return out;
}

// Task 23: nested attributes — collect per type under each org.
async function allAttributes(
    db: MemoryDbAdapter,
): Promise<RecordAttributeEntity[]> {
    const out: RecordAttributeEntity[] = [];
    for (const organization of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const token = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', organization,
        );
        const typesRes = await handleRequest(
            db,
            new Request(
                'http://localhost/organizations/'
                + organization + '/record-types/',
                {
                    headers: {
                        Authorization: 'Bearer ' + token,
                    },
                },
            ),
        );
        assertStrictEquals(typesRes.status, 200);
        const types = await typesRes.json() as { id: string }[];
        for (const type of types) {
            const res = await handleRequest(
                db,
                new Request(
                    'http://localhost/organizations/'
                    + organization + '/record-types/'
                    + type.id + '/attributes/',
                    {
                        headers: {
                            Authorization: 'Bearer ' + token,
                        },
                    },
                ),
            );
            assertStrictEquals(res.status, 200);
            out.push(
                ...await res.json() as RecordAttributeEntity[],
            );
        }
    }
    return out;
}

Deno.test(
    'postMockDataLoad seeds at least two Records',
    async () => {
        const db = await seeded();
        const records = await allRecords(db);
        assert(
            records.length >= 2,
            'expected >=2 records, got '
            + records.length,
        );
        // Phase Final Stage B: records table retired.
    },
);

Deno.test(
    'each seeded Record has at least three'
    + ' attributes',
    async () => {
        const db = await seeded();
        const records = await allRecords(db);
        const attrs = await allAttributes(db);
        for (const rec of records) {
            const own = attrs.filter(
                a => (a as { record_type_id?: string }).record_type_id
                    === rec.id
                || a.record_id === rec.id,
            );
            assert(
                own.length >= 3,
                'record ' + rec.id + ' has '
                + own.length + ' attrs',
            );
        }
    },
);

Deno.test(
    'seeded attributes span at least three'
    + ' attribute_types',
    async () => {
        const db = await seeded();
        const attrs = await allAttributes(db);
        const types = new Set(
            attrs.map(a => a.attribute_type),
        );
        assert(
            types.size >= 3,
            'expected >=3 distinct types, got '
            + types.size,
        );
    },
);

Deno.test(
    'seeded constraints include at least one of'
    + ' each: regex, range_min, range_max',
    async () => {
        const db = await seeded();
        const attrs = await allAttributes(db);
        const allKinds = new Set<string>();
        for (const attr of attrs) {
            for (const c of attr.constraints) {
                allKinds.add(c.kind);
            }
        }
        assert(
            allKinds.has('regex'),
            'expected a regex constraint',
        );
        assert(
            allKinds.has('range_min'),
            'expected a range_min constraint',
        );
        assert(
            allKinds.has('range_max'),
            'expected a range_max constraint',
        );
    },
);

Deno.test(
    'at least one seeded Record is bound to'
    + ' multiple flows via flow_records',
    async () => {
        const db = await seeded();
        const counts = new Map<string, number>();
        for (const organization of [
            STARK_ORGANIZATION, ORGANIZATION_TWO,
        ]) {
            for (const f of await deriveFlows(
                db, organization,
            )) {
                const bindings = await deriveFlowRecords(
                    db, organization, f.id,
                );
                for (const b of bindings) {
                    counts.set(
                        b.record_id,
                        (counts.get(b.record_id) ?? 0) + 1,
                    );
                }
            }
        }
        const max = Math.max(0, ...counts.values());
        assert(
            max >= 2,
            'expected >=2 bindings for some record,'
            + ' got max=' + max,
        );
        // Phase Final Stage B: flow_records table retired.
    },
);

Deno.test(
    'the gate-violation work order has a current'
    + ' node with at least one required attribute'
    + ' with a null stored value',
    async () => {
        const db = await seeded();
        const woId = 'eOlNZpGQfmCdpSFWXGkzFQ';
        // Phase Final Task 2: WO + SFV on the message plane.
        const token = await organizationToken();
        const woRes = await handleRequest(
            db,
            new Request(
                'http://localhost/organizations/AjdvjuECVZEgZoFajaIEkg/'
                    + 'work-orders/' + woId,
                {
                    headers: {
                        Authorization: 'Bearer ' + token,
                    },
                },
            ),
        );
        assertStrictEquals(woRes.status, 200);
        const wo = await woRes.json() as {
            flow_graph: Record<string, unknown>;
        };
        const flowGraph =
            asWorkOrderFlowGraph(
                wo.flow_graph,
                'wo.flow_graph',
            );

        const events = await workOrderLifecycleStatesFor(db
            , 'AjdvjuECVZEgZoFajaIEkg', woId);
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
        assert(
            latest,
            'gate WO must have at least one'
            + ' transition',
        );
        const currentNodeId = latest!.state;
        const currentNode = flowGraph.nodes.find(
            n => n.id === currentNodeId,
        );
        assert(
            currentNode,
            'current node must exist on the'
            + ' frozen flow graph',
        );

        const outgoing = flowGraph.edges.filter(
            e => e.fromNodeId === currentNodeId,
        );
        assert(
            outgoing.length > 0,
            'current node should have outgoing'
            + ' edges so the gate is reachable',
        );

        const history = await workOrderHistoryFor(
            db, STARK_ORGANIZATION, woId,
        );
        const values = history.flatMap(
            (row) => row.field_values,
        );
        const storedAttrIds = new Set(
            values.map(v => v.attribute_id),
        );

        // Current-node gate: required refs on the
        // node the operator is leaving, not the
        // target of the next edge.
        const violations: string[] = [];
        for (const ref of currentNode!.attributes) {
            if (
                ref.isRequired
                && !storedAttrIds.has(
                    ref.attributeId,
                )
            ) {
                violations.push(
                    ref.attributeId,
                );
            }
        }
        assert(
            violations.length > 0,
            'gate WO must trip on at least one'
            + ' required CURRENT attribute',
        );
    },
);

Deno.test(
    'every seeded flow graph carries attributes[]'
    + ' (no fields[]) via message-plane derive',
    async () => {
        const db = await seeded();
        // Wire GET /flows carries graph as native nested
        // JSON on each FlowWithGraph row (message-plane head).
        async function assertGraphShape(
            token: string,
            organization: string,
        ): Promise<void> {
            const res = await handleRequest(
                db,
                new Request(
                    'http://localhost/organizations/'
                    + organization + '/flows/',
                    {
                        headers: {
                            Authorization: 'Bearer ' + token,
                        },
                    },
                ),
            );
            assertStrictEquals(res.status, 200);
            const flows = await res.json() as {
                id: string;
            }[];
            for (const flow of flows) {
                const detail = await handleRequest(
                    db,
                    new Request(
                        'http://localhost/organizations/'
                        + organization + '/flows/'
                        + flow.id,
                        {
                            headers: {
                                Authorization:
                                    'Bearer ' + token,
                            },
                        },
                    ),
                );
                assertStrictEquals(detail.status, 200);
                const body = await detail.json() as {
                    graph: {
                        nodes: {
                            id: string;
                            attributes?: unknown;
                            fields?: unknown;
                        }[];
                    };
                };
                assertStrictEquals(typeof body.graph, 'object');
                const graph = body.graph;
                for (const node of graph.nodes) {
                    assert(
                        Array.isArray(node.attributes),
                        'node ' + node.id
                        + ' is missing attributes[]',
                    );
                    assert(
                        !('fields' in node),
                        'node ' + node.id
                        + ' must not carry fields[]',
                    );
                }
            }
        }
        await assertGraphShape(
            await organizationToken(),
            STARK_ORGANIZATION,
        );
        await assertGraphShape(
            await organizationToken(
                'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
            ),
            ORGANIZATION_TWO,
        );
    },
);

Deno.test(
    'Project Brief Priority and Approved carry the'
    + ' restricted seed ACLs; the rest keep the default',
    async () => {
        const db = await seeded();
        const projectBrief = await loadAttributeSchemaById(
            db, ORGANIZATION_TWO, projectBriefRecordId,
        );
        const priority = projectBrief.get(
            'pwjGSoPQMbsjmEJLDAgbaA',
        );
        assert(priority, 'Priority attribute exists');
        assertEquals(priority.readRoles, ['admin']);
        assertEquals(priority.writeRoles, ['admin']);
        const approved = projectBrief.get(
            'qDgLYtdgNBjEEoPqCoMATg',
        );
        assert(approved, 'Approved attribute exists');
        assertEquals(
            approved.readRoles, ['member', 'admin'],
        );
        assertEquals(approved.writeRoles, ['admin']);
        const projectName = projectBrief.get(
            'ptlpsUrQssxuTLkouUAnNw',
        );
        assert(projectName, 'Project Name exists');
        assertEquals(
            projectName.readRoles, ['member', 'admin'],
        );
        assertEquals(
            projectName.writeRoles, ['member', 'admin'],
        );
        const customerProfile =
            await loadAttributeSchemaById(
                db, STARK_ORGANIZATION,
                customerProfileRecordId,
            );
        assert(customerProfile.size >= 3);
        for (const row of customerProfile.values()) {
            assertEquals(
                row.readRoles, ['member', 'admin'],
            );
            assertEquals(
                row.writeRoles, ['member', 'admin'],
            );
        }
    },
);
