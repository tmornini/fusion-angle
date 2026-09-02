import { assertEquals, assertStrictEquals, assertThrows } from '@std/assert';
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
    validateMessagePairEntity,
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

Deno.test(
    'validateHumanMemberEntity accepts valid payload',
    () => {
        const result = validateHumanMemberEntity(
            validHumanMember,
        );
        assertStrictEquals(result.title, 'Engineer');
    },
);

Deno.test(
    'validateHumanMemberEntity rejects status key '
    + '(retired by Stage 10b+c)',
    () => {
        assertThrows(
            () => validateHumanMemberEntity({
                ...validHumanMember,
                status: 'active',
            }),
            Error, 'unexpected key "status"',
        );
    },
);

Deno.test(
    'validateHumanMemberEntity rejects contact PII'
    + ' (now in identity_pii)',
    () => {
        assertThrows(
            () => validateHumanMemberEntity({
                ...validHumanMember,
                email: 'ada@example.com',
            }),
            Error, 'unexpected key "email"',
        );
    },
);

Deno.test(
    'validateHumanMemberEntity rejects unexpected key',
    () => {
        assertThrows(
            () => validateHumanMemberEntity({
                ...validHumanMember,
                admin: true,
            }),
            Error, 'unexpected key "admin"',
        );
    },
);

Deno.test(
    'validateHumanMemberEntity rejects missing'
    + ' required key',
    () => {
        const body = { ...validHumanMember };
        delete (
            body as Record<string, unknown>
        )['department'];
        assertThrows(
            () => validateHumanMemberEntity(body),
            Error, 'missing required key "department"',
        );
    },
);

Deno.test(
    'validateHumanMemberEntity rejects non-string'
    + ' strengths elements',
    () => {
        assertThrows(
            () => validateHumanMemberEntity({
                ...validHumanMember,
                strengths: [1, 2],
            }),
            Error, 'expected string for strengths[0]',
        );
    },
);

Deno.test(
    'validateHumanMemberEntity rejects non-number'
    + ' team dimension values',
    () => {
        assertThrows(
            () => validateHumanMemberEntity({
                ...validHumanMember,
                team_dimensions: { driver: 'high' },
            }),
            Error, 'expected finite number for team_dimensions.driver',
        );
    },
);

Deno.test(
    'validateHumanMemberEntity accepts native'
    + ' strengths and team_dimensions',
    () => {
        const entity = validateHumanMemberEntity({
            title: 'Engineer',
            department: 'R&D',
            strengths: ['systems', 'mentoring'],
            team_dimensions: { driver: 60, amiable: 40 },
        });
        assertEquals(
            entity.strengths,
            ['systems', 'mentoring'],
        );
        assertEquals(
            entity.team_dimensions,
            { driver: 60, amiable: 40 },
        );
    },
);

Deno.test(
    'validateHumanMemberEntity rejects a'
    + ' JSON-encoded strengths string',
    () => {
        assertThrows(
            () => validateHumanMemberEntity({
                title: 'Engineer',
                department: 'R&D',
                strengths: '["systems"]',
                team_dimensions: { driver: 60 },
            }),
            Error, 'expected array for strengths',
        );
    },
);

Deno.test(
    'validateHumanMemberEntity rejects a'
    + ' JSON-encoded team_dimensions string',
    () => {
        assertThrows(
            () => validateHumanMemberEntity({
                title: 'Engineer',
                department: 'R&D',
                strengths: [],
                team_dimensions: '{"driver":60}',
            }),
            Error, 'expected object for team_dimensions',
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

Deno.test(
    'validateAIMemberEntity accepts valid payload',
    () => {
        const result = validateAIMemberEntity(
            validAIMember,
        );
        assertStrictEquals(
            result.description,
            'Long context, deep reasoning.',
        );
        assertStrictEquals(
            result.skill_focus,
            'Deep reasoning over long docs.',
        );
        assertStrictEquals(
            result.model,
            firstProviderModel().id,
        );
    },
);

Deno.test(
    'validateAIMemberEntity accepts empty'
    + ' skill_focus',
    () => {
        const result = validateAIMemberEntity({
            ...validAIMember,
            skill_focus: '',
        });
        assertStrictEquals(result.skill_focus, '');
    },
);

Deno.test(
    'validateAIMemberEntity rejects unknown'
    + ' model id',
    () => {
        assertThrows(
            () => validateAIMemberEntity({
                ...validAIMember,
                model: UNKNOWN_MODEL,
            }),
            Error, 'model must be a known provider',
        );
    },
);

Deno.test(
    'validateAIMemberEntity rejects unexpected key',
    () => {
        assertThrows(
            () => validateAIMemberEntity({
                ...validAIMember,
                surprise: 'oops',
            }),
            Error, 'unexpected key "surprise"',
        );
    },
);

Deno.test(
    'validateAIMemberEntity rejects missing model',
    () => {
        const { model: _omit, ...rest } =
            validAIMember;
        assertThrows(
            () => validateAIMemberEntity(rest),
            Error, 'missing required key "model"',
        );
    },
);

Deno.test(
    'validateAIMemberEntity rejects missing'
    + ' skill_focus',
    () => {
        const { skill_focus: _omit, ...rest } =
            validAIMember;
        assertThrows(
            () => validateAIMemberEntity(rest),
            Error, 'missing required key "skill_focus"',
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

Deno.test('validateIdeaEntity accepts valid payload', () => {
    const result = validateIdeaEntity(validIdea);
    assertStrictEquals(result.title, 'Idea One');
    assertStrictEquals(result.position, 1);
});

Deno.test(
    'validateIdeaEntity rejects unexpected key',
    () => {
    assertThrows(
        () => validateIdeaEntity({
            ...validIdea,
            secret: 'pwned',
        }),
        Error, 'unexpected key "secret"',
    );
});

Deno.test(
    'validateIdeaEntity rejects status key (retired)',
    () => {
    assertThrows(
        () => validateIdeaEntity({
            ...validIdea,
            status: 'active',
        }),
        Error, 'unexpected key "status"',
    );
});

Deno.test(
    'validateIdeaEntity rejects readiness key (retired)',
    () => {
    assertThrows(
        () => validateIdeaEntity({
            ...validIdea,
            readiness: 'ready',
        }),
        Error, 'unexpected key "readiness"',
    );
});

Deno.test(
    'validateIdeaEntity rejects missing required key',
    () => {
    const body = { ...validIdea };
    delete (
        body as Record<string, unknown>
    )['expected_outcome'];
    assertThrows(
        () => validateIdeaEntity(body),
        Error, 'missing required key "expected_outcome"',
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

Deno.test('validateProjectEntity accepts valid payload', () => {
    const result =
        validateProjectEntity(validProject);
    assertStrictEquals(result.title, 'Proj');
});

Deno.test('validateProjectEntity rejects unknown key', () => {
    assertThrows(
        () => validateProjectEntity({
            ...validProject,
            status: 'submitted',
        }),
        Error, 'unexpected key "status"',
    );
});

Deno.test(
    'validateProjectEntity rejects a timestamp where a'
    + ' calendar date belongs',
    () => {
    assertThrows(
        () => validateProjectEntity({
            ...validProject,
            start_date: '2024-01-01T00:00:00.000000Z',
        }),
        Error, 'calendar date YYYY-MM-DD for ProjectEntity',
    );
});

Deno.test(
    'validateProjectEntity rejects an impossible day',
    () => {
    assertThrows(
        () => validateProjectEntity({
            ...validProject,
            target_end_date: '2024-02-30',
        }),
        Error, 'calendar date YYYY-MM-DD for ProjectEntity',
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

Deno.test('validateFlowEntity accepts valid payload', () => {
    const result = validateFlowEntity(validFlow);
    assertStrictEquals(result.name, 'Flow A');
    assertStrictEquals(result.is_locked, false);
});

Deno.test(
    'validateFlowEntity rejects non-boolean is_locked',
    () => {
    assertThrows(
        () => validateFlowEntity({
            ...validFlow,
            is_locked: 0,
        }),
        Error, 'expected boolean for is_locked',
    );
});

Deno.test(
    'validateFlowEntity rejects unexpected key',
    () => {
    assertThrows(
        () => validateFlowEntity({
            ...validFlow,
            admin: true,
        }),
        Error, 'unexpected key "admin"',
    );
});

Deno.test(
    'validateFlowEntity rejects missing required key',
    () => {
    const body = { ...validFlow };
    delete (
        body as Record<string, unknown>
    )['lock_timeout'];
    assertThrows(
        () => validateFlowEntity(body),
        Error, 'missing required key "lock_timeout"',
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

Deno.test(
    'validateWorkOrderEntity accepts valid payload',
    () => {
    const result =
        validateWorkOrderEntity(validWorkOrder);
    assertStrictEquals(result.display_id, 'WO-001');
});

Deno.test(
    'validateWorkOrderEntity rejects non-number'
    + ' position',
    () => {
    assertThrows(
        () => validateWorkOrderEntity({
            ...validWorkOrder,
            position: 'first',
        }),
        Error, 'expected finite number for position',
    );
});

Deno.test(
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
    assertStrictEquals(result.display_id, 'WO-001');
});

// --- FlowWorkOrderEntity ---

const validFlowWorkOrder = {
    flow_id: F_1,
    work_order_id: WO_1,
    at: '2024-01-01T00:00:00.000000Z',
};

Deno.test(
    'validateFlowWorkOrderEntity accepts valid payload',
    () => {
    const result =
        validateFlowWorkOrderEntity(
            validFlowWorkOrder,
        );
    assertStrictEquals(result.flow_id, F_1);
});

Deno.test(
    'validateFlowWorkOrderEntity rejects missing'
    + ' work_order_id',
    () => {
    assertThrows(
        () => validateFlowWorkOrderEntity({
            flow_id: F_1,
            at: '2024-01-01T00:00:00.000000Z',
        }),
        Error, 'missing required key "work_order_id"',
    );
});

// --- StateFieldValueEntity ---

const validStateFieldValue = {
    state_event_id: EVT_1,
    attribute_id: F_1,
    value: 'Acme Corp',
};

Deno.test(
    'validateStateFieldValueEntity accepts valid'
    + ' payload',
    () => {
    const result =
        validateStateFieldValueEntity(
            validStateFieldValue,
        );
    assertStrictEquals(result.state_event_id, EVT_1);
});

Deno.test(
    'validateStateFieldValueEntity rejects missing'
    + ' state_event_id',
    () => {
    assertThrows(
        () => validateStateFieldValueEntity({
            attribute_id: F_1,
            value: 'x',
        }),
        Error, 'missing required key "state_event_id"',
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

Deno.test(
    'validateOrganizationEntity accepts valid payload',
    () => {
    const result =
        validateOrganizationEntity(validOrganization);
    assertStrictEquals(result.name, 'Acme Corp');
    assertStrictEquals(result.seats, 10);
});

Deno.test(
    'validateOrganizationEntity rejects non-number'
    + ' seats',
    () => {
    assertThrows(
        () => validateOrganizationEntity({
            ...validOrganization,
            seats: 'ten',
        }),
        Error, 'expected finite number for seats',
    );
});

Deno.test(
    'validateOrganizationEntity rejects unexpected'
    + ' key',
    () => {
    assertThrows(
        () => validateOrganizationEntity({
            ...validOrganization,
            admin: true,
        }),
        Error, 'unexpected key "admin"',
    );
});

Deno.test(
    'validateOrganizationEntity rejects missing'
    + ' required key',
    () => {
    const body = { ...validOrganization };
    delete (
        body as Record<string, unknown>
    )['seats'];
    assertThrows(
        () => validateOrganizationEntity(body),
        Error, 'missing required key "seats"',
    );
});

Deno.test(
    'validateOrganizationEntity rejects the retired'
    + ' stored aggregates',
    () => {
    // used_seats / last_activity are DERIVED from the
    // memberships ledger and the states log — a stored
    // copy is a second truth kept in sync by nothing
    assertThrows(
        () => validateOrganizationEntity({
            ...validOrganization,
            used_seats: 5,
        }),
        Error, 'unexpected key "used_seats"',
    );
});

Deno.test(
    'validateOrganizationEntity rejects a bare'
    + ' calendar date for next_billing',
    () => {
    assertThrows(
        () => validateOrganizationEntity({
            ...validOrganization,
            next_billing: '2025-01-01',
        }),
        Error, 'invalid timestamp',
    );
});

// --- IdeaSubmissionEntity ---

const validIdeaSubmission = {
    idea_id: I_1,
    member_id: U_1,
    at: '2024-01-01T00:00:00.000000Z',
};

Deno.test(
    'validateIdeaSubmissionEntity accepts valid'
    + ' payload',
    () => {
    const result =
        validateIdeaSubmissionEntity(
            validIdeaSubmission,
        );
    assertStrictEquals(result.idea_id, I_1);
});

Deno.test(
    'validateIdeaSubmissionEntity rejects missing'
    + ' idea_id',
    () => {
    assertThrows(
        () => validateIdeaSubmissionEntity({
            member_id: U_1,
            at: '2024-01-01T00:00:00.000000Z',
        }),
        Error, 'missing required key "idea_id"',
    );
});

// --- ProjectFlowEntity ---

const validProjectFlow = {
    project_id: 'pjQzgITAPDQVyvCVpzpIfQ',
    flow_id: F_1,
    at: '2024-01-01T00:00:00.000000Z',
};

Deno.test(
    'validateProjectFlowEntity accepts valid payload',
    () => {
    const result =
        validateProjectFlowEntity(
            validProjectFlow,
        );
    assertStrictEquals(result.project_id, 'pjQzgITAPDQVyvCVpzpIfQ');
});

Deno.test(
    'validateProjectFlowEntity rejects missing'
    + ' flow_id',
    () => {
    assertThrows(
        () => validateProjectFlowEntity({
            project_id: 'pjQzgITAPDQVyvCVpzpIfQ',
            at: '2024-01-01T00:00:00.000000Z',
        }),
        Error, 'missing required key "flow_id"',
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

Deno.test(
    'asStoredGraph throws on missing memberIds',
    () => {
        assertThrows(
            () => asStoredGraph(
                { nodes: [baseNode], edges: [] },
                'graph',
            ),
        );
    },
);

Deno.test(
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
        assertEquals(n.memberIds, []);
    },
);

Deno.test(
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
        assertEquals(
            n.memberIds,
            [MEMBER_SARAH, MEMBER_CLAUDE],
        );
    },
);

Deno.test(
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
        assertStrictEquals(n.agentIds, undefined);
    },
);

Deno.test(
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
        assertEquals(n.agentIds, ['UuvoBhQJUSEsiJwscXPkUg']);
    },
);

Deno.test(
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
        assertThrows(
            () => assertFlowGraphWriteLaw(
                graph, new Set([AI_1]),
            ),
            Error, 'not AI agents',
        );
    },
);

Deno.test(
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
        assertFlowGraphWriteLaw(
            graph, new Set(['UuvoBhQJUSEsiJwscXPkUg']),
        );
    },
);

Deno.test(
    'asStoredGraph rejects non-string entries in'
    + ' memberIds',
    () => {
        assertThrows(
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

Deno.test(
    'asStoredGraph throws on missing'
    + ' taskInstructions',
    () => {
        assertThrows(
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

Deno.test(
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
        assertStrictEquals(n.taskInstructions, '');
    },
);

Deno.test(
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
        assertStrictEquals(n.taskInstructions, md);
    },
);

Deno.test(
    'asStoredGraph rejects non-string'
    + ' taskInstructions',
    () => {
        assertThrows(
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

Deno.test(
    'validateRecordAttributeEntity rejects a'
    + ' select with zero options',
    () => {
    assertThrows(
        () => validateRecordAttributeEntity({
            ...validSelectAttribute,
            options: [],
        }),
        Error, 'at least one option',
    );
});

Deno.test(
    'validateRecordAttributeEntity accepts a'
    + ' radio with options',
    () => {
    const result = validateRecordAttributeEntity({
        ...validSelectAttribute,
        attribute_type: 'radio',
    });
    assertStrictEquals(result.attribute_type, 'radio');
});

Deno.test(
    'validateRecordAttributeEntity rejects a'
    + ' radio with zero options',
    () => {
    assertThrows(
        () => validateRecordAttributeEntity({
            ...validSelectAttribute,
            attribute_type: 'radio',
            options: [],
        }),
        Error, 'at least one option',
    );
});

Deno.test(
    'validateRecordAttributeEntity rejects non-string'
    + ' option elements on any type',
    () => {
    assertThrows(
        () => validateRecordAttributeEntity({
            ...validSelectAttribute,
            attribute_type: 'text',
            options: [3],
        }),
        Error, 'expected string for options[0]',
    );
});

Deno.test(
    'validateRecordAttributeEntity rejects a regex'
    + ' constraint on a number attribute_type',
    () => {
    assertThrows(
        () => validateRecordAttributeEntity({
            ...validSelectAttribute,
            attribute_type: 'number',
            options: [],
            constraints: [
                { kind: 'regex', pattern: '^\\d+$' },
            ],
        }),
        Error, 'regex',
    );
});

Deno.test(
    'validateRecordAttributeEntity rejects range_min'
    + ' on a text attribute_type',
    () => {
    assertThrows(
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

Deno.test(
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
    assertStrictEquals(result.attribute_type, 'date');
});

Deno.test(
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
    assertStrictEquals(result.name, 'Priority');
});

Deno.test('asConstraint rejects nested-quantifier regex', () => {
    assertThrows(
        () => asConstraint(
            { kind: 'regex', pattern: '(a+)+$' }, 'c',
        ),
        Error, 'nested unbounded quantifiers',
    );
});

Deno.test('asConstraint rejects an over-long pattern', () => {
    assertThrows(
        () => asConstraint(
            { kind: 'regex', pattern: 'a'.repeat(201) },
            'c',
        ),
        Error, 'exceeds 200 chars',
    );
});

Deno.test('asConstraint accepts a safe pattern', () => {
    assertStrictEquals(
        asConstraint(
            { kind: 'regex', pattern: '^[a-z]{3,10}$' },
            'c',
        ).kind,
        'regex',
    );
});

Deno.test(
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
        assertEquals(
            body.graph, { nodes: [], edges: [] },
        );
    },
);

Deno.test(
    'validateFlowDocumentBody rejects a'
    + ' JSON-encoded graph string',
    () => {
        assertThrows(
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
            Error, 'expected object for FlowDocumentBody.graph',
        );
    },
);

Deno.test(
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
        assertEquals(
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

Deno.test(
    'validateWorkOrderEntity rejects a'
    + ' JSON-encoded flow_graph string',
    () => {
        assertThrows(
            () => validateWorkOrderEntity({
                organization_id: ORGANIZATION_1,
                display_id: 'a7c3e1f9',
                flow_graph:
                    '{"name":"x","lockTimeout":1,'
                    + '"nodes":[],"edges":[]}',
                position: 1,
            }),
            Error, 'expected object for flow_graph',
        );
    },
);

// --- MessagePairEntity ---

const validMessagePair = {
    uri_collection: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    uri_id: '42',
    requester_identity_id: 'XXZruirZyAOoRpNxaDnpSA',
    method: 'PUT',
    request_at: '2026-01-01T00:00:00.000000Z',
    request_hash: 'a'.repeat(64),
    request: '{"kind":"request"}',
    response_at: '2026-01-01T00:00:00.000001Z',
    response: '{"kind":"response"}',
    operation_id: '0123456789ABCDEFGHIJKw',
};

Deno.test(
    'validateMessagePairEntity accepts a full pair',
    () => {
        const got = validateMessagePairEntity(validMessagePair);
        assertStrictEquals(got.method, 'PUT');
        assertStrictEquals(got.request_at, validMessagePair.request_at);
        assertStrictEquals(
            got.response_at, validMessagePair.response_at,
        );
    },
);

Deno.test(
    'validateMessagePairEntity rejects status key',
    () => {
        assertThrows(
            () => validateMessagePairEntity({
                ...validMessagePair, status: 200,
            }),
            Error, 'unexpected key "status"',
        );
    },
);

Deno.test(
    'validateMessagePairEntity rejects message_hash key',
    () => {
        assertThrows(
            () => validateMessagePairEntity({
                ...validMessagePair,
                message_hash: 'a'.repeat(64),
            }),
            Error, 'unexpected key "message_hash"',
        );
    },
);

Deno.test(
    'validateMessagePairEntity rejects a short hash',
    () => {
        assertThrows(
            () => validateMessagePairEntity({
                ...validMessagePair,
                request_hash: 'aa',
            }),
            Error, 'request_hash must be a 64-',
        );
    },
);

Deno.test(
    'validateMessagePairEntity rejects a lowercase method',
    () => {
        assertThrows(
            () => validateMessagePairEntity({
                ...validMessagePair, method: 'put',
            }),
            Error, 'method must match ^[A-Z]+$',
        );
    },
);
