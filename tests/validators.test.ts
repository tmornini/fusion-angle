import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    validatePersonEntity,
    validateIdeaEntity,
    validateProjectEntity,
    validateActivityEntity,
    validateFlowEntity,
    validateFlowVersionEntity,
    validateWorkOrderEntity,
    validateFlowWorkOrderEntity,
    validateWorkOrderTransitionEntity,
    validateWorkOrderClaimEntity,
    validateOrganizationEntity,
    validateIdeaSubmissionEntity,
    validateActivityActorEntity,
    validateProjectFlowEntity,
    validateModelEntity,
    validateRoleModelMembershipEntity,
    asNodeAssignment,
    asStoredGraph,
} from '../api/validators.ts';

// --- PersonEntity ---

const validPerson = {
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    title: 'Engineer',
    department: 'R&D',
    status: 'active',
    strengths: '["analytical"]',
    team_dimensions: '{"driver":0.5}',
    phone: '555-1234',
    bio: 'Pioneer',
};

test('validatePersonEntity accepts valid payload', () => {
    const result = validatePersonEntity(validPerson);
    assert.equal(result.first_name, 'Ada');
    assert.equal(result.status, 'active');
});

test('validatePersonEntity rejects missing email', () => {
    const body = { ...validPerson };
    delete (body as Record<string, unknown>)['email'];
    assert.throws(
        () => validatePersonEntity(body),
        /missing required key "email"/,
    );
});

test(
    'validatePersonEntity rejects unexpected key',
    () => {
    assert.throws(
        () => validatePersonEntity({
            ...validPerson,
            admin: true,
        }),
        /unexpected key "admin"/,
    );
});

test(
    'validatePersonEntity rejects missing required key',
    () => {
    const body = { ...validPerson };
    delete (
        body as Record<string, unknown>
    )['last_name'];
    assert.throws(
        () => validatePersonEntity(body),
        /missing required key "last_name"/,
    );
});

// --- IdeaEntity ---

const validIdea = {
    title: 'Idea One',
    position: 1,
    status: 'active',
    problem_statement: 'A problem',
    target_users: 'Users',
    proposed_solution: 'A solution',
    expected_outcome: 'Better',
    success_metrics: 'Metrics',
    readiness: 'ready',
    risks: '[]',
    assumptions: '[]',
    alignments: '[]',
};

test('validateIdeaEntity accepts valid payload', () => {
    const result = validateIdeaEntity(validIdea);
    assert.equal(result.title, 'Idea One');
    assert.equal(result.readiness, 'ready');
});

test('validateIdeaEntity rejects bad status', () => {
    assert.throws(
        () => validateIdeaEntity({
            ...validIdea,
            status: 'submitted',
        }),
        /expected IdeaStatus for status/,
    );
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
    'validateIdeaEntity rejects missing required key',
    () => {
    const body = { ...validIdea };
    delete (
        body as Record<string, unknown>
    )['alignments'];
    assert.throws(
        () => validateIdeaEntity(body),
        /missing required key "alignments"/,
    );
});

// --- ProjectEntity ---

const validProject = {
    title: 'Proj',
    description: 'Desc',
    status: 'submitted',
    progress: 0,
    start_date: '2024-01-01',
    target_end_date: '2024-12-31',
    estimated_duration: 86400,
    actual_duration: 0,
    estimated_cost: 1000,
    actual_cost: 0,
    estimated_impact: 500,
    actual_impact: 0,
    position: 1,
    business_context: '{}',
    timeline_label: 'Q1',
    budget_label: '$1K',
};

test('validateProjectEntity accepts valid payload', () => {
    const result =
        validateProjectEntity(validProject);
    assert.equal(result.title, 'Proj');
    assert.equal(result.status, 'submitted');
});

test('validateProjectEntity rejects bad status', () => {
    assert.throws(
        () => validateProjectEntity({
            ...validProject,
            status: 'unknown-status',
        }),
        /expected ProjectStatus for status/,
    );
});

// --- ActivityEntity ---

const validActivity = {
    type: 'idea_created',
    action: 'Created an idea',
    target: 'idea-1',
    timestamp: '2024-01-01T00:00:00Z',
    status: 'complete',
    feedback: '',
};

test('validateActivityEntity accepts valid payload', () => {
    const result =
        validateActivityEntity(validActivity);
    assert.equal(result.type, 'idea_created');
});

test(
    'validateActivityEntity rejects missing timestamp',
    () => {
    const body = { ...validActivity };
    delete (
        body as Record<string, unknown>
    )['timestamp'];
    assert.throws(
        () => validateActivityEntity(body),
        /missing required key "timestamp"/,
    );
});

// --- FlowEntity ---

const validFlow = {
    name: 'Flow A',
    description: 'Desc',
    is_locked: false,
    is_auto_layout: true,
    is_auto_fit: true,
    lock_timeout: 28800,
    graph: '{"nodes":[],"edges":[]}',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
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
    )['updated_at'];
    assert.throws(
        () => validateFlowEntity(body),
        /missing required key "updated_at"/,
    );
});

// --- FlowVersionEntity ---

const validFlowVersion = {
    flow_id: 'f-1',
    name: 'v1',
    description: '',
    is_locked: false,
    is_auto_layout: true,
    is_auto_fit: true,
    lock_timeout: 28800,
    graph: '{"nodes":[],"edges":[]}',
    created_at: '2024-01-01T00:00:00Z',
};

test(
    'validateFlowVersionEntity accepts valid payload',
    () => {
    const result =
        validateFlowVersionEntity(validFlowVersion);
    assert.equal(result.flow_id, 'f-1');
});

test(
    'validateFlowVersionEntity rejects missing flow_id',
    () => {
    const body = { ...validFlowVersion };
    delete (
        body as Record<string, unknown>
    )['flow_id'];
    assert.throws(
        () => validateFlowVersionEntity(body),
        /missing required key "flow_id"/,
    );
});

// --- WorkOrderEntity ---

const minimalWoGraph = JSON.stringify({
    flowId: 'f-1',
    name: 'WO Flow',
    description: '',
    lockTimeout: 28800,
    nodes: [],
    edges: [],
});

const validWorkOrder = {
    display_id: 'WO-001',
    flow_graph: minimalWoGraph,
    position: 1,
    created_at: '2024-01-01T00:00:00Z',
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

// --- FlowWorkOrderEntity ---

const validFlowWorkOrder = {
    flow_id: 'f-1',
    work_order_id: 'wo-1',
    created_at: '2024-01-01T00:00:00Z',
};

test(
    'validateFlowWorkOrderEntity accepts valid payload',
    () => {
    const result =
        validateFlowWorkOrderEntity(
            validFlowWorkOrder,
        );
    assert.equal(result.flow_id, 'f-1');
});

test(
    'validateFlowWorkOrderEntity rejects missing'
    + ' work_order_id',
    () => {
    assert.throws(
        () => validateFlowWorkOrderEntity({
            flow_id: 'f-1',
            created_at: '2024-01-01T00:00:00Z',
        }),
        /missing required key "work_order_id"/,
    );
});

// --- WorkOrderTransitionEntity ---

const validTransition = {
    work_order_id: 'wo-1',
    from_node_id: 'n-1',
    to_node_id: 'n-2',
    person_id: 'u-1',
    transitioned_at: '2024-01-01T00:00:00Z',
};

test(
    'validateWorkOrderTransitionEntity accepts'
    + ' valid payload',
    () => {
    const result =
        validateWorkOrderTransitionEntity(
            validTransition,
        );
    assert.equal(result.work_order_id, 'wo-1');
});

test(
    'validateWorkOrderTransitionEntity'
    + ' rejects missing transitioned_at',
    () => {
    const body = { ...validTransition };
    delete (
        body as Record<string, unknown>
    )['transitioned_at'];
    assert.throws(
        () => validateWorkOrderTransitionEntity(
            body,
        ),
        /missing required key "transitioned_at"/,
    );
});

test(
    'validateWorkOrderTransitionEntity rejects'
    + ' lingering values key',
    () => {
    const body = {
        ...validTransition,
        values: '{}',
    };
    assert.throws(
        () => validateWorkOrderTransitionEntity(
            body,
        ),
        /unexpected key "values"/,
    );
});

// --- WorkOrderClaimEntity ---

const validClaim = {
    work_order_id: 'wo-1',
    person_id: 'u-1',
    claimed_at: '2024-01-01T00:00:00Z',
};

test(
    'validateWorkOrderClaimEntity accepts valid'
    + ' payload',
    () => {
    const result =
        validateWorkOrderClaimEntity(validClaim);
    assert.equal(result.person_id, 'u-1');
});

test(
    'validateWorkOrderClaimEntity rejects missing'
    + ' claimed_at',
    () => {
    assert.throws(
        () => validateWorkOrderClaimEntity({
            work_order_id: 'wo-1',
            person_id: 'u-1',
        }),
        /missing required key "claimed_at"/,
    );
});

// --- OrganizationEntity ---

const validOrg = {
    name: 'Acme Corp',
    domain: 'acme.com',
    plan: 'pro',
    plan_status: 'active',
    next_billing: '2025-01-01',
    seats: 10,
    used_seats: 5,
    projects_limit: 50,
    projects_current: 3,
    ideas_limit: 200,
    ideas_current: 10,
    storage_limit: 1000,
    storage_current: 100,
    ai_credits_limit: 500,
    ai_credits_current: 50,
    health_score: 85,
    health_status: 'healthy',
    last_activity: '2024-01-01T00:00:00Z',
    active_people: 5,
};

test(
    'validateOrganizationEntity accepts valid payload',
    () => {
    const result =
        validateOrganizationEntity(validOrg);
    assert.equal(result.plan, 'pro');
    assert.equal(result.seats, 10);
});

test(
    'validateOrganizationEntity rejects non-number'
    + ' seats',
    () => {
    assert.throws(
        () => validateOrganizationEntity({
            ...validOrg,
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
            ...validOrg,
            admin: true,
        }),
        /unexpected key "admin"/,
    );
});

test(
    'validateOrganizationEntity rejects missing'
    + ' required key',
    () => {
    const body = { ...validOrg };
    delete (
        body as Record<string, unknown>
    )['active_people'];
    assert.throws(
        () => validateOrganizationEntity(body),
        /missing required key "active_people"/,
    );
});

// --- IdeaSubmissionEntity ---

const validIdeaSubmission = {
    idea_id: 'i-1',
    person_id: 'u-1',
    created_at: '2024-01-01T00:00:00Z',
};

test(
    'validateIdeaSubmissionEntity accepts valid'
    + ' payload',
    () => {
    const result =
        validateIdeaSubmissionEntity(
            validIdeaSubmission,
        );
    assert.equal(result.idea_id, 'i-1');
});

test(
    'validateIdeaSubmissionEntity rejects missing'
    + ' idea_id',
    () => {
    assert.throws(
        () => validateIdeaSubmissionEntity({
            person_id: 'u-1',
            created_at: '2024-01-01T00:00:00Z',
        }),
        /missing required key "idea_id"/,
    );
});

// --- ActivityActorEntity ---

const validActivityActor = {
    activity_id: 'act-1',
    person_id: 'u-1',
    created_at: '2024-01-01T00:00:00Z',
};

test(
    'validateActivityActorEntity accepts valid'
    + ' payload',
    () => {
    const result =
        validateActivityActorEntity(
            validActivityActor,
        );
    assert.equal(result.activity_id, 'act-1');
});

test(
    'validateActivityActorEntity rejects missing'
    + ' activity_id',
    () => {
    assert.throws(
        () => validateActivityActorEntity({
            person_id: 'u-1',
            created_at: '2024-01-01T00:00:00Z',
        }),
        /missing required key "activity_id"/,
    );
});

// --- ProjectFlowEntity ---

const validProjectFlow = {
    project_id: 'p-1',
    flow_id: 'f-1',
    created_at: '2024-01-01T00:00:00Z',
};

test(
    'validateProjectFlowEntity accepts valid payload',
    () => {
    const result =
        validateProjectFlowEntity(
            validProjectFlow,
        );
    assert.equal(result.project_id, 'p-1');
});

test(
    'validateProjectFlowEntity rejects missing'
    + ' flow_id',
    () => {
    assert.throws(
        () => validateProjectFlowEntity({
            project_id: 'p-1',
            created_at: '2024-01-01T00:00:00Z',
        }),
        /missing required key "flow_id"/,
    );
});

// --- validateModelEntity ---

const validModel = {
    name: 'Claude Opus 4.7 Max',
    provider: 'Anthropic',
    description: 'Long context, deep reasoning.',
    created_at: '2024-01-01T00:00:00Z',
};

test(
    'validateModelEntity accepts valid payload',
    () => {
        const result = validateModelEntity(
            validModel,
        );
        assert.equal(
            result.name, 'Claude Opus 4.7 Max',
        );
        assert.equal(
            result.provider, 'Anthropic',
        );
    },
);

test(
    'validateModelEntity rejects unexpected key',
    () => {
        assert.throws(
            () => validateModelEntity({
                ...validModel,
                surprise: 'oops',
            }),
        );
    },
);

test(
    'validateModelEntity rejects missing name',
    () => {
        const { name: _omit, ...rest } =
            validModel;
        assert.throws(
            () => validateModelEntity(rest),
        );
    },
);

// --- validateRoleModelMembershipEntity ---

const validRoleModelMembership = {
    role_id: 'role_engineering',
    model_id: 'model_claude_opus',
    created_at: '2024-01-01T00:00:00Z',
};

test(
    'validateRoleModelMembershipEntity accepts'
    + ' valid payload',
    () => {
        const result =
            validateRoleModelMembershipEntity(
                validRoleModelMembership,
            );
        assert.equal(
            result.model_id,
            'model_claude_opus',
        );
    },
);

test(
    'validateRoleModelMembershipEntity rejects'
    + ' missing model_id',
    () => {
        const { model_id: _omit, ...rest } =
            validRoleModelMembership;
        assert.throws(
            () =>
                validateRoleModelMembershipEntity(
                    rest,
                ),
        );
    },
);

// --- asNodeAssignment (NodeAssignment discriminated union) ---

test('asNodeAssignment accepts unassigned variant', () => {
    const result = asNodeAssignment(
        { kind: 'unassigned' }, 'assignment',
    );
    assert.equal(result.kind, 'unassigned');
});

test('asNodeAssignment accepts the new role variant', () => {
    const result = asNodeAssignment(
        { kind: 'role', roleId: 'r-eng' },
        'assignment',
    );
    assert.equal(result.kind, 'role');
    if (result.kind === 'role') {
        assert.equal(result.roleId, 'r-eng');
    }
});

test('asNodeAssignment accepts model variant', () => {
    const result = asNodeAssignment(
        { kind: 'model', modelId: 'm-1' },
        'assignment',
    );
    assert.equal(result.kind, 'model');
    if (result.kind === 'model') {
        assert.equal(result.modelId, 'm-1');
    }
});

test(
    'asNodeAssignment rejects the old model'
    + ' shape (string model field)',
    () => {
        assert.throws(
            () => asNodeAssignment(
                {
                    kind: 'model',
                    model: 'Copilot',
                },
                'assignment',
            ),
        );
    },
);

test('asNodeAssignment accepts crew variant', () => {
    const result = asNodeAssignment(
        { kind: 'crew', crewId: 'c-1' },
        'assignment',
    );
    assert.equal(result.kind, 'crew');
    if (result.kind === 'crew') {
        assert.equal(result.crewId, 'c-1');
    }
});

test(
    'asNodeAssignment rejects crew without'
    + ' crewId',
    () => {
        assert.throws(
            () => asNodeAssignment(
                { kind: 'crew' },
                'assignment',
            ),
        );
    },
);

test('asNodeAssignment rejects invalid kind', () => {
    assert.throws(
        () => asNodeAssignment(
            { kind: 'invalid' }, 'assignment',
        ),
        /assignment\.kind in/,
    );
});

test(
    'asNodeAssignment rejects role without'
    + ' roleId',
    () => {
        assert.throws(
            () => asNodeAssignment(
                { kind: 'role' },
                'assignment',
            ),
        );
    },
);

test(
    'asNodeAssignment rejects model without'
    + ' modelId',
    () => {
        assert.throws(
            () => asNodeAssignment(
                { kind: 'model' },
                'assignment',
            ),
        );
    },
);

// --- asGraphNode crew validation ---

const baseNode = {
    id: 'n1',
    name: 'N',
    description: '',
    positionX: 0,
    positionY: 0,
    isStart: false,
    isComplete: false,
    fields: [],
};

test(
    'asStoredGraph throws on missing crew',
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
    'asStoredGraph round-trips a role crew',
    () => {
        const result = asStoredGraph(
            {
                nodes: [
                    {
                        ...baseNode,
                        crew: {
                            kind: 'role',
                            roleId: 'r-eng',
                        },
                    },
                ],
                edges: [],
            },
            'graph',
        );
        const n = result.nodes[0]!;
        assert.equal(n.crew.kind, 'role');
        if (n.crew.kind === 'role') {
            assert.equal(
                n.crew.roleId, 'r-eng',
            );
        }
    },
);

test(
    'asStoredGraph round-trips a model crew',
    () => {
        const result = asStoredGraph(
            {
                nodes: [
                    {
                        ...baseNode,
                        crew: {
                            kind: 'model',
                            modelId: 'm-1',
                        },
                    },
                ],
                edges: [],
            },
            'graph',
        );
        const n = result.nodes[0]!;
        assert.equal(n.crew.kind, 'model');
        if (n.crew.kind === 'model') {
            assert.equal(
                n.crew.modelId, 'm-1',
            );
        }
    },
);

test(
    'asStoredGraph round-trips a crew'
    + ' assignment',
    () => {
        const result = asStoredGraph(
            {
                nodes: [
                    {
                        ...baseNode,
                        crew: {
                            kind: 'crew',
                            crewId: 'c-1',
                        },
                    },
                ],
                edges: [],
            },
            'graph',
        );
        const n = result.nodes[0]!;
        assert.equal(n.crew.kind, 'crew');
        if (n.crew.kind === 'crew') {
            assert.equal(n.crew.crewId, 'c-1');
        }
    },
);
