import {
    assertPersonStatus,
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
    NodeAssignment,
    PersonStatus,
    IdeaStatus,
    ProjectStatus,
    ReadinessLevel,
    JsonArrayField,
    JsonObjectField,
    PersonEntity,
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
    RoleEntity,
    RoleMembershipEntity,
    CrewEntity,
    CrewRoleMembershipEntity,
    ModelEntity,
    RoleModelMembershipEntity,
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

export function asNodeAssignment(
    value: unknown,
    label: string,
): NodeAssignment {
    const obj = asObject(value, label);
    const kind = asString(
        obj['kind'], label + '.kind',
    );
    if (kind === 'unassigned') {
        return { kind: 'unassigned' };
    }
    if (kind === 'role') {
        return {
            kind: 'role',
            roleId: asString(
                obj['roleId'],
                label + '.roleId',
            ),
        };
    }
    if (kind === 'crew') {
        return {
            kind: 'crew',
            crewId: asString(
                obj['crewId'],
                label + '.crewId',
            ),
        };
    }
    if (kind === 'model') {
        return {
            kind: 'model',
            modelId: asString(
                obj['modelId'],
                label + '.modelId',
            ),
        };
    }
    throw new Error(
        'expected assignment.kind in {unassigned,'
            + ' role, crew, model} for '
            + label + ', got ' + kind,
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
    const crew = asNodeAssignment(
        obj['crew'], label + '.crew',
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
        isStart: asBoolean(
            obj['isStart'],
            label + '.isStart',
        ),
        isComplete: asBoolean(
            obj['isComplete'],
            label + '.isComplete',
        ),
        crew,
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

export function asPersonStatus(
    value: unknown,
    label: string,
): PersonStatus {
    return assertPersonStatus(
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

const PERSON_BODY_KEYS: readonly string[] = [
    'first_name', 'last_name', 'email',
    'title', 'department', 'status',
    'strengths', 'team_dimensions',
    'phone', 'bio',
];

export function validatePersonEntity(
    body: Record<string, unknown>,
): Omit<PersonEntity, 'id'> {
    assertOnlyKeys(
        body, PERSON_BODY_KEYS, 'PersonEntity',
    );
    return {
        first_name: asString(
            body['first_name'], 'first_name',
        ),
        last_name: asString(
            body['last_name'], 'last_name',
        ),
        email: asString(
            body['email'], 'email',
        ),
        title: asString(
            body['title'], 'title',
        ),
        department: asString(
            body['department'], 'department',
        ),
        status: asPersonStatus(
            body['status'], 'status',
        ),
        strengths: asJsonArrayField(
            body['strengths'], 'strengths',
        ),
        team_dimensions: asJsonObjectField(
            body['team_dimensions'],
            'team_dimensions',
        ),
        phone: asString(
            body['phone'], 'phone',
        ),
        bio: asString(
            body['bio'], 'bio',
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
        title: asString(
            body['title'], 'title',
        ),
        position: asNumber(
            body['position'], 'position',
        ),
        status: asIdeaStatus(
            body['status'], 'status',
        ),
        problem_statement: asString(
            body['problem_statement'],
            'problem_statement',
        ),
        target_users: asString(
            body['target_users'],
            'target_users',
        ),
        proposed_solution: asString(
            body['proposed_solution'],
            'proposed_solution',
        ),
        expected_outcome: asString(
            body['expected_outcome'],
            'expected_outcome',
        ),
        success_metrics: asString(
            body['success_metrics'],
            'success_metrics',
        ),
        readiness: asReadinessLevel(
            body['readiness'], 'readiness',
        ),
        risks: asJsonArrayField(
            body['risks'], 'risks',
        ),
        assumptions: asJsonArrayField(
            body['assumptions'],
            'assumptions',
        ),
        alignments: asJsonArrayField(
            body['alignments'], 'alignments',
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
    'budget_label',
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
        title: asString(
            body['title'], 'title',
        ),
        description: asString(
            body['description'],
            'description',
        ),
        status: asProjectStatus(
            body['status'], 'status',
        ),
        progress: asNumber(
            body['progress'], 'progress',
        ),
        start_date: asString(
            body['start_date'], 'start_date',
        ),
        target_end_date: asString(
            body['target_end_date'],
            'target_end_date',
        ),
        estimated_duration: asNumber(
            body['estimated_duration'],
            'estimated_duration',
        ),
        actual_duration: asNumber(
            body['actual_duration'],
            'actual_duration',
        ),
        estimated_cost: asNumber(
            body['estimated_cost'],
            'estimated_cost',
        ),
        actual_cost: asNumber(
            body['actual_cost'],
            'actual_cost',
        ),
        estimated_impact: asNumber(
            body['estimated_impact'],
            'estimated_impact',
        ),
        actual_impact: asNumber(
            body['actual_impact'],
            'actual_impact',
        ),
        position: asNumber(
            body['position'], 'position',
        ),
        business_context: asJsonObjectField(
            body['business_context'],
            'business_context',
        ),
        timeline_label: asString(
            body['timeline_label'],
            'timeline_label',
        ),
        budget_label: asString(
            body['budget_label'],
            'budget_label',
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
        type: asString(
            body['type'], 'type',
        ),
        action: asString(
            body['action'], 'action',
        ),
        target: asString(
            body['target'], 'target',
        ),
        timestamp: asString(
            body['timestamp'], 'timestamp',
        ),
        status: asString(
            body['status'], 'status',
        ),
        feedback: asString(
            body['feedback'], 'feedback',
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
        name: asString(
            body['name'], 'name',
        ),
        description: asString(
            body['description'],
            'description',
        ),
        is_locked: asBoolean(
            body['is_locked'], 'is_locked',
        ),
        is_auto_layout: asBoolean(
            body['is_auto_layout'],
            'is_auto_layout',
        ),
        is_auto_fit: asBoolean(
            body['is_auto_fit'],
            'is_auto_fit',
        ),
        lock_timeout: asNumber(
            body['lock_timeout'],
            'lock_timeout',
        ),
        graph: asJsonObjectField(
            body['graph'], 'graph',
        ),
        created_at: asString(
            body['created_at'], 'created_at',
        ),
        updated_at: asString(
            body['updated_at'], 'updated_at',
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
        flow_id: asString(
            body['flow_id'], 'flow_id',
        ),
        name: asString(
            body['name'], 'name',
        ),
        description: asString(
            body['description'],
            'description',
        ),
        is_locked: asBoolean(
            body['is_locked'], 'is_locked',
        ),
        is_auto_layout: asBoolean(
            body['is_auto_layout'],
            'is_auto_layout',
        ),
        is_auto_fit: asBoolean(
            body['is_auto_fit'],
            'is_auto_fit',
        ),
        lock_timeout: asNumber(
            body['lock_timeout'],
            'lock_timeout',
        ),
        graph: asJsonObjectField(
            body['graph'], 'graph',
        ),
        created_at: asString(
            body['created_at'], 'created_at',
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
        display_id: asString(
            body['display_id'], 'display_id',
        ),
        flow_graph: asJsonObjectField(
            body['flow_graph'], 'flow_graph',
        ),
        position: asNumber(
            body['position'], 'position',
        ),
        created_at: asString(
            body['created_at'], 'created_at',
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
        flow_id: asString(
            body['flow_id'], 'flow_id',
        ),
        work_order_id: asString(
            body['work_order_id'],
            'work_order_id',
        ),
        created_at: asString(
            body['created_at'], 'created_at',
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
        work_order_id: asString(
            body['work_order_id'],
            'work_order_id',
        ),
        from_node_id: asString(
            body['from_node_id'],
            'from_node_id',
        ),
        to_node_id: asString(
            body['to_node_id'], 'to_node_id',
        ),
        person_id: asString(
            body['person_id'], 'person_id',
        ),
        transitioned_at: asString(
            body['transitioned_at'],
            'transitioned_at',
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
        transition_id: asString(
            body['transition_id'],
            'transition_id',
        ),
        field_id: asString(
            body['field_id'], 'field_id',
        ),
        value: asString(
            body['value'], 'value',
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
        work_order_id: asString(
            body['work_order_id'],
            'work_order_id',
        ),
        person_id: asString(
            body['person_id'], 'person_id',
        ),
        claimed_at: asString(
            body['claimed_at'], 'claimed_at',
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
        name: asString(
            body['name'], 'name',
        ),
        domain: asString(
            body['domain'], 'domain',
        ),
        plan: asString(
            body['plan'], 'plan',
        ),
        plan_status: asString(
            body['plan_status'], 'plan_status',
        ),
        next_billing: asString(
            body['next_billing'],
            'next_billing',
        ),
        seats: asNumber(
            body['seats'], 'seats',
        ),
        used_seats: asNumber(
            body['used_seats'], 'used_seats',
        ),
        projects_limit: asNumber(
            body['projects_limit'],
            'projects_limit',
        ),
        projects_current: asNumber(
            body['projects_current'],
            'projects_current',
        ),
        ideas_limit: asNumber(
            body['ideas_limit'], 'ideas_limit',
        ),
        ideas_current: asNumber(
            body['ideas_current'],
            'ideas_current',
        ),
        storage_limit: asNumber(
            body['storage_limit'],
            'storage_limit',
        ),
        storage_current: asNumber(
            body['storage_current'],
            'storage_current',
        ),
        ai_credits_limit: asNumber(
            body['ai_credits_limit'],
            'ai_credits_limit',
        ),
        ai_credits_current: asNumber(
            body['ai_credits_current'],
            'ai_credits_current',
        ),
        health_score: asNumber(
            body['health_score'],
            'health_score',
        ),
        health_status: asString(
            body['health_status'],
            'health_status',
        ),
        last_activity: asString(
            body['last_activity'],
            'last_activity',
        ),
        active_people: asNumber(
            body['active_people'],
            'active_people',
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
        idea_id: asString(
            body['idea_id'], 'idea_id',
        ),
        person_id: asString(
            body['person_id'], 'person_id',
        ),
        created_at: asString(
            body['created_at'], 'created_at',
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
        activity_id: asString(
            body['activity_id'], 'activity_id',
        ),
        person_id: asString(
            body['person_id'], 'person_id',
        ),
        created_at: asString(
            body['created_at'], 'created_at',
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
        project_id: asString(
            body['project_id'], 'project_id',
        ),
        flow_id: asString(
            body['flow_id'], 'flow_id',
        ),
        created_at: asString(
            body['created_at'], 'created_at',
        ),
    };
}

const ROLE_BODY_KEYS: readonly string[] = [
    'name', 'description', 'created_at',
];

export function validateRoleEntity(
    body: Record<string, unknown>,
): Omit<RoleEntity, 'id'> {
    assertOnlyKeys(
        body, ROLE_BODY_KEYS, 'RoleEntity',
    );
    return {
        name: asString(
            body['name'], 'name',
        ),
        description: asString(
            body['description'], 'description',
        ),
        created_at: asString(
            body['created_at'], 'created_at',
        ),
    };
}

const ROLE_MEMBERSHIP_BODY_KEYS:
    readonly string[] = [
    'role_id', 'person_id', 'created_at',
];

export function validateRoleMembershipEntity(
    body: Record<string, unknown>,
): Omit<RoleMembershipEntity, 'id'> {
    assertOnlyKeys(
        body,
        ROLE_MEMBERSHIP_BODY_KEYS,
        'RoleMembershipEntity',
    );
    return {
        role_id: asString(
            body['role_id'], 'role_id',
        ),
        person_id: asString(
            body['person_id'], 'person_id',
        ),
        created_at: asString(
            body['created_at'], 'created_at',
        ),
    };
}

const CREW_BODY_KEYS: readonly string[] = [
    'name', 'description', 'created_at',
];

export function validateCrewEntity(
    body: Record<string, unknown>,
): Omit<CrewEntity, 'id'> {
    assertOnlyKeys(
        body, CREW_BODY_KEYS, 'CrewEntity',
    );
    return {
        name: asString(
            body['name'], 'name',
        ),
        description: asString(
            body['description'], 'description',
        ),
        created_at: asString(
            body['created_at'], 'created_at',
        ),
    };
}

const CREW_ROLE_MEMBERSHIP_BODY_KEYS:
    readonly string[] = [
    'crew_id', 'role_id', 'created_at',
];

export function validateCrewRoleMembershipEntity(
    body: Record<string, unknown>,
): Omit<CrewRoleMembershipEntity, 'id'> {
    assertOnlyKeys(
        body,
        CREW_ROLE_MEMBERSHIP_BODY_KEYS,
        'CrewRoleMembershipEntity',
    );
    return {
        crew_id: asString(
            body['crew_id'], 'crew_id',
        ),
        role_id: asString(
            body['role_id'], 'role_id',
        ),
        created_at: asString(
            body['created_at'], 'created_at',
        ),
    };
}

const MODEL_BODY_KEYS: readonly string[] = [
    'name', 'provider', 'description',
    'created_at',
];

export function validateModelEntity(
    body: Record<string, unknown>,
): Omit<ModelEntity, 'id'> {
    assertOnlyKeys(
        body, MODEL_BODY_KEYS, 'ModelEntity',
    );
    return {
        name: asString(
            body['name'], 'name',
        ),
        provider: asString(
            body['provider'], 'provider',
        ),
        description: asString(
            body['description'], 'description',
        ),
        created_at: asString(
            body['created_at'], 'created_at',
        ),
    };
}

const ROLE_MODEL_MEMBERSHIP_BODY_KEYS:
    readonly string[] = [
    'role_id', 'model_id', 'created_at',
];

export function validateRoleModelMembershipEntity(
    body: Record<string, unknown>,
): Omit<RoleModelMembershipEntity, 'id'> {
    assertOnlyKeys(
        body,
        ROLE_MODEL_MEMBERSHIP_BODY_KEYS,
        'RoleModelMembershipEntity',
    );
    return {
        role_id: asString(
            body['role_id'], 'role_id',
        ),
        model_id: asString(
            body['model_id'], 'model_id',
        ),
        created_at: asString(
            body['created_at'], 'created_at',
        ),
    };
}
