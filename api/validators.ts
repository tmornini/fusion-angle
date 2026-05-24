import type {
    GraphNode,
    GraphEdge,
    NodeAttribute,
    StoredGraph,
    WorkOrderFlowGraph,
    AttributeType,
    Constraint,
    WorkerId,
    JsonArrayField,
    JsonObjectField,
    HumanWorkerEntity,
    AIWorkerEntity,
    IdeaEntity,
    ProjectEntity,
    FlowEntity,
    FlowVersionEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    StateFieldValueEntity,
    OrganizationEntity,
    IdeaSubmissionEntity,
    ProjectFlowEntity,
    RecordEntity,
    RecordAttributeEntity,
    FlowRecordEntity,
    Objective,
    ObjectiveRevision,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
    StateEntity,
} from './types.ts';
import {
    assertAttributeType,
    assertConstraintAppliesTo,
} from './types.ts';

export function parseOrThrow(
    raw: string,
    label: string,
): unknown {
    try {
        return JSON.parse(raw);
    } catch (e) {
        const msg = e instanceof Error
            ? e.message
            : String(e);
        throw new Error(
            'invalid JSON for '
                + label + ': ' + msg,
        );
    }
}

export function asArray(
    value: unknown,
    label: string,
): unknown[] {
    if (!Array.isArray(value)) {
        throw new Error(
            'expected array for '
                + label
                + ', got '
                + typeName(value),
        );
    }
    return value;
}

export function asObject(
    value: unknown,
    label: string,
): Record<string, unknown> {
    if (
        typeof value !== 'object'
        || value === null
        || Array.isArray(value)
    ) {
        throw new Error(
            'expected object for '
                + label
                + ', got '
                + typeName(value),
        );
    }
    return value as Record<string, unknown>;
}

export function asString(
    value: unknown,
    label: string,
): string {
    if (typeof value !== 'string') {
        throw new Error(
            'expected string for '
                + label
                + ', got '
                + typeName(value),
        );
    }
    return value;
}

export function asNumber(
    value: unknown,
    label: string,
): number {
    if (
        typeof value !== 'number'
        || !Number.isFinite(value)
    ) {
        throw new Error(
            'expected finite number for '
                + label
                + ', got '
                + typeName(value),
        );
    }
    return value;
}

export function asScore(
    value: unknown,
    label: string,
): number {
    if (
        typeof value !== 'number'
        || !Number.isInteger(value)
        || value < -100
        || value > 100
    ) {
        throw new Error(
            'expected integer in [-100, +100] for '
                + label
                + ', got '
                + typeName(value),
        );
    }
    return value;
}

export function asBoolean(
    value: unknown,
    label: string,
): boolean {
    if (typeof value !== 'boolean') {
        throw new Error(
            'expected boolean for '
                + label
                + ', got '
                + typeName(value),
        );
    }
    return value;
}

export function asAttributeType(
    value: unknown,
    label: string,
): AttributeType {
    return assertAttributeType(
        asString(value, label),
        label,
    );
}

function typeName(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

export function validateStringArrayJson(
    raw: string,
    label: string,
): string[] {
    const parsed = parseOrThrow(raw, label);
    const arr = asArray(parsed, label);
    return arr.map((item, i) =>
        asString(
            item,
            label + '[' + i + ']',
        ),
    );
}

export function
validateStringNumberRecordJson(
    raw: string,
    label: string,
): Record<string, number> {
    const parsed = parseOrThrow(raw, label);
    const obj = asObject(parsed, label);
    const out: Record<string, number> = {};
    for (
        const [k, v] of Object.entries(obj)
    ) {
        out[k] = asNumber(
            v, label + '.' + k,
        );
    }
    return out;
}

const NODE_ATTRIBUTE_MODES:
    readonly ('editable' | 'readonly')[]
    = ['editable', 'readonly'];

function asNodeAttribute(
    value: unknown,
    label: string,
): NodeAttribute {
    const obj = asObject(value, label);
    const mode = asString(
        obj['mode'], label + '.mode',
    );
    if (
        !(NODE_ATTRIBUTE_MODES as
            readonly string[]).includes(mode)
    ) {
        throw new Error(
            "expected 'editable' or 'readonly'"
            + ' for ' + label + '.mode, got '
            + mode,
        );
    }
    return {
        attribute_id: asString(
            obj['attribute_id'],
            label + '.attribute_id',
        ),
        mode: mode as
            ('editable' | 'readonly'),
        isRequired: asBoolean(
            obj['isRequired'],
            label + '.isRequired',
        ),
    };
}

export function asConstraint(
    value: unknown,
    label: string,
): Constraint {
    const obj = asObject(value, label);
    const kind = asString(
        obj['kind'], label + '.kind',
    );
    if (kind === 'regex') {
        return {
            kind: 'regex',
            pattern: asString(
                obj['pattern'],
                label + '.pattern',
            ),
        };
    }
    if (kind === 'range_min') {
        return {
            kind: 'range_min',
            min: asString(
                obj['min'],
                label + '.min',
            ),
        };
    }
    if (kind === 'range_max') {
        return {
            kind: 'range_max',
            max: asString(
                obj['max'],
                label + '.max',
            ),
        };
    }
    throw new Error(
        "expected Constraint kind 'regex',"
        + " 'range_min', or 'range_max' for "
        + label + '.kind, got ' + kind,
    );
}

export function asWorkerIds(
    value: unknown,
    label: string,
): WorkerId[] {
    const arr = asArray(value, label);
    return arr.map((v, i) =>
        asString(
            v,
            label + '[' + i + ']',
        ),
    );
}

function asGraphNode(
    value: unknown,
    label: string,
): GraphNode {
    const obj = asObject(value, label);
    const attrsArr = asArray(
        obj['attributes'],
        label + '.attributes',
    );
    const workerIds = asWorkerIds(
        obj['workerIds'],
        label + '.workerIds',
    );
    return {
        id: asString(
            obj['id'], label + '.id',
        ),
        name: asString(
            obj['name'], label + '.name',
        ),
        description: asString(
            obj['description'],
            label + '.description',
        ),
        positionX: asNumber(
            obj['positionX'],
            label + '.positionX',
        ),
        positionY: asNumber(
            obj['positionY'],
            label + '.positionY',
        ),
        isCreate: asBoolean(
            obj['isCreate'],
            label + '.isCreate',
        ),
        isArchive: asBoolean(
            obj['isArchive'],
            label + '.isArchive',
        ),
        workerIds,
        attributes: attrsArr.map((a, i) =>
            asNodeAttribute(
                a,
                label + '.attributes['
                    + i + ']',
            ),
        ),
    };
}

function asGraphEdge(
    value: unknown,
    label: string,
): GraphEdge {
    const obj = asObject(value, label);
    return {
        id: asString(
            obj['id'], label + '.id',
        ),
        name: asString(
            obj['name'], label + '.name',
        ),
        description: asString(
            obj['description'],
            label + '.description',
        ),
        fromNodeId: asString(
            obj['fromNodeId'],
            label + '.fromNodeId',
        ),
        toNodeId: asString(
            obj['toNodeId'],
            label + '.toNodeId',
        ),
    };
}

export function asStoredGraph(
    value: unknown,
    label: string,
): StoredGraph {
    const obj = asObject(value, label);
    const nodesArr = asArray(
        obj['nodes'],
        label + '.nodes',
    );
    const edgesArr = asArray(
        obj['edges'],
        label + '.edges',
    );
    return {
        nodes: nodesArr.map((n, i) =>
            asGraphNode(
                n,
                label + '.nodes['
                    + i + ']',
            ),
        ),
        edges: edgesArr.map((e, i) =>
            asGraphEdge(
                e,
                label + '.edges['
                    + i + ']',
            ),
        ),
    };
}

export function validateStoredGraphJson(
    raw: string,
    label: string,
): StoredGraph {
    const parsed = parseOrThrow(raw, label);
    return asStoredGraph(parsed, label);
}

export function
validateWorkOrderFlowGraphJson(
    raw: string,
    label: string,
): WorkOrderFlowGraph {
    const parsed = parseOrThrow(raw, label);
    const obj = asObject(parsed, label);
    const nodesArr = asArray(
        obj['nodes'],
        label + '.nodes',
    );
    const edgesArr = asArray(
        obj['edges'],
        label + '.edges',
    );
    return {
        flowId: asString(
            obj['flowId'],
            label + '.flowId',
        ),
        name: asString(
            obj['name'], label + '.name',
        ),
        description: asString(
            obj['description'],
            label + '.description',
        ),
        lockTimeout: asNumber(
            obj['lockTimeout'],
            label + '.lockTimeout',
        ),
        nodes: nodesArr.map((n, i) =>
            asGraphNode(
                n,
                label + '.nodes['
                    + i + ']',
            ),
        ),
        edges: edgesArr.map((e, i) =>
            asGraphEdge(
                e,
                label + '.edges['
                    + i + ']',
            ),
        ),
    };
}


// ── JSON field helpers ────────────────

function asJsonArrayField(
    value: unknown,
    label: string,
): JsonArrayField {
    const raw = asString(value, label);
    const parsed = parseOrThrow(raw, label);
    asArray(parsed, label);
    return raw as JsonArrayField;
}

function asJsonObjectField(
    value: unknown,
    label: string,
): JsonObjectField {
    const raw = asString(value, label);
    const parsed = parseOrThrow(raw, label);
    asObject(parsed, label);
    return raw as JsonObjectField;
}

// ── Pick-from-body helpers ───────────
//
// pick*(body, key) is the no-stutter form
// of as*(body[key], key). The label IS the
// key. For nested parsing where the label
// must be a parent path (e.g., label +
// '.kind'), keep using the as* form.

export function pickString(
    body: Record<string, unknown>,
    key: string,
): string {
    return asString(body[key], key);
}

export function pickNumber(
    body: Record<string, unknown>,
    key: string,
): number {
    return asNumber(body[key], key);
}

export function pickBoolean(
    body: Record<string, unknown>,
    key: string,
): boolean {
    return asBoolean(body[key], key);
}

export function pickJsonArrayField(
    body: Record<string, unknown>,
    key: string,
): JsonArrayField {
    return asJsonArrayField(body[key], key);
}

export function pickJsonObjectField(
    body: Record<string, unknown>,
    key: string,
): JsonObjectField {
    return asJsonObjectField(body[key], key);
}

// ── Key-set enforcement ──────────────
//
// assertOnlyKeys checks exact key-set
// membership: no extra keys, no missing
// keys. Rejects key-injection attacks
// ("trust within the walls" doctrine).
//
// Follow-on: extend this same discipline
// into JSON-encoded fields (graph,
// flow_graph, values, strengths,
// team_dimensions, etc.) — each
// JSON column's inner schema needs its own
// enumerated key list. That is the
// "recursive check" that closes the
// remaining edges. Intentionally deferred
// here because each column's shape must be
// enumerated case-by-case. Bringing those
// columns under key-count discipline is
// the next iteration.

export function assertOnlyKeys(
    body: Record<string, unknown>,
    expected: readonly string[],
    label: string,
): void {
    const expectedSet = new Set(expected);
    for (const key of Object.keys(body)) {
        if (!expectedSet.has(key)) {
            throw new Error(
                'unexpected key "'
                    + key + '"'
                    + ' for ' + label,
            );
        }
    }
    for (const key of expected) {
        if (!(key in body)) {
            throw new Error(
                'missing required key "'
                    + key + '"'
                    + ' for ' + label,
            );
        }
    }
}

// ── Entity validators ────────────────

const HUMAN_WORKER_BODY_KEYS:
    readonly string[] = [
    'first_name', 'last_name', 'email',
    'title', 'department',
    'strengths', 'team_dimensions',
    'phone', 'bio',
];

export function validateHumanWorkerEntity(
    body: Record<string, unknown>,
): Omit<HumanWorkerEntity, 'id'> {
    assertOnlyKeys(
        body,
        HUMAN_WORKER_BODY_KEYS,
        'HumanWorkerEntity',
    );
    return {
        first_name: pickString(
            body, 'first_name',
        ),
        last_name: pickString(
            body, 'last_name',
        ),
        email: pickString(
            body, 'email',
        ),
        title: pickString(
            body, 'title',
        ),
        department: pickString(
            body, 'department',
        ),
        strengths: pickJsonArrayField(
            body, 'strengths',
        ),
        team_dimensions: pickJsonObjectField(
            body, 'team_dimensions',
        ),
        phone: pickString(
            body, 'phone',
        ),
        bio: pickString(
            body, 'bio',
        ),
    };
}

const AI_WORKER_BODY_KEYS:
    readonly string[] = [
    'name', 'provider', 'description',
    'auth_token',
];

// auth_token must be non-empty —
// Sin of Null / Default Values fires
// otherwise (empty would be a sentinel for
// "not set"). Future feature will add
// provider-side validation; this gate is
// the first line of defense today.
export function validateAIWorkerEntity(
    body: Record<string, unknown>,
): Omit<AIWorkerEntity, 'id'> {
    assertOnlyKeys(
        body,
        AI_WORKER_BODY_KEYS,
        'AIWorkerEntity',
    );
    const authToken = pickString(
        body, 'auth_token',
    );
    if (authToken === '') {
        throw new Error(
            'auth_token must be non-empty'
            + ' on AIWorkerEntity',
        );
    }
    return {
        name: pickString(
            body, 'name',
        ),
        provider: pickString(
            body, 'provider',
        ),
        description: pickString(
            body, 'description',
        ),
        auth_token: authToken,
    };
}

const IDEA_BODY_KEYS: readonly string[] = [
    'title', 'position',
    'problem_statement', 'target_users',
    'proposed_solution', 'expected_outcome',
    'success_metrics',
];

export function validateIdeaEntity(
    body: Record<string, unknown>,
): Omit<IdeaEntity, 'id'> {
    assertOnlyKeys(
        body, IDEA_BODY_KEYS, 'IdeaEntity',
    );
    return {
        title: pickString(
            body, 'title',
        ),
        position: pickNumber(
            body, 'position',
        ),
        problem_statement: pickString(
            body, 'problem_statement',
        ),
        target_users: pickString(
            body, 'target_users',
        ),
        proposed_solution: pickString(
            body, 'proposed_solution',
        ),
        expected_outcome: pickString(
            body, 'expected_outcome',
        ),
        success_metrics: pickString(
            body, 'success_metrics',
        ),
    };
}

const PROJECT_BODY_KEYS: readonly string[] = [
    'title', 'description',
    'progress', 'start_date',
    'target_end_date', 'estimated_cost',
    'actual_cost', 'position',
];

export function validateProjectEntity(
    body: Record<string, unknown>,
): Omit<ProjectEntity, 'id'> {
    assertOnlyKeys(
        body,
        PROJECT_BODY_KEYS,
        'ProjectEntity',
    );
    return {
        title: pickString(
            body, 'title',
        ),
        description: pickString(
            body, 'description',
        ),
        progress: pickNumber(
            body, 'progress',
        ),
        start_date: pickString(
            body, 'start_date',
        ),
        target_end_date: pickString(
            body, 'target_end_date',
        ),
        estimated_cost: pickNumber(
            body, 'estimated_cost',
        ),
        actual_cost: pickNumber(
            body, 'actual_cost',
        ),
        position: pickNumber(
            body, 'position',
        ),
    };
}


const FLOW_BODY_KEYS: readonly string[] = [
    'name', 'description', 'is_locked',
    'is_auto_layout', 'is_auto_fit',
    'lock_timeout', 'graph',
];

export function validateFlowEntity(
    body: Record<string, unknown>,
): Omit<FlowEntity, 'id'> {
    assertOnlyKeys(
        body, FLOW_BODY_KEYS, 'FlowEntity',
    );
    return {
        name: pickString(
            body, 'name',
        ),
        description: pickString(
            body, 'description',
        ),
        is_locked: pickBoolean(
            body, 'is_locked',
        ),
        is_auto_layout: pickBoolean(
            body, 'is_auto_layout',
        ),
        is_auto_fit: pickBoolean(
            body, 'is_auto_fit',
        ),
        lock_timeout: pickNumber(
            body, 'lock_timeout',
        ),
        graph: pickJsonObjectField(
            body, 'graph',
        ),
    };
}

const FLOW_VERSION_BODY_KEYS:
    readonly string[] = [
    'flow_id', 'name', 'description',
    'is_locked', 'is_auto_layout',
    'is_auto_fit', 'lock_timeout',
    'graph', 'at',
];

export function validateFlowVersionEntity(
    body: Record<string, unknown>,
): Omit<FlowVersionEntity, 'id'> {
    assertOnlyKeys(
        body,
        FLOW_VERSION_BODY_KEYS,
        'FlowVersionEntity',
    );
    return {
        flow_id: pickString(
            body, 'flow_id',
        ),
        name: pickString(
            body, 'name',
        ),
        description: pickString(
            body, 'description',
        ),
        is_locked: pickBoolean(
            body, 'is_locked',
        ),
        is_auto_layout: pickBoolean(
            body, 'is_auto_layout',
        ),
        is_auto_fit: pickBoolean(
            body, 'is_auto_fit',
        ),
        lock_timeout: pickNumber(
            body, 'lock_timeout',
        ),
        graph: pickJsonObjectField(
            body, 'graph',
        ),
        at: pickString(
            body, 'at',
        ),
    };
}

const WORK_ORDER_BODY_KEYS:
    readonly string[] = [
    'display_id', 'flow_graph',
    'position',
];

export function validateWorkOrderEntity(
    body: Record<string, unknown>,
): Omit<WorkOrderEntity, 'id'> {
    assertOnlyKeys(
        body,
        WORK_ORDER_BODY_KEYS,
        'WorkOrderEntity',
    );
    return {
        display_id: pickString(
            body, 'display_id',
        ),
        flow_graph: pickJsonObjectField(
            body, 'flow_graph',
        ),
        position: pickNumber(
            body, 'position',
        ),
    };
}

const FLOW_WORK_ORDER_BODY_KEYS:
    readonly string[] = [
    'flow_id', 'work_order_id', 'at',
];

export function validateFlowWorkOrderEntity(
    body: Record<string, unknown>,
): Omit<FlowWorkOrderEntity, 'id'> {
    assertOnlyKeys(
        body,
        FLOW_WORK_ORDER_BODY_KEYS,
        'FlowWorkOrderEntity',
    );
    return {
        flow_id: pickString(
            body, 'flow_id',
        ),
        work_order_id: pickString(
            body, 'work_order_id',
        ),
        at: pickString(
            body, 'at',
        ),
    };
}

const STATE_FIELD_VALUE_BODY_KEYS:
    readonly string[] = [
    'state_event_id', 'field_id', 'value',
];

export function
validateStateFieldValueEntity(
    body: Record<string, unknown>,
): Omit<StateFieldValueEntity, 'id'> {
    assertOnlyKeys(
        body,
        STATE_FIELD_VALUE_BODY_KEYS,
        'StateFieldValueEntity',
    );
    return {
        state_event_id: pickString(
            body, 'state_event_id',
        ),
        field_id: pickString(
            body, 'field_id',
        ),
        value: pickString(
            body, 'value',
        ),
    };
}

const ORGANIZATION_BODY_KEYS:
    readonly string[] = [
    'name', 'domain',
    'plan', 'plan_status', 'next_billing',
    'seats', 'used_seats', 'projects_limit',
    'ideas_limit', 'health_score',
    'health_status', 'last_activity',
];

export function validateOrganizationEntity(
    body: Record<string, unknown>,
): Omit<OrganizationEntity, 'id'> {
    assertOnlyKeys(
        body,
        ORGANIZATION_BODY_KEYS,
        'OrganizationEntity',
    );
    return {
        name: pickString(
            body, 'name',
        ),
        domain: pickString(
            body, 'domain',
        ),
        plan: pickString(
            body, 'plan',
        ),
        plan_status: pickString(
            body, 'plan_status',
        ),
        next_billing: pickString(
            body, 'next_billing',
        ),
        seats: pickNumber(
            body, 'seats',
        ),
        used_seats: pickNumber(
            body, 'used_seats',
        ),
        projects_limit: pickNumber(
            body, 'projects_limit',
        ),
        ideas_limit: pickNumber(
            body, 'ideas_limit',
        ),
        health_score: pickNumber(
            body, 'health_score',
        ),
        health_status: pickString(
            body, 'health_status',
        ),
        last_activity: pickString(
            body, 'last_activity',
        ),
    };
}

const IDEA_SUBMISSION_BODY_KEYS:
    readonly string[] = [
    'idea_id', 'worker_id', 'at',
];

export function validateIdeaSubmissionEntity(
    body: Record<string, unknown>,
): Omit<IdeaSubmissionEntity, 'id'> {
    assertOnlyKeys(
        body,
        IDEA_SUBMISSION_BODY_KEYS,
        'IdeaSubmissionEntity',
    );
    return {
        idea_id: pickString(
            body, 'idea_id',
        ),
        worker_id: pickString(
            body, 'worker_id',
        ),
        at: pickString(
            body, 'at',
        ),
    };
}

const PROJECT_FLOW_BODY_KEYS:
    readonly string[] = [
    'project_id', 'flow_id', 'at',
];

export function validateProjectFlowEntity(
    body: Record<string, unknown>,
): Omit<ProjectFlowEntity, 'id'> {
    assertOnlyKeys(
        body,
        PROJECT_FLOW_BODY_KEYS,
        'ProjectFlowEntity',
    );
    return {
        project_id: pickString(
            body, 'project_id',
        ),
        flow_id: pickString(
            body, 'flow_id',
        ),
        at: pickString(
            body, 'at',
        ),
    };
}

const OBJECTIVE_BODY_KEYS: readonly string[] = [
    'position',
];

export function validateObjectiveEntity(
    body: Record<string, unknown>,
): Omit<Objective, 'id'> {
    assertOnlyKeys(
        body, OBJECTIVE_BODY_KEYS, 'Objective',
    );
    return {
        position: pickNumber(body, 'position'),
    };
}

const OBJECTIVE_REVISION_BODY_KEYS:
    readonly string[] = [
    'objective_id', 'name',
    'description', 'at',
];

export function validateObjectiveRevisionEntity(
    body: Record<string, unknown>,
): Omit<ObjectiveRevision, 'id'> {
    assertOnlyKeys(
        body,
        OBJECTIVE_REVISION_BODY_KEYS,
        'ObjectiveRevision',
    );
    const name = pickString(body, 'name');
    if (name === '') {
        throw new Error(
            'ObjectiveRevision.name must be non-empty',
        );
    }
    return {
        objective_id: pickString(
            body, 'objective_id',
        ),
        name,
        description: pickString(
            body, 'description',
        ),
        at: pickString(
            body, 'at',
        ),
    };
}

const BASELINE_SCORE_BODY_KEYS:
    readonly string[] = [
    'project_id', 'objective_id',
    'score', 'at',
];

export function validateBaselineScoreEntity(
    body: Record<string, unknown>,
): Omit<ProjectObjectiveBaselineScore, 'id'> {
    assertOnlyKeys(
        body,
        BASELINE_SCORE_BODY_KEYS,
        'BaselineScore',
    );
    return {
        project_id: pickString(
            body, 'project_id',
        ),
        objective_id: pickString(
            body, 'objective_id',
        ),
        score: asScore(
            body.score, 'BaselineScore.score',
        ),
        at: pickString(
            body, 'at',
        ),
    };
}

const ACTUAL_SCORE_BODY_KEYS:
    readonly string[] = [
    'project_id', 'objective_id',
    'score', 'at',
];

export function validateActualScoreEntity(
    body: Record<string, unknown>,
): Omit<ProjectObjectiveActualScore, 'id'> {
    assertOnlyKeys(
        body,
        ACTUAL_SCORE_BODY_KEYS,
        'ActualScore',
    );
    return {
        project_id: pickString(
            body, 'project_id',
        ),
        objective_id: pickString(
            body, 'objective_id',
        ),
        score: asScore(
            body.score, 'ActualScore.score',
        ),
        at: pickString(
            body, 'at',
        ),
    };
}

const STATE_BODY_KEYS: readonly string[] = [
    'entity_id', 'state', 'worker_id', 'at',
];

export function validateStateEntity(
    body: Record<string, unknown>,
): Omit<StateEntity, 'id'> {
    assertOnlyKeys(
        body, STATE_BODY_KEYS, 'StateEntity',
    );
    return {
        entity_id: pickString(
            body, 'entity_id',
        ),
        state: pickString(body, 'state'),
        worker_id: pickString(
            body, 'worker_id',
        ),
        at: pickString(body, 'at'),
    };
}

const RECORD_BODY_KEYS: readonly string[] = [
    'name', 'description',
];

export function validateRecordEntity(
    body: Record<string, unknown>,
): Omit<RecordEntity, 'id'> {
    assertOnlyKeys(
        body, RECORD_BODY_KEYS, 'RecordEntity',
    );
    const name = pickString(body, 'name');
    if (name === '') {
        throw new Error(
            'RecordEntity.name must be'
            + ' non-empty',
        );
    }
    return {
        name,
        description: pickString(
            body, 'description',
        ),
    };
}

const RECORD_ATTRIBUTE_BODY_KEYS:
    readonly string[] = [
    'record_id', 'name', 'attribute_type',
    'sort_order', 'options', 'constraints',
];

export function validateRecordAttributeEntity(
    body: Record<string, unknown>,
): Omit<RecordAttributeEntity, 'id'> {
    assertOnlyKeys(
        body,
        RECORD_ATTRIBUTE_BODY_KEYS,
        'RecordAttributeEntity',
    );
    const name = pickString(body, 'name');
    if (name === '') {
        throw new Error(
            'RecordAttributeEntity.name'
            + ' must be non-empty',
        );
    }
    const attributeType = asAttributeType(
        body['attribute_type'],
        'RecordAttributeEntity.attribute_type',
    );
    const constraintsField =
        pickJsonArrayField(
            body, 'constraints',
        );
    const parsedConstraints = parseOrThrow(
        constraintsField,
        'RecordAttributeEntity.constraints',
    );
    const constraintsArr = asArray(
        parsedConstraints,
        'RecordAttributeEntity.constraints',
    );
    for (let i = 0; i < constraintsArr.length; i++) {
        const constraint = asConstraint(
            constraintsArr[i],
            'RecordAttributeEntity.constraints['
            + i + ']',
        );
        assertConstraintAppliesTo(
            constraint.kind,
            attributeType,
            'RecordAttributeEntity.constraints['
            + i + ']',
        );
    }
    return {
        record_id: pickString(
            body, 'record_id',
        ),
        name,
        attribute_type: attributeType,
        sort_order: pickNumber(
            body, 'sort_order',
        ),
        options: pickJsonArrayField(
            body, 'options',
        ),
        constraints: constraintsField,
    };
}

const FLOW_RECORD_BODY_KEYS: readonly string[] = [
    'flow_id', 'record_id', 'at',
];

export function validateFlowRecordEntity(
    body: Record<string, unknown>,
): Omit<FlowRecordEntity, 'id'> {
    assertOnlyKeys(
        body,
        FLOW_RECORD_BODY_KEYS,
        'FlowRecordEntity',
    );
    return {
        flow_id: pickString(body, 'flow_id'),
        record_id: pickString(
            body, 'record_id',
        ),
        at: pickString(body, 'at'),
    };
}

