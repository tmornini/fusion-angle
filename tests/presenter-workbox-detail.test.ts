import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    HumanWorker,
    jsonArrayField,
    jsonObjectField,
    DEFAULT_LOCK_TIMEOUT,
    type HumanWorkerEntity,
    type WorkOrderEntity,
    type StateFieldValueEntity,
    type WorkOrderFlowGraph,
    type GraphNode,
    type GraphEdge,
    type NodeAttribute,
    type RecordAttributeEntity,
    type AttributeType,
    type Id,
    type Worker,
} from '../api/types.ts';
import type {
    TransitionEvent,
} from '../web-app/app/adapters/state-events.ts';
import {
    WorkboxDetailPresenter,
    buildAttributeInputHtml,
} from
'../web-app/app/presenters/workbox-detail.ts';

// WorkboxDetailPresenter is pure: the constructor
// takes the work order, transition events, per-event
// field values, the active claim (or null), a
// workerMap, the current worker id, and the
// attribute map; buildPage() returns SafeHtml.
// The work order's flow_graph is a JsonObjectField
// (a JSON string) that the presenter re-validates,
// so we stringify a WorkOrderFlowGraph shape.

function makeAttributeRef(
    overrides: Partial<NodeAttribute> = {},
): NodeAttribute {
    return {
        attribute_id: 'a-1',
        mode: 'editable',
        isRequired: false,
        ...overrides,
    };
}

function makeAttribute(
    overrides: Partial<RecordAttributeEntity> = {},
): RecordAttributeEntity {
    const attributeType: AttributeType =
        overrides.attribute_type ?? 'text';
    return {
        id: 'a-1',
        record_id: 'rec-1',
        name: 'Notes',
        attribute_type: attributeType,
        sort_order: 0,
        options: jsonArrayField([]),
        constraints: jsonArrayField([]),
        ...overrides,
    };
}

function makeNode(
    overrides: Partial<GraphNode> = {},
): GraphNode {
    return {
        id: 'n-1',
        name: 'Triage',
        description: '',
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        workerIds: [],
        attributes: [],
        ...overrides,
    };
}

function makeEdge(
    overrides: Partial<GraphEdge> = {},
): GraphEdge {
    return {
        id: 'e-1',
        name: 'Approve',
        description: '',
        fromNodeId: 'n-1',
        toNodeId: 'n-2',
        ...overrides,
    };
}

function makeFlowGraph(
    overrides: Partial<WorkOrderFlowGraph> = {},
): WorkOrderFlowGraph {
    return {
        flowId: 'flow-1',
        name: 'Expense approval',
        description: '',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [
            makeNode({
                id: 'n-1', name: 'Triage',
            }),
            makeNode({
                id: 'n-2', name: 'Done',
                isArchive: true,
            }),
        ],
        edges: [
            makeEdge({
                id: 'e-1', name: 'Approve',
                fromNodeId: 'n-1', toNodeId: 'n-2',
            }),
        ],
        ...overrides,
    };
}

function makeWorkOrder(
    graph: WorkOrderFlowGraph,
    overrides: Partial<WorkOrderEntity> = {},
): WorkOrderEntity {
    return {
        id: 'wo-1',
        display_id: 'WO-42',
        flow_graph: jsonObjectField(
            graph as unknown as Record<
                string, unknown
            >,
        ),
        position: 0,
        ...overrides,
    };
}

function makeTransition(
    overrides: Partial<TransitionEvent> = {},
): TransitionEvent {
    return {
        id: 't-1',
        work_order_id: 'wo-1',
        from_node_id: '',
        to_node_id: 'n-1',
        worker_id: 'p-1',
        at: '2026-04-01T12:00:00.000Z',
        ...overrides,
    };
}

function makeHumanWorkerEntity(
    id: string,
    first: string,
): HumanWorkerEntity {
    return {
        id,
        first_name: first,
        last_name: 'Park',
        email: first.toLowerCase() + '@example.com',
        title: 'Reviewer',
        department: 'Finance',
        strengths: jsonArrayField([]),
        team_dimensions: jsonObjectField({}),
        phone: '',
        bio: '',
    };
}

function makeWorkerMap(
    entities: HumanWorkerEntity[],
): Map<Id, Worker> {
    return new Map(
        entities.map(
            e => [e.id, new HumanWorker(e, 'active')],
        ),
    );
}

function makeAttributeMap(
    attributes: RecordAttributeEntity[],
): ReadonlyMap<string, RecordAttributeEntity> {
    return new Map(
        attributes.map(
            a => [a.id, a] as const,
        ),
    );
}

const WORKER_MAP = makeWorkerMap([
    makeHumanWorkerEntity('p-1', 'Ada'),
    makeHumanWorkerEntity('p-2', 'Bo'),
]);

function makePresenter(
    args: {
        graph?: WorkOrderFlowGraph;
        workOrder?: WorkOrderEntity;
        transitions?: TransitionEvent[];
        fieldValues?:
            Map<Id, StateFieldValueEntity[]>;
        activeClaim?:
            { workerId: Id; at: string } | null;
        currentWorkerId?: string;
        attributes?: RecordAttributeEntity[];
    } = {},
): WorkboxDetailPresenter {
    const graph = args.graph ?? makeFlowGraph();
    const workOrder =
        args.workOrder ?? makeWorkOrder(graph);
    const transitions = args.transitions ?? [
        makeTransition(),
    ];
    const attributes = args.attributes ?? [];
    return new WorkboxDetailPresenter(
        workOrder,
        transitions,
        args.fieldValues ?? new Map(),
        args.activeClaim ?? null,
        WORKER_MAP,
        args.currentWorkerId ?? 'p-1',
        makeAttributeMap(attributes),
    );
}

// buildAttributeInputHtml (the exported helper)

test(
    'buildAttributeInputHtml renders a text input'
    + ' carrying the attribute id',
    () => {
        const ref = makeAttributeRef({
            attribute_id: 'a-x',
        });
        const attribute = makeAttribute({
            id: 'a-x', attribute_type: 'text',
        });
        const out = buildAttributeInputHtml(
            ref, attribute,
        ).toString();
        assert.match(out, /<input/);
        assert.match(out, /type="text"/);
        assert.match(
            out, /data-attribute-id="a-x"/,
        );
        assert.ok(!out.includes('required'));
    },
);

test(
    'buildAttributeInputHtml adds the required'
    + ' attribute for required refs',
    () => {
        const ref = makeAttributeRef({
            isRequired: true,
        });
        const attribute = makeAttribute();
        const out = buildAttributeInputHtml(
            ref, attribute,
        ).toString();
        assert.match(out, /required/);
    },
);

test(
    'buildAttributeInputHtml renders a number'
    + ' input for the number attribute type',
    () => {
        const ref = makeAttributeRef();
        const attribute = makeAttribute({
            attribute_type: 'number',
        });
        const out = buildAttributeInputHtml(
            ref, attribute,
        ).toString();
        assert.match(out, /<input/);
        assert.match(out, /type="number"/);
    },
);

test(
    'buildAttributeInputHtml renders a date input'
    + ' for the date attribute type',
    () => {
        const ref = makeAttributeRef();
        const attribute = makeAttribute({
            attribute_type: 'date',
        });
        const out = buildAttributeInputHtml(
            ref, attribute,
        ).toString();
        assert.match(out, /<input/);
        assert.match(out, /type="date"/);
    },
);

test(
    'buildAttributeInputHtml renders a select with'
    + ' one option per choice plus a placeholder',
    () => {
        const ref = makeAttributeRef();
        const attribute = makeAttribute({
            attribute_type: 'select',
            options: jsonArrayField(
                ['Low', 'High'],
            ),
        });
        const out = buildAttributeInputHtml(
            ref, attribute,
        ).toString();
        assert.match(out, /<select/);
        assert.match(out, /Select\.\.\./);
        assert.match(out, /value="Low"/);
        assert.match(out, /value="High"/);
    },
);

test(
    'buildAttributeInputHtml renders a bare'
    + ' checkbox input for the checkbox type',
    () => {
        const ref = makeAttributeRef();
        const attribute = makeAttribute({
            attribute_type: 'checkbox',
        });
        const out = buildAttributeInputHtml(
            ref, attribute,
        ).toString();
        assert.match(out, /type="checkbox"/);
        assert.ok(!out.includes('class="input"'));
    },
);

test(
    'buildAttributeInputHtml renders readonly and'
    + ' disabled attributes for a readonly ref',
    () => {
        const ref = makeAttributeRef({
            mode: 'readonly',
        });
        const attribute = makeAttribute();
        const out = buildAttributeInputHtml(
            ref, attribute,
        ).toString();
        assert.match(out, /readonly/);
    },
);

test(
    'buildAttributeInputHtml on a readonly select'
    + ' emits the disabled attribute',
    () => {
        const ref = makeAttributeRef({
            mode: 'readonly',
        });
        const attribute = makeAttribute({
            attribute_type: 'select',
            options: jsonArrayField(['A']),
        });
        const out = buildAttributeInputHtml(
            ref, attribute,
        ).toString();
        assert.match(out, /disabled/);
    },
);

// WorkboxDetailPresenter: getters + buildPage

test(
    'WorkboxDetailPresenter exposes id, display'
    + ' id, and flow name from the work order',
    () => {
        const presenter = makePresenter();
        assert.equal(presenter.idValue(), 'wo-1');
        assert.equal(
            presenter.displayIdText(), 'WO-42',
        );
        assert.equal(
            presenter.flowNameText(),
            'Expense approval',
        );
    },
);

test(
    'the current node is the destination of the'
    + ' latest transition',
    () => {
        // Two transitions: created -> n-1, then
        // n-1 -> n-2 (the complete node).
        const presenter = makePresenter({
            transitions: [
                makeTransition({
                    id: 't-1', from_node_id: '',
                    to_node_id: 'n-1',
                    at:
                        '2026-04-01T12:00:00.000Z',
                }),
                makeTransition({
                    id: 't-2', from_node_id: 'n-1',
                    to_node_id: 'n-2',
                    at:
                        '2026-04-02T09:00:00.000Z',
                }),
            ],
        });
        assert.equal(
            presenter.currentNodeId(), 'n-2',
        );
        assert.equal(presenter.isArchive(), true);
    },
);

test(
    'renderableAttributes are the current node'
    + ' refs and buildPage renders a labeled input'
    + ' per required attribute with a marker',
    () => {
        const amountAttr = makeAttribute({
            id: 'a-amt',
            name: 'Amount',
            attribute_type: 'number',
            sort_order: 0,
        });
        const noteAttr = makeAttribute({
            id: 'a-note',
            name: 'Note',
            attribute_type: 'text',
            sort_order: 1,
        });
        const graph = makeFlowGraph({
            nodes: [
                makeNode({
                    id: 'n-1', name: 'Triage',
                    attributes: [
                        makeAttributeRef({
                            attribute_id: 'a-amt',
                            isRequired: true,
                        }),
                        makeAttributeRef({
                            attribute_id: 'a-note',
                            isRequired: false,
                        }),
                    ],
                }),
                makeNode({
                    id: 'n-2', name: 'Done',
                    isArchive: true,
                }),
            ],
        });
        const presenter = makePresenter({
            graph,
            attributes: [amountAttr, noteAttr],
        });
        assert.equal(
            presenter
                .renderableAttributes()
                .length,
            2,
        );
        const out = presenter
            .buildPage().toString();
        assert.match(out, /Attributes/);
        assert.match(out, /Amount \*/);
        assert.match(out, /Note/);
        assert.match(
            out, /data-attribute-id="a-amt"/,
        );
        assert.match(out, /type="number"/);
        assert.ok(!out.includes('undefined'));
    },
);

test(
    'buildPage renders one transition button per'
    + ' outgoing edge and a release button when'
    + ' the work order is not complete',
    () => {
        const graph = makeFlowGraph({
            nodes: [
                makeNode({
                    id: 'n-1', name: 'Triage',
                }),
                makeNode({
                    id: 'n-2', name: 'Approved',
                }),
                makeNode({
                    id: 'n-3', name: 'Rejected',
                }),
            ],
            edges: [
                makeEdge({
                    id: 'e-ok', name: 'Approve',
                    fromNodeId: 'n-1',
                    toNodeId: 'n-2',
                }),
                makeEdge({
                    id: 'e-no', name: 'Reject',
                    fromNodeId: 'n-1',
                    toNodeId: 'n-3',
                }),
            ],
        });
        const presenter = makePresenter({ graph });
        const out = presenter.buildPage().toString();
        assert.match(out, /data-edge-id="e-ok"/);
        assert.match(out, /data-edge-id="e-no"/);
        assert.match(out, /Approve/);
        assert.match(out, /Reject/);
        assert.match(out, /id="unclaim-btn"/);
        assert.match(out, /Release Work Order/);
        assert.match(out, /work-order-transitions/);
    },
);

test(
    'buildPage on a complete work order hides the'
    + ' attributes card, transition buttons, and'
    + ' release button',
    () => {
        const presenter = makePresenter({
            transitions: [
                makeTransition({
                    id: 't-1', from_node_id: '',
                    to_node_id: 'n-2',
                }),
            ],
        });
        const out = presenter.buildPage().toString();
        assert.ok(!out.includes('work-order-fields'));
        assert.ok(!out.includes(
            'work-order-transitions',
        ));
        assert.ok(!out.includes('unclaim-btn'));
        assert.match(out, /WO-42/);
        assert.match(out, /Done/);
    },
);

test(
    'buildPage shows a single Created -> Triage'
    + ' history row for a freshly created work order',
    () => {
        const presenter = makePresenter();
        const out = presenter.buildPage().toString();
        assert.match(out, /History/);
        assert.match(out, /Created/);
        assert.match(out, /Triage/);
        assert.match(out, /Ada Park/);
        assert.ok(!out.includes('Unknown'));
    },
);

test(
    'buildPage history lists transitions newest'
    + ' first with their attribute values',
    () => {
        const amountAttr = makeAttribute({
            id: 'a-amt',
            name: 'Amount',
            attribute_type: 'number',
        });
        const graph = makeFlowGraph({
            nodes: [
                makeNode({
                    id: 'n-1', name: 'Triage',
                    attributes: [
                        makeAttributeRef({
                            attribute_id: 'a-amt',
                        }),
                    ],
                }),
                makeNode({
                    id: 'n-2', name: 'Approved',
                }),
            ],
        });
        const fieldValues = new Map<
            Id, StateFieldValueEntity[]
        >([
            ['t-2', [{
                id: 'fv-1',
                state_event_id: 't-2',
                field_id: 'a-amt',
                value: '1200',
            }]],
        ]);
        const presenter = makePresenter({
            graph,
            transitions: [
                makeTransition({
                    id: 't-1', from_node_id: '',
                    to_node_id: 'n-1',
                    worker_id: 'p-1',
                    at:
                        '2026-04-01T12:00:00.000Z',
                }),
                makeTransition({
                    id: 't-2', from_node_id: 'n-1',
                    to_node_id: 'n-2',
                    worker_id: 'p-2',
                    at:
                        '2026-04-03T08:00:00.000Z',
                }),
            ],
            fieldValues,
            attributes: [amountAttr],
        });
        const out = presenter.buildPage().toString();
        // newest (Triage -> Approved) appears before
        // the creation entry (Created -> Triage).
        assert.ok(
            out.indexOf('Approved')
            < out.indexOf('Created'),
        );
        assert.match(out, /Amount/);
        assert.match(out, /1200/);
        assert.match(out, /Bo Park/);
        assert.match(out, /Ada Park/);
    },
);

test(
    'an active claim by the current worker is'
    + ' reported as claimed with byCurrentWorker',
    () => {
        const presenter = makePresenter({
            activeClaim: {
                workerId: 'p-1',
                at: new Date().toISOString(),
            },
            currentWorkerId: 'p-1',
        });
        const status = presenter.claimStatus();
        assert.equal(status.kind, 'claimed');
        if (status.kind === 'claimed') {
            assert.equal(
                status.byCurrentWorker, true,
            );
        }
    },
);

test(
    'an active claim by another worker is claimed'
    + ' but not by the current worker',
    () => {
        const presenter = makePresenter({
            activeClaim: {
                workerId: 'p-2',
                at: new Date().toISOString(),
            },
            currentWorkerId: 'p-1',
        });
        const status = presenter.claimStatus();
        assert.equal(status.kind, 'claimed');
        if (status.kind === 'claimed') {
            assert.equal(
                status.byCurrentWorker, false,
            );
        }
    },
);

test(
    'a null active claim leaves the work order'
    + ' unclaimed',
    () => {
        const presenter = makePresenter({
            activeClaim: null,
        });
        assert.equal(
            presenter.claimStatus().kind, 'unclaimed',
        );
    },
);
