import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    validateHumanWorkerEntity,
    validateAIWorkerEntity,
    validateIdeaEntity,
    validateProjectEntity,
    validateActivityEntity,
    validateFlowEntity,
    validateFlowVersionEntity,
    validateWorkOrderEntity,
    validateFlowWorkOrderEntity,
    validateStateFieldValueEntity,
    validateOrganizationEntity,
    validateIdeaSubmissionEntity,
    validateActivityActorEntity,
    validateProjectFlowEntity,
    asStoredGraph,
} from '../api/validators.ts';

// --- HumanWorkerEntity ---

const validHumanWorker = {
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    title: 'Engineer',
    department: 'R&D',
    strengths: '["analytical"]',
    team_dimensions: '{"driver":0.5}',
    phone: '555-1234',
    bio: 'Pioneer',
};

test(
    'validateHumanWorkerEntity accepts valid payload',
    () => {
        const result = validateHumanWorkerEntity(
            validHumanWorker,
        );
        assert.equal(result.first_name, 'Ada');
    },
);

test(
    'validateHumanWorkerEntity rejects status key '
    + '(retired by Stage 10b+c)',
    () => {
        assert.throws(
            () => validateHumanWorkerEntity({
                ...validHumanWorker,
                status: 'active',
            }),
            /unexpected key "status"/,
        );
    },
);

test(
    'validateHumanWorkerEntity rejects missing email',
    () => {
        const body = { ...validHumanWorker };
        delete (
            body as Record<string, unknown>
        )['email'];
        assert.throws(
            () => validateHumanWorkerEntity(body),
            /missing required key "email"/,
        );
    },
);

test(
    'validateHumanWorkerEntity rejects unexpected key',
    () => {
        assert.throws(
            () => validateHumanWorkerEntity({
                ...validHumanWorker,
                admin: true,
            }),
            /unexpected key "admin"/,
        );
    },
);

test(
    'validateHumanWorkerEntity rejects missing'
    + ' required key',
    () => {
        const body = { ...validHumanWorker };
        delete (
            body as Record<string, unknown>
        )['last_name'];
        assert.throws(
            () => validateHumanWorkerEntity(body),
            /missing required key "last_name"/,
        );
    },
);

// --- AIWorkerEntity ---

const validAIWorker = {
    name: 'Claude Opus 4.7 Max',
    provider: 'Anthropic',
    description: 'Long context, deep reasoning.',
    auth_token: 'sk-PLACEHOLDER-DEMOTOKEN-XXXX',
    created_at: '2026-01-01T00:00:00Z',
};

test(
    'validateAIWorkerEntity accepts valid payload',
    () => {
        const result = validateAIWorkerEntity(
            validAIWorker,
        );
        assert.equal(
            result.name, 'Claude Opus 4.7 Max',
        );
        assert.equal(result.provider, 'Anthropic');
        assert.equal(
            result.auth_token,
            'sk-PLACEHOLDER-DEMOTOKEN-XXXX',
        );
    },
);

test(
    'validateAIWorkerEntity rejects empty auth_token',
    () => {
        assert.throws(
            () => validateAIWorkerEntity({
                ...validAIWorker,
                auth_token: '',
            }),
            /auth_token must be non-empty/,
        );
    },
);

test(
    'validateAIWorkerEntity rejects unexpected key',
    () => {
        assert.throws(
            () => validateAIWorkerEntity({
                ...validAIWorker,
                surprise: 'oops',
            }),
            /unexpected key "surprise"/,
        );
    },
);

test(
    'validateAIWorkerEntity rejects missing name',
    () => {
        const { name: _omit, ...rest } =
            validAIWorker;
        assert.throws(
            () => validateAIWorkerEntity(rest),
            /missing required key "name"/,
        );
    },
);

test(
    'validateAIWorkerEntity rejects missing'
    + ' auth_token',
    () => {
        const {
            auth_token: _omit, ...rest
        } = validAIWorker;
        assert.throws(
            () => validateAIWorkerEntity(rest),
            /missing required key "auth_token"/,
        );
    },
);

// --- IdeaEntity ---

const validIdea = {
    title: 'Idea One',
    position: 1,
    problem_statement: 'A problem',
    target_users: 'Users',
    proposed_solution: 'A solution',
    expected_outcome: 'Better',
    success_metrics: 'Metrics',
    risks: '[]',
    assumptions: '[]',
    alignments: '[]',
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
    progress: 0,
    start_date: '2024-01-01',
    target_end_date: '2024-12-31',
    estimated_duration: 86400,
    actual_duration: 0,
    estimated_cost: 1000,
    actual_cost: 0,
    position: 1,
    business_context: '{}',
    timeline_label: 'Q1',
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

// --- StateFieldValueEntity ---

const validStateFieldValue = {
    state_event_id: 'evt-1',
    field_id: 'f-1',
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
    assert.equal(result.state_event_id, 'evt-1');
});

test(
    'validateStateFieldValueEntity rejects missing'
    + ' state_event_id',
    () => {
    assert.throws(
        () => validateStateFieldValueEntity({
            field_id: 'f-1',
            value: 'x',
        }),
        /missing required key "state_event_id"/,
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
    worker_id: 'u-1',
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
            worker_id: 'u-1',
            created_at: '2024-01-01T00:00:00Z',
        }),
        /missing required key "idea_id"/,
    );
});

// --- ActivityActorEntity ---

const validActivityActor = {
    activity_id: 'act-1',
    worker_id: 'u-1',
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
            worker_id: 'u-1',
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

// --- asStoredGraph (workerIds shape) ---

const baseNode = {
    id: 'n1',
    name: 'N',
    description: '',
    positionX: 0,
    positionY: 0,
    isCreate: false,
    isArchive: false,
    fields: [],
};

test(
    'asStoredGraph throws on missing workerIds',
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
    'asStoredGraph round-trips an empty workerIds',
    () => {
        const result = asStoredGraph(
            {
                nodes: [
                    {
                        ...baseNode,
                        workerIds: [],
                    },
                ],
                edges: [],
            },
            'graph',
        );
        const n = result.nodes[0]!;
        assert.deepEqual(n.workerIds, []);
    },
);

test(
    'asStoredGraph round-trips a populated'
    + ' workerIds list',
    () => {
        const result = asStoredGraph(
            {
                nodes: [
                    {
                        ...baseNode,
                        workerIds: [
                            'hw_sarah_chen',
                            'ai_claude_opus',
                        ],
                    },
                ],
                edges: [],
            },
            'graph',
        );
        const n = result.nodes[0]!;
        assert.deepEqual(
            n.workerIds,
            ['hw_sarah_chen', 'ai_claude_opus'],
        );
    },
);

test(
    'asStoredGraph rejects non-string entries in'
    + ' workerIds',
    () => {
        assert.throws(
            () => asStoredGraph(
                {
                    nodes: [
                        {
                            ...baseNode,
                            workerIds: [123],
                        },
                    ],
                    edges: [],
                },
                'graph',
            ),
        );
    },
);
