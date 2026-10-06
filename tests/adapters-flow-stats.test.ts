import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    type RequestContext,
} from '../client/request-context.ts';
import { responseMessage } from './fixtures/response-message.ts';
import {
    IN_PROCESS_ORIGIN,
    inPageContext,
    inProcessFetch,
} from './in-page-facade.ts';
import { createHttpFacade } from '../client/http-facade.ts';
import { createAppClient } from '../web-app/app/client.ts';
import { organizationToken } from './token-fixtures.ts';
import { adminContext } from './context-fixtures.ts';
import {
    getFlowStats,
} from '../web-app/app/flow-stats.ts';
import {
    postFlowCreation,
    putFlow,
} from '../client/flow-mutations.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
} from '../shared/types.ts';
import type {
    GraphNode,
    GraphEdge,
    StoredGraph,
} from '../shared/types.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { seedCreatedWorkOrder } from
    './work-order-fixtures.ts';

// -- Fixture helpers --------------------------

function buildNode(
    id: string,
    name: string,
    overrides?: Partial<GraphNode>,
): GraphNode {
    return {
        id,
        name,
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        memberIds: [],
        attributes: [],
        taskInstructions: '',
        ...overrides,
    };
}

function buildEdge(
    id: string,
    fromNodeId: string,
    toNodeId: string,
): GraphEdge {
    return {
        id,
        name: '',
        fromNodeId,
        toNodeId,
    };
}

// Seed a flow through the SAME gate-driven create/document-PUT
// idiom the live route uses (postFlowCreation + putFlow), so a
// message pair exists at this flow's document — required for the
// flipped GET organizations/:id/flows/:id route (Phase 4 Task 8), which
// getFlowStats reads via getFlowGraph, to derive it.
// postFlowCreation seeds a default start/complete graph; the
// immediate putFlow overwrites it with the caller's own graph.
async function seedFlow(
    ctx: RequestContext,
    flowId: string,
    name: string,
    graph: StoredGraph,
): Promise<void> {
    await postFlowCreation(ctx, {
        flowId,
        linkId: generateIdentifier(),
        projectId: generateIdentifier(),
        name,
    });
    await putFlow(ctx, flowId, {
        name,
        isLocked: false,
        isAutoLayout: true,
        isAutoFit: true,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: graph.nodes,
        edges: graph.edges,
    });
}

// Timestamps relative to now so the 90-day window
// check stays valid regardless of when the test runs.
function daysAgo(d: number): string {
    return new Date(
        Date.now() - d * 24 * 3600 * 1000,
    ).toISOString()
        .replace('Z', '000Z');
}

// A work-order transition, posted through the SAME
// wire-reachable POST the live route serves
// (postWorkOrderTransitionOp) — required for the versions
// read getFlowStats charts to find it. A raw
// db.states.put left no message pair at this document.
async function transitionWorkOrder(
    ctx: RequestContext,
    workOrderId: string,
    eventId: string,
    targetState: string,
    at: string,
): Promise<void> {
    const read = await ctx.GET(
        'organizations/AjdvjuECVZEgZoFajaIEkg'
        + '/work-orders/' + workOrderId,
    );
    await ctx.POST(
        'organizations/AjdvjuECVZEgZoFajaIEkg'
        + '/work-orders/' + workOrderId
        + '/transition',
        {
        transitionEventId: eventId,
        targetState,
        release: null,
        transitionAt: at,
    }, [read]);
}

// c→a→z graph: c isCreate, z isArchive, a regular
function buildTestGraph(): {
    graph: StoredGraph;
    createId: string;
    activeId: string;
    doneId: string;
} {
    const createId = generateIdentifier();
    const activeId = generateIdentifier();
    const doneId = generateIdentifier();
    return {
        createId,
        activeId,
        doneId,
        graph: {
            nodes: [
                buildNode(createId, 'Create', {
                    isCreate: true,
                }),
                buildNode(activeId, 'Active'),
                buildNode(doneId, 'Done', {
                    isArchive: true,
                }),
            ],
            edges: [
                buildEdge(
                    generateIdentifier(),
                    createId, activeId,
                ),
                buildEdge(
                    generateIdentifier(),
                    activeId, doneId,
                ),
            ],
        },
    };
}

// -- Tests ------------------------------------

Deno.test(
    'getFlowStats reads each joined work order\'s versions',
    async () => {
        const paths: string[] = [];
        const organization = 'AjdvjuECVZEgZoFajaIEkg';
        const flowId = 'flow-1';
        const ctx = {
            identity: { organization },
            GET: async (path: string) => {
                paths.push(path);
                if (path.endsWith(
                    '/invitations/?state=removed',
                )) {
                    return responseMessage([]);
                }
                return responseMessage({
                    id: flowId,
                    organization_id: organization,
                    name: 'Stats',
                    is_locked: false,
                    is_auto_layout: false,
                    is_auto_fit: false,
                    lock_timeout: 0,
                    graph: {
                        nodes: [],
                        edges: [],
                    },
                });
            },
            // A collection read records its path, then answers
            // the flow's one work-order join, the one work
            // order, and empty members, former members, agents,
            // and versions; any other collection path is a
            // fault.
            GETCollection: async (path: string) => {
                paths.push(path);
                if (
                    path.endsWith(
                        '/flows/' + flowId
                            + '/work-orders/',
                    )
                ) {
                    return [responseMessage({
                        work_order_id: 'w-join',
                    })];
                }
                if (path.endsWith('/work-orders/')) {
                    return [responseMessage({ id: 'w-coll' })];
                }
                if (
                    path.endsWith('/versions/')
                    || path.endsWith(
                        '/invitations/?state=accepted',
                    )
                    || path.endsWith(
                        '/invitations/?state=removed',
                    )
                    || path === 'ai-agents/'
                ) {
                    return [];
                }
                throw new Error('not a collection: ' + path);
            },
        } as unknown as RequestContext;
        await getFlowStats(ctx, flowId, 0);
        assertEquals(
            paths.some(p =>
                p.endsWith('/work-orders/')
                && !p.includes('/flows/'),
            ),
            false,
        );
        assert(
            paths.some(p =>
                p.includes('/flows/')
                && p.endsWith('/work-orders/'),
            ),
        );
        assert(
            paths.some(p =>
                p.endsWith(
                    '/work-orders/w-join/versions/',
                ),
            ),
        );
        assertEquals(
            paths.some(p =>
                p.endsWith(
                    '/work-orders/w-coll/versions/',
                ),
            ),
            false,
        );
    },
);

Deno.test(
    'getFlowStats only includes this flow\'s'
    + ' work orders',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = inPageContext(db, await organizationToken());

        // Flow ZOousbbnzpqlxJExVAruYQ with an Onboarding graph, seeded
        // through the
        // gate-driven create/document-PUT idiom.
        const f1Graph = buildTestGraph();
        await seedFlow(
            ctx, 'ZOousbbnzpqlxJExVAruYQ', 'Onboarding',
            f1Graph.graph,
        );

        // Minimal VALID work-order graphs — the gate
        // demands shape, but getFlowStats reads from
        // flow-work-orders and flow transitions,
        // not from work-order.flow_graph. Each work order
        // lands through the live create with its flow join;
        // yNSSnbrpacodQTzUEcdEVA belongs to ZOousbbnzpqlxJExVAruYQ,
        // yNXXsTEwShOozlQCEWKIIw to OTHER.
        const token = await organizationToken();
        const otherFlow = generateIdentifier();
        await seedCreatedWorkOrder(db, {
            organization: 'AjdvjuECVZEgZoFajaIEkg',
            id: 'yNSSnbrpacodQTzUEcdEVA',
            fields: {
                display_id: 'WO-1',
                flow_graph: {
                    name: 'Onboarding',
                    lockTimeout: 0, nodes: [], edges: [],
                },
                position: 1,
            },
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
            births: [f1Graph.createId, f1Graph.createId],
            at: daysAgo(40),
            token,
            claim: 'released',
        });
        await seedCreatedWorkOrder(db, {
            organization: 'AjdvjuECVZEgZoFajaIEkg',
            id: 'yNXXsTEwShOozlQCEWKIIw',
            fields: {
                display_id: 'WO-2',
                flow_graph: {
                    name: 'Onboarding',
                    lockTimeout: 0, nodes: [], edges: [],
                },
                position: 2,
            },
            flowId: otherFlow,
            births: [f1Graph.createId, f1Graph.createId],
            at: daysAgo(40),
            token,
            claim: 'released',
        });

        // yNSSnbrpacodQTzUEcdEVA: '' → create → active → done
        // ~35 days in the active node, within 90-day window
        await transitionWorkOrder(
            ctx, 'yNSSnbrpacodQTzUEcdEVA',
            generateIdentifier(), f1Graph.activeId,
            daysAgo(40),
        );
        await transitionWorkOrder(
            ctx, 'yNSSnbrpacodQTzUEcdEVA',
            generateIdentifier(), f1Graph.doneId,
            daysAgo(5),
        );

        const { model, graph } =
            await getFlowStats(ctx, 'ZOousbbnzpqlxJExVAruYQ', Date.now());

        assertStrictEquals(graph.name, 'Onboarding');
        assertStrictEquals(
            model.completedWorkOrderCount, 1,
        );
        assertStrictEquals(
            model.incompleteWorkOrderCount, 0,
        );
        const a =
            model.nodes.find(
                n => n.id === f1Graph.activeId,
            )!;
        assert(
            a !== undefined,
            'active node must be present',
        );
        assert(
            a.heatPct > 0,
            `expected heatPct > 0, got ${a.heatPct}`,
        );
    },
);

Deno.test(
    'getFlowStats unknown flowId propagates'
    + ' the underlying error',
    async () => {
        const { ctx } = await adminContext();
        await assertRejects(
            () => getFlowStats(
                ctx, generateIdentifier(), Date.now(),
            ),
        );
    },
);

Deno.test(
    'a rejected getFlowStats leaves none of its reads in'
    + ' flight',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const flowId = generateIdentifier();
        const inner = inProcessFetch(db);
        // The work-order read is held until the flow read
        // has answered its 404, so the rejection always
        // arrives while a sibling is still running.
        let releaseHeld = (): void => {};
        const held = new Promise<void>((resolve) => {
            releaseHeld = resolve;
        });
        let inFlight = 0;
        const fetch: typeof globalThis.fetch = async (
            input, init,
        ) => {
            const path = new URL(new Request(input, init).url)
                .pathname;
            inFlight += 1;
            try {
                if (path.endsWith('/work-orders/')) {
                    await held;
                }
                return await inner(input, init);
            } finally {
                inFlight -= 1;
                if (path.endsWith('/flows/' + flowId)) {
                    releaseHeld();
                }
            }
        };
        const ctx = createAppClient(
            createHttpFacade(IN_PROCESS_ORIGIN, fetch),
        ).requestContext(await organizationToken());
        const inFlightAtRejection = await getFlowStats(
            ctx, flowId, Date.now(),
        ).then(
            () => 'resolved',
            () => inFlight,
        );
        assertStrictEquals(
            inFlightAtRejection, 0,
            'every read settles before the rejection does',
        );
    },
);

Deno.test('a rejected versions read leaves none in flight',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const flowId = generateIdentifier();
    const built = buildTestGraph();
    await seedFlow(
        inPageContext(db, token), flowId, 'Stats',
        built.graph,
    );
    const [failing, other] = [
        generateIdentifier(), generateIdentifier(),
    ];
    for (const [position, id] of [failing, other].entries()) {
        await seedCreatedWorkOrder(db, {
            organization: 'AjdvjuECVZEgZoFajaIEkg', id,
            fields: {
                display_id: 'WO-' + position,
                flow_graph: {
                    name: 'Stats', lockTimeout: 0,
                    nodes: [], edges: [],
                },
                position,
            },
            flowId,
            births: [built.createId, built.activeId],
            at: daysAgo(1), token, claim: 'kept',
        });
    }
    const inner = inProcessFetch(db);
    let inFlight = 0;
    let releaseHeld = (): void => {};
    const held = new Promise<void>((resolve) => {
        releaseHeld = resolve;
    });
    const fetch: typeof globalThis.fetch = async (
        input, init,
    ) => {
        const path = new URL(new Request(input, init).url)
            .pathname;
        inFlight += 1;
        try {
            if (path.endsWith(failing + '/versions/')) {
                throw new TypeError('network down');
            }
            if (path.endsWith('/versions/')) await held;
            return await inner(input, init);
        } finally {
            inFlight -= 1;
            if (path.endsWith(failing + '/versions/')) {
                releaseHeld();
            }
        }
    };
    const ctx = createAppClient(
        createHttpFacade(IN_PROCESS_ORIGIN, fetch),
    ).requestContext(await organizationToken());
    const inFlightAtRejection = await getFlowStats(
        ctx, flowId, Date.now(),
    ).then(
        () => { throw new Error('expected a rejection'); },
        () => inFlight,
    );
    assertStrictEquals(inFlightAtRejection, 0);
});

Deno.test(
    'getFlowStats lays out an auto-layout flow so the'
    + ' returned graph and stat model are not degenerate',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = inPageContext(db, await organizationToken());
        // seedFlow saves is_auto_layout true; buildTestGraph
        // seeds c→a→z all at (0,0).
        const autoGraph = buildTestGraph();
        await seedFlow(ctx, 'ZOousbbnzpqlxJExVAruYQ', 'AutoLayout'
            , autoGraph.graph);
        await seedCreatedWorkOrder(db, {
            organization: 'AjdvjuECVZEgZoFajaIEkg',
            id: 'yNSSnbrpacodQTzUEcdEVA',
            fields: {
                display_id: 'WO-1',
                flow_graph: {
                    name: 'AutoLayout',
                    lockTimeout: 0, nodes: [], edges: [],
                },
                position: 1,
            },
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
            births: [autoGraph.createId, autoGraph.createId],
            at: daysAgo(10),
            token: await organizationToken(),
            claim: 'released',
        });
        const { model, graph } =
            await getFlowStats(ctx, 'ZOousbbnzpqlxJExVAruYQ', Date.now());
        const graphPos = new Set(
            graph.nodes.map(
                n => `${n.positionX},${n.positionY}`,
            ),
        );
        assertStrictEquals(graphPos.size, 3);
        const c = graph.nodes.find(
            n => n.id === autoGraph.createId,
        )!;
        const z = graph.nodes.find(
            n => n.id === autoGraph.doneId,
        )!;
        assert(c.positionX < z.positionX);
        const modelPos = new Set(
            model.nodes.map(
                n => `${n.positionX},${n.positionY}`,
            ),
        );
        assertStrictEquals(modelPos.size, 3);
    },
);
