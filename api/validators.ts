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
    IdentityDefaultOrganizationEntity,
    IdentityTokenEntity,
    ClientEntity,
    IdentityProviderEntity,
    RoleGrantEntity,
    MemberEntity,
    HumanMemberEntity,
    AIMemberEntity,
    MemberState,
    IdeaEntity,
    IdeaState,
    ProjectEntity,
    ProjectState,
    FlowEntity,
    FlowState,
    FlowVersionEntity,
    FlowNodeEntity,
    FlowEdgeEntity,
    FlowNodeMemberEntity,
    FlowNodeAttributeEntity,
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
    ObjectiveEntity,
    ObjectiveRevisionEntity,
    ProjectObjectiveBaselineScoreEntity,
    ProjectObjectiveActualScoreEntity,
    RequestEntity,
    ResponseEntity,
    StateEntity,
} from './types.ts';
import {
    assertAttributeType,
    assertConstraintAppliesTo,
    assertFlowState,
    assertIdeaState,
    assertMemberState,
    assertProjectState,
    assertRecordState,
} from './types.ts';
import {
    isProviderModelId,
} from './provider-models.ts';
import { extractErrorMessage } from '../shared/error-helpers.ts';
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

export function asGraphId(
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

// A string field that may be ABSENT from the body — never
// null. Presence is checked before type: a missing key
// yields undefined, so the caller omits the property from
// the validated result (key absence models "none"); a
// PRESENT `null` is the Sin of Null and is rejected outright.
// An empty string is likewise rejected — non-empty per the
// follows/supersedes spec these fields serve.
export function pickOptionalString(
    body: Record<string, unknown>,
    key: string,
    entityLabel: string,
): string | undefined {
    if (!(key in body)) return undefined;
    const value = body[key];
    if (value === null) {
        throw new ValidationError(
            'null is not valid for optional field "'
            + key + '" on ' + entityLabel
            + ' — omit the key to signal absence',
        );
    }
    const str = asString(value, key);
    if (str === '') {
        throw new ValidationError(
            entityLabel + '.' + key + ' must be'
            + ' non-empty when present',
        );
    }
    return str;
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

// `optional` names keys that MAY appear but need not — the
// follows/supersedes shape (absent is the only valid "none",
// so they are never in `expected`). Every existing caller
// omits the 4th argument, so the accepted set collapses to
// `expected` and behavior is unchanged for them.
export function assertOnlyKeys(
    body: Record<string, unknown>,
    expected: readonly string[],
    label: string,
    optional: readonly string[] = [],
): void {
    const allowedSet = new Set([...expected, ...optional]);
    for (const key of Object.keys(body)) {
        if (!allowedSet.has(key)) {
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

const MEMBER_DOCUMENT_BODY_KEYS: readonly string[] = [
    'type',
];

export interface MemberDocumentBody {
    readonly entity: Omit<MemberEntity, 'id'>;
}

// The HTTP-body gate for PUT /members/:id: the ninth family,
// and the FIRST of the roster's shared-log-with-genesis
// 'stateless' bucket (see MEMBERS_WIRING in routes.ts for the
// full rationale-contrast). THE LABEL MANDATE (the Phase 7
// Objective precedent, a NAMED byte-parity-over-convention
// choice): the assertOnlyKeys label is 'MemberEntity', matching
// TODAY'S store validator (validateMemberEntity) byte-for-byte,
// NOT the 'MemberDocumentBody' naming convention every other
// *DocumentBody validator uses — the label appears in the wire
// 400 body ("unexpected key ... for MemberEntity"), and the
// convention's label would change those bytes. `type`'s own
// rule (validateEnumField over the SAME three-member enum) is
// IDENTICAL to validateMemberEntity's, so the missing/stray-key
// 400s stay byte-identical on both paths too. Global plane
// (family-registry.ts: organizationNested:false) — no
// organization_id exists on this entity, so nothing is
// tolerated beyond `type`.
export function validateMemberDocumentBody(
    body: Record<string, unknown>,
): MemberDocumentBody {
    assertOnlyKeys(
        body, MEMBER_DOCUMENT_BODY_KEYS, 'MemberEntity',
    );
    const type = validateEnumField(
        body, 'type', ['human', 'ai', 'system'],
        'member type', 'MemberEntity',
    );
    return {
        entity: {
            type,
        },
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

const IDENTITY_DOCUMENT_BODY_KEYS: readonly string[] = ['kind'];

export interface IdentityDocumentBody {
    readonly entity: Omit<IdentityEntity, 'id'>;
}

// The HTTP-body gate for PUT /identities/:id: the twelfth
// registered family, and the FOURTH member of MEMBERS_WIRING's
// shared-log-with-genesis 'stateless' bucket (see MEMBERS_WIRING
// in routes.ts for the full rationale-contrast) — the shared id
// (member.id === identity.id, always) already receives a genesis
// states event at create and archive/reactivate via PUT
// states/:id, so a document-address trio here would FREEZE that
// lifecycle at genesis forever. THE LABEL MANDATE (the Phase 7
// Objective precedent, a NAMED byte-parity-over-convention
// choice): the assertOnlyKeys label is 'IdentityEntity', matching
// TODAY'S store validator (validateIdentityEntity) byte-for-byte,
// NOT the 'IdentityDocumentBody' naming convention every other
// *DocumentBody validator uses — the label appears in the wire
// 400 body ("unexpected key ... for IdentityEntity"), and the
// convention's label would change those bytes. `kind`'s own rule
// (validateEnumField over the SAME two-member enum) is IDENTICAL
// to validateIdentityEntity's, so the missing/stray-key 400s stay
// byte-identical on both paths too. Global plane (family-
// registry.ts: organizationNested:false) — no organization_id
// exists on this entity, so nothing is tolerated beyond `kind`.
export function validateIdentityDocumentBody(
    body: Record<string, unknown>,
): IdentityDocumentBody {
    assertOnlyKeys(
        body, IDENTITY_DOCUMENT_BODY_KEYS, 'IdentityEntity',
    );
    const kind = validateEnumField(
        body, 'kind', ['person', 'service'],
        'identity kind', 'IdentityEntity',
    );
    return {
        entity: {
            kind,
        },
    };
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

const IDENTITY_DEFAULT_ORGANIZATION_BODY_KEYS:
    readonly string[] = [
    'identity_id', 'organization_id', 'at',
];

export function validateIdentityDefaultOrganizationEntity(
    body: Record<string, unknown>,
): Omit<IdentityDefaultOrganizationEntity, 'id'> {
    assertOnlyKeys(
        body,
        IDENTITY_DEFAULT_ORGANIZATION_BODY_KEYS,
        'IdentityDefaultOrganizationEntity',
    );
    const at = validateTimestampField(
        body, 'at', 'IdentityDefaultOrganizationEntity',
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
    'jti', 'identity_id', 'action', 'chain_id', 'at',
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

const HUMAN_MEMBER_DOCUMENT_BODY_KEYS:
    readonly string[] = [
    'title', 'department',
    'strengths', 'team_dimensions',
];

export interface HumanMemberDocumentBody {
    readonly entity: Omit<HumanMemberEntity, 'id'>;
}

// The HTTP-body gate for PUT /human-members/:id: the eleventh
// family, and the THIRD (last) member of MEMBERS_WIRING's
// shared-log-with-genesis 'stateless' bucket (see MEMBERS_WIRING
// in routes.ts for the full rationale-contrast) — but UNLIKE
// members/ai-members, no live PUT route exists to serve this
// validator today (human-members/:id carries only {get, post});
// it exists for a future synthesis/seed caller only, mirroring
// validateAiMemberDocumentBody's shape exactly. THE LABEL
// MANDATE: the assertOnlyKeys label is 'HumanMemberEntity',
// matching TODAY'S store validator (validateHumanMemberEntity)
// byte-for-byte, NOT the 'HumanMemberDocumentBody' naming
// convention every other *DocumentBody validator uses. The
// strengths/team_dimensions structural gates (validateStringArrayJson/
// validateStringNumberRecordJson) are the SAME calls
// validateHumanMemberEntity makes, so every 400 this validator
// can raise stays byte-identical to its store counterpart. Global
// plane (family-registry.ts: organizationNested:false) — no
// organization_id exists on this entity, so nothing is tolerated
// beyond the four fields above.
export function validateHumanMemberDocumentBody(
    body: Record<string, unknown>,
): HumanMemberDocumentBody {
    assertOnlyKeys(
        body,
        HUMAN_MEMBER_DOCUMENT_BODY_KEYS,
        'HumanMemberEntity',
    );
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
        entity: {
            title: pickString(
                body, 'title',
            ),
            department: pickString(
                body, 'department',
            ),
            strengths,
            team_dimensions: teamDimensions,
        },
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

const AI_MEMBER_DOCUMENT_BODY_KEYS:
    readonly string[] = [
    'name', 'description', 'model', 'skill_focus',
];

export interface AiMemberDocumentBody {
    readonly entity: Omit<AIMemberEntity, 'id'>;
}

// The HTTP-body gate for PUT /ai-members/:id: the tenth family,
// joining MEMBERS_WIRING's shared-log-with-genesis 'stateless'
// bucket (see MEMBERS_WIRING in routes.ts for the full
// rationale-contrast; the fifth bucket's SECOND member — no new
// rationale, no new bucket). THE LABEL MANDATE: the
// assertOnlyKeys label is 'AIMemberEntity', matching TODAY'S
// store validator (validateAIMemberEntity) byte-for-byte, NOT
// the 'AiMemberDocumentBody' naming convention every other
// *DocumentBody validator uses. `model`'s own rule
// (isProviderModelId, the SAME catalog-membership gate) is
// IDENTICAL to validateAIMemberEntity's, so the missing/stray-
// key 400s AND the model-rejection 400 stay byte-identical on
// both paths. Global plane (family-registry.ts:
// organizationNested:false) — no organization_id exists on this
// entity, so nothing is tolerated beyond the four fields above.
export function validateAiMemberDocumentBody(
    body: Record<string, unknown>,
): AiMemberDocumentBody {
    assertOnlyKeys(
        body,
        AI_MEMBER_DOCUMENT_BODY_KEYS,
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
        entity: {
            name: pickString(body, 'name'),
            description: pickString(
                body, 'description',
            ),
            skill_focus: pickString(
                body, 'skill_focus',
            ),
            model,
        },
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

const IDEA_DOCUMENT_ENTITY_KEYS: readonly string[] = [
    'title', 'position', 'problem_statement',
    'target_users', 'proposed_solution',
    'expected_outcome', 'success_metrics',
];

const IDEA_DOCUMENT_BODY_KEYS: readonly string[] = [
    ...IDEA_DOCUMENT_ENTITY_KEYS,
    'state', 'state_at', 'state_event_id',
];

export interface IdeaDocumentBody {
    readonly entity: Omit<IdeaEntity, 'id' | 'organization_id'>;
    readonly state: IdeaState;
    readonly state_at: string;
    readonly state_event_id: string;
}

// The HTTP-body gate for PUT /ideas/:id (Decision 7): the full
// wire document — the entity's own fields plus the lifecycle
// trio folded in. organization_id is deliberately absent from
// the expected set (like every other org-owned write, the
// client never supplies it; the org fence stamps it downstream
// when view.ideas.put re-validates through validateIdeaEntity)
// yet rides the `optional` allowance rather than `expected` —
// a caller-forged organization_id is tolerated-but-ignored, not
// rejected, because the fence's stamp always overrides whatever
// key it finds (the forged-body isolation test relies on this).
// The trio holds to the SAME rules the bare states/:id route
// applies to an event (assertIdeaState, an RFC-3339 `at`, a
// non-empty event id), so a folded document and a bare event
// share one shape. Entity fields are picked directly rather
// than delegated to validateIdeaEntity — that function REQUIRES
// organization_id, which this body never carries pre-stamp.
export function validateIdeaDocumentBody(
    body: Record<string, unknown>,
): IdeaDocumentBody {
    assertOnlyKeys(
        body, IDEA_DOCUMENT_BODY_KEYS, 'IdeaDocumentBody',
        ['organization_id'],
    );
    const state = assertIdeaState(
        pickString(body, 'state'),
        'IdeaDocumentBody.state',
    );
    const stateEventId = pickString(body, 'state_event_id');
    if (stateEventId === '') {
        throw new ValidationError(
            'IdeaDocumentBody.state_event_id must be'
            + ' non-empty',
        );
    }
    return {
        entity: {
            title: pickString(body, 'title'),
            position: pickNumber(body, 'position'),
            problem_statement:
                pickString(body, 'problem_statement'),
            target_users: pickString(body, 'target_users'),
            proposed_solution:
                pickString(body, 'proposed_solution'),
            expected_outcome:
                pickString(body, 'expected_outcome'),
            success_metrics:
                pickString(body, 'success_metrics'),
        },
        state,
        state_at: validateTimestampField(
            body, 'state_at', 'IdeaDocumentBody.state_at',
        ),
        state_event_id: stateEventId,
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

const PROJECT_DOCUMENT_ENTITY_KEYS: readonly string[] = [
    'title', 'description', 'progress', 'start_date',
    'target_end_date', 'estimated_cost', 'actual_cost',
    'position',
];

const PROJECT_DOCUMENT_BODY_KEYS: readonly string[] = [
    ...PROJECT_DOCUMENT_ENTITY_KEYS,
    'state', 'state_at', 'state_event_id',
];

export interface ProjectDocumentBody {
    readonly entity:
        Omit<ProjectEntity, 'id' | 'organization_id'>;
    readonly state: ProjectState;
    readonly state_at: string;
    readonly state_event_id: string;
}

// The HTTP-body gate for PUT /projects/:id (Decision 7): the
// full wire document — the entity's own fields plus the
// lifecycle trio folded in. organization_id is deliberately
// absent from the expected set (like every other org-owned
// write, the client never supplies it; the org fence stamps it
// downstream when view.projects.put re-validates through
// validateProjectEntity) yet rides the `optional` allowance
// rather than `expected` — a caller-forged organization_id is
// tolerated-but-ignored, not rejected, because the fence's
// stamp always overrides whatever key it finds. The trio holds
// to the SAME rules the bare states/:id route applies to an
// event (assertProjectState, an RFC-3339 `at`, a non-empty
// event id), so a folded document and a bare event share one
// shape. Entity fields are picked directly rather than
// delegated to validateProjectEntity — that function REQUIRES
// organization_id, which this body never carries pre-stamp.
export function validateProjectDocumentBody(
    body: Record<string, unknown>,
): ProjectDocumentBody {
    assertOnlyKeys(
        body, PROJECT_DOCUMENT_BODY_KEYS,
        'ProjectDocumentBody', ['organization_id'],
    );
    const state = assertProjectState(
        pickString(body, 'state'),
        'ProjectDocumentBody.state',
    );
    const stateEventId = pickString(body, 'state_event_id');
    if (stateEventId === '') {
        throw new ValidationError(
            'ProjectDocumentBody.state_event_id must be'
            + ' non-empty',
        );
    }
    return {
        entity: {
            title: pickString(body, 'title'),
            description: pickString(body, 'description'),
            progress: pickNumber(body, 'progress'),
            start_date: validateCalendarDateField(
                body, 'start_date', 'ProjectDocumentBody',
            ),
            target_end_date: validateCalendarDateField(
                body, 'target_end_date',
                'ProjectDocumentBody',
            ),
            estimated_cost:
                pickNumber(body, 'estimated_cost'),
            actual_cost: pickNumber(body, 'actual_cost'),
            position: pickNumber(body, 'position'),
        },
        state,
        state_at: validateTimestampField(
            body, 'state_at', 'ProjectDocumentBody.state_at',
        ),
        state_event_id: stateEventId,
    };
}

// The graph is NOT a flow column — it lives in the four
// relation tables. The storage row carries only the flow's own
// scalar fields; the relation rows are validated by their own
// entity validators (validateFlowNodeEntity et al.) as the
// graph delta lands.
const FLOW_BODY_KEYS: readonly string[] = [
    'organization_id', 'name', 'is_locked',
    'is_auto_layout', 'is_auto_fit',
    'lock_timeout',
];

export function validateFlowEntity(
    body: Record<string, unknown>,
): Omit<FlowEntity, 'id'> {
    assertOnlyKeys(
        body, FLOW_BODY_KEYS, 'FlowEntity',
    );
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
    };
}

const FLOW_DOCUMENT_ENTITY_KEYS: readonly string[] = [
    'name', 'is_locked', 'is_auto_layout',
    'is_auto_fit', 'lock_timeout',
];

const FLOW_DOCUMENT_BODY_KEYS: readonly string[] = [
    ...FLOW_DOCUMENT_ENTITY_KEYS,
    'state', 'state_at', 'state_event_id',
    'graph', 'graphDelta', 'revivals',
];

export interface FlowDocumentBody {
    readonly entity:
        Omit<FlowEntity, 'id' | 'organization_id'>;
    readonly state: FlowState;
    readonly state_at: string;
    readonly state_event_id: string;
    // The FULL reduced graph in EXACTLY the wire form GET
    // /flows/:id emits today (JsonObjectField is a branded
    // JSON-ENCODED STRING — the same covenant
    // flow_versions.graph already carries); validated via
    // validateStoredGraphJson but stored as the SAME encoded
    // string — the op never re-serializes it.
    readonly graph: JsonObjectField;
    // TRANSITIONAL decomposition sidecars — consumed by the
    // old-plane relation writer (writeFlowGraphDelta) AND by
    // deriveFlowGraphStates (api/derive-states.ts), the sole
    // ledger source of flow-node/edge deleted/restored history.
    // Retiring at Phase Final is now GATED on that lifecycle
    // source being re-anchored elsewhere first — dropping these
    // sidecars before then would silently stop recording every
    // future node/edge delete/restore.
    readonly graphDelta: FlowGraphDelta;
    readonly revivals: readonly GraphRevival[];
}

// The HTTP-body gate for PUT /flows/:id (Decision 7, the
// LOCKED class — Task 3): the full wire document — the
// entity's own fields, the lifecycle trio, the client-
// authored post-save graph snapshot, and the two transitional
// decomposition sidecars. organization_id is deliberately
// absent from the expected set (like every other org-owned
// write) yet rides the `optional` allowance rather than
// `expected` — a caller-forged organization_id is tolerated-
// but-ignored (the fence's stamp always overrides whatever key
// it finds), and the below-facade seed path (no scoping
// wrapper) embeds it in the raw body so this op can read it
// straight back. The trio holds to the SAME rules the bare
// states/:id route applies to an event (assertFlowState, an
// RFC-3339 `at`, a non-empty event id). Entity fields are
// picked directly rather than delegated to validateFlowEntity
// — that function REQUIRES organization_id, which this body
// never carries pre-stamp. `graphDelta`/`revivals` reuse the
// undo/redo bodies' own validators (validateFlowGraphDelta,
// validateRevivals below) — same wire shape, same gate.
export function validateFlowDocumentBody(
    body: Record<string, unknown>,
): FlowDocumentBody {
    assertOnlyKeys(
        body, FLOW_DOCUMENT_BODY_KEYS, 'FlowDocumentBody',
        ['organization_id'],
    );
    const state = assertFlowState(
        pickString(body, 'state'),
        'FlowDocumentBody.state',
    );
    const stateEventId = pickString(body, 'state_event_id');
    if (stateEventId === '') {
        throw new ValidationError(
            'FlowDocumentBody.state_event_id must be'
            + ' non-empty',
        );
    }
    const graph = pickJsonObjectField(body, 'graph');
    validateStoredGraphJson(graph, 'FlowDocumentBody.graph');
    const graphDelta = validateFlowGraphDelta(
        asObject(
            body['graphDelta'], 'FlowDocumentBody.graphDelta',
        ),
    );
    const revivals = validateRevivals(
        body['revivals'], 'FlowDocumentBody.revivals',
    );
    return {
        entity: {
            name: pickString(body, 'name'),
            is_locked: pickBoolean(body, 'is_locked'),
            is_auto_layout:
                pickBoolean(body, 'is_auto_layout'),
            is_auto_fit: pickBoolean(body, 'is_auto_fit'),
            lock_timeout: pickNumber(body, 'lock_timeout'),
        },
        state,
        state_at: validateTimestampField(
            body, 'state_at', 'FlowDocumentBody.state_at',
        ),
        state_event_id: stateEventId,
        graph,
        graphDelta,
        revivals,
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

const FLOW_NODE_BODY_KEYS: readonly string[] = [
    'flow_id', 'name', 'position_x', 'position_y',
    'is_create', 'is_archive', 'task_instructions', 'at',
];

export function validateFlowNodeEntity(
    body: Record<string, unknown>,
): Omit<FlowNodeEntity, 'id'> {
    assertOnlyKeys(
        body, FLOW_NODE_BODY_KEYS, 'FlowNodeEntity',
    );
    return {
        flow_id: pickString(body, 'flow_id'),
        name: pickString(body, 'name'),
        position_x: pickNumber(body, 'position_x'),
        position_y: pickNumber(body, 'position_y'),
        is_create: pickBoolean(body, 'is_create'),
        is_archive: pickBoolean(body, 'is_archive'),
        task_instructions: pickString(
            body, 'task_instructions',
        ),
        at: validateTimestampField(
            body, 'at', 'FlowNodeEntity',
        ),
    };
}

const FLOW_EDGE_BODY_KEYS: readonly string[] = [
    'flow_id', 'name', 'from_node_id', 'to_node_id', 'at',
];

// from_node_id / to_node_id are canvas node ids that flow into
// DOM/SVG markup at render, so the gate pins them to the graph
// id alphabet — the same stored-XSS fence asGraphEdge applied
// when the edge lived inside the graph blob.
export function validateFlowEdgeEntity(
    body: Record<string, unknown>,
): Omit<FlowEdgeEntity, 'id'> {
    assertOnlyKeys(
        body, FLOW_EDGE_BODY_KEYS, 'FlowEdgeEntity',
    );
    return {
        flow_id: pickString(body, 'flow_id'),
        name: pickString(body, 'name'),
        from_node_id: asGraphId(
            body['from_node_id'],
            'FlowEdgeEntity.from_node_id',
        ),
        to_node_id: asGraphId(
            body['to_node_id'],
            'FlowEdgeEntity.to_node_id',
        ),
        at: validateTimestampField(
            body, 'at', 'FlowEdgeEntity',
        ),
    };
}

const FLOW_NODE_MEMBER_BODY_KEYS: readonly string[] = [
    'flow_node_id', 'member_id', 'action', 'at',
];

export function validateFlowNodeMemberEntity(
    body: Record<string, unknown>,
): Omit<FlowNodeMemberEntity, 'id'> {
    assertOnlyKeys(
        body, FLOW_NODE_MEMBER_BODY_KEYS,
        'FlowNodeMemberEntity',
    );
    const action = validateEnumField(
        body, 'action', ['added', 'removed'],
        'relation action', 'FlowNodeMemberEntity',
    );
    return {
        flow_node_id: asGraphId(
            body['flow_node_id'],
            'FlowNodeMemberEntity.flow_node_id',
        ),
        member_id: pickString(body, 'member_id'),
        action,
        at: validateTimestampField(
            body, 'at', 'FlowNodeMemberEntity',
        ),
    };
}

const FLOW_NODE_ATTRIBUTE_BODY_KEYS: readonly string[] = [
    'flow_node_id', 'attribute_id', 'mode',
    'is_required', 'action', 'at',
];

export function validateFlowNodeAttributeEntity(
    body: Record<string, unknown>,
): Omit<FlowNodeAttributeEntity, 'id'> {
    assertOnlyKeys(
        body, FLOW_NODE_ATTRIBUTE_BODY_KEYS,
        'FlowNodeAttributeEntity',
    );
    const mode = validateEnumField(
        body, 'mode', ['editable', 'readonly'],
        'attribute mode', 'FlowNodeAttributeEntity',
    );
    const action = validateEnumField(
        body, 'action', ['added', 'removed'],
        'relation action', 'FlowNodeAttributeEntity',
    );
    return {
        flow_node_id: asGraphId(
            body['flow_node_id'],
            'FlowNodeAttributeEntity.flow_node_id',
        ),
        attribute_id: pickString(body, 'attribute_id'),
        mode,
        is_required: pickBoolean(body, 'is_required'),
        action,
        at: validateTimestampField(
            body, 'at', 'FlowNodeAttributeEntity',
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

const WORK_ORDER_DOCUMENT_BODY_KEYS: readonly string[] = [
    'display_id', 'flow_graph', 'position',
];

export interface WorkOrderDocumentBody {
    readonly entity:
        Omit<WorkOrderEntity, 'id' | 'organization_id'>;
}

// The HTTP-body gate for PUT /work-orders/:id: UNLIKE every
// other document family, this body carries NO lifecycle trio
// (the fourth-family, 'stateless' evidence) — a work order's
// lifecycle is written only by the create/claim/transition ops
// and the states/:id unclaim path, never by a document PUT, so
// state/state_at/state_event_id are absent from BOTH the
// expected and optional sets: a body carrying any of them 400s
// here (the stateless covenant is validator-enforced, not
// caller discipline). organization_id is deliberately absent
// from the expected set (like every other org-owned write, the
// client never supplies it; the org fence stamps it downstream
// when view.workOrders.put re-validates through
// validateWorkOrderEntity) yet rides the `optional` allowance
// rather than `expected` — a caller-forged organization_id is
// tolerated-but-ignored, not rejected, because the fence's
// stamp always overrides whatever key it finds. Entity fields
// are picked directly rather than delegated to
// validateWorkOrderEntity — that function REQUIRES
// organization_id, which this body never carries pre-stamp.
export function validateWorkOrderDocumentBody(
    body: Record<string, unknown>,
): WorkOrderDocumentBody {
    assertOnlyKeys(
        body, WORK_ORDER_DOCUMENT_BODY_KEYS,
        'WorkOrderDocumentBody', ['organization_id'],
    );
    const flowGraph = pickJsonObjectField(body, 'flow_graph');
    validateWorkOrderFlowGraphJson(
        flowGraph, 'WorkOrderDocumentBody.flow_graph',
    );
    return {
        entity: {
            display_id: pickString(body, 'display_id'),
            flow_graph: flowGraph,
            position: pickNumber(body, 'position'),
        },
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
    'state_event_id', 'attribute_id', 'value',
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
        attribute_id: pickString(
            body, 'attribute_id',
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

const MEMBERSHIP_DOCUMENT_BODY_KEYS: readonly string[] = [
    'organization_id', 'identity_id', 'at',
];

export interface MembershipDocumentBody {
    readonly entity: Omit<MembershipEntity, 'id'>;
}

// The HTTP-body gate for PUT /memberships/:id: the eighth
// family, and the FOURTH 'stateless' one — but unlike work-
// orders/record-attributes/objectives, no lifecycle concept
// exists for a membership row AT ALL: it is a pure join
// relation, joining record-attributes' vacuous-BY-CONSTRUCTION
// bucket as its actual sibling (see RECORD_ATTRIBUTES_WIRING's
// own comment in routes.ts). THE LABEL MANDATE (a NAMED byte-
// parity-over-convention choice, the Phase 7 Objective
// precedent): the assertOnlyKeys label is 'MembershipEntity',
// matching TODAY'S store validator (validateMembershipEntity)
// byte-for-byte, NOT the 'MembershipDocumentBody' naming
// convention every other *DocumentBody validator uses — the
// label appears in the wire 400 body ("unexpected key ... for
// MembershipEntity"), and the convention's label would change
// those bytes. UNLIKE objectives' tolerated-but-ignored
// organization_id, every key here is REQUIRED: memberships'
// live wire PUT body carries its OWN organization_id today (the
// org-scoped store stamps over it at write time regardless —
// the objectives fence-stamp analogue — but this gate mirrors
// today's acceptance either way). position/state rules do not
// apply; the fields are the SAME three pickString/timestamp
// calls validateMembershipEntity already makes, so the missing-
// key 400 stays byte-identical on both paths too.
export function validateMembershipDocumentBody(
    body: Record<string, unknown>,
): MembershipDocumentBody {
    assertOnlyKeys(
        body, MEMBERSHIP_DOCUMENT_BODY_KEYS, 'MembershipEntity',
    );
    const at = validateTimestampField(
        body, 'at', 'MembershipEntity',
    );
    return {
        entity: {
            organization_id: pickString(
                body, 'organization_id',
            ),
            identity_id: pickString(body, 'identity_id'),
            at,
        },
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
): Omit<ObjectiveEntity, 'id'> {
    assertOnlyKeys(
        body, OBJECTIVE_BODY_KEYS, 'Objective',
    );
    return {
        organization_id: pickString(body, 'organization_id'),
        position: pickNumber(body, 'position'),
    };
}

const OBJECTIVE_DOCUMENT_BODY_KEYS: readonly string[] = [
    'position',
];

export interface ObjectiveDocumentBody {
    readonly entity:
        Omit<ObjectiveEntity, 'id' | 'organization_id'>;
}

// The HTTP-body gate for PUT /objectives/:id: the seventh
// family, and the THIRD 'stateless' one (work-orders and
// record-attributes are the first two) — Author gate 3's
// SECOND named partial amendment to Decision 7. The trio
// COULD represent the objective alphabet, but is FORBIDDEN
// three ways: the wire body would have to grow it (the
// unavoidable zero-delta violation); a minted genesis event
// would abort the states 911 pin at reseed (the genesis
// dilemma); and absence-as-active is R2's named covenant. So
// this validator admits the entity field alone, exactly as
// the other two 'stateless' document bodies do — no trio, no
// exceptions. THE LABEL MANDATE (a NAMED byte-parity-over-
// convention choice): the assertOnlyKeys label is 'Objective',
// matching TODAY'S store validator (validateObjectiveEntity)
// byte-for-byte, NOT the 'ObjectiveDocumentBody' naming
// convention every other *DocumentBody validator uses — the
// label appears in the wire 400 body ("unexpected key ... for
// Objective"), and the convention's label would change those
// bytes. organization_id is a TOLERATED-BUT-IGNORED optional
// allowance, never expected: the live client's PUT body is
// `{position}` alone, but the seed's below-facade create
// bodies carry organization_id too (documentOperationOrganization's
// read-back shape in routes.ts, mirrored by every sibling
// *DocumentBody validator), and the org-scoped store always
// stamps organization_id downstream regardless of what it
// finds — so a caller-forged value is tolerated, never
// rejected. position's own rule (pickNumber) is IDENTICAL to
// validateObjectiveEntity's — the missing-position 400 is the
// SAME assertOnlyKeys call with the SAME label, so its message
// stays byte-identical on both paths.
export function validateObjectiveDocumentBody(
    body: Record<string, unknown>,
): ObjectiveDocumentBody {
    assertOnlyKeys(
        body, OBJECTIVE_DOCUMENT_BODY_KEYS, 'Objective',
        ['organization_id'],
    );
    return {
        entity: {
            position: pickNumber(body, 'position'),
        },
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
): Omit<ProjectObjectiveBaselineScoreEntity, 'id'> {
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
): Omit<ProjectObjectiveActualScoreEntity, 'id'> {
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

// The two message-plane ledgers (Phase 0 of the
// message-as-state migration): one row per stored HTTP
// request/response. `message_hash` is the sha256 digest
// (`shared/digest.ts` sha256Hex) of `message`, hex-encoded
// lowercase.
const MESSAGE_HASH = /^[0-9a-f]{64}$/;

const REQUEST_BODY_KEYS: readonly string[] = [
    'uri_prefix', 'uri_id', 'at', 'requester_identity_id',
    'message_hash', 'message',
];

export function validateRequestEntity(
    body: Record<string, unknown>,
): Omit<RequestEntity, 'id'> {
    assertOnlyKeys(
        body, REQUEST_BODY_KEYS, 'RequestEntity',
    );
    const uriPrefix = pickString(body, 'uri_prefix');
    if (!uriPrefix.endsWith('/')) {
        throw new ValidationError(
            'RequestEntity.uri_prefix must end with "/"',
        );
    }
    const messageHash = pickString(body, 'message_hash');
    if (!MESSAGE_HASH.test(messageHash)) {
        throw new ValidationError(
            'RequestEntity.message_hash must be a 64-'
            + 'character lowercase hex sha256 digest',
        );
    }
    const at = validateTimestampField(
        body, 'at', 'RequestEntity',
    );
    return {
        uri_prefix: uriPrefix,
        uri_id: pickString(body, 'uri_id'),
        at,
        requester_identity_id: pickString(
            body, 'requester_identity_id',
        ),
        message_hash: messageHash,
        message: pickString(body, 'message'),
    };
}

const RESPONSE_BODY_KEYS: readonly string[] = [
    'uri_prefix', 'uri_id', 'at', 'status', 'etag',
    'message_hash', 'message',
];

// follows/supersedes are the only optional keys in the
// codebase: present only when the write had a predecessor.
// assertOnlyKeys's 4th argument admits them without requiring
// them — absence is the sole valid "none" (Sin of Null).
const RESPONSE_OPTIONAL_BODY_KEYS: readonly string[] = [
    'follows', 'supersedes',
];

export function validateResponseEntity(
    body: Record<string, unknown>,
): Omit<ResponseEntity, 'id'> {
    assertOnlyKeys(
        body, RESPONSE_BODY_KEYS, 'ResponseEntity',
        RESPONSE_OPTIONAL_BODY_KEYS,
    );
    const uriPrefix = pickString(body, 'uri_prefix');
    if (!uriPrefix.endsWith('/')) {
        throw new ValidationError(
            'ResponseEntity.uri_prefix must end with "/"',
        );
    }
    const status = pickNumber(body, 'status');
    if (
        !Number.isInteger(status)
        || status < 100 || status > 599
    ) {
        throw new ValidationError(
            'ResponseEntity.status must be an integer in'
            + ' 100..599',
        );
    }
    const messageHash = pickString(body, 'message_hash');
    if (!MESSAGE_HASH.test(messageHash)) {
        throw new ValidationError(
            'ResponseEntity.message_hash must be a 64-'
            + 'character lowercase hex sha256 digest',
        );
    }
    const at = validateTimestampField(
        body, 'at', 'ResponseEntity',
    );
    const follows = pickOptionalString(
        body, 'follows', 'ResponseEntity',
    );
    const supersedes = pickOptionalString(
        body, 'supersedes', 'ResponseEntity',
    );
    return {
        uri_prefix: uriPrefix,
        uri_id: pickString(body, 'uri_id'),
        at,
        status,
        etag: pickString(body, 'etag'),
        message_hash: messageHash,
        message: pickString(body, 'message'),
        ...(follows !== undefined ? { follows } : {}),
        ...(supersedes !== undefined
            ? { supersedes } : {}),
    };
}

// The storage-edge gate: the FULL event row, member_id
// included. The store re-validates every write through this,
// so a direct put cannot smuggle a malformed event past it.
const STATE_ENTITY_KEYS: readonly string[] = [
    'entity_id', 'state', 'member_id', 'at',
];

export function validateStateEntity(
    body: Record<string, unknown>,
): Omit<StateEntity, 'id'> {
    assertOnlyKeys(
        body, STATE_ENTITY_KEYS, 'StateEntity',
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

// The HTTP-body gate for PUT /states/:id: NO member_id —
// authorship is stamped from the verified token, never the
// body. A body that names a member is malformed and 400s.
const STATE_BODY_KEYS: readonly string[] = [
    'entity_id', 'state', 'at',
];

export function validateStateBody(
    body: Record<string, unknown>,
): Omit<StateEntity, 'id' | 'member_id'> {
    assertOnlyKeys(
        body, STATE_BODY_KEYS, 'StateEvent',
    );
    return {
        entity_id: pickString(
            body, 'entity_id',
        ),
        state: pickString(body, 'state'),
        at: validateTimestampField(
            body, 'at', 'StateEvent',
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

const RECORD_DOCUMENT_ENTITY_KEYS: readonly string[] = [
    'name', 'description', 'position',
];

const RECORD_DOCUMENT_BODY_KEYS: readonly string[] = [
    ...RECORD_DOCUMENT_ENTITY_KEYS,
    'state', 'state_at', 'state_event_id',
];

export interface RecordDocumentBody {
    readonly entity:
        Omit<RecordEntity, 'id' | 'organization_id'>;
    readonly state: RecordState;
    readonly state_at: string;
    readonly state_event_id: string;
}

// The HTTP-body gate for PUT /records/:id (Decision 7): the
// full wire document — the entity's own fields plus the
// lifecycle trio folded in. organization_id is deliberately
// absent from the expected set (like every other org-owned
// write, the client never supplies it; the org fence stamps it
// downstream when view.records.put re-validates through
// validateRecordEntity) yet rides the `optional` allowance
// rather than `expected` — a caller-forged organization_id is
// tolerated-but-ignored, not rejected, because the fence's
// stamp always overrides whatever key it finds. The trio holds
// to the SAME rules the bare states/:id route applies to an
// event (assertRecordState, an RFC-3339 `at`, a non-empty
// event id), so a folded document and a bare event share one
// shape. Entity fields are picked directly rather than
// delegated to validateRecordEntity — that function REQUIRES
// organization_id, which this body never carries pre-stamp
// (name's own non-empty invariant still lands downstream, at
// view.records.put's own re-validation — this gate gates the
// WIRE SHAPE, not the entity's own rules).
export function validateRecordDocumentBody(
    body: Record<string, unknown>,
): RecordDocumentBody {
    assertOnlyKeys(
        body, RECORD_DOCUMENT_BODY_KEYS,
        'RecordDocumentBody', ['organization_id'],
    );
    const state = assertRecordState(
        pickString(body, 'state'),
        'RecordDocumentBody.state',
    );
    const stateEventId = pickString(body, 'state_event_id');
    if (stateEventId === '') {
        throw new ValidationError(
            'RecordDocumentBody.state_event_id must be'
            + ' non-empty',
        );
    }
    return {
        entity: {
            name: pickString(body, 'name'),
            description: pickString(body, 'description'),
            position: pickNumber(body, 'position'),
        },
        state,
        state_at: validateTimestampField(
            body, 'state_at', 'RecordDocumentBody.state_at',
        ),
        state_event_id: stateEventId,
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

const RECORD_ATTRIBUTE_DOCUMENT_BODY_KEYS:
    readonly string[] = [
    'record_id', 'name', 'attribute_type',
    'sort_order', 'options', 'constraints',
];

export interface RecordAttributeDocumentBody {
    readonly entity:
        Omit<RecordAttributeEntity, 'id' | 'organization_id'>;
}

// The HTTP-body gate for PUT /record-attributes/:id: the
// sixth family, and the SECOND 'stateless' one (work-orders is
// the first) — no lifecycle trio is admitted, so a document PUT
// here is a pure entity edit. organization_id is deliberately
// absent from the expected set (like every other org-owned
// write, the client never supplies it; the org fence stamps it
// downstream when view.recordAttributes.put re-validates
// through validateRecordAttributeEntity) yet rides the
// `optional` allowance rather than `expected` — a caller-forged
// organization_id is tolerated-but-ignored, not rejected,
// because the fence's stamp always overrides whatever key it
// finds. REASON this validator exists rather than wiring
// validateRecordAttributeEntity straight into
// documentWriteResponseSpec: that generic builder calls
// validateDocument WITHOUT pre-stamping organization_id (the
// stamp lands only in the RESPONSE, after validation), while
// today's hand-written response spec pre-stamps the key BEFORE
// calling validateRecordAttributeEntity — wiring the shipped
// entity validator in directly would 500 any body lacking the
// key, where today it 200s. Every existing fixture happens to
// carry the key, so ./validate alone would not catch that
// regression — this validator closes it by construction. Entity
// fields are picked directly (the same constraints/options
// rules validateRecordAttributeEntity enforces) rather than
// delegated to it — that function REQUIRES organization_id,
// which this body never carries pre-stamp.
export function validateRecordAttributeDocumentBody(
    body: Record<string, unknown>,
): RecordAttributeDocumentBody {
    assertOnlyKeys(
        body, RECORD_ATTRIBUTE_DOCUMENT_BODY_KEYS,
        'RecordAttributeDocumentBody', ['organization_id'],
    );
    const name = pickString(body, 'name');
    if (name === '') {
        throw new ValidationError(
            'RecordAttributeDocumentBody.name'
            + ' must be non-empty',
        );
    }
    const attributeType = asAttributeType(
        body['attribute_type'],
        'RecordAttributeDocumentBody.attribute_type',
    );
    const constraintsField =
        pickJsonArrayField(body, 'constraints');
    const parsedConstraints = parseOrThrow(
        constraintsField,
        'RecordAttributeDocumentBody.constraints',
    );
    const constraintsArr = asArray(
        parsedConstraints,
        'RecordAttributeDocumentBody.constraints',
    );
    for (let i = 0; i < constraintsArr.length; i++) {
        const constraint = asConstraint(
            constraintsArr[i],
            'RecordAttributeDocumentBody.constraints['
            + i + ']',
        );
        assertConstraintAppliesTo(
            constraint.kind,
            attributeType,
            'RecordAttributeDocumentBody.constraints['
            + i + ']',
        );
    }
    const optionsField = pickJsonArrayField(
        body, 'options',
    );
    const parsedOptions = validateStringArrayJson(
        optionsField,
        'RecordAttributeDocumentBody.options',
    );
    if (
        (attributeType === 'select'
            || attributeType === 'radio')
        && parsedOptions.length === 0
    ) {
        throw new ValidationError(
            'RecordAttributeDocumentBody.options'
            + ' must list at least one option'
            + " for attribute_type '"
            + attributeType + "'",
        );
    }
    return {
        entity: {
            record_id: pickString(body, 'record_id'),
            name,
            attribute_type: attributeType,
            sort_order: pickNumber(body, 'sort_order'),
            options: optionsField,
            constraints: constraintsField,
        },
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

export interface RecordWriteCreateBody {
    readonly kind: 'create';
    readonly id: RecordId;
    readonly record: Omit<RecordEntity, 'id'>;
    readonly attributes: readonly RecordAttributeEntity[];
    readonly initialState: RecordState;
    readonly initialStateEventId: string;
    readonly initialStateAt: string;
}

export interface RecordWriteEditBody {
    readonly kind: 'edit';
    readonly id: RecordId;
    readonly record: Omit<RecordEntity, 'id'>;
    readonly attributes: readonly RecordAttributeEntity[];
    // The echoed lifecycle trio (Phase 6 Task 4, the SECOND
    // named wire delta): an edit now carries the SAME
    // state/state_at/state_event_id keys — and the SAME
    // validation rules — as validateRecordDocumentBody's own
    // trio, since the synthesized document pair forms purely
    // from this body. A byte-identical echo of the stored head
    // converges to a no-op event write at the op (the sameEvent
    // decompose); a fresh mint would silently author a genuine
    // transition instead.
    readonly state: RecordState;
    readonly state_at: string;
    readonly state_event_id: string;
    readonly removedAttributeIds: readonly string[];
}

export type RecordWriteBody =
    | RecordWriteCreateBody
    | RecordWriteEditBody;

const RECORD_WRITE_CREATE_KEYS:
    readonly string[] = [
    'kind', 'id', 'record',
    'attributes', 'initialState',
    'initialStateEventId', 'initialStateAt',
];

// The trio keys sit BEFORE removedAttributeIds (order is
// load-bearing: assertOnlyKeys reports the first missing
// required key it finds).
const RECORD_WRITE_EDIT_KEYS:
    readonly string[] = [
    'kind', 'id', 'record', 'attributes',
    'state', 'state_at', 'state_event_id',
    'removedAttributeIds',
];

function validateRecordWriteAttribute(
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

export function validateRecordWriteBody(
    body: Record<string, unknown>,
): RecordWriteBody {
    const kind = pickString(body, 'kind');
    if (kind === 'create') {
        assertOnlyKeys(
            body,
            RECORD_WRITE_CREATE_KEYS,
            'RecordWriteCreateBody',
        );
        const id = pickString(body, 'id');
        const record = validateRecordEntity(
            asObject(
                body['record'],
                'RecordWriteCreateBody.record',
            ),
        );
        const attrsRaw = asArray(
            body['attributes'],
            'RecordWriteCreateBody.attributes',
        );
        const attributes = attrsRaw.map((a, i) =>
            validateRecordWriteAttribute(
                a, id,
                'RecordWriteCreateBody'
                + '.attributes[' + i + ']',
            ),
        );
        const initialState = assertRecordState(
            pickString(body, 'initialState'),
            'RecordWriteCreateBody.initialState',
        );
        const initialStateEventId = pickString(
            body, 'initialStateEventId',
        );
        const initialStateAt = validateTimestampField(
            body, 'initialStateAt',
            'RecordWriteCreateBody',
        );
        return {
            kind: 'create',
            id, record, attributes,
            initialState, initialStateEventId,
            initialStateAt,
        };
    }
    if (kind === 'edit') {
        assertOnlyKeys(
            body,
            RECORD_WRITE_EDIT_KEYS,
            'RecordWriteEditBody',
        );
        const id = pickString(body, 'id');
        const record = validateRecordEntity(
            asObject(
                body['record'],
                'RecordWriteEditBody.record',
            ),
        );
        const attrsRaw = asArray(
            body['attributes'],
            'RecordWriteEditBody.attributes',
        );
        const attributes = attrsRaw.map((a, i) =>
            validateRecordWriteAttribute(
                a, id,
                'RecordWriteEditBody'
                + '.attributes[' + i + ']',
            ),
        );
        // The document trio's OWN validation rules
        // (validateRecordDocumentBody), reused verbatim: an
        // edit's echoed trio is byte-identical wire shape to
        // what a live PUT records/:id would carry.
        const state = assertRecordState(
            pickString(body, 'state'),
            'RecordWriteEditBody.state',
        );
        const stateEventId = pickString(
            body, 'state_event_id',
        );
        if (stateEventId === '') {
            throw new ValidationError(
                'RecordWriteEditBody.state_event_id must be'
                + ' non-empty',
            );
        }
        const stateAt = validateTimestampField(
            body, 'state_at', 'RecordWriteEditBody.state_at',
        );
        const removedRaw = asArray(
            body['removedAttributeIds'],
            'RecordWriteEditBody'
            + '.removedAttributeIds',
        );
        const removedAttributeIds = removedRaw
            .map((r, i) => asString(
                r,
                'RecordWriteEditBody'
                + '.removedAttributeIds['
                + i + ']',
            ));
        return {
            kind: 'edit',
            id, record, attributes,
            state,
            state_at: stateAt,
            state_event_id: stateEventId,
            removedAttributeIds,
        };
    }
    throw new ValidationError(
        "expected RecordWriteBody kind"
        + " 'create' or 'edit', got " + kind,
    );
}

export interface IdeaConversionBaseline {
    readonly id: string;
    readonly fields: Record<string, unknown>;
}

export interface IdeaConversionBody {
    readonly projectId: string;
    readonly project: Record<string, unknown>;
    readonly idea: Record<string, unknown>;
    readonly ideaStateEventId: string;
    readonly ideaState: string;
    readonly ideaStateAt: string;
    readonly projectStateEventId: string;
    readonly projectState: string;
    readonly projectStateAt: string;
    readonly baselines: readonly IdeaConversionBaseline[];
}

const IDEA_CONVERSION_KEYS: readonly string[] = [
    'projectId', 'project', 'idea',
    'ideaStateEventId', 'ideaState', 'ideaStateAt',
    'projectStateEventId', 'projectState', 'projectStateAt',
    'baselines',
];

const IDEA_CONVERSION_BASELINE_KEYS: readonly string[] = [
    'id', 'fields',
];

// The HTTP-body gate for POST /ideas/:id/conversion: the lone
// cross-aggregate write — a new project row, the promoted idea
// row, TWO state events (the idea's 'promoted' and the
// project's initial), and N baseline-score rows, written
// atomically. The idea is the route param. The facet fields are
// NOT fully validated here — the org-scoped projects store
// stamps organization_id from the verified token and
// re-validates through validateProjectEntity AFTER the stamp
// (so the project body OMITS organization_id); the ideas store
// re-validates the promoted idea through validateIdeaEntity, and
// each baseline row through validateBaselineScoreEntity, as the
// composing puts land. Authorship of both events is stamped
// from the verified caller in the route, never the body — the
// body carries only the event ids and the (server-fixed) state
// values. The baseline ids are minted client-side and non-empty.
export function validateIdeaConversionBody(
    body: Record<string, unknown>,
): IdeaConversionBody {
    assertOnlyKeys(
        body, IDEA_CONVERSION_KEYS, 'IdeaConversionBody',
    );
    const projectId = pickString(body, 'projectId');
    if (projectId === '') {
        throw new ValidationError(
            'IdeaConversionBody.projectId must be non-empty',
        );
    }
    const project = asObject(
        body['project'], 'IdeaConversionBody.project',
    );
    const idea = asObject(
        body['idea'], 'IdeaConversionBody.idea',
    );
    const ideaStateEventId = pickString(
        body, 'ideaStateEventId',
    );
    if (ideaStateEventId === '') {
        throw new ValidationError(
            'IdeaConversionBody.ideaStateEventId'
            + ' must be non-empty',
        );
    }
    const ideaState = pickString(body, 'ideaState');
    if (ideaState === '') {
        throw new ValidationError(
            'IdeaConversionBody.ideaState must be non-empty',
        );
    }
    const projectStateEventId = pickString(
        body, 'projectStateEventId',
    );
    if (projectStateEventId === '') {
        throw new ValidationError(
            'IdeaConversionBody.projectStateEventId'
            + ' must be non-empty',
        );
    }
    const projectState = pickString(body, 'projectState');
    if (projectState === '') {
        throw new ValidationError(
            'IdeaConversionBody.projectState must be non-empty',
        );
    }
    const ideaStateAt = validateTimestampField(
        body, 'ideaStateAt',
        'IdeaConversionBody.ideaStateAt',
    );
    const projectStateAt = validateTimestampField(
        body, 'projectStateAt',
        'IdeaConversionBody.projectStateAt',
    );
    const baselines = asArray(
        body['baselines'], 'IdeaConversionBody.baselines',
    ).map((v, i) => {
        const label =
            'IdeaConversionBody.baselines[' + i + ']';
        const row = asObject(v, label);
        assertOnlyKeys(
            row, IDEA_CONVERSION_BASELINE_KEYS, label,
        );
        const id = asString(row['id'], label + '.id');
        if (id === '') {
            throw new ValidationError(
                label + '.id must be non-empty',
            );
        }
        return {
            id,
            fields: asObject(
                row['fields'], label + '.fields',
            ),
        };
    });
    return {
        projectId, project, idea,
        ideaStateEventId, ideaState, ideaStateAt,
        projectStateEventId, projectState, projectStateAt,
        baselines,
    };
}

export interface ObjectiveCreateBody {
    readonly id: string;
    readonly objective: Record<string, unknown>;
    readonly revisionId: string;
    readonly revision: Record<string, unknown>;
}

const OBJECTIVE_CREATE_KEYS: readonly string[] = [
    'id', 'objective', 'revisionId', 'revision',
];

// The HTTP-body gate for POST /objectives: the objective row
// plus its FIRST revision, written atomically. Objective
// creation writes NO state event — an objective with no event
// reads as active, archival is a later event — so the handler
// needs no actor. The objective fields are NOT fully validated
// here: the org-scoped store stamps organization_id from the
// verified token and re-validates through validateObjectiveEntity
// AFTER the stamp, so the body OMITS it. The revision sub-object
// is re-validated by the objective_revisions store's own
// validator; its member_id is a row column (who authored the
// definition), not state authorship.
export function validateObjectiveCreateBody(
    body: Record<string, unknown>,
): ObjectiveCreateBody {
    assertOnlyKeys(
        body, OBJECTIVE_CREATE_KEYS, 'ObjectiveCreateBody',
    );
    const id = pickString(body, 'id');
    if (id === '') {
        throw new ValidationError(
            'ObjectiveCreateBody.id must be non-empty',
        );
    }
    const objective = asObject(
        body['objective'], 'ObjectiveCreateBody.objective',
    );
    const revisionId = pickString(body, 'revisionId');
    if (revisionId === '') {
        throw new ValidationError(
            'ObjectiveCreateBody.revisionId must be non-empty',
        );
    }
    const revision = asObject(
        body['revision'], 'ObjectiveCreateBody.revision',
    );
    return { id, objective, revisionId, revision };
}

export interface FlowCreateBody {
    readonly id: string;
    readonly flow: Record<string, unknown>;
    readonly projectFlowId: string;
    readonly projectFlow: Record<string, unknown>;
    readonly initialState: string;
    readonly initialStateEventId: string;
    readonly initialStateAt: string;
    readonly graphDelta: FlowGraphDelta;
}

const FLOW_CREATE_KEYS: readonly string[] = [
    'id', 'flow', 'projectFlowId', 'projectFlow',
    'initialState', 'initialStateEventId',
    'initialStateAt', 'graphDelta',
];

// The HTTP-body gate for POST /flows: the flow row, its
// project_flows join row, the initial state event, and the
// initial graph delta (seeding the four relation tables),
// written atomically. The facet fields are NOT fully
// validated here — the org-scoped flows store stamps
// organization_id from the verified token and re-validates
// through validateFlowEntity AFTER the stamp (so the body
// OMITS organization_id), and the project_flows store
// re-validates the join through validateProjectFlowEntity
// when the composing POST puts it. Authorship of the
// initial event is stamped from the verified caller in the
// route, never the body; initialState is carried for
// symmetry with the other create endpoints (the flow
// creation paths pin it to 'active') and validated
// non-empty. graphDelta is the pre-built relation delta for
// the default graph (2 nodes, 0 edges, 0 member/attribute
// events) — validated here at the HTTP gate via
// validateFlowGraphDelta; the route writes the rows.
export function validateFlowCreateBody(
    body: Record<string, unknown>,
): FlowCreateBody {
    assertOnlyKeys(
        body, FLOW_CREATE_KEYS, 'FlowCreateBody',
    );
    const id = pickString(body, 'id');
    if (id === '') {
        throw new ValidationError(
            'FlowCreateBody.id must be non-empty',
        );
    }
    const flow = asObject(
        body['flow'], 'FlowCreateBody.flow',
    );
    const projectFlowId = pickString(body, 'projectFlowId');
    if (projectFlowId === '') {
        throw new ValidationError(
            'FlowCreateBody.projectFlowId must be non-empty',
        );
    }
    const projectFlow = asObject(
        body['projectFlow'], 'FlowCreateBody.projectFlow',
    );
    const initialState = pickString(body, 'initialState');
    if (initialState === '') {
        throw new ValidationError(
            'FlowCreateBody.initialState must be non-empty',
        );
    }
    const initialStateEventId = pickString(
        body, 'initialStateEventId',
    );
    if (initialStateEventId === '') {
        throw new ValidationError(
            'FlowCreateBody.initialStateEventId'
            + ' must be non-empty',
        );
    }
    const initialStateAt = validateTimestampField(
        body, 'initialStateAt', 'FlowCreateBody',
    );
    const graphDelta = validateFlowGraphDelta(
        asObject(body['graphDelta'], 'graphDelta'),
    );
    return {
        id, flow, projectFlowId, projectFlow,
        initialState, initialStateEventId,
        initialStateAt, graphDelta,
    };
}

export interface FlowVersionPublishBody {
    readonly id: string;
    readonly version: Record<string, unknown>;
    readonly trimIds: readonly string[];
}

const FLOW_VERSION_PUBLISH_KEYS: readonly string[] = [
    'id', 'version', 'trimIds',
];

// The HTTP-body gate for POST /flows/:id/versions: the version
// snapshot row plus the ids of the over-cap versions to trim,
// written atomically. The version fields are NOT fully validated
// here — the flow_versions store re-validates the snapshot
// through validateFlowVersionEntity when the composing POST puts
// it. The web-app computes WHICH versions to trim (its own
// cap-retention derivation), so trimIds is carried as a list of
// non-empty version ids. No state event is written, so no actor
// is involved.
export function validateFlowVersionPublishBody(
    body: Record<string, unknown>,
): FlowVersionPublishBody {
    assertOnlyKeys(
        body, FLOW_VERSION_PUBLISH_KEYS,
        'FlowVersionPublishBody',
    );
    const id = pickString(body, 'id');
    if (id === '') {
        throw new ValidationError(
            'FlowVersionPublishBody.id must be non-empty',
        );
    }
    const version = asObject(
        body['version'], 'FlowVersionPublishBody.version',
    );
    const trimRaw = asArray(
        body['trimIds'], 'FlowVersionPublishBody.trimIds',
    );
    const trimIds = trimRaw.map((t, i) => {
        const value = asString(
            t, 'FlowVersionPublishBody.trimIds[' + i + ']',
        );
        if (value === '') {
            throw new ValidationError(
                'FlowVersionPublishBody.trimIds[' + i + ']'
                + ' must be non-empty',
            );
        }
        return value;
    });
    return { id, version, trimIds };
}

export interface FlowUndoBody {
    readonly flow: Record<string, unknown>;
    readonly eventId: string;
    readonly consumedVersionId: string;
    readonly at: string;
    // Task 5: the post-undo reduced graph — performUndo already
    // computes the target working copy, so the client carries it
    // verbatim (the SAME wire covenant validateFlowDocumentBody's
    // `graph` field already holds). REQUIRED — an old-shape undo
    // body (missing this field) 400s; there is no silent
    // fallback. The ONLY consumer is the undo route's synthesized
    // document pair (message-pair.ts); this op's own row writes
    // never touch it.
    readonly graph: JsonObjectField;
    readonly graphDelta: FlowGraphDelta;
    readonly revivals: GraphRevival[];
}

const FLOW_UNDO_KEYS: readonly string[] = [
    'flow', 'eventId', 'consumedVersionId', 'at',
    'graph', 'graphDelta', 'revivals',
];

// The revivals array gate, shared by the undo and redo
// bodies: each element is the deletion/revival triple, so the
// route can post a 'restored' event that supersedes a prior
// tombstone. `label` names the enclosing body.
function validateRevivals(
    value: unknown,
    label: string,
): GraphRevival[] {
    return asArray(value, label).map((item, i) =>
        validateGraphTriple(item, label + '[' + i + ']'),
    );
}

// The HTTP-body gate for POST /flows/:id/undo: the flow row, the
// 'updated' state event, the DELETE of the consumed version, the
// graphDelta to the four relation tables, and the revivals —
// written atomically. The flow can never land reverted while the
// version row survives unconsumed. The flow fields are
// re-validated by the org-scoped flows store after the org
// stamp (body OMITS organization_id). The state is fixed to
// 'updated' server-side and authored by the verified caller
// (actor), never the body. graphDelta lands the target graph in
// relations (validated via validateFlowGraphDelta); revivals
// post 'restored' events that supersede the tombstones of the
// nodes/edges the target re-introduces (so isDeletedIn flips
// back to false and they reappear in reads).
export function validateFlowUndoBody(
    body: Record<string, unknown>,
): FlowUndoBody {
    assertOnlyKeys(body, FLOW_UNDO_KEYS, 'FlowUndoBody');
    const flow = asObject(body['flow'], 'FlowUndoBody.flow');
    const eventId = pickString(body, 'eventId');
    if (eventId === '') {
        throw new ValidationError(
            'FlowUndoBody.eventId must be non-empty',
        );
    }
    const consumedVersionId = pickString(
        body, 'consumedVersionId',
    );
    if (consumedVersionId === '') {
        throw new ValidationError(
            'FlowUndoBody.consumedVersionId must be non-empty',
        );
    }
    const at = validateTimestampField(
        body, 'at', 'FlowUndoBody',
    );
    const graph = pickJsonObjectField(body, 'graph');
    validateStoredGraphJson(graph, 'FlowUndoBody.graph');
    const graphDelta = validateFlowGraphDelta(
        asObject(body['graphDelta'], 'FlowUndoBody.graphDelta'),
    );
    const revivals = validateRevivals(
        body['revivals'], 'FlowUndoBody.revivals',
    );
    return {
        flow, eventId, consumedVersionId, at,
        graph, graphDelta, revivals,
    };
}

export interface HumanMemberCreateBody {
    readonly id: string;
    readonly detail: Record<string, unknown>;
    readonly initialState: MemberState;
    readonly initialStateEventId: string;
    readonly initialStateAt: string;
}

const HUMAN_MEMBER_CREATE_KEYS: readonly string[] = [
    'id', 'detail',
    'initialState', 'initialStateEventId',
    'initialStateAt',
];

// The HTTP-body gate for POST /human-members: the three member
// facets (the parent member row, the identity, the detail row)
// plus the initial state event, written atomically. PII no
// longer rides this body (Phase 10 Task 2's intake
// decomposition) — it enters later via the separate PUT
// identities/:id/pii. The facet fields are NOT fully validated
// here — each facet store re-validates its own body
// (validateMemberEntity, validateIdentityEntity,
// validateHumanMemberEntity) when the composing POST puts it.
// The member parent (type) and the identity (kind) are
// server-supplied facts the handler pins, so the body carries
// only the detail sub-object. Authorship of the initial event is
// stamped from the verified caller in the route, never the body.
export function validateHumanMemberCreateBody(
    body: Record<string, unknown>,
): HumanMemberCreateBody {
    assertOnlyKeys(
        body, HUMAN_MEMBER_CREATE_KEYS, 'HumanMemberCreateBody',
    );
    const id = pickString(body, 'id');
    if (id === '') {
        throw new ValidationError(
            'HumanMemberCreateBody.id must be non-empty',
        );
    }
    const detail = asObject(
        body['detail'], 'HumanMemberCreateBody.detail',
    );
    const initialState = assertMemberState(
        pickString(body, 'initialState'),
        'HumanMemberCreateBody.initialState',
    );
    const initialStateEventId = pickString(
        body, 'initialStateEventId',
    );
    if (initialStateEventId === '') {
        throw new ValidationError(
            'HumanMemberCreateBody.initialStateEventId'
            + ' must be non-empty',
        );
    }
    const initialStateAt = validateTimestampField(
        body, 'initialStateAt', 'HumanMemberCreateBody',
    );
    return {
        id, detail, initialState,
        initialStateEventId, initialStateAt,
    };
}

// Identity creation, discriminated by kind. A person carries
// only {id, kind} — its PII enters later via the separate PUT
// identities/:id/pii (Phase 10 Task 2's intake decomposition);
// a service carries its credential sub-object (a deterministic-
// id'd client_secret row whose secret is hashed client-side
// before it crosses the gate). The route pins the identity kind.
export interface IdentityCreatePersonBody {
    readonly id: string;
    readonly kind: 'person';
}

export interface IdentityCreateServiceBody {
    readonly id: string;
    readonly kind: 'service';
    readonly credential: Record<string, unknown>;
}

export type IdentityCreateBody =
    | IdentityCreatePersonBody
    | IdentityCreateServiceBody;

const IDENTITY_CREATE_PERSON_KEYS: readonly string[] = [
    'id', 'kind',
];

const IDENTITY_CREATE_SERVICE_KEYS: readonly string[] = [
    'id', 'kind', 'credential',
];

// The HTTP-body gate for POST /identities: a bare person
// identity (its PII lands later via PUT identities/:id/pii), OR
// a service identity + its client_secret credential row, written
// atomically. The credential sub-object is NOT fully validated
// here — the parent-scoped identity_credentials store re-
// validates its own body (validateIdentityCredentialEntity) when
// the composing put lands, and the identities store pins the
// kind through validateIdentityEntity. The credential's secret
// is hashed client-side; the route never touches crypto.
// Identity creation writes NO state event — identities carry no
// lifecycle event at creation — so the handler needs no actor.
export function validateIdentityCreateBody(
    body: Record<string, unknown>,
): IdentityCreateBody {
    const kind = validateEnumField(
        body, 'kind', ['person', 'service'],
        'identity kind', 'IdentityCreateBody',
    );
    const id = pickString(body, 'id');
    if (id === '') {
        throw new ValidationError(
            'IdentityCreateBody.id must be non-empty',
        );
    }
    if (kind === 'person') {
        assertOnlyKeys(
            body,
            IDENTITY_CREATE_PERSON_KEYS,
            'IdentityCreatePersonBody',
        );
        return { id, kind };
    }
    assertOnlyKeys(
        body,
        IDENTITY_CREATE_SERVICE_KEYS,
        'IdentityCreateServiceBody',
    );
    return {
        id,
        kind,
        credential: asObject(
            body['credential'],
            'IdentityCreateServiceBody.credential',
        ),
    };
}

export interface WorkOrderCreateBody {
    readonly id: string;
    readonly workOrder: Record<string, unknown>;
    readonly flowWorkOrderId: string;
    readonly flowWorkOrder: Record<string, unknown>;
    readonly stateEventIds: readonly string[];
    readonly stateEventAts: readonly string[];
    readonly states: readonly string[];
}

const WORK_ORDER_CREATE_KEYS: readonly string[] = [
    'id', 'workOrder', 'flowWorkOrderId', 'flowWorkOrder',
    'stateEventIds', 'stateEventAts', 'states',
];

// The HTTP-body gate for POST /work-orders: the work_orders
// row, its flow_work_orders join row, and THREE initial state
// events (start, post-start, claimed), written atomically. The
// facet fields are NOT fully validated here — the work_orders
// store stamps organization_id from the verified token and
// re-validates through validateWorkOrderEntity AFTER the stamp
// (so the body OMITS organization_id), and the flow_work_orders
// store re-validates the join through validateFlowWorkOrderEntity
// when the composing POST puts it. The three event ids and
// states ride parallel arrays, applied IN ORDER; authorship of
// every event is stamped from the verified caller in the route,
// never the body. The arrays must be equal length and exactly
// three — the create's fixed event count.
export function validateWorkOrderCreateBody(
    body: Record<string, unknown>,
): WorkOrderCreateBody {
    assertOnlyKeys(
        body, WORK_ORDER_CREATE_KEYS, 'WorkOrderCreateBody',
    );
    const id = pickString(body, 'id');
    if (id === '') {
        throw new ValidationError(
            'WorkOrderCreateBody.id must be non-empty',
        );
    }
    const workOrder = asObject(
        body['workOrder'], 'WorkOrderCreateBody.workOrder',
    );
    const flowWorkOrderId = pickString(body, 'flowWorkOrderId');
    if (flowWorkOrderId === '') {
        throw new ValidationError(
            'WorkOrderCreateBody.flowWorkOrderId'
            + ' must be non-empty',
        );
    }
    const flowWorkOrder = asObject(
        body['flowWorkOrder'],
        'WorkOrderCreateBody.flowWorkOrder',
    );
    const stateEventIds = asArray(
        body['stateEventIds'],
        'WorkOrderCreateBody.stateEventIds',
    ).map((v, i) => {
        const eventId = asString(
            v, 'WorkOrderCreateBody.stateEventIds[' + i + ']',
        );
        if (eventId === '') {
            throw new ValidationError(
                'WorkOrderCreateBody.stateEventIds['
                + i + '] must be non-empty',
            );
        }
        return eventId;
    });
    const stateEventAts = asArray(
        body['stateEventAts'],
        'WorkOrderCreateBody.stateEventAts',
    ).map((v, i) => {
        const label =
            'WorkOrderCreateBody.stateEventAts[' + i + ']';
        return validateTimestampField(
            { at: v }, 'at', label,
        );
    });
    const states = asArray(
        body['states'], 'WorkOrderCreateBody.states',
    ).map((v, i) => {
        const state = asString(
            v, 'WorkOrderCreateBody.states[' + i + ']',
        );
        if (state === '') {
            throw new ValidationError(
                'WorkOrderCreateBody.states['
                + i + '] must be non-empty',
            );
        }
        return state;
    });
    if (
        stateEventIds.length !== 3
        || stateEventAts.length !== 3
        || states.length !== 3
    ) {
        throw new ValidationError(
            'WorkOrderCreateBody expects exactly three'
            + ' state events'
            + ' (stateEventIds + stateEventAts + states),'
            + ' got ' + stateEventIds.length + ' ids, '
            + stateEventAts.length + ' ats, and '
            + states.length + ' states',
        );
    }
    return {
        id, workOrder, flowWorkOrderId, flowWorkOrder,
        stateEventIds, stateEventAts, states,
    };
}

export interface WorkOrderTransitionFieldValue {
    readonly id: string;
    readonly fields: Record<string, unknown>;
}

export interface WorkOrderTransitionRelease {
    readonly id: string;
    readonly state: string;
    readonly at: string;
}

export interface WorkOrderTransitionBody {
    readonly transitionEventId: string;
    readonly targetState: string;
    readonly fieldValues: readonly WorkOrderTransitionFieldValue[];
    readonly release: WorkOrderTransitionRelease | null;
    readonly transitionAt: string;
}

const WORK_ORDER_TRANSITION_KEYS: readonly string[] = [
    'transitionEventId', 'targetState',
    'fieldValues', 'release', 'transitionAt',
];

const TRANSITION_RELEASE_KEYS: readonly string[] = [
    'id', 'state', 'at',
];

const TRANSITION_FIELD_VALUE_KEYS: readonly string[] = [
    'id', 'fields',
];

// The HTTP-body gate for POST /work-orders/:id/transition: the
// transition state event (target node), zero or more
// state_field_values rows, and an OPTIONAL claim-release event,
// written atomically. The web-app computes WHAT to write — the
// target node, the field rows, and whether a live claim must be
// released — exactly as POST /work-orders keeps graph derivation
// client-side. The field-value `fields` are NOT fully validated
// here: the state_field_values store re-validates each row
// through validateStateFieldValueEntity AFTER the transition
// event id is woven in. Authorship of the transition event AND
// the release event is stamped from the verified caller in the
// route, never the body — matching the old commit batch, where
// both events flowed through PUT /states/:id and were stamped
// with the actor.
export function validateWorkOrderTransitionBody(
    body: Record<string, unknown>,
): WorkOrderTransitionBody {
    assertOnlyKeys(
        body,
        WORK_ORDER_TRANSITION_KEYS,
        'WorkOrderTransitionBody',
    );
    const transitionEventId = pickString(
        body, 'transitionEventId',
    );
    if (transitionEventId === '') {
        throw new ValidationError(
            'WorkOrderTransitionBody.transitionEventId'
            + ' must be non-empty',
        );
    }
    const targetState = pickString(body, 'targetState');
    if (targetState === '') {
        throw new ValidationError(
            'WorkOrderTransitionBody.targetState'
            + ' must be non-empty',
        );
    }
    const fieldValues = asArray(
        body['fieldValues'],
        'WorkOrderTransitionBody.fieldValues',
    ).map((v, i) => {
        const label =
            'WorkOrderTransitionBody.fieldValues[' + i + ']';
        const row = asObject(v, label);
        assertOnlyKeys(
            row, TRANSITION_FIELD_VALUE_KEYS, label,
        );
        const id = asString(row['id'], label + '.id');
        if (id === '') {
            throw new ValidationError(
                label + '.id must be non-empty',
            );
        }
        return {
            id,
            fields: asObject(
                row['fields'], label + '.fields',
            ),
        };
    });
    const rawRelease = body['release'];
    let release: WorkOrderTransitionRelease | null = null;
    if (rawRelease !== null) {
        const label = 'WorkOrderTransitionBody.release';
        const obj = asObject(rawRelease, label);
        assertOnlyKeys(obj, TRANSITION_RELEASE_KEYS, label);
        const id = asString(obj['id'], label + '.id');
        if (id === '') {
            throw new ValidationError(
                label + '.id must be non-empty',
            );
        }
        const state = asString(obj['state'], label + '.state');
        if (state === '') {
            throw new ValidationError(
                label + '.state must be non-empty',
            );
        }
        const at = validateTimestampField(
            obj, 'at', label,
        );
        release = { id, state, at };
    }
    const transitionAt = validateTimestampField(
        body, 'transitionAt',
        'WorkOrderTransitionBody',
    );
    return {
        transitionEventId, targetState,
        fieldValues, release, transitionAt,
    };
}

export interface AIMemberCreateBody {
    readonly id: string;
    readonly detail: Record<string, unknown>;
    readonly initialState: MemberState;
    readonly initialStateEventId: string;
    readonly initialStateAt: string;
}

const AI_MEMBER_CREATE_KEYS: readonly string[] = [
    'id', 'detail',
    'initialState', 'initialStateEventId',
    'initialStateAt',
];

// The HTTP-body gate for POST /ai-members: the parent member
// row plus the ai_members detail row, plus the initial state
// event, written atomically. The detail fields are NOT fully
// validated here — the ai_members store re-validates its own
// body (validateAIMemberEntity) when the composing POST puts
// it. The member parent (type 'ai') is a server-supplied fact
// the handler pins, so the body carries only the detail sub-
// object (name + the AI fields). Authorship of the initial
// event is stamped from the verified caller in the route,
// never the body.
export function validateAIMemberCreateBody(
    body: Record<string, unknown>,
): AIMemberCreateBody {
    assertOnlyKeys(
        body, AI_MEMBER_CREATE_KEYS, 'AIMemberCreateBody',
    );
    const id = pickString(body, 'id');
    if (id === '') {
        throw new ValidationError(
            'AIMemberCreateBody.id must be non-empty',
        );
    }
    const detail = asObject(
        body['detail'], 'AIMemberCreateBody.detail',
    );
    const initialState = assertMemberState(
        pickString(body, 'initialState'),
        'AIMemberCreateBody.initialState',
    );
    const initialStateEventId = pickString(
        body, 'initialStateEventId',
    );
    if (initialStateEventId === '') {
        throw new ValidationError(
            'AIMemberCreateBody.initialStateEventId'
            + ' must be non-empty',
        );
    }
    const initialStateAt = validateTimestampField(
        body, 'initialStateAt', 'AIMemberCreateBody',
    );
    return {
        id, detail, initialState,
        initialStateEventId, initialStateAt,
    };
}

const WORK_ORDER_CLAIM_KEYS: readonly string[] = [
    'claimEventId', 'claimAt',
    'expireEventId', 'expireAt',
];

export interface WorkOrderClaimBody {
    readonly claimEventId: string;
    readonly claimAt: string;
    readonly expireEventId: string;
    readonly expireAt: string;
}

// Gate for POST /work-orders/:id/claim. The caller mints
// both event ids and timestamps; the route reads them via
// this validator and never calls generateCryptoSafeBase62
// for the claim events. Authorship is server-derived
// (actor for 'claimed', prior.member_id for
// 'claim_expired') — never supplied by the caller.
export function validateWorkOrderClaimBody(
    body: Record<string, unknown>,
): WorkOrderClaimBody {
    assertOnlyKeys(
        body, WORK_ORDER_CLAIM_KEYS, 'WorkOrderClaimBody',
    );
    const claimEventId = pickString(body, 'claimEventId');
    const expireEventId = pickString(
        body, 'expireEventId',
    );
    if (claimEventId === '' || expireEventId === '') {
        throw new ValidationError(
            'WorkOrderClaimBody ids must be non-empty',
        );
    }
    const claimAt = validateTimestampField(
        body, 'claimAt', 'WorkOrderClaimBody',
    );
    const expireAt = validateTimestampField(
        body, 'expireAt', 'WorkOrderClaimBody',
    );
    return { claimEventId, claimAt, expireEventId, expireAt };
}

export interface AIMemberEditBody {
    readonly detail: Record<string, unknown>;
}

const AI_MEMBER_EDIT_KEYS: readonly string[] = [
    'detail',
];

// The HTTP-body gate for POST /ai-members/:id: the parent
// member row plus the ai_members detail row re-put, NO state
// event (an edit does not move the member's lifecycle), so the
// handler needs no actor. As with create, the ai_members store
// re-validates its own body when the composing POST puts it;
// the id is the route param, the member type is a server-
// supplied fact.
export function validateAIMemberEditBody(
    body: Record<string, unknown>,
): AIMemberEditBody {
    assertOnlyKeys(
        body, AI_MEMBER_EDIT_KEYS, 'AIMemberEditBody',
    );
    const detail = asObject(
        body['detail'], 'AIMemberEditBody.detail',
    );
    return { detail };
}

export interface HumanMemberEditBody {
    readonly detail: Record<string, unknown>;
}

const HUMAN_MEMBER_EDIT_KEYS: readonly string[] = [
    'detail',
];

// The HTTP-body gate for POST /human-members/:id: the member and
// identity facets re-pin, the detail facet re-puts, NO state
// event (an edit does not move the member's lifecycle), so the
// handler needs no actor. PII no longer rides this body (Phase
// 10 Task 2's intake decomposition) — it changes ONLY via the
// separate PUT identities/:id/pii, fired by the client IFF the
// caller's dirty check finds it changed. As with create, the
// detail facet is NOT fully validated here — human_members
// re-validates its own body when the composing POST puts it;
// the id is the route param, the member type and identity kind
// are server-supplied facts.
export function validateHumanMemberEditBody(
    body: Record<string, unknown>,
): HumanMemberEditBody {
    assertOnlyKeys(
        body, HUMAN_MEMBER_EDIT_KEYS, 'HumanMemberEditBody',
    );
    const detail = asObject(
        body['detail'], 'HumanMemberEditBody.detail',
    );
    return { detail };
}

// ── Flow graph delta ─────────────────
//
// FlowGraphDelta is the wire shape the client sends when
// saving a normalised graph: upsert rows for every working
// node/edge, deletion tombstones for removed ones, and
// append-only ledger events for member/attribute changes.
// The row body interfaces mirror the entity interfaces but
// carry `id` (the stable canvas id) because the client
// supplies it (same precedent as postFlowCreation).

export interface FlowNodeRowBody {
    readonly id: string;
    readonly flow_id: string;
    readonly name: string;
    readonly position_x: number;
    readonly position_y: number;
    readonly is_create: boolean;
    readonly is_archive: boolean;
    readonly task_instructions: string;
    readonly at: string;
}

export interface FlowEdgeRowBody {
    readonly id: string;
    readonly flow_id: string;
    readonly name: string;
    readonly from_node_id: string;
    readonly to_node_id: string;
    readonly at: string;
}

export interface GraphDeletion {
    readonly eventId: string;
    readonly entityId: string;
    readonly at: string;
}

// A revival has the SAME triple shape as a deletion — a
// client-minted eventId, the entity being re-introduced, and
// the moment. The undo/redo bodies carry these to post a
// non-'deleted' 'restored' event that supersedes a prior
// tombstone, so a node/edge the user deleted reappears in
// reads when the deletion is reverted.
export type GraphRevival = GraphDeletion;

// The deletion/revival triple validator — eventId non-empty
// string, entityId asGraphId, at via validateTimestampField.
// Shared by FlowGraphDelta.deletions and the undo/redo body
// revivals (same wire shape, same gate).
function validateGraphTriple(
    value: unknown,
    label: string,
): GraphDeletion {
    const obj = asObject(value, label);
    const eventId = pickString(obj, 'eventId');
    if (eventId === '') {
        throw new ValidationError(
            label + '.eventId must be non-empty',
        );
    }
    const entityId = asGraphId(
        obj['entityId'], label + '.entityId',
    );
    const at = validateTimestampField(obj, 'at', label);
    return { eventId, entityId, at };
}

export interface FlowNodeMemberRowBody {
    readonly id: string;
    readonly flow_node_id: string;
    readonly member_id: string;
    readonly action: 'added' | 'removed';
    readonly at: string;
}

export interface FlowNodeAttributeRowBody {
    readonly id: string;
    readonly flow_node_id: string;
    readonly attribute_id: string;
    readonly mode: 'editable' | 'readonly';
    readonly is_required: boolean;
    readonly action: 'added' | 'removed';
    readonly at: string;
}

export interface FlowGraphDelta {
    readonly nodes: FlowNodeRowBody[];
    readonly edges: FlowEdgeRowBody[];
    readonly deletions: GraphDeletion[];
    readonly memberEvents: FlowNodeMemberRowBody[];
    readonly attributeEvents: FlowNodeAttributeRowBody[];
}

const FLOW_GRAPH_DELTA_KEYS: readonly string[] = [
    'nodes', 'edges', 'deletions',
    'memberEvents', 'attributeEvents',
];

// Validates an inbound FlowGraphDelta HTTP body.
// For each node element: splits the `id` (asGraphId) from
// the row fields and delegates to validateFlowNodeEntity.
// Same pattern for edges. Member and attribute event ids
// are minted base62 strings — validated as non-empty strings.
// Delegates the rest to the landed row validators.
// Deletions: eventId non-empty string, entityId asGraphId,
// at via validateTimestampField.
export function validateFlowGraphDelta(
    body: Record<string, unknown>,
): FlowGraphDelta {
    assertOnlyKeys(
        body, FLOW_GRAPH_DELTA_KEYS, 'FlowGraphDelta',
    );
    const nodesRaw = asArray(
        body['nodes'], 'FlowGraphDelta.nodes',
    );
    const edgesRaw = asArray(
        body['edges'], 'FlowGraphDelta.edges',
    );
    const deletionsRaw = asArray(
        body['deletions'], 'FlowGraphDelta.deletions',
    );
    const memberEventsRaw = asArray(
        body['memberEvents'],
        'FlowGraphDelta.memberEvents',
    );
    const attributeEventsRaw = asArray(
        body['attributeEvents'],
        'FlowGraphDelta.attributeEvents',
    );

    const nodes: FlowNodeRowBody[] =
        nodesRaw.map((item, i) => {
            const obj = asObject(
                item,
                'FlowGraphDelta.nodes[' + i + ']',
            );
            const id = asGraphId(
                obj['id'],
                'FlowGraphDelta.nodes['
                    + i + '].id',
            );
            const { id: _id, ...rest } = obj;
            const validated =
                validateFlowNodeEntity(rest);
            return { id, ...validated };
        });

    const edges: FlowEdgeRowBody[] =
        edgesRaw.map((item, i) => {
            const obj = asObject(
                item,
                'FlowGraphDelta.edges[' + i + ']',
            );
            const id = asGraphId(
                obj['id'],
                'FlowGraphDelta.edges['
                    + i + '].id',
            );
            const { id: _id, ...rest } = obj;
            const validated =
                validateFlowEdgeEntity(rest);
            return { id, ...validated };
        });

    const deletions: GraphDeletion[] =
        deletionsRaw.map((item, i) =>
            validateGraphTriple(
                item,
                'FlowGraphDelta.deletions[' + i + ']',
            ),
        );

    const memberEvents: FlowNodeMemberRowBody[] =
        memberEventsRaw.map((item, i) => {
            const label =
                'FlowGraphDelta.memberEvents['
                + i + ']';
            const obj = asObject(item, label);
            const id = pickString(obj, 'id');
            if (id === '') {
                throw new ValidationError(
                    label + '.id must be non-empty',
                );
            }
            const {
                id: _id, ...rest
            } = obj;
            const validated =
                validateFlowNodeMemberEntity(rest);
            return { id, ...validated };
        });

    const attributeEvents:
        FlowNodeAttributeRowBody[] =
        attributeEventsRaw.map((item, i) => {
            const label =
                'FlowGraphDelta.attributeEvents['
                + i + ']';
            const obj = asObject(item, label);
            const id = pickString(obj, 'id');
            if (id === '') {
                throw new ValidationError(
                    label + '.id must be non-empty',
                );
            }
            const {
                id: _id, ...rest
            } = obj;
            const validated =
                validateFlowNodeAttributeEntity(rest);
            return { id, ...validated };
        });

    return {
        nodes, edges, deletions,
        memberEvents, attributeEvents,
    };
}
