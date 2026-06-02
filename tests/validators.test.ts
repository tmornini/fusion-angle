import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    validateHumanWorkerEntity,
    validateAIWorkerEntity,
    validateIdeaEntity,
    validateProjectEntity,
    validateFlowEntity,
    validateFlowVersionEntity,
    validateWorkOrderEntity,
    validateFlowWorkOrderEntity,
    validateStateFieldValueEntity,
    validateOrganizationEntity,
    validateIdeaSubmissionEntity,
    validateProjectFlowEntity,
    validateRecordAttributeEntity,
    asStoredGraph,
} from '../api/validators.ts';
import {
    getProviderModels,
} from '../api/provider-models.ts';

// --- HumanWorkerEntity ---

const validHumanWorker = {
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
        assert.equal(result.email, 'ada@example.com');
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
        )['department'];
        assert.throws(
            () => validateHumanWorkerEntity(body),
            /missing required key "department"/,
        );
    },
);

// --- AIWorkerEntity ---

const validAIWorker = {
    description: 'Long context, deep reasoning.',
    skill_focus: 'Deep reasoning over long docs.',
    model: getProviderModels()[0]!.id,
};

test(
    'validateAIWorkerEntity accepts valid payload',
    () => {
        const result = validateAIWorkerEntity(
            validAIWorker,
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
            getProviderModels()[0]!.id,
        );
    },
);

test(
    'validateAIWorkerEntity accepts empty'
    + ' skill_focus',
    () => {
        const result = validateAIWorkerEntity({
            ...validAIWorker,
            skill_focus: '',
        });
        assert.equal(result.skill_focus, '');
    },
);

test(
    'validateAIWorkerEntity rejects unknown'
    + ' model id',
    () => {
        assert.throws(
            () => validateAIWorkerEntity({
                ...validAIWorker,
                model: 'not-a-real-model-id',
            }),
            /model must be a known provider/,
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
    'validateAIWorkerEntity rejects missing model',
    () => {
        const { model: _omit, ...rest } =
            validAIWorker;
        assert.throws(
            () => validateAIWorkerEntity(rest),
            /missing required key "model"/,
        );
    },
);

test(
    'validateAIWorkerEntity rejects missing'
    + ' skill_focus',
    () => {
        const { skill_focus: _omit, ...rest } =
            validAIWorker;
        assert.throws(
            () => validateAIWorkerEntity(rest),
            /missing required key "skill_focus"/,
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

// --- FlowEntity ---

const validFlow = {
    name: 'Flow A',
    is_locked: false,
    is_auto_layout: true,
    is_auto_fit: true,
    lock_timeout: 28800,
    graph: '{"nodes":[],"edges":[]}',
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

// --- FlowVersionEntity ---

const validFlowVersion = {
    flow_id: 'f-1',
    name: 'v1',
    is_locked: false,
    is_auto_layout: true,
    is_auto_fit: true,
    lock_timeout: 28800,
    graph: '{"nodes":[],"edges":[]}',
    at: '2024-01-01T00:00:00Z',
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
    lockTimeout: 28800,
    nodes: [],
    edges: [],
});

const validWorkOrder = {
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

// --- FlowWorkOrderEntity ---

const validFlowWorkOrder = {
    flow_id: 'f-1',
    work_order_id: 'wo-1',
    at: '2024-01-01T00:00:00Z',
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
            at: '2024-01-01T00:00:00Z',
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
    next_billing: '2025-01-01',
    seats: 10,
    used_seats: 5,
    projects_limit: 50,
    ideas_limit: 200,
    last_activity: '2024-01-01T00:00:00Z',
};

test(
    'validateOrganizationEntity accepts valid payload',
    () => {
    const result =
        validateOrganizationEntity(validOrg);
    assert.equal(result.name, 'Acme Corp');
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
    )['last_activity'];
    assert.throws(
        () => validateOrganizationEntity(body),
        /missing required key "last_activity"/,
    );
});

// --- IdeaSubmissionEntity ---

const validIdeaSubmission = {
    idea_id: 'i-1',
    worker_id: 'u-1',
    at: '2024-01-01T00:00:00Z',
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
            at: '2024-01-01T00:00:00Z',
        }),
        /missing required key "idea_id"/,
    );
});

// --- ProjectFlowEntity ---

const validProjectFlow = {
    project_id: 'p-1',
    flow_id: 'f-1',
    at: '2024-01-01T00:00:00Z',
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
            at: '2024-01-01T00:00:00Z',
        }),
        /missing required key "flow_id"/,
    );
});

// --- asStoredGraph (workerIds shape) ---

const baseNode = {
    id: 'n1',
    name: 'N',
    positionX: 0,
    positionY: 0,
    isCreate: false,
    isArchive: false,
    attributes: [],
    taskInstructions: '',
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
                            workerIds: [],
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
                        workerIds: [],
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
                        workerIds: [],
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
                            workerIds: [],
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
    record_id: 'r-1',
    name: 'Priority',
    attribute_type: 'select',
    sort_order: 0,
    options: '["High","Low"]',
    constraints: '[]',
};

test(
    'validateRecordAttributeEntity rejects a'
    + ' select with zero options',
    () => {
    assert.throws(
        () => validateRecordAttributeEntity({
            ...validSelectAttribute,
            options: '[]',
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
            options: '[]',
        }),
        /at least one option/,
    );
});
