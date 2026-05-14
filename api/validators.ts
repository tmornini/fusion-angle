import {
    assertWorkerStatus,
    assertIdeaStatus,
    assertProjectStatus,
    assertReadinessLevel,
} from './types.ts';
import type {
    GraphNode,
    GraphEdge,
    GraphField,
    StoredGraph,
    WorkOrderFlowGraph,
    FlowFieldType,
    WorkerId,
    WorkerStatus,
    IdeaStatus,
    ProjectStatus,
    ReadinessLevel,
    JsonArrayField,
    JsonObjectField,
    HumanWorkerEntity,
    AIWorkerEntity,
    IdeaEntity,
    ProjectEntity,
    ActivityEntity,
    FlowEntity,
    FlowVersionEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    WorkOrderTransitionEntity,
    TransitionFieldValueEntity,
    WorkOrderClaimEntity,
    OrganizationEntity,
    IdeaSubmissionEntity,
    ActivityActorEntity,
    ProjectFlowEntity,
} from './types.ts';

export interface Risk {
    title: string;
    severity: string;
    mitigation: string;
}

const FLOW_FIELD_TYPE_VALUES:
    readonly FlowFieldType[] = [
        'text', 'textarea', 'number',
        'date', 'select', 'checkbox',
        'file', 'email', 'url', 'phone',
        'currency', 'multi_select',
        'radio', 'image',
    ];

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

export function asFlowFieldType(
    value: unknown,
    label: string,
): FlowFieldType {
    const str = asString(value, label);
    if (
        !(FLOW_FIELD_TYPE_VALUES as
            readonly string[]).includes(str)
    ) {
        throw new Error(
            'expected FlowFieldType for '
                + label + ', got ' + str,
        );
    }
    return str as FlowFieldType;
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

export function validateRisksJson(
    raw: string,
): Risk[] {
    const label = 'risks';
    const parsed = parseOrThrow(raw, label);
    const arr = asArray(parsed, label);
    return arr.map((item, i) => {
        const itemLabel =
            label + '[' + i + ']';
        const obj = asObject(
            item, itemLabel,
        );
        return {
            title: asString(
                obj['title'],
                itemLabel + '.title',
            ),
            severity: asString(
                obj['severity'],
                itemLabel + '.severity',
            ),
            mitigation: asString(
                obj['mitigation'],
                itemLabel + '.mitigation',
            ),
        };
    });
}

function asGraphField(
    value: unknown,
    label: string,
): GraphField {
    const obj = asObject(value, label);
    const optsArr = asArray(
        obj['options'],
        label + '.options',
    );
    const name = asString(
        obj['name'], label + '.name',
    );
    if (name.length === 0) {
        throw new Error(
            'expected non-empty string'
            + ' for ' + label + '.name',
        );
    }
    return {
        id: asString(
            obj['id'], label + '.id',
        ),
        name,
        fieldType: asFlowFieldType(
            obj['fieldType'],
            label + '.fieldType',
        ),
        sortOrder: asNumber(
            obj['sortOrder'],
            label + '.sortOrder',
        ),
        isRequired: asBoolean(
            obj['isRequired'],
            label + '.isRequired',
        ),
        options: optsArr.map((o, i) =>
            asString(
                o,
                label + '.options['
                    + i + ']',
            ),
        ),
    };
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
    const fieldsArr = asArray(
        obj['fields'],
        label + '.fields',
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
        fields: fieldsArr.map((f, i) =>
            asGraphField(
                f,
                label + '.fields['
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

// ── Enum validators ─────────────────

export function asWorkerStatus(
    value: unknown,
    label: string,
): WorkerStatus {
    return assertWorkerStatus(
        asString(value, label), label,
    );
}

export function asIdeaStatus(
    value: unknown,
    label: string,
): IdeaStatus {
    return assertIdeaStatus(
        asString(value, label), label,
    );
}

export function asProjectStatus(
    value: unknown,
    label: string,
): ProjectStatus {
    return assertProjectStatus(
        asString(value, label), label,
    );
}

export function asReadinessLevel(
    value: unknown,
    label: string,
): ReadinessLevel {
    return assertReadinessLevel(
        asString(value, label), label,
    );
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

export function pickWorkerStatus(
    body: Record<string, unknown>,
    key: string,
): WorkerStatus {
    return asWorkerStatus(body[key], key);
}

export function pickIdeaStatus(
    body: Record<string, unknown>,
    key: string,
): IdeaStatus {
    return asIdeaStatus(body[key], key);
}

export function pickProjectStatus(
    body: Record<string, unknown>,
    key: string,
): ProjectStatus {
    return asProjectStatus(body[key], key);
}

export function pickReadinessLevel(
    body: Record<string, unknown>,
    key: string,
): ReadinessLevel {
    return asReadinessLevel(body[key], key);
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
// flow_graph, business_context, values,
// strengths, team_dimensions, etc.) — each
// JSON column's inner schema needs its own
// enumerated key list. That is the
// "recursive check" that closes the
// remaining edges. Intentionally deferred
// here because each column's shape must be
// enumerated case-by-case (e.g.
// business_context has its own keys; risks
// is an array of {title, severity,
// mitigation} objects — validateRisksJson
// does deep field validation but not
// key-count rejection). Bringing those
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
    'title', 'department', 'status',
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
        status: pickWorkerStatus(
            body, 'status',
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
    'auth_token', 'created_at',
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
        created_at: pickString(
            body, 'created_at',
        ),
    };
}

const IDEA_BODY_KEYS: readonly string[] = [
    'title', 'position', 'status',
    'problem_statement', 'target_users',
    'proposed_solution', 'expected_outcome',
    'success_metrics', 'readiness',
    'risks', 'assumptions', 'alignments',
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
        status: pickIdeaStatus(
            body, 'status',
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
        readiness: pickReadinessLevel(
            body, 'readiness',
        ),
        risks: pickJsonArrayField(
            body, 'risks',
        ),
        assumptions: pickJsonArrayField(
            body, 'assumptions',
        ),
        alignments: pickJsonArrayField(
            body, 'alignments',
        ),
    };
}

const PROJECT_BODY_KEYS: readonly string[] = [
    'title', 'description', 'status',
    'progress', 'start_date',
    'target_end_date', 'estimated_duration',
    'actual_duration', 'estimated_cost',
    'actual_cost', 'estimated_impact',
    'actual_impact', 'position',
    'business_context', 'timeline_label',
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
        status: pickProjectStatus(
            body, 'status',
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
        estimated_duration: pickNumber(
            body, 'estimated_duration',
        ),
        actual_duration: pickNumber(
            body, 'actual_duration',
        ),
        estimated_cost: pickNumber(
            body, 'estimated_cost',
        ),
        actual_cost: pickNumber(
            body, 'actual_cost',
        ),
        estimated_impact: pickNumber(
            body, 'estimated_impact',
        ),
        actual_impact: pickNumber(
            body, 'actual_impact',
        ),
        position: pickNumber(
            body, 'position',
        ),
        business_context: pickJsonObjectField(
            body, 'business_context',
        ),
        timeline_label: pickString(
            body, 'timeline_label',
        ),
    };
}


const ACTIVITY_BODY_KEYS: readonly string[] = [
    'type', 'action', 'target',
    'timestamp', 'status', 'feedback',
];

export function validateActivityEntity(
    body: Record<string, unknown>,
): Omit<ActivityEntity, 'id'> {
    assertOnlyKeys(
        body,
        ACTIVITY_BODY_KEYS,
        'ActivityEntity',
    );
    return {
        type: pickString(
            body, 'type',
        ),
        action: pickString(
            body, 'action',
        ),
        target: pickString(
            body, 'target',
        ),
        timestamp: pickString(
            body, 'timestamp',
        ),
        status: pickString(
            body, 'status',
        ),
        feedback: pickString(
            body, 'feedback',
        ),
    };
}

const FLOW_BODY_KEYS: readonly string[] = [
    'name', 'description', 'is_locked',
    'is_auto_layout', 'is_auto_fit',
    'lock_timeout', 'graph',
    'created_at', 'updated_at',
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
        created_at: pickString(
            body, 'created_at',
        ),
        updated_at: pickString(
            body, 'updated_at',
        ),
    };
}

const FLOW_VERSION_BODY_KEYS:
    readonly string[] = [
    'flow_id', 'name', 'description',
    'is_locked', 'is_auto_layout',
    'is_auto_fit', 'lock_timeout',
    'graph', 'created_at',
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
        created_at: pickString(
            body, 'created_at',
        ),
    };
}

const WORK_ORDER_BODY_KEYS:
    readonly string[] = [
    'display_id', 'flow_graph',
    'position', 'created_at',
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
        created_at: pickString(
            body, 'created_at',
        ),
    };
}

const FLOW_WORK_ORDER_BODY_KEYS:
    readonly string[] = [
    'flow_id', 'work_order_id', 'created_at',
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
        created_at: pickString(
            body, 'created_at',
        ),
    };
}

const WORK_ORDER_TRANSITION_BODY_KEYS:
    readonly string[] = [
    'work_order_id', 'from_node_id',
    'to_node_id', 'person_id',
    'transitioned_at',
];

export function
validateWorkOrderTransitionEntity(
    body: Record<string, unknown>,
): Omit<WorkOrderTransitionEntity, 'id'> {
    assertOnlyKeys(
        body,
        WORK_ORDER_TRANSITION_BODY_KEYS,
        'WorkOrderTransitionEntity',
    );
    return {
        work_order_id: pickString(
            body, 'work_order_id',
        ),
        from_node_id: pickString(
            body, 'from_node_id',
        ),
        to_node_id: pickString(
            body, 'to_node_id',
        ),
        person_id: pickString(
            body, 'person_id',
        ),
        transitioned_at: pickString(
            body, 'transitioned_at',
        ),
    };
}

const TRANSITION_FIELD_VALUE_BODY_KEYS:
    readonly string[] = [
    'transition_id', 'field_id', 'value',
];

export function
validateTransitionFieldValueEntity(
    body: Record<string, unknown>,
): Omit<TransitionFieldValueEntity, 'id'> {
    assertOnlyKeys(
        body,
        TRANSITION_FIELD_VALUE_BODY_KEYS,
        'TransitionFieldValueEntity',
    );
    return {
        transition_id: pickString(
            body, 'transition_id',
        ),
        field_id: pickString(
            body, 'field_id',
        ),
        value: pickString(
            body, 'value',
        ),
    };
}

const WORK_ORDER_CLAIM_BODY_KEYS:
    readonly string[] = [
    'work_order_id', 'person_id', 'claimed_at',
];

export function validateWorkOrderClaimEntity(
    body: Record<string, unknown>,
): Omit<WorkOrderClaimEntity, 'id'> {
    assertOnlyKeys(
        body,
        WORK_ORDER_CLAIM_BODY_KEYS,
        'WorkOrderClaimEntity',
    );
    return {
        work_order_id: pickString(
            body, 'work_order_id',
        ),
        person_id: pickString(
            body, 'person_id',
        ),
        claimed_at: pickString(
            body, 'claimed_at',
        ),
    };
}

const ORGANIZATION_BODY_KEYS:
    readonly string[] = [
    'name', 'domain',
    'plan', 'plan_status', 'next_billing',
    'seats', 'used_seats', 'projects_limit',
    'projects_current', 'ideas_limit',
    'ideas_current', 'storage_limit',
    'storage_current', 'ai_credits_limit',
    'ai_credits_current', 'health_score',
    'health_status', 'last_activity',
    'active_people',
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
        projects_current: pickNumber(
            body, 'projects_current',
        ),
        ideas_limit: pickNumber(
            body, 'ideas_limit',
        ),
        ideas_current: pickNumber(
            body, 'ideas_current',
        ),
        storage_limit: pickNumber(
            body, 'storage_limit',
        ),
        storage_current: pickNumber(
            body, 'storage_current',
        ),
        ai_credits_limit: pickNumber(
            body, 'ai_credits_limit',
        ),
        ai_credits_current: pickNumber(
            body, 'ai_credits_current',
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
        active_people: pickNumber(
            body, 'active_people',
        ),
    };
}

const IDEA_SUBMISSION_BODY_KEYS:
    readonly string[] = [
    'idea_id', 'person_id', 'created_at',
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
        person_id: pickString(
            body, 'person_id',
        ),
        created_at: pickString(
            body, 'created_at',
        ),
    };
}

const ACTIVITY_ACTOR_BODY_KEYS:
    readonly string[] = [
    'activity_id', 'person_id', 'created_at',
];

export function validateActivityActorEntity(
    body: Record<string, unknown>,
): Omit<ActivityActorEntity, 'id'> {
    assertOnlyKeys(
        body,
        ACTIVITY_ACTOR_BODY_KEYS,
        'ActivityActorEntity',
    );
    return {
        activity_id: pickString(
            body, 'activity_id',
        ),
        person_id: pickString(
            body, 'person_id',
        ),
        created_at: pickString(
            body, 'created_at',
        ),
    };
}

const PROJECT_FLOW_BODY_KEYS:
    readonly string[] = [
    'project_id', 'flow_id', 'created_at',
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
        created_at: pickString(
            body, 'created_at',
        ),
    };
}

