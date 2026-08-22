import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    validateHumanMemberEntity,
    validateAIMemberEntity,
    validateIdeaEntity,
    validateProjectEntity,
    validateFlowEntity,
    validateWorkOrderEntity,
    validateFlowWorkOrderEntity,
    validateStateFieldValueEntity,
    validateOrganizationEntity,
    validateIdeaSubmissionEntity,
    validateProjectFlowEntity,
    validateRecordAttributeEntity,
    validateFlowDocumentBody,
    validatePairEntity,
    asStoredGraph,
    asConstraint,
    assertFlowGraphWriteLaw,
} from '../api/validators.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import {
    firstProviderModel,
} from './member-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const F_LEGACY = generateIdentifier();
const F_1 = generateIdentifier();
const WO_1 = generateIdentifier();
const EVT_1 = generateIdentifier();
const I_1 = generateIdentifier();
const U_1 = generateIdentifier();
const AI_1 = generateIdentifier();
const PERSON_1 = generateIdentifier();
const R_1 = generateIdentifier();
const ORGANIZATION_1 = generateIdentifier();
const NODE_ID = generateIdentifier();
const MEMBER_SARAH = generateIdentifier();
const MEMBER_CLAUDE = generateIdentifier();
const UNKNOWN_MODEL = generateIdentifier();

// --- HumanMemberEntity ---

const validHumanMember = {
    title: 'Engineer',
    department: 'R&D',
    strengths: ['analytical'],
    team_dimensions: { driver: 0.5 },
};

test(
    'validateHumanMemberEntity accepts valid payload',
    () => {
        const result = validateHumanMemberEntity(
            validHumanMember,
        );
        assert.equal(result.title, 'Engineer');
    },
);

test(
    'validateHumanMemberEntity rejects status key '
    + '(retired by Stage 10b+c)',
    () => {
        assert.throws(
            () => validateHumanMemberEntity({
                ...validHumanMember,
                status: 'active',
            }),
            /unexpected key "status"/,
        );
    },
);

test(
    'validateHumanMemberEntity rejects contact PII'
    + ' (now in identity_pii)',
    () => {
        assert.throws(
            () => validateHumanMemberEntity({
                ...validHumanMember,
                email: 'ada@example.com',
            }),
            /unexpected key "email"/,
        );
    },
);

test(
    'validateHumanMemberEntity rejects unexpected key',
    () => {
        assert.throws(
            () => validateHumanMemberEntity({
                ...validHumanMember,
                admin: true,
            }),
            /unexpected key "admin"/,
        );
    },
);

test(
    'validateHumanMemberEntity rejects missing'
    + ' required key',
    () => {
        const body = { ...validHumanMember };
        delete (
            body as Record<string, unknown>
        )['department'];
        assert.throws(
            () => validateHumanMemberEntity(body),
            /missing required key "department"/,
        );
    },
);

test(
    'validateHumanMemberEntity rejects non-string'
    + ' strengths elements',
    () => {
        assert.throws(
            () => validateHumanMemberEntity({
                ...validHumanMember,
                strengths: [1, 2],
            }),
            /expected string for strengths\[0\]/,
        );
    },
);

test(
    'validateHumanMemberEntity rejects non-number'
    + ' team dimension values',
    () => {
        assert.throws(
            () => validateHumanMemberEntity({
                ...validHumanMember,
                team_dimensions: { driver: 'high' },
            }),
            /expected finite number for team_dimensions\.driver/,
        );
    },
);

test(
    'validateHumanMemberEntity accepts native'
    + ' strengths and team_dimensions',
    () => {
        const entity = validateHumanMemberEntity({
            title: 'Engineer',
            department: 'R&D',
            strengths: ['systems', 'mentoring'],
            team_dimensions: { driver: 60, amiable: 40 },
        });
        assert.deepEqual(
            entity.strengths,
            ['systems', 'mentoring'],
        );
        assert.deepEqual(
            entity.team_dimensions,
            { driver: 60, amiable: 40 },
        );
    },
);

test(
    'validateHumanMemberEntity rejects a'
    + ' JSON-encoded strengths string',
    () => {
        assert.throws(
            () => validateHumanMemberEntity({
                title: 'Engineer',
                department: 'R&D',
                strengths: '["systems"]',
                team_dimensions: { driver: 60 },
            }),
            /expected array for strengths/,
        );
    },
);

test(
    'validateHumanMemberEntity rejects a'
    + ' JSON-encoded team_dimensions string',
    () => {
        assert.throws(
            () => validateHumanMemberEntity({
                title: 'Engineer',
                department: 'R&D',
                strengths: [],
                team_dimensions: '{"driver":60}',
            }),
            /expected object for team_dimensions/,
        );
    },
);

// --- AIMemberEntity ---

const validAIMember = {
    name: 'Claude Opus 4.8',
    description: 'Long context, deep reasoning.',
    skill_focus: 'Deep reasoning over long docs.',
    model: firstProviderModel().id,
};

test(
    'validateAIMemberEntity accepts valid payload',
    () => {
        const result = validateAIMemberEntity(
            validAIMember,
        );
        assert.equal(
            result.description,
            'Long context, deep reasoning.',
        );
        assert.equal(
            result.skill_focus,
            'Deep reasoning over long docs.',
        );
        assert.equal(
            result.model,
            firstProviderModel().id,
        );
    },
);

test(
    'validateAIMemberEntity accepts empty'
    + ' skill_focus',
    () => {
        const result = validateAIMemberEntity({
            ...validAIMember,
            skill_focus: '',
        });
        assert.equal(result.skill_focus, '');
    },
);

test(
    'validateAIMemberEntity rejects unknown'
    + ' model id',
    () => {
        assert.throws(
            () => validateAIMemberEntity({
                ...validAIMember,
                model: UNKNOWN_MODEL,
            }),
            /model must be a known provider/,
        );
    },
);

test(
    'validateAIMemberEntity rejects unexpected key',
    () => {
        assert.throws(
            () => validateAIMemberEntity({
                ...validAIMember,
                surprise: 'oops',
            }),
            /unexpected key "surprise"/,
        );
    },
);

test(
    'validateAIMemberEntity rejects missing model',
    () => {
        const { model: _omit, ...rest } =
            validAIMember;
        assert.throws(
            () => validateAIMemberEntity(rest),
            /missing required key "model"/,
        );
    },
);

test(
    'validateAIMemberEntity rejects missing'
    + ' skill_focus',
    () => {
        const { skill_focus: _omit, ...rest } =
            validAIMember;
        assert.throws(
            () => validateAIMemberEntity(rest),
            /missing required key "skill_focus"/,
        );
    },
);

// --- IdeaEntity ---

const validIdea = {
    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    title: 'Idea One',
    position: 1,
    problem_statement: 'A problem',
    target_users: 'Users',
    proposed_solution: 'A solution',
    expected_outcome: 'Better',
    success_metrics: 'Metrics',
};

test('validateIdeaEntity accepts valid payload', () => {
    const result = validateIdeaEntity(validIdea);
    assert.equal(result.title, 'Idea One');
    assert.equal(result.position, 1);
});

test(
    'validateIdeaEntity rejects unexpected key',
    () => {
    assert.throws(
        () => validateIdeaEntity({
            ...validIdea,
            secret: 'pwned',
        }),
        /unexpected key "secret"/,
    );
});

test(
    'validateIdeaEntity rejects status key (retired)',
    () => {
    assert.throws(
        () => validateIdeaEntity({
            ...validIdea,
            status: 'active',
        }),
        /unexpected key "status"/,
    );
});

test(
    'validateIdeaEntity rejects readiness key (retired)',
    () => {
    assert.throws(
        () => validateIdeaEntity({
            ...validIdea,
            readiness: 'ready',
        }),
        /unexpected key "readiness"/,
    );
});

test(
    'validateIdeaEntity rejects missing required key',
    () => {
    const body = { ...validIdea };
    delete (
        body as Record<string, unknown>
    )['expected_outcome'];
    assert.throws(
        () => validateIdeaEntity(body),
        /missing required key "expected_outcome"/,
    );
});

// --- ProjectEntity ---

const validProject = {
    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    title: 'Proj',
    description: 'Desc',
    progress: 0,
    start_date: '2024-01-01',
    target_end_date: '2024-12-31',
    estimated_cost: 1000,
    actual_cost: 0,
    position: 1,
};

test('validateProjectEntity accepts valid payload', () => {
    const result =
        validateProjectEntity(validProject);
    assert.equal(result.title, 'Proj');
});

test('validateProjectEntity rejects unknown key', () => {
    assert.throws(
        () => validateProjectEntity({
            ...validProject,
            status: 'submitted',
        }),
        /unexpected key "status"/,
    );
});

test(
    'validateProjectEntity rejects a timestamp where a'
    + ' calendar date belongs',
    () => {
    assert.throws(
        () => validateProjectEntity({
            ...validProject,
            start_date: '2024-01-01T00:00:00.000000Z',
        }),
        /calendar date YYYY-MM-DD for ProjectEntity/,
    );
});

test(
    'validateProjectEntity rejects an impossible day',
    () => {
    assert.throws(
        () => validateProjectEntity({
            ...validProject,
            target_end_date: '2024-02-30',
        }),
        /calendar date YYYY-MM-DD for ProjectEntity/,
    );
});

// --- FlowEntity ---

// The graph is NOT a FlowEntity key — it rides the flow
// document body as native nested JSON (validateFlowDocumentBody
// / asStoredGraph). validateFlowEntity accepts only scalars.
const validFlow = {
    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    name: 'Flow A',
    is_locked: false,
    is_auto_layout: true,
    is_auto_fit: true,
    lock_timeout: DEFAULT_LOCK_TIMEOUT,
};

test('validateFlowEntity accepts valid payload', () => {
    const result = validateFlowEntity(validFlow);
    assert.equal(result.name, 'Flow A');
    assert.equal(result.is_locked, false);
});

test(
    'validateFlowEntity rejects non-boolean is_locked',
    () => {
    assert.throws(
        () => validateFlowEntity({
            ...validFlow,
            is_locked: 0,
        }),
        /expected boolean for is_locked/,
    );
});

test(
    'validateFlowEntity rejects unexpected key',
    () => {
    assert.throws(
        () => validateFlowEntity({
            ...validFlow,
            admin: true,
        }),
        /unexpected key "admin"/,
    );
});

test(
    'validateFlowEntity rejects missing required key',
    () => {
    const body = { ...validFlow };
    delete (
        body as Record<string, unknown>
    )['lock_timeout'];
    assert.throws(
        () => validateFlowEntity(body),
        /missing required key "lock_timeout"/,
    );
});


// --- WorkOrderEntity ---

const minimalWoGraph = {
    name: 'WO Flow',
    lockTimeout: DEFAULT_LOCK_TIMEOUT,
    nodes: [],
    edges: [],
};

const validWorkOrder = {
    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    display_id: 'WO-001',
    flow_graph: minimalWoGraph,
    position: 1,
};

test(
    'validateWorkOrderEntity accepts valid payload',
    () => {
    const result =
        validateWorkOrderEntity(validWorkOrder);
    assert.equal(result.display_id, 'WO-001');
});

test(
    'validateWorkOrderEntity rejects non-number'
    + ' position',
    () => {
    assert.throws(
        () => validateWorkOrderEntity({
            ...validWorkOrder,
            position: 'first',
        }),
        /expected finite number for position/,
    );
});

test(
    'validateWorkOrderEntity tolerates legacy'
    + ' graphs still carrying flowId',
    () => {
    const result = validateWorkOrderEntity({
        ...validWorkOrder,
        flow_graph: {
            flowId: F_LEGACY,
            name: 'WO Flow',
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [], edges: [],
        },
    });
    assert.equal(result.display_id, 'WO-001');
});

// --- FlowWorkOrderEntity ---

const validFlowWorkOrder = {
    flow_id: F_1,
    work_order_id: WO_1,
    at: '2024-01-01T00:00:00.000000Z',
};

test(
    'validateFlowWorkOrderEntity accepts valid payload',
    () => {
    const result =
        validateFlowWorkOrderEntity(
            validFlowWorkOrder,
        );
    assert.equal(result.flow_id, F_1);
});

test(
    'validateFlowWorkOrderEntity rejects missing'
    + ' work_order_id',
    () => {
    assert.throws(
        () => validateFlowWorkOrderEntity({
            flow_id: F_1,
            at: '2024-01-01T00:00:00.000000Z',
        }),
        /missing required key "work_order_id"/,
    );
});

// --- StateFieldValueEntity ---

const validStateFieldValue = {
    state_event_id: EVT_1,
    attribute_id: F_1,
    value: 'Acme Corp',
};

test(
    'validateStateFieldValueEntity accepts valid'
    + ' payload',
    () => {
    const result =
        validateStateFieldValueEntity(
            validStateFieldValue,
        );
    assert.equal(result.state_event_id, EVT_1);
});

test(
    'validateStateFieldValueEntity rejects missing'
    + ' state_event_id',
    () => {
    assert.throws(
        () => validateStateFieldValueEntity({
            attribute_id: F_1,
            value: 'x',
        }),
        /missing required key "state_event_id"/,
    );
});

// --- OrganizationEntity ---

const validOrganization = {
    name: 'Acme Corp',
    domain: 'acme.com',
    next_billing: '2025-01-01T00:00:00.000000Z',
    seats: 10,
    projects_limit: 50,
    ideas_limit: 200,
};

test(
    'validateOrganizationEntity accepts valid payload',
    () => {
    const result =
        validateOrganizationEntity(validOrganization);
    assert.equal(result.name, 'Acme Corp');
    assert.equal(result.seats, 10);
});

test(
    'validateOrganizationEntity rejects non-number'
    + ' seats',
    () => {
    assert.throws(
        () => validateOrganizationEntity({
            ...validOrganization,
            seats: 'ten',
        }),
        /expected finite number for seats/,
    );
});

test(
    'validateOrganizationEntity rejects unexpected'
    + ' key',
    () => {
    assert.throws(
        () => validateOrganizationEntity({
            ...validOrganization,
            admin: true,
        }),
        /unexpected key "admin"/,
    );
});

test(
    'validateOrganizationEntity rejects missing'
    + ' required key',
    () => {
    const body = { ...validOrganization };
    delete (
        body as Record<string, unknown>
    )['seats'];
    assert.throws(
        () => validateOrganizationEntity(body),
        /missing required key "seats"/,
    );
});

test(
    'validateOrganizationEntity rejects the retired'
    + ' stored aggregates',
    () => {
    // used_seats / last_activity are DERIVED from the
    // memberships ledger and the states log — a stored
    // copy is a second truth kept in sync by nothing
    assert.throws(
        () => validateOrganizationEntity({
            ...validOrganization,
            used_seats: 5,
        }),
        /unexpected key "used_seats"/,
    );
});

test(
    'validateOrganizationEntity rejects a bare'
    + ' calendar date for next_billing',
    () => {
    assert.throws(
        () => validateOrganizationEntity({
            ...validOrganization,
            next_billing: '2025-01-01',
        }),
        /invalid timestamp/,
    );
});

// --- IdeaSubmissionEntity ---

const validIdeaSubmission = {
    idea_id: I_1,
    member_id: U_1,
    at: '2024-01-01T00:00:00.000000Z',
};

test(
    'validateIdeaSubmissionEntity accepts valid'
    + ' payload',
    () => {
    const result =
        validateIdeaSubmissionEntity(
            validIdeaSubmission,
        );
    assert.equal(result.idea_id, I_1);
});

test(
    'validateIdeaSubmissionEntity rejects missing'
    + ' idea_id',
    () => {
    assert.throws(
        () => validateIdeaSubmissionEntity({
            member_id: U_1,
            at: '2024-01-01T00:00:00.000000Z',
        }),
        /missing required key "idea_id"/,
    );
});

// --- ProjectFlowEntity ---

const validProjectFlow = {
    project_id: 'pjQzgITAPDQVyvCVpzpIfQ',
    flow_id: F_1,
    at: '2024-01-01T00:00:00.000000Z',
};

test(
    'validateProjectFlowEntity accepts valid payload',
    () => {
    const result =
        validateProjectFlowEntity(
            validProjectFlow,
        );
    assert.equal(result.project_id, 'pjQzgITAPDQVyvCVpzpIfQ');
});

test(
    'validateProjectFlowEntity rejects missing'
    + ' flow_id',
    () => {
    assert.throws(
        () => validateProjectFlowEntity({
            project_id: 'pjQzgITAPDQVyvCVpzpIfQ',
            at: '2024-01-01T00:00:00.000000Z',
        }),
        /missing required key "flow_id"/,
    );
});

// --- asStoredGraph (memberIds shape) ---

const baseNode = {
    id: NODE_ID,
    name: 'N',
    positionX: 0,
    positionY: 0,
    isCreate: false,
    isArchive: false,
    attributes: [],
    taskInstructions: '',
};

test(
    'asStoredGraph throws on missing memberIds',
    () => {
        assert.throws(
            () => asStoredGraph(
                { nodes: [baseNode], edges: [] },
                'graph',
            ),
        );
    },
);

test(
    'asStoredGraph round-trips an empty memberIds',
    () => {
        const result = asStoredGraph(
            {
                nodes: [
                    {
                        ...baseNode,
                        memberIds: [],
                    },
                ],
                edges: [],
            },
            'graph',
        );
        const n = result.nodes[0]!;
        assert.deepEqual(n.memberIds, []);
    },
);

test(
    'asStoredGraph round-trips a populated'
    + ' memberIds list',
    () => {
        const result = asStoredGraph(
            {
                nodes: [
                    {
                        ...baseNode,
                        memberIds: [
                            MEMBER_SARAH,
                            MEMBER_CLAUDE,
                        ],
                    },
                ],
                edges: [],
            },
            'graph',
        );
        const n = result.nodes[0]!;
        assert.deepEqual(
            n.memberIds,
            [MEMBER_SARAH, MEMBER_CLAUDE],
        );
    },
);

test(
    'asStoredGraph leaves missing agentIds absent',
    () => {
        const result = asStoredGraph(
            {
                nodes: [
                    {
                        ...baseNode,
                        memberIds: [],
                    },
                ],
                edges: [],
            },
            'graph',
        );
        const n = result.nodes[0]!;
        assert.equal(n.agentIds, undefined);
    },
);

test(
    'asStoredGraph round-trips a populated'
    + ' agentIds list',
    () => {
        const result = asStoredGraph(
            {
                nodes: [
                    {
                        ...baseNode,
                        memberIds: [],
                        agentIds: ['UuvoBhQJUSEsiJwscXPkUg'],
                    },
                ],
                edges: [],
            },
            'graph',
        );
        const n = result.nodes[0]!;
        assert.deepEqual(n.agentIds, ['UuvoBhQJUSEsiJwscXPkUg']);
    },
);

test(
    'assertFlowGraphWriteLaw rejects an AI agent'
    + ' id in memberIds',
    () => {
        const graph = asStoredGraph(
            {
                nodes: [
                    {
                        ...baseNode,
                        memberIds: [AI_1],
                    },
                ],
                edges: [],
            },
            'graph',
        );
        assert.throws(
            () => assertFlowGraphWriteLaw(
                graph, new Set([AI_1]),
            ),
            /not AI agents/,
        );
    },
);

test(
    'assertFlowGraphWriteLaw accepts a live agent'
    + ' in agentIds',
    () => {
        const graph = asStoredGraph(
            {
                nodes: [
                    {
                        ...baseNode,
                        memberIds: [PERSON_1],
                        agentIds: ['UuvoBhQJUSEsiJwscXPkUg'],
                    },
                ],
                edges: [],
            },
            'graph',
        );
        assert.doesNotThrow(() =>
            assertFlowGraphWriteLaw(
                graph, new Set(['UuvoBhQJUSEsiJwscXPkUg']),
            ),
        );
    },
);

test(
    'asStoredGraph rejects non-string entries in'
    + ' memberIds',
    () => {
        assert.throws(
            () => asStoredGraph(
                {
                    nodes: [
                        {
                            ...baseNode,
                            memberIds: [123],
                        },
                    ],
                    edges: [],
                },
                'graph',
            ),
        );
    },
);

// --- asStoredGraph (taskInstructions) ---

test(
    'asStoredGraph throws on missing'
    + ' taskInstructions',
    () => {
        assert.throws(
            () => asStoredGraph(
                {
                    nodes: [
                        {
                            id: 'n1',
                            name: 'N',
                            positionX: 0,
                            positionY: 0,
                            isCreate: false,
                            isArchive: false,
                            attributes: [],
                            memberIds: [],
                        },
                    ],
                    edges: [],
                },
                'graph',
            ),
        );
    },
);

test(
    'asStoredGraph round-trips an empty'
    + ' taskInstructions',
    () => {
        const result = asStoredGraph(
            {
                nodes: [
                    {
                        ...baseNode,
                        memberIds: [],
                        taskInstructions: '',
                    },
                ],
                edges: [],
            },
            'graph',
        );
        const n = result.nodes[0]!;
        assert.equal(n.taskInstructions, '');
    },
);

test(
    'asStoredGraph round-trips multi-line'
    + ' markdown taskInstructions byte-for-byte',
    () => {
        const md = '# Title\n\n- one\n- two\n';
        const result = asStoredGraph(
            {
                nodes: [
                    {
                        ...baseNode,
                        memberIds: [],
                        taskInstructions: md,
                    },
                ],
                edges: [],
            },
            'graph',
        );
        const n = result.nodes[0]!;
        assert.equal(n.taskInstructions, md);
    },
);

test(
    'asStoredGraph rejects non-string'
    + ' taskInstructions',
    () => {
        assert.throws(
            () => asStoredGraph(
                {
                    nodes: [
                        {
                            ...baseNode,
                            memberIds: [],
                            taskInstructions: 123,
                        },
                    ],
                    edges: [],
                },
                'graph',
            ),
        );
    },
);

// --- RecordAttributeEntity ---

const validSelectAttribute = {
    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    record_id: R_1,
    name: 'Priority',
    attribute_type: 'select',
    sort_order: 0,
    options: ['High', 'Low'],
    constraints: [] as const,
};

test(
    'validateRecordAttributeEntity rejects a'
    + ' select with zero options',
    () => {
    assert.throws(
        () => validateRecordAttributeEntity({
            ...validSelectAttribute,
            options: [],
        }),
        /at least one option/,
    );
});

test(
    'validateRecordAttributeEntity accepts a'
    + ' radio with options',
    () => {
    const result = validateRecordAttributeEntity({
        ...validSelectAttribute,
        attribute_type: 'radio',
    });
    assert.equal(result.attribute_type, 'radio');
});

test(
    'validateRecordAttributeEntity rejects a'
    + ' radio with zero options',
    () => {
    assert.throws(
        () => validateRecordAttributeEntity({
            ...validSelectAttribute,
            attribute_type: 'radio',
            options: [],
        }),
        /at least one option/,
    );
});

test(
    'validateRecordAttributeEntity rejects non-string'
    + ' option elements on any type',
    () => {
    assert.throws(
        () => validateRecordAttributeEntity({
            ...validSelectAttribute,
            attribute_type: 'text',
            options: [3],
        }),
        /expected string for options\[0\]/,
    );
});

test(
    'validateRecordAttributeEntity rejects a regex'
    + ' constraint on a number attribute_type',
    () => {
    assert.throws(
        () => validateRecordAttributeEntity({
            ...validSelectAttribute,
            attribute_type: 'number',
            options: [],
            constraints: [
                { kind: 'regex', pattern: '^\\d+$' },
            ],
        }),
        /regex/,
    );
});

test(
    'validateRecordAttributeEntity rejects range_min'
    + ' on a text attribute_type',
    () => {
    assert.throws(
        () => validateRecordAttributeEntity({
            ...validSelectAttribute,
            attribute_type: 'text',
            options: [],
            constraints: [
                { kind: 'range_min', min: '0' },
            ],
        }),
    );
});

test(
    'validateRecordAttributeEntity accepts range_min'
    + ' on a date attribute_type',
    () => {
    const result = validateRecordAttributeEntity({
        ...validSelectAttribute,
        attribute_type: 'date',
        options: [],
        constraints: [
            {
                kind: 'range_min',
                min: '2000-01-01',
            },
        ],
    });
    assert.equal(result.attribute_type, 'date');
});

test(
    'validateRecordAttributeEntity accepts a regex'
    + ' constraint on a text attribute_type',
    () => {
    const result = validateRecordAttributeEntity({
        ...validSelectAttribute,
        attribute_type: 'text',
        options: [],
        constraints: [
            {
                kind: 'regex',
                pattern: '^[^@]+@[^@]+\\.[^@]+$',
            },
        ],
    });
    assert.equal(result.name, 'Priority');
});

test('asConstraint rejects nested-quantifier regex', () => {
    assert.throws(
        () => asConstraint(
            { kind: 'regex', pattern: '(a+)+$' }, 'c',
        ),
        /nested unbounded quantifiers/,
    );
});

test('asConstraint rejects an over-long pattern', () => {
    assert.throws(
        () => asConstraint(
            { kind: 'regex', pattern: 'a'.repeat(201) },
            'c',
        ),
        /exceeds 200 chars/,
    );
});

test('asConstraint accepts a safe pattern', () => {
    assert.equal(
        asConstraint(
            { kind: 'regex', pattern: '^[a-z]{3,10}$' },
            'c',
        ).kind,
        'regex',
    );
});

test(
    'validateFlowDocumentBody accepts a native'
    + ' graph object',
    () => {
        const body = validateFlowDocumentBody({
            name: 'Onboarding',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout: 28800,
            state: 'active',
            state_at: '2026-07-12T00:00:00.000000Z',
            state_event_id: EVT_1,
            graph: { nodes: [], edges: [] },
            graphDelta: {
                nodes: [], edges: [],
                deletions: [],
                memberEvents: [],
                attributeEvents: [],
            },
            revivals: [],
        });
        assert.deepEqual(
            body.graph, { nodes: [], edges: [] },
        );
    },
);

test(
    'validateFlowDocumentBody rejects a'
    + ' JSON-encoded graph string',
    () => {
        assert.throws(
            () => validateFlowDocumentBody({
                name: 'Onboarding',
                is_locked: false,
                is_auto_layout: true,
                is_auto_fit: true,
                lock_timeout: 28800,
                state: 'active',
                state_at:
                    '2026-07-12T00:00:00.000000Z',
                state_event_id: EVT_1,
                graph: '{"nodes":[],"edges":[]}',
                graphDelta: {
                    nodes: [], edges: [],
                    deletions: [],
                    memberEvents: [],
                    attributeEvents: [],
                },
                revivals: [],
            }),
            /expected object for FlowDocumentBody\.graph/,
        );
    },
);

test(
    'validateWorkOrderEntity accepts a native'
    + ' flow_graph object',
    () => {
        const entity = validateWorkOrderEntity({
            organization_id: ORGANIZATION_1,
            display_id: 'a7c3e1f9',
            flow_graph: {
                name: 'Onboarding',
                lockTimeout: 28800,
                nodes: [],
                edges: [],
            },
            position: 1,
        });
        assert.deepEqual(
            entity.flow_graph,
            {
                name: 'Onboarding',
                lockTimeout: 28800,
                nodes: [],
                edges: [],
            },
        );
    },
);

test(
    'validateWorkOrderEntity rejects a'
    + ' JSON-encoded flow_graph string',
    () => {
        assert.throws(
            () => validateWorkOrderEntity({
                organization_id: ORGANIZATION_1,
                display_id: 'a7c3e1f9',
                flow_graph:
                    '{"name":"x","lockTimeout":1,'
                    + '"nodes":[],"edges":[]}',
                position: 1,
            }),
            /expected object for flow_graph/,
        );
    },
);

// --- PairEntity ---

const validPair = {
    uri_collection: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    uri_id: '42',
    requester_identity_id: 'XXZruirZyAOoRpNxaDnpSA',
    method: 'PUT',
    request_at: '2026-01-01T00:00:00.000000Z',
    request_hash: 'a'.repeat(64),
    request: '{"kind":"request"}',
    response_at: '2026-01-01T00:00:00.000001Z',
    version: 'e'.repeat(64),
    response: '{"kind":"response"}',
    operation_id: '0123456789ABCDEFGHIJKw',
};

test(
    'validatePairEntity accepts a full pair',
    () => {
        const got = validatePairEntity(validPair);
        assert.equal(got.method, 'PUT');
        assert.equal(got.request_at, validPair.request_at);
        assert.equal(
            got.response_at, validPair.response_at,
        );
    },
);

test(
    'validatePairEntity rejects status key',
    () => {
        assert.throws(
            () => validatePairEntity({
                ...validPair, status: 200,
            }),
            /unexpected key "status"/,
        );
    },
);

test(
    'validatePairEntity rejects message_hash key',
    () => {
        assert.throws(
            () => validatePairEntity({
                ...validPair,
                message_hash: 'a'.repeat(64),
            }),
            /unexpected key "message_hash"/,
        );
    },
);

test(
    'validatePairEntity rejects a short hash',
    () => {
        assert.throws(
            () => validatePairEntity({
                ...validPair,
                request_hash: 'aa',
            }),
            /request_hash must be a 64-/,
        );
    },
);

test(
    'validatePairEntity rejects a lowercase method',
    () => {
        assert.throws(
            () => validatePairEntity({
                ...validPair, method: 'put',
            }),
            /method must match \^\[A-Z\]\+\$/,
        );
    },
);
