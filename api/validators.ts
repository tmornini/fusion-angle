import type {
    GraphNode,
    GraphEdge,
    NodeAttribute,
    StoredGraph,
    WorkOrderFlowGraph,
    AttributeType,
    Constraint,
    MemberId,
    JsonArrayField,
    JsonObjectField,
    IdentityEntity,
    IdentityPiiEntity,
    IdentityCredentialEntity,
    IdentityTokenRevocationEntity,
    IdentityDefaultOrgEntity,
    IdentityTokenEntity,
    ClientEntity,
    IdentityProviderEntity,
    AuthorizationCodeEntity,
    RoleGrantEntity,
    MemberEntity,
    HumanMemberEntity,
    AIMemberEntity,
    IdeaEntity,
    ProjectEntity,
    FlowEntity,
    FlowVersionEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    StateFieldValueEntity,
    OrganizationEntity,
    MembershipEntity,
    InvitationEntity,
    IdeaSubmissionEntity,
    ProjectFlowEntity,
    RecordEntity,
    RecordAttributeEntity,
    RecordId,
    RecordState,
    FlowRecordEntity,
    Objective,
    ObjectiveRevisionEntity,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
    StateEntity,
} from './types.ts';
import {
    assertAttributeType,
    assertConstraintAppliesTo,
    assertRecordState,
} from './types.ts';
import {
    isProviderModelId,
} from './provider-models.ts';
import { extractErrorMessage } from './error-helpers.ts';
import { ValidationError } from './types.ts';

export function parseOrThrow(
    raw: string,
    label: string,
): unknown {
    try {
        return JSON.parse(raw);
    } catch (e) {
        const msg = extractErrorMessage(e);
        throw new ValidationError(
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
        throw new ValidationError(
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
        throw new ValidationError(
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
        throw new ValidationError(
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
        throw new ValidationError(
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
        throw new ValidationError(
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
        throw new ValidationError(
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

export function validateConstraintArrayJson(
    raw: string,
    label: string,
): Constraint[] {
    const parsed = parseOrThrow(raw, label);
    const arr = asArray(parsed, label);
    return arr.map((item, i) =>
        asConstraint(
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
        throw new ValidationError(
            "expected 'editable' or 'readonly'"
            + ' for ' + label + '.mode, got '
            + mode,
        );
    }
    return {
        attributeId: asString(
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
    throw new ValidationError(
        "expected Constraint kind 'regex',"
        + " 'range_min', or 'range_max' for "
        + label + '.kind, got ' + kind,
    );
}

export function asMemberIds(
    value: unknown,
    label: string,
): MemberId[] {
    const arr = asArray(value, label);
    return arr.map((v, i) =>
        asString(
            v,
            label + '[' + i + ']',
        ),
    );
}

// Graph node/edge ids flow into DOM ids and SVG markup, so
// the gate pins them to the id alphabet — markup-significant
// characters can never enter storage, killing the stored-XSS
// class here rather than relying on every render site to
// escape. Every id producer (designer, importers, seeds)
// mints base62; _ and - are admitted for legacy snapshots.
const GRAPH_ID_ALPHABET = /^[A-Za-z0-9_-]+$/;

function asGraphId(
    value: unknown,
    label: string,
): string {
    const id = asString(value, label);
    if (!GRAPH_ID_ALPHABET.test(id)) {
        throw new ValidationError(
            label + ' must contain only'
            + ' [A-Za-z0-9_-], got ' + id,
        );
    }
    return id;
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
    const memberIds = asMemberIds(
        obj['memberIds'],
        label + '.memberIds',
    );
    return {
        id: asGraphId(
            obj['id'], label + '.id',
        ),
        name: asString(
            obj['name'], label + '.name',
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
        memberIds,
        attributes: attrsArr.map((a, i) =>
            asNodeAttribute(
                a,
                label + '.attributes['
                    + i + ']',
            ),
        ),
        taskInstructions: asString(
            obj['taskInstructions'],
            label + '.taskInstructions',
        ),
    };
}

function asGraphEdge(
    value: unknown,
    label: string,
): GraphEdge {
    const obj = asObject(value, label);
    return {
        id: asGraphId(
            obj['id'], label + '.id',
        ),
        name: asString(
            obj['name'], label + '.name',
        ),
        fromNodeId: asGraphId(
            obj['fromNodeId'],
            label + '.fromNodeId',
        ),
        toNodeId: asGraphId(
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
        name: asString(
            obj['name'], label + '.name',
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

// RFC-3339 zulu at EXACTLY six fraction digits — the one
// width the mints emit (nowUtc/dt/isoFromMs) and the ledgers
// sort. The Office of Time's enemy is AMBIGUITY (a date-only
// stamp shifts the day across zones; a zoned offset is
// localtime), and the latest-wins reductions add a second
// enemy: WIDTH. Lexical compare is chronological only within
// one width — a fractionless second sorts AFTER every
// fractional stamp inside it ('Z' > '.'), so an admitted
// off-width stamp could shadow the true latest event. The
// gate is the persistence edge for externally-sourced rows
// (PUT states/:id, the snapshot plane), so width is pinned
// HERE; Date.parse then rejects impossible dates the shape
// admits (e.g. month 13).
const ISO_ZULU =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

// A string field that must be an RFC-3339 zulu timestamp;
// returns it. The entity label names the offender — same message
// every ledger row's `at` validation emitted inline before.
export function validateTimestampField(
    body: Record<string, unknown>,
    field: string,
    entityLabel: string,
): string {
    const at = pickString(body, field);
    if (!ISO_ZULU.test(at) || Number.isNaN(Date.parse(at))) {
        throw new ValidationError(
            'invalid timestamp "' + at + '" on ' + entityLabel,
        );
    }
    return at;
}

// A calendar DATE, exactly YYYY-MM-DD — the OTHER temporal
// grammar: a zone-neutral day marker, not an instant. Project
// start/target dates carry no time of day; admitting a full
// timestamp here would store two grammars in one column and
// shift the rendered day across zones. Date.parse ROLLS OVER
// an impossible day (2026-02-30 parses as March 1), so the
// parsed instant is rendered back and must reproduce the
// input day exactly.
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateCalendarDateField(
    body: Record<string, unknown>,
    field: string,
    entityLabel: string,
): string {
    const day = pickString(body, field);
    const parsedMs = Date.parse(day);
    if (
        !CALENDAR_DATE.test(day)
        || Number.isNaN(parsedMs)
        || !new Date(parsedMs).toISOString()
            .startsWith(day)
    ) {
        throw new ValidationError(
            'expected calendar date YYYY-MM-DD for '
            + entityLabel + '.' + field
            + ', got "' + day + '"',
        );
    }
    return day;
}

// A string field that must be one of `allowed`; returns the
// matched option (narrowed to E, no cast). `descriptor` names
// the field in the message ("member type", "credential status")
// so the wording matches the inline checks it replaces.
export function validateEnumField<E extends string>(
    body: Record<string, unknown>,
    field: string,
    allowed: readonly E[],
    descriptor: string,
    entityLabel: string,
): E {
    const value = pickString(body, field);
    for (const option of allowed) {
        if (value === option) return option;
    }
    throw new ValidationError(
        'invalid ' + descriptor + ' "' + value
        + '" on ' + entityLabel,
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
            throw new ValidationError(
                'unexpected key "'
                    + key + '"'
                    + ' for ' + label,
            );
        }
    }
    for (const key of expected) {
        if (!(key in body)) {
            throw new ValidationError(
                'missing required key "'
                    + key + '"'
                    + ' for ' + label,
            );
        }
    }
}

// ── Entity validators ────────────────

const MEMBER_BODY_KEYS: readonly string[] = [
    'type',
];

export function validateMemberEntity(
    body: Record<string, unknown>,
): Omit<MemberEntity, 'id'> {
    assertOnlyKeys(
        body, MEMBER_BODY_KEYS, 'MemberEntity',
    );
    const type = validateEnumField(
        body, 'type', ['human', 'ai', 'system'],
        'member type', 'MemberEntity',
    );
    return {
        type,
    };
}

const IDENTITY_BODY_KEYS: readonly string[] = ['kind'];

export function validateIdentityEntity(
    body: Record<string, unknown>,
): Omit<IdentityEntity, 'id'> {
    assertOnlyKeys(
        body, IDENTITY_BODY_KEYS, 'IdentityEntity',
    );
    const kind = validateEnumField(
        body, 'kind', ['person', 'service'],
        'identity kind', 'IdentityEntity',
    );
    return { kind };
}

const IDENTITY_PII_BODY_KEYS: readonly string[] = [
    'name', 'email', 'phone', 'bio',
];

export function validateIdentityPiiEntity(
    body: Record<string, unknown>,
): Omit<IdentityPiiEntity, 'id'> {
    assertOnlyKeys(
        body, IDENTITY_PII_BODY_KEYS, 'IdentityPiiEntity',
    );
    return {
        name: pickString(body, 'name'),
        email: pickString(body, 'email'),
        phone: pickString(body, 'phone'),
        bio: pickString(body, 'bio'),
    };
}

const IDENTITY_CREDENTIAL_BODY_KEYS:
    readonly string[] = [
    'identity_id', 'kind', 'status',
    'secret', 'at',
];

export function validateIdentityCredentialEntity(
    body: Record<string, unknown>,
): Omit<IdentityCredentialEntity, 'id'> {
    assertOnlyKeys(
        body,
        IDENTITY_CREDENTIAL_BODY_KEYS,
        'IdentityCredentialEntity',
    );
    const kind = validateEnumField(
        body, 'kind', ['password', 'client_secret'],
        'credential kind', 'IdentityCredentialEntity',
    );
    const status = validateEnumField(
        body, 'status', ['set', 'rotated', 'revoked'],
        'credential status', 'IdentityCredentialEntity',
    );
    return {
        identity_id: pickString(
            body, 'identity_id',
        ),
        kind,
        status,
        secret: pickString(body, 'secret'),
        at: validateTimestampField(
            body, 'at', 'IdentityCredentialEntity',
        ),
    };
}

const IDENTITY_TOKEN_REVOCATION_BODY_KEYS:
    readonly string[] = ['identity_id', 'at'];

export function
validateIdentityTokenRevocationEntity(
    body: Record<string, unknown>,
): Omit<IdentityTokenRevocationEntity, 'id'> {
    assertOnlyKeys(
        body,
        IDENTITY_TOKEN_REVOCATION_BODY_KEYS,
        'IdentityTokenRevocationEntity',
    );
    const at = validateTimestampField(
        body, 'at', 'IdentityTokenRevocationEntity',
    );
    return {
        identity_id: pickString(body, 'identity_id'),
        at,
    };
}

const IDENTITY_DEFAULT_ORG_BODY_KEYS:
    readonly string[] = [
    'identity_id', 'organization_id', 'at',
];

export function validateIdentityDefaultOrgEntity(
    body: Record<string, unknown>,
): Omit<IdentityDefaultOrgEntity, 'id'> {
    assertOnlyKeys(
        body,
        IDENTITY_DEFAULT_ORG_BODY_KEYS,
        'IdentityDefaultOrgEntity',
    );
    const at = validateTimestampField(
        body, 'at', 'IdentityDefaultOrgEntity',
    );
    return {
        identity_id: pickString(body, 'identity_id'),
        organization_id: pickString(
            body, 'organization_id',
        ),
        at,
    };
}

const ROLE_GRANT_BODY_KEYS: readonly string[] = [
    'organization_id', 'identity_id', 'role', 'action',
    'by_member_id', 'at',
];

export function validateRoleGrantEntity(
    body: Record<string, unknown>,
): Omit<RoleGrantEntity, 'id'> {
    assertOnlyKeys(
        body, ROLE_GRANT_BODY_KEYS, 'RoleGrantEntity',
    );
    const action = validateEnumField(
        body, 'action', ['granted', 'revoked'],
        'role action', 'RoleGrantEntity',
    );
    const at = validateTimestampField(
        body, 'at', 'RoleGrantEntity',
    );
    return {
        organization_id: pickString(body, 'organization_id'),
        identity_id: pickString(body, 'identity_id'),
        role: pickString(body, 'role'),
        action,
        by_member_id: pickString(body, 'by_member_id'),
        at,
    };
}

const IDENTITY_TOKEN_BODY_KEYS: readonly string[] = [
    'jti', 'identity_id', 'action', 'chain_id',
    'parent_jti', 'at',
];

export function validateIdentityTokenEntity(
    body: Record<string, unknown>,
): Omit<IdentityTokenEntity, 'id'> {
    assertOnlyKeys(
        body, IDENTITY_TOKEN_BODY_KEYS,
        'IdentityTokenEntity',
    );
    const action = validateEnumField(
        body, 'action', ['issued', 'rotated', 'revoked'],
        'token action', 'IdentityTokenEntity',
    );
    const at = validateTimestampField(
        body, 'at', 'IdentityTokenEntity',
    );
    return {
        jti: pickString(body, 'jti'),
        identity_id: pickString(body, 'identity_id'),
        action,
        chain_id: pickString(body, 'chain_id'),
        parent_jti: pickString(body, 'parent_jti'),
        at,
    };
}

const CLIENT_BODY_KEYS: readonly string[] = [
    'grant_types', 'redirect_uris', 'jwks', 'aud', 'status',
];

export function validateClientEntity(
    body: Record<string, unknown>,
): Omit<ClientEntity, 'id'> {
    assertOnlyKeys(body, CLIENT_BODY_KEYS, 'ClientEntity');
    const status = validateEnumField(
        body, 'status', ['active', 'disabled'],
        'client status', 'ClientEntity',
    );
    return {
        grant_types: pickString(body, 'grant_types'),
        redirect_uris: pickString(body, 'redirect_uris'),
        jwks: pickString(body, 'jwks'),
        aud: pickString(body, 'aud'),
        status,
    };
}

const IDENTITY_PROVIDER_BODY_KEYS: readonly string[] = [
    'identity_id', 'provider', 'provider_subject',
    'action', 'at',
];

export function validateIdentityProviderEntity(
    body: Record<string, unknown>,
): Omit<IdentityProviderEntity, 'id'> {
    assertOnlyKeys(
        body, IDENTITY_PROVIDER_BODY_KEYS,
        'IdentityProviderEntity',
    );
    const action = validateEnumField(
        body, 'action', ['linked', 'unlinked'],
        'provider action', 'IdentityProviderEntity',
    );
    const at = validateTimestampField(
        body, 'at', 'IdentityProviderEntity',
    );
    return {
        identity_id: pickString(body, 'identity_id'),
        provider: pickString(body, 'provider'),
        provider_subject:
            pickString(body, 'provider_subject'),
        action,
        at,
    };
}

const AUTHORIZATION_CODE_BODY_KEYS: readonly string[] = [
    'code', 'identity_id', 'client_id', 'status', 'at',
];

export function validateAuthorizationCodeEntity(
    body: Record<string, unknown>,
): Omit<AuthorizationCodeEntity, 'id'> {
    assertOnlyKeys(
        body, AUTHORIZATION_CODE_BODY_KEYS,
        'AuthorizationCodeEntity',
    );
    const status = validateEnumField(
        body, 'status', ['issued', 'consumed'],
        'code status', 'AuthorizationCodeEntity',
    );
    const at = validateTimestampField(
        body, 'at', 'AuthorizationCodeEntity',
    );
    return {
        code: pickString(body, 'code'),
        identity_id: pickString(body, 'identity_id'),
        client_id: pickString(body, 'client_id'),
        status,
        at,
    };
}

const HUMAN_MEMBER_BODY_KEYS:
    readonly string[] = [
    'title', 'department',
    'strengths', 'team_dimensions',
];

export function validateHumanMemberEntity(
    body: Record<string, unknown>,
): Omit<HumanMemberEntity, 'id'> {
    assertOnlyKeys(
        body,
        HUMAN_MEMBER_BODY_KEYS,
        'HumanMemberEntity',
    );
    // Structural gate: the columns store raw JSON strings,
    // but their shapes are enforced at instantiation — the
    // same validators the domain accessors run downstream
    // as their transform.
    const strengths = pickJsonArrayField(
        body, 'strengths',
    );
    validateStringArrayJson(
        strengths, 'HumanMemberEntity.strengths',
    );
    const teamDimensions = pickJsonObjectField(
        body, 'team_dimensions',
    );
    validateStringNumberRecordJson(
        teamDimensions,
        'HumanMemberEntity.team_dimensions',
    );
    return {
        title: pickString(
            body, 'title',
        ),
        department: pickString(
            body, 'department',
        ),
        strengths,
        team_dimensions: teamDimensions,
    };
}

const AI_MEMBER_BODY_KEYS:
    readonly string[] = [
    'name', 'description', 'model', 'skill_focus',
];

// model must be a known catalog id — membership at
// the gate, not mere non-emptiness, so a stale or
// forged id cannot enter storage. skill_focus is
// free text but never null: the column is NOT NULL.
export function validateAIMemberEntity(
    body: Record<string, unknown>,
): Omit<AIMemberEntity, 'id'> {
    assertOnlyKeys(
        body,
        AI_MEMBER_BODY_KEYS,
        'AIMemberEntity',
    );
    const model = pickString(body, 'model');
    if (!isProviderModelId(model)) {
        throw new ValidationError(
            'model must be a known provider'
            + ' model id on AIMemberEntity',
        );
    }
    return {
        name: pickString(body, 'name'),
        description: pickString(
            body, 'description',
        ),
        skill_focus: pickString(
            body, 'skill_focus',
        ),
        model,
    };
}

const IDEA_BODY_KEYS: readonly string[] = [
    'organization_id', 'title', 'position',
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
        organization_id: pickString(body, 'organization_id'),
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
    'organization_id', 'title', 'description',
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
        organization_id: pickString(body, 'organization_id'),
        title: pickString(
            body, 'title',
        ),
        description: pickString(
            body, 'description',
        ),
        progress: pickNumber(
            body, 'progress',
        ),
        start_date: validateCalendarDateField(
            body, 'start_date', 'ProjectEntity',
        ),
        target_end_date: validateCalendarDateField(
            body, 'target_end_date', 'ProjectEntity',
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
    'organization_id', 'name', 'is_locked',
    'is_auto_layout', 'is_auto_fit',
    'lock_timeout', 'graph',
];

export function validateFlowEntity(
    body: Record<string, unknown>,
): Omit<FlowEntity, 'id'> {
    assertOnlyKeys(
        body, FLOW_BODY_KEYS, 'FlowEntity',
    );
    // Structural gate: the column stores the raw JSON string,
    // but its shape (and the node/edge id alphabet) is
    // enforced at instantiation — read adapters re-parse as
    // their transform, never as a guard.
    const graph = pickJsonObjectField(body, 'graph');
    validateStoredGraphJson(graph, 'FlowEntity.graph');
    return {
        organization_id: pickString(body, 'organization_id'),
        name: pickString(
            body, 'name',
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
        graph,
    };
}

const FLOW_VERSION_BODY_KEYS:
    readonly string[] = [
    'flow_id', 'name',
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
    const graph = pickJsonObjectField(body, 'graph');
    validateStoredGraphJson(
        graph, 'FlowVersionEntity.graph',
    );
    return {
        flow_id: pickString(
            body, 'flow_id',
        ),
        name: pickString(
            body, 'name',
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
        graph,
        at: validateTimestampField(
            body, 'at', 'FlowVersionEntity',
        ),
    };
}

const WORK_ORDER_BODY_KEYS:
    readonly string[] = [
    'organization_id', 'display_id', 'flow_graph',
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
    const flowGraph =
        pickJsonObjectField(body, 'flow_graph');
    validateWorkOrderFlowGraphJson(
        flowGraph, 'WorkOrderEntity.flow_graph',
    );
    return {
        organization_id: pickString(body, 'organization_id'),
        display_id: pickString(
            body, 'display_id',
        ),
        flow_graph: flowGraph,
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
        at: validateTimestampField(
            body, 'at', 'FlowWorkOrderEntity',
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
    'name', 'domain', 'next_billing',
    'seats', 'projects_limit', 'ideas_limit',
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
        next_billing: pickString(
            body, 'next_billing',
        ),
        seats: pickNumber(
            body, 'seats',
        ),
        projects_limit: pickNumber(
            body, 'projects_limit',
        ),
        ideas_limit: pickNumber(
            body, 'ideas_limit',
        ),
    };
}

const MEMBERSHIP_BODY_KEYS: readonly string[] = [
    'organization_id', 'identity_id', 'at',
];

export function validateMembershipEntity(
    body: Record<string, unknown>,
): Omit<MembershipEntity, 'id'> {
    assertOnlyKeys(
        body, MEMBERSHIP_BODY_KEYS, 'MembershipEntity',
    );
    const at = validateTimestampField(
        body, 'at', 'MembershipEntity',
    );
    return {
        organization_id: pickString(
            body, 'organization_id',
        ),
        identity_id: pickString(body, 'identity_id'),
        at,
    };
}

const INVITATION_BODY_KEYS: readonly string[] = [
    'organization_id', 'identity_id', 'at',
];

export function validateInvitationEntity(
    body: Record<string, unknown>,
): Omit<InvitationEntity, 'id'> {
    assertOnlyKeys(
        body, INVITATION_BODY_KEYS, 'InvitationEntity',
    );
    const at = validateTimestampField(
        body, 'at', 'InvitationEntity',
    );
    return {
        organization_id: pickString(
            body, 'organization_id',
        ),
        identity_id: pickString(body, 'identity_id'),
        at,
    };
}

const IDEA_SUBMISSION_BODY_KEYS:
    readonly string[] = [
    'idea_id', 'member_id', 'at',
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
        member_id: pickString(
            body, 'member_id',
        ),
        at: validateTimestampField(
            body, 'at', 'IdeaSubmissionEntity',
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
        at: validateTimestampField(
            body, 'at', 'ProjectFlowEntity',
        ),
    };
}

const OBJECTIVE_BODY_KEYS: readonly string[] = [
    'organization_id', 'position',
];

export function validateObjectiveEntity(
    body: Record<string, unknown>,
): Omit<Objective, 'id'> {
    assertOnlyKeys(
        body, OBJECTIVE_BODY_KEYS, 'Objective',
    );
    return {
        organization_id: pickString(body, 'organization_id'),
        position: pickNumber(body, 'position'),
    };
}

const OBJECTIVE_REVISION_BODY_KEYS:
    readonly string[] = [
    'objective_id', 'name',
    'description', 'member_id', 'at',
];

export function validateObjectiveRevisionEntity(
    body: Record<string, unknown>,
): Omit<ObjectiveRevisionEntity, 'id'> {
    assertOnlyKeys(
        body,
        OBJECTIVE_REVISION_BODY_KEYS,
        'ObjectiveRevision',
    );
    const name = pickString(body, 'name');
    if (name === '') {
        throw new ValidationError(
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
        member_id: pickString(
            body, 'member_id',
        ),
        at: validateTimestampField(
            body, 'at', 'ObjectiveRevision',
        ),
    };
}

const BASELINE_SCORE_BODY_KEYS:
    readonly string[] = [
    'project_id', 'objective_id',
    'score', 'member_id', 'at',
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
        member_id: pickString(
            body, 'member_id',
        ),
        at: validateTimestampField(
            body, 'at', 'BaselineScore',
        ),
    };
}

const ACTUAL_SCORE_BODY_KEYS:
    readonly string[] = [
    'project_id', 'objective_id',
    'score', 'member_id', 'at',
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
        member_id: pickString(
            body, 'member_id',
        ),
        at: validateTimestampField(
            body, 'at', 'ActualScore',
        ),
    };
}

const STATE_BODY_KEYS: readonly string[] = [
    'entity_id', 'state', 'member_id', 'at',
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
        member_id: pickString(
            body, 'member_id',
        ),
        at: validateTimestampField(
            body, 'at', 'StateEntity',
        ),
    };
}

const RECORD_BODY_KEYS: readonly string[] = [
    'organization_id', 'name', 'description', 'position',
];

export function validateRecordEntity(
    body: Record<string, unknown>,
): Omit<RecordEntity, 'id'> {
    assertOnlyKeys(
        body, RECORD_BODY_KEYS, 'RecordEntity',
    );
    const name = pickString(body, 'name');
    if (name === '') {
        throw new ValidationError(
            'RecordEntity.name must be'
            + ' non-empty',
        );
    }
    return {
        organization_id: pickString(body, 'organization_id'),
        name,
        description: pickString(
            body, 'description',
        ),
        position: pickNumber(
            body, 'position',
        ),
    };
}

const RECORD_ATTRIBUTE_BODY_KEYS:
    readonly string[] = [
    'organization_id', 'record_id', 'name',
    'attribute_type', 'sort_order',
    'options', 'constraints',
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
        throw new ValidationError(
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
    const optionsField = pickJsonArrayField(
        body, 'options',
    );
    // Options are a string array for EVERY attribute type —
    // the same shape the read adapter derives downstream.
    const parsedOptions = validateStringArrayJson(
        optionsField,
        'RecordAttributeEntity.options',
    );
    if (
        (attributeType === 'select'
            || attributeType === 'radio')
        && parsedOptions.length === 0
    ) {
        throw new ValidationError(
            'RecordAttributeEntity.options'
            + ' must list at least one option'
            + " for attribute_type '"
            + attributeType + "'",
        );
    }
    return {
        organization_id: pickString(body, 'organization_id'),
        record_id: pickString(
            body, 'record_id',
        ),
        name,
        attribute_type: attributeType,
        sort_order: pickNumber(
            body, 'sort_order',
        ),
        options: optionsField,
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
        at: validateTimestampField(
            body, 'at', 'FlowRecordEntity',
        ),
    };
}

export interface RecordMultiPutCreateBody {
    readonly kind: 'create';
    readonly id: RecordId;
    readonly record: Omit<RecordEntity, 'id'>;
    readonly attributes: readonly RecordAttributeEntity[];
    readonly initialState: RecordState;
    readonly initialStateEventId: string;
}

export interface RecordMultiPutEditBody {
    readonly kind: 'edit';
    readonly id: RecordId;
    readonly record: Omit<RecordEntity, 'id'>;
    readonly attributes: readonly RecordAttributeEntity[];
    readonly removedAttributeIds: readonly string[];
}

export type RecordMultiPutBody =
    | RecordMultiPutCreateBody
    | RecordMultiPutEditBody;

const RECORD_MULTI_PUT_CREATE_KEYS:
    readonly string[] = [
    'kind', 'id', 'record',
    'attributes', 'initialState',
    'initialStateEventId',
];

const RECORD_MULTI_PUT_EDIT_KEYS:
    readonly string[] = [
    'kind', 'id', 'record',
    'attributes', 'removedAttributeIds',
];

function validateMultiPutAttribute(
    value: unknown,
    recordId: string,
    label: string,
): RecordAttributeEntity {
    const obj = asObject(value, label);
    const id = asString(obj['id'], label + '.id');
    const { id: _id, ...rest } = obj;
    const validated =
        validateRecordAttributeEntity(rest);
    if (validated.record_id !== recordId) {
        throw new ValidationError(
            label + '.record_id must match'
            + ' top-level id; got '
            + validated.record_id
            + ', expected ' + recordId,
        );
    }
    return { id, ...validated };
}

export function validateRecordMultiPutBody(
    body: Record<string, unknown>,
): RecordMultiPutBody {
    const kind = pickString(body, 'kind');
    if (kind === 'create') {
        assertOnlyKeys(
            body,
            RECORD_MULTI_PUT_CREATE_KEYS,
            'RecordMultiPutCreateBody',
        );
        const id = pickString(body, 'id');
        const record = validateRecordEntity(
            asObject(
                body['record'],
                'RecordMultiPutCreateBody.record',
            ),
        );
        const attrsRaw = asArray(
            body['attributes'],
            'RecordMultiPutCreateBody.attributes',
        );
        const attributes = attrsRaw.map((a, i) =>
            validateMultiPutAttribute(
                a, id,
                'RecordMultiPutCreateBody'
                + '.attributes[' + i + ']',
            ),
        );
        const initialState = assertRecordState(
            pickString(body, 'initialState'),
            'RecordMultiPutCreateBody.initialState',
        );
        const initialStateEventId = pickString(
            body, 'initialStateEventId',
        );
        return {
            kind: 'create',
            id, record, attributes,
            initialState, initialStateEventId,
        };
    }
    if (kind === 'edit') {
        assertOnlyKeys(
            body,
            RECORD_MULTI_PUT_EDIT_KEYS,
            'RecordMultiPutEditBody',
        );
        const id = pickString(body, 'id');
        const record = validateRecordEntity(
            asObject(
                body['record'],
                'RecordMultiPutEditBody.record',
            ),
        );
        const attrsRaw = asArray(
            body['attributes'],
            'RecordMultiPutEditBody.attributes',
        );
        const attributes = attrsRaw.map((a, i) =>
            validateMultiPutAttribute(
                a, id,
                'RecordMultiPutEditBody'
                + '.attributes[' + i + ']',
            ),
        );
        const removedRaw = asArray(
            body['removedAttributeIds'],
            'RecordMultiPutEditBody'
            + '.removedAttributeIds',
        );
        const removedAttributeIds = removedRaw
            .map((r, i) => asString(
                r,
                'RecordMultiPutEditBody'
                + '.removedAttributeIds['
                + i + ']',
            ));
        return {
            kind: 'edit',
            id, record, attributes,
            removedAttributeIds,
        };
    }
    throw new ValidationError(
        "expected RecordMultiPutBody kind"
        + " 'create' or 'edit', got " + kind,
    );
}
