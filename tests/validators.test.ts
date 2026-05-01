import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    validateUserEntity,
    validateIdeaEntity,
    validateProjectEntity,
    validateTeamEntity,
    validateTeamProjectEntity,
    validateTeamUserEntity,
    validateActivityEntity,
    validateFlowEntity,
    validateFlowVersionEntity,
    validateWorkOrderEntity,
    validateFlowWorkOrderEntity,
    validateWorkOrderTransitionEntity,
    validateWorkOrderClaimEntity,
    validateCompanyEntity,
    validateOrganizationEntity,
    validateIdeaSubmissionEntity,
    validateActivityActorEntity,
    validateProjectFlowEntity,
} from '../api/validators.ts';

// --- UserEntity ---

const validUser = {
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    role: 'Engineer',
    department: 'R&D',
    status: 'active',
    availability: 80,
    performance_score: 90,
    projects_completed: 5,
    current_projects: 2,
    strengths: '["analytical"]',
    team_dimensions: '{"driver":0.5}',
    phone: '555-1234',
    bio: 'Pioneer',
    last_active: '2024-01-01T00:00:00Z',
};

test('validateUserEntity accepts valid payload', () => {
    const result = validateUserEntity(validUser);
    assert.equal(result.first_name, 'Ada');
    assert.equal(result.status, 'active');
});

test('validateUserEntity rejects missing email', () => {
    const body = { ...validUser };
    delete (body as Record<string, unknown>)['email'];
    assert.throws(
        () => validateUserEntity(body),
        /missing required key "email"/,
    );
});

test(
    'validateUserEntity rejects unexpected key',
    () => {
    assert.throws(
        () => validateUserEntity({
            ...validUser,
            admin: true,
        }),
        /unexpected key "admin"/,
    );
});

test(
    'validateUserEntity rejects missing required key',
    () => {
    const body = { ...validUser };
    delete (
        body as Record<string, unknown>
    )['last_name'];
    assert.throws(
        () => validateUserEntity(body),
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

// --- TeamEntity ---

const validTeam = {
    role: 'Developer',
    type: 'core',
};

test('validateTeamEntity accepts valid payload', () => {
    const result = validateTeamEntity(validTeam);
    assert.equal(result.role, 'Developer');
});

test('validateTeamEntity rejects missing role', () => {
    assert.throws(
        () => validateTeamEntity({ type: 'core' }),
        /missing required key "role"/,
    );
});

// --- TeamProjectEntity ---

const validTeamProject = {
    team_id: 'tm-1',
    project_id: 'p-1',
    created_at: '2024-01-01T00:00:00Z',
};

test('validateTeamProjectEntity accepts valid payload', () => {
    const result =
        validateTeamProjectEntity(validTeamProject);
    assert.equal(result.team_id, 'tm-1');
});

test(
    'validateTeamProjectEntity rejects missing'
    + ' project_id',
    () => {
    assert.throws(
        () => validateTeamProjectEntity({
            team_id: 'tm-1',
            created_at: '2024-01-01T00:00:00Z',
        }),
        /missing required key "project_id"/,
    );
});

// --- TeamUserEntity ---

const validTeamUser = {
    team_id: 'tm-1',
    user_id: 'u-1',
    created_at: '2024-01-01T00:00:00Z',
};

test('validateTeamUserEntity accepts valid payload', () => {
    const result =
        validateTeamUserEntity(validTeamUser);
    assert.equal(result.user_id, 'u-1');
});

test('validateTeamUserEntity rejects missing user_id', () => {
    assert.throws(
        () => validateTeamUserEntity({
            team_id: 'tm-1',
            created_at: '2024-01-01T00:00:00Z',
        }),
        /missing required key "user_id"/,
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
    user_id: 'u-1',
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
    user_id: 'u-1',
    claimed_at: '2024-01-01T00:00:00Z',
};

test(
    'validateWorkOrderClaimEntity accepts valid'
    + ' payload',
    () => {
    const result =
        validateWorkOrderClaimEntity(validClaim);
    assert.equal(result.user_id, 'u-1');
});

test(
    'validateWorkOrderClaimEntity rejects missing'
    + ' claimed_at',
    () => {
    assert.throws(
        () => validateWorkOrderClaimEntity({
            work_order_id: 'wo-1',
            user_id: 'u-1',
        }),
        /missing required key "claimed_at"/,
    );
});

// --- CompanyEntity ---

const validCompany = {
    name: 'Acme Corp',
    domain: 'acme.com',
};

test('validateCompanyEntity accepts valid payload', () => {
    const result =
        validateCompanyEntity(validCompany);
    assert.equal(result.name, 'Acme Corp');
});

test('validateCompanyEntity rejects missing domain', () => {
    assert.throws(
        () => validateCompanyEntity({
            name: 'Acme Corp',
        }),
        /missing required key "domain"/,
    );
});

// --- OrganizationEntity ---

const validOrg = {
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
    active_users: 5,
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
    )['active_users'];
    assert.throws(
        () => validateOrganizationEntity(body),
        /missing required key "active_users"/,
    );
});

// --- IdeaSubmissionEntity ---

const validIdeaSubmission = {
    idea_id: 'i-1',
    user_id: 'u-1',
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
            user_id: 'u-1',
            created_at: '2024-01-01T00:00:00Z',
        }),
        /missing required key "idea_id"/,
    );
});

// --- ActivityActorEntity ---

const validActivityActor = {
    activity_id: 'act-1',
    user_id: 'u-1',
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
            user_id: 'u-1',
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
