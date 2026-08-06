import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    nowUtc,
    DEFAULT_LOCK_TIMEOUT,
    type WorkOrderFlowGraph,
    type GraphNode,
    type GraphEdge,
    type NodeAttribute,
    type AttributeType,
    type Id,
    type Member,
} from '../api/types.ts';
import type {
    CreationTransition,
    StepTransition,
    TransitionEvent,
    StateFieldValue,
    WorkOrder,
} from
'../web-app/app/adapters/work-orders-queries.ts';
import type {
    RecordAttribute,
} from '../web-app/app/adapters/record-attributes.ts';
import type {
    ConstraintViolation,
} from '../api/record-constraints.ts';
import {
    WorkboxDetailPresenter,
    buildAttributeInputHtml,
} from
'../web-app/app/presenters/workbox-detail.ts';
import {
    makeHumanMember,
} from './member-fixtures.ts';

// WorkboxDetailPresenter is pure: the constructor
// takes the work order, transition events, per-event
// field values, the active claim (or null), a
// memberMap, the current member id, and the
// attribute map; buildPage() returns SafeHtml.
// The work order arrives as the parsed domain model
// — the adapter already validated the flow graph.

function makeAttributeRef(
    overrides: Partial<NodeAttribute> = {},
): NodeAttribute {
    return {
        attributeId: 'a-1',
        mode: 'editable',
        isRequired: false,
        ...overrides,
    };
}

function makeAttribute(
    overrides: Partial<RecordAttribute> = {},
): RecordAttribute {
    const attributeType: AttributeType =
        overrides.attributeType ?? 'text';
    return {
        id: 'a-1',
        organizationId: '1',
        recordId: 'rec-1',
        name: 'Notes',
        attributeType,
        sortOrder: 0,
        options: [],
        constraints: [],
        readRoles: ['member', 'admin'],
        writeRoles: ['member', 'admin'],
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
        memberIds: [],
        attributes: [],
        taskInstructions: '',
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
    overrides: Partial<WorkOrder> = {},
): WorkOrder {
    return {
        id: 'wo-1',
        organizationId: '1',
        displayId: 'WO-42',
        flowGraph: graph,
        position: 0,
        ...overrides,
    };
}

function makeCreation(
    overrides: Partial<CreationTransition> = {},
): TransitionEvent {
    return {
        kind: 'creation',
        id: 't-1',
        workOrderId: 'wo-1',
        toNodeId: 'n-1',
        memberId: 'p-1',
        at: '2026-04-01T12:00:00.000000Z',
        ...overrides,
    };
}

function makeStep(
    overrides: Partial<StepTransition> = {},
): TransitionEvent {
    return {
        kind: 'step',
        id: 't-2',
        workOrderId: 'wo-1',
        fromNodeId: 'n-1',
        toNodeId: 'n-2',
        memberId: 'p-1',
        at: '2026-04-01T12:00:00.000000Z',
        ...overrides,
    };
}

function makeMemberMap(
    members: Member[],
): Map<Id, Member> {
    return new Map(
        members.map(
            w => [w.idForLink(), w],
        ),
    );
}

function makeAttributeMap(
    attributes: RecordAttribute[],
): ReadonlyMap<string, RecordAttribute> {
    return new Map(
        attributes.map(
            a => [a.id, a] as const,
        ),
    );
}

const MEMBER_MAP = makeMemberMap([
    makeHumanMember('p-1', 'Ada Park'),
    makeHumanMember('p-2', 'Bo Park'),
]);

function makePresenter(
    args: {
        graph?: WorkOrderFlowGraph;
        workOrder?: WorkOrder;
        transitions?: TransitionEvent[];
        fieldValues?:
            Map<Id, StateFieldValue[]>;
        activeClaim?:
            { memberId: Id; at: string } | null;
        currentMemberId?: string;
        attributes?: RecordAttribute[];
    } = {},
): WorkboxDetailPresenter {
    const graph = args.graph ?? makeFlowGraph();
    const workOrder =
        args.workOrder ?? makeWorkOrder(graph);
    const transitions = args.transitions ?? [
        makeCreation(),
    ];
    const attributes = args.attributes ?? [];
    return new WorkboxDetailPresenter(
        workOrder,
        transitions,
        args.fieldValues ?? new Map(),
        args.activeClaim ?? null,
        MEMBER_MAP,
        args.currentMemberId ?? 'p-1',
        makeAttributeMap(attributes),
    );
}

// buildAttributeInputHtml (the exported helper)

test(
    'buildAttributeInputHtml renders a text input'
    + ' carrying the attribute id',
    () => {
        const ref = makeAttributeRef({
            attributeId: 'a-x',
        });
        const attribute = makeAttribute({
            id: 'a-x', attributeType: 'text',
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
            attributeType: 'number',
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
            attributeType: 'date',
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
            attributeType: 'select',
            options: ['Low', 'High'],
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
    'buildAttributeInputHtml renders a radio group'
    + ' with one collectable input per option',
    () => {
        const ref = makeAttributeRef();
        const attribute = makeAttribute({
            attributeType: 'radio',
            options: ['Low', 'High'],
        });
        const out = buildAttributeInputHtml(
            ref, attribute,
        ).toString();
        assert.match(out, /type="radio"/);
        assert.match(out, /name="a-1"/);
        assert.match(out, /data-attribute-id="a-1"/);
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
            attributeType: 'checkbox',
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
            attributeType: 'select',
            options: ['A'],
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
                makeCreation({
                    id: 't-1',
                    toNodeId: 'n-1',
                    at:
                        '2026-04-01T12:00:00.000000Z',
                }),
                makeStep({
                    id: 't-2', fromNodeId: 'n-1',
                    toNodeId: 'n-2',
                    at:
                        '2026-04-02T09:00:00.000000Z',
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
            attributeType: 'number',
            sortOrder: 0,
        });
        const noteAttr = makeAttribute({
            id: 'a-note',
            name: 'Note',
            attributeType: 'text',
            sortOrder: 1,
        });
        const graph = makeFlowGraph({
            nodes: [
                makeNode({
                    id: 'n-1', name: 'Triage',
                    attributes: [
                        makeAttributeRef({
                            attributeId: 'a-amt',
                            isRequired: true,
                        }),
                        makeAttributeRef({
                            attributeId: 'a-note',
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
                makeCreation({
                    id: 't-1',
                    toNodeId: 'n-2',
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
            attributeType: 'number',
        });
        const graph = makeFlowGraph({
            nodes: [
                makeNode({
                    id: 'n-1', name: 'Triage',
                    attributes: [
                        makeAttributeRef({
                            attributeId: 'a-amt',
                        }),
                    ],
                }),
                makeNode({
                    id: 'n-2', name: 'Approved',
                }),
            ],
        });
        const fieldValues = new Map<
            Id, StateFieldValue[]
        >([
            ['t-2', [{
                attributeId: 'a-amt',
                value: '1200',
            }]],
        ]);
        const presenter = makePresenter({
            graph,
            transitions: [
                makeCreation({
                    id: 't-1',
                    toNodeId: 'n-1',
                    memberId: 'p-1',
                    at:
                        '2026-04-01T12:00:00.000000Z',
                }),
                makeStep({
                    id: 't-2', fromNodeId: 'n-1',
                    toNodeId: 'n-2',
                    memberId: 'p-2',
                    at:
                        '2026-04-03T08:00:00.000000Z',
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
    'an active claim by the current member is'
    + ' reported as claimed with byCurrentMember',
    () => {
        const presenter = makePresenter({
            activeClaim: {
                memberId: 'p-1',
                at: nowUtc(),
            },
            currentMemberId: 'p-1',
        });
        const status = presenter.claimStatus();
        assert.equal(status.kind, 'claimed');
        if (status.kind === 'claimed') {
            assert.equal(
                status.byCurrentMember, true,
            );
        }
    },
);

test(
    'an active claim by another member is claimed'
    + ' but not by the current member',
    () => {
        const presenter = makePresenter({
            activeClaim: {
                memberId: 'p-2',
                at: nowUtc(),
            },
            currentMemberId: 'p-1',
        });
        const status = presenter.claimStatus();
        assert.equal(status.kind, 'claimed');
        if (status.kind === 'claimed') {
            assert.equal(
                status.byCurrentMember, false,
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

// buildViolations: the rejected-transition banner

test(
    'buildViolations names each failed attribute,'
    + ' phrasing range bounds by attribute type',
    () => {
        const amount = makeAttribute({
            id: 'a-amt', name: 'Amount',
            attributeType: 'number',
        });
        const due = makeAttribute({
            id: 'a-when', name: 'Due date',
            attributeType: 'date',
        });
        const presenter = makePresenter({
            attributes: [amount, due],
        });
        const violations: ConstraintViolation[] = [
            {
                kind: 'required',
                attributeId: 'a-amt',
                attributeName: 'Amount',
            },
            {
                kind: 'range_min',
                attributeId: 'a-when',
                attributeName: 'Due date',
                min: '2026-01-01',
            },
        ];
        const out = presenter
            .buildViolations(violations)
            .toString();
        assert.match(out, /violations-banner/);
        assert.match(out, /role="alert"/);
        assert.match(out, /Amount is required/);
        // Date-aware phrasing proves the presenter
        // resolved the attribute by id for its type.
        assert.match(
            out,
            /Due date must be on or after 2026-01-01/,
        );
        assert.equal(
            out.match(/<li>/g)?.length, 2,
        );
        assert.ok(!out.includes('undefined'));
    },
);

test(
    'buildViolations throws when a violation names'
    + ' an attribute absent from the Record',
    () => {
        const presenter = makePresenter({
            attributes: [],
        });
        assert.throws(
            () => presenter.buildViolations([
                {
                    kind: 'required',
                    attributeId: 'ghost',
                    attributeName: 'Ghost',
                },
            ]),
            /unknown attributeId: ghost/,
        );
    },
);
