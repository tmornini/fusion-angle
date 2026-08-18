import type {
    GraphNode,
    GraphEdge,
    NodeAttribute,
    StoredGraph,
    WorkOrderFlowGraph,
    AttributeType,
    Constraint,
    MemberId,
    IdentityEntity,
    IdentityPiiEntity,
    IdentityCredentialEntity,
    IdentityTokenRevocationEntity,
    IdentityDefaultOrganizationEntity,
    IdentityTokenEntity,
    ClientRegistrationEntity,
    IdentityProviderEntity,
    RoleGrantEntity,
    MemberEntity,
    HumanMemberEntity,
    AIMemberEntity,
    AIAgentEntity,
    MemberState,
    IdeaEntity,
    IdeaState,
    ProjectEntity,
    ProjectState,
    FlowEntity,
    FlowState,
    FlowNodeEntity,
    FlowEdgeEntity,
    FlowNodeMemberEntity,
    FlowNodeAttributeEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    StateFieldValueEntity,
    OrganizationEntity,
    MembershipEntity,
    MembershipType,
    InvitationEntity,
    IdeaSubmissionEntity,
    ProjectFlowEntity,
    RecordEntity,
    RecordAttributeEntity,
    RecordId,
    RecordState,
    FlowRecordEntity,
    FlowTagEntity,
    ObjectiveEntity,
    ObjectiveState,
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
    assertObjectiveState,
    assertProjectState,
    assertRecordState,
    DEFAULT_ATTRIBUTE_ACL_ROLES,
} from './types.ts';
import {
    isProviderModelId,
} from './provider-models.ts';
import { extractErrorMessage } from '../shared/error-helpers.ts';
import { ValidationError } from './types.ts';
import { HEX64 } from './message-form.ts';

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

const MAX_REGEX_PATTERN_LENGTH = 200;

// A quantifier applied to a group that itself contains an
// unbounded quantifier — (a+)+, (a*)*, (.+)* — is the classic
// catastrophic-backtracking family. Full ReDoS detection is
// undecidable; this rejects that family and the length cap
// bounds worst-case input regardless.
const NESTED_QUANTIFIER = /\([^)]*[+*][^)]*\)[+*]/;

export function assertSafeRegexPattern(
    pattern: string,
    label: string,
): void {
    if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
        throw new ValidationError(
            'regex ' + label + ' exceeds '
            + MAX_REGEX_PATTERN_LENGTH + ' chars',
        );
    }
    if (NESTED_QUANTIFIER.test(pattern)) {
        throw new ValidationError(
            'regex ' + label
            + ' has nested unbounded quantifiers',
        );
    }
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
        const pattern = asString(
            obj['pattern'], label + '.pattern',
        );
        assertSafeRegexPattern(pattern, label + '.pattern');
        return { kind: 'regex', pattern };
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
    const agentIdsRaw = obj['agentIds'];
    const agentIds = agentIdsRaw === undefined
        ? undefined
        : asMemberIds(
            agentIdsRaw,
            label + '.agentIds',
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
        ...(agentIds === undefined
            ? {}
            : { agentIds }),
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

// Write-path graph law: memberIds may name person
// identities only. agentIds must name live /ai-agents
// documents.
export function assertFlowGraphWriteLaw(
    graph: StoredGraph,
    liveAgentIds: ReadonlySet<string>,
): void {
    for (const node of graph.nodes) {
        for (const id of node.memberIds) {
            if (liveAgentIds.has(id)) {
                throw new ValidationError(
                    'memberIds may name person'
                    + ' identities only, not AI'
                    + ' agents',
                );
            }
        }
        for (const id of node.agentIds ?? []) {
            if (!liveAgentIds.has(id)) {
                throw new ValidationError(
                    'agentIds must name a live AI'
                    + ' agent',
                );
            }
        }
    }
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

export function asWorkOrderFlowGraph(
    value: unknown,
    label: string,
): WorkOrderFlowGraph {
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

export function pickStringArray(
    body: Record<string, unknown>,
    key: string,
): string[] {
    const arr = asArray(body[key], key);
    return arr.map((item, i) =>
        asString(item, key + '[' + i + ']'),
    );
}

export function pickStringNumberRecord(
    body: Record<string, unknown>,
    key: string,
): Record<string, number> {
    const obj = asObject(body[key], key);
    const out: Record<string, number> = {};
    for (
        const [k, v] of Object.entries(obj)
    ) {
        out[k] = asNumber(v, key + '.' + k);
    }
    return out;
}

// A string field that may be ABSENT from the body — never
// null. Presence is checked before type: a missing key
// yields undefined, so the caller omits the property from
// the validated result (key absence models "none"); a
// PRESENT `null` is the Sin of Null and is rejected outright.
// An empty string is likewise rejected — presence of the
// key demands a non-empty string.
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
// width the mints emit (nowUtc/daysFromNow/isoFromMs) and
// the ledgers sort. The Office of Time's enemy is AMBIGUITY
// (a date-only stamp shifts the day across zones; a zoned
// offset is localtime), and the latest-wins reductions add
// a second enemy: WIDTH. Lexical compare is chronological
// only within
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
// into remaining nested object fields
// that still lack full key-set gates —
// each shape's inner schema needs its own
// enumerated key list. That is the
// "recursive check" that closes the
// remaining edges. Intentionally deferred
// here because each shape must be
// enumerated case-by-case.

// `optional` names keys that MAY appear but need not.
// Every existing caller omits the 4th argument, so the
// accepted set collapses to `expected`.
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

// Entity-field body only — lifecycle trio is GET stamp /
// document-body, never part of this validator's key set.
export type MemberEntityFields = Omit<
    MemberEntity,
    'id' | 'state' | 'state_at' | 'state_event_id'
>;

export function validateMemberEntity(
    body: Record<string, unknown>,
): MemberEntityFields {
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
    'state', 'state_at', 'state_event_id',
];

export interface MemberDocumentBody {
    readonly entity: MemberEntityFields;
    readonly state: MemberState;
    readonly state_at: string;
    readonly state_event_id: string;
}

// The HTTP-body gate for PUT /members/:id: the ninth family,
// now a lifecycle-trio one (states-address retirement). The
// old FREEZE-at-genesis refutation is RETIRED — its premise
// (a competing states/:id log) died with the address; the
// body carries {type} plus the trio. THE LABEL MANDATE (the
// Phase 7 Objective precedent, a NAMED byte-parity-over-
// convention choice): the assertOnlyKeys label is
// 'MemberEntity', matching TODAY'S store validator
// (validateMemberEntity) byte-for-byte, NOT the
// 'MemberDocumentBody' naming convention every other
// *DocumentBody validator uses — the label appears in the
// wire 400 body ("unexpected key ... for MemberEntity"),
// and the convention's label would change those bytes.
// `type`'s own rule (validateEnumField over the SAME three-
// member enum) is IDENTICAL to validateMemberEntity's, so
// the missing-type 400 stays byte-identical on both paths.
// Global plane (family-registry.ts: organizationNested:
// false) — no organization_id exists on this entity, so
// nothing is tolerated beyond type + trio.
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
    const state = assertMemberState(
        pickString(body, 'state'),
        'MemberEntity.state',
    );
    const stateEventId = pickString(body, 'state_event_id');
    if (stateEventId === '') {
        throw new ValidationError(
            'MemberEntity.state_event_id must be non-empty',
        );
    }
    return {
        entity: {
            type,
        },
        state,
        state_at: validateTimestampField(
            body, 'state_at', 'MemberEntity.state_at',
        ),
        state_event_id: stateEventId,
    };
}

const IDENTITY_BODY_KEYS: readonly string[] = ['kind'];

// Person-only. Same four fields HumanMemberEntity validates;
// optional here so `{ kind }` still admits a person without
// a profile. A service that names any of them is 400.
const IDENTITY_PROFILE_KEYS: readonly string[] = [
    'title', 'department',
    'strengths', 'team_dimensions',
];

export function validateIdentityEntity(
    body: Record<string, unknown>,
): Omit<IdentityEntity, 'id'> {
    assertOnlyKeys(
        body, IDENTITY_BODY_KEYS, 'IdentityEntity',
        IDENTITY_PROFILE_KEYS,
    );
    const kind = validateEnumField(
        body, 'kind', ['person', 'service'],
        'identity kind', 'IdentityEntity',
    );
    if (kind === 'service') {
        assertOnlyKeys(
            body, IDENTITY_BODY_KEYS, 'IdentityEntity',
        );
        return { kind };
    }
    return {
        kind,
        ...('title' in body
            ? { title: pickString(body, 'title') }
            : {}),
        ...('department' in body
            ? {
                department: pickString(
                    body, 'department',
                ),
            }
            : {}),
        ...('strengths' in body
            ? {
                strengths: pickStringArray(
                    body, 'strengths',
                ),
            }
            : {}),
        ...('team_dimensions' in body
            ? {
                team_dimensions:
                    pickStringNumberRecord(
                        body, 'team_dimensions',
                    ),
            }
            : {}),
    };
}

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
// choice): this gate delegates to validateIdentityEntity, so
// the assertOnlyKeys label stays 'IdentityEntity' — NOT the
// 'IdentityDocumentBody' naming convention every other
// *DocumentBody validator uses — the label appears in the wire
// 400 body ("unexpected key ... for IdentityEntity"), and the
// convention's label would change those bytes. A person may
// carry the four HumanMemberEntity profile fields; a service
// that names any of them is 400. Existing `{ kind }` PUTs
// still admit a person without a profile. Global plane
// (family-registry.ts: organizationNested:false).
export function validateIdentityDocumentBody(
    body: Record<string, unknown>,
): IdentityDocumentBody {
    return {
        entity: validateIdentityEntity(body),
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

// The registration facet's five body columns (shared with
// the retired clients row shape — the facet is the sole
// remaining consumer).
const CLIENT_BODY_KEYS: readonly string[] = [
    'grant_types', 'redirect_uris', 'jwks', 'aud', 'status',
];

// The registration facet's body validator.
export function validateClientRegistrationEntity(
    body: Record<string, unknown>,
): Omit<ClientRegistrationEntity, 'id'> {
    assertOnlyKeys(
        body, CLIENT_BODY_KEYS, 'ClientRegistrationEntity',
    );
    const status = validateEnumField(
        body, 'status', ['active', 'disabled'],
        'registration status', 'ClientRegistrationEntity',
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
    const strengths = pickStringArray(
        body, 'strengths',
    );
    const teamDimensions =
        pickStringNumberRecord(
            body, 'team_dimensions',
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
// strengths/team_dimensions structural gates (pickStringArray/
// pickStringNumberRecord) are the SAME calls
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
    const strengths = pickStringArray(
        body, 'strengths',
    );
    const teamDimensions =
        pickStringNumberRecord(
            body, 'team_dimensions',
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

const AI_AGENT_BODY_KEYS:
    readonly string[] = [
    'name', 'description', 'model', 'skill_focus',
];

export function validateAIAgentEntity(
    body: Record<string, unknown>,
): Omit<AIAgentEntity, 'id'> {
    assertOnlyKeys(
        body,
        AI_AGENT_BODY_KEYS,
        'AIAgentEntity',
    );
    const model = pickString(body, 'model');
    if (!isProviderModelId(model)) {
        throw new ValidationError(
            'model must be a known provider'
            + ' model id on AIAgentEntity',
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

const AI_AGENT_DOCUMENT_BODY_KEYS:
    readonly string[] = [
    'name', 'description', 'model', 'skill_focus',
];

export interface AiAgentDocumentBody {
    readonly entity: Omit<AIAgentEntity, 'id'>;
}

// The HTTP-body gate for PUT /ai-agents/:id: a
// standalone global-plane family, not a member and
// not an identity. THE LABEL MANDATE: assertOnlyKeys
// speaks 'AIAgentEntity', matching
// validateAIAgentEntity byte-for-byte. model uses
// the SAME catalog-membership gate.
export function validateAiAgentDocumentBody(
    body: Record<string, unknown>,
): AiAgentDocumentBody {
    assertOnlyKeys(
        body,
        AI_AGENT_DOCUMENT_BODY_KEYS,
        'AIAgentEntity',
    );
    const model = pickString(body, 'model');
    if (!isProviderModelId(model)) {
        throw new ValidationError(
            'model must be a known provider'
            + ' model id on AIAgentEntity',
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

// Entity-field body only — lifecycle trio is GET stamp /
// document-body, never part of this validator's key set.
export type IdeaEntityFields = Omit<
    IdeaEntity,
    'id' | 'organization_id' | 'state'
>;

export function validateIdeaEntity(
    body: Record<string, unknown>,
): IdeaEntityFields & { organization_id: string } {
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
    'state',
];

export interface IdeaDocumentBody {
    readonly entity: IdeaEntityFields;
    readonly state: IdeaState;
}

// The HTTP-body gate for PUT /ideas/:id: entity fields plus
// domain `state`. organization_id is deliberately absent from
// the expected set (like every other org-owned write, the
// client never supplies it; the org fence stamps it downstream
// when the write path stamps organization_id from the bound
// org) yet rides the `optional` allowance rather than
// `expected` — a caller-forged organization_id is
// tolerated-but-ignored, not rejected, because the bound org
// always overrides (the forged-body isolation test relies on
// this). Entity fields are picked directly rather than
// delegated to validateIdeaEntity — that function REQUIRES
// organization_id, which this body never carries pre-stamp.
export function validateIdeaDocumentBody(
    body: Record<string, unknown>,
): IdeaDocumentBody {
    assertOnlyKeys(
        body, IDEA_DOCUMENT_BODY_KEYS, 'IdeaDocumentBody',
        ['organization_id'],
    );
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
        state: assertIdeaState(
            pickString(body, 'state'),
            'IdeaDocumentBody.state',
        ),
    };
}

const PROJECT_BODY_KEYS: readonly string[] = [
    'organization_id', 'title', 'description',
    'progress', 'start_date',
    'target_end_date', 'estimated_cost',
    'actual_cost', 'position',
];

// Entity-field body only — lifecycle trio is GET stamp /
// document-body, never part of this validator's key set.
export type ProjectEntityFields = Omit<
    ProjectEntity,
    'id' | 'organization_id' | 'state'
>;

export function validateProjectEntity(
    body: Record<string, unknown>,
): ProjectEntityFields & { organization_id: string } {
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
    'state',
];

export interface ProjectDocumentBody {
    readonly entity: ProjectEntityFields;
    readonly state: ProjectState;
}

// The HTTP-body gate for PUT /projects/:id: entity fields
// plus domain `state`. organization_id is deliberately
// absent from the expected set (like every other org-owned
// write, the client never supplies it; the org fence stamps it
// downstream when view.projects.put re-validates through
// validateProjectEntity) yet rides the `optional` allowance
// rather than `expected` — a caller-forged organization_id is
// tolerated-but-ignored, not rejected, because the fence's
// stamp always overrides whatever key it finds. Entity fields
// are picked directly rather than delegated to
// validateProjectEntity — that function REQUIRES
// organization_id, which this body never carries pre-stamp.
export function validateProjectDocumentBody(
    body: Record<string, unknown>,
): ProjectDocumentBody {
    assertOnlyKeys(
        body, PROJECT_DOCUMENT_BODY_KEYS,
        'ProjectDocumentBody', ['organization_id'],
    );
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
        state: assertProjectState(
            pickString(body, 'state'),
            'ProjectDocumentBody.state',
        ),
    };
}

// The graph is NOT a FlowEntity key — it rides the flow
// document body as a native nested object (`graph`, plus
// write-side `graphDelta` / `revivals`). validateFlowEntity
// accepts only the flow's own scalar fields.
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
    // /flows/:id emits — a NATIVE nested object (the stored
    // tongue: storedGraph()'s shape); validated via
    // asStoredGraph and carried verbatim — the op never
    // re-serializes it.
    readonly graph: Record<string, unknown>;
    // SIDECAR-KEEP: graphDelta/revivals stay on the document
    // pair body permanently — deriveFlowGraphStates is the
    // sole ledger source of flow-node/edge deleted/restored
    // history. Phase Final Task 2 retired writeFlowGraphDelta
    // (the old-plane relation writer half).
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
    const graph = asObject(
        body['graph'], 'FlowDocumentBody.graph',
    );
    asStoredGraph(graph, 'FlowDocumentBody.graph');
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
    const flowGraph = asObject(
        body['flow_graph'], 'flow_graph',
    );
    asWorkOrderFlowGraph(
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
    const flowGraph = asObject(
        body['flow_graph'], 'flow_graph',
    );
    asWorkOrderFlowGraph(
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
        next_billing: validateTimestampField(
            body, 'next_billing', 'OrganizationEntity',
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
    'organization_id', 'identity_id', 'type', 'at',
];

const MEMBERSHIP_TYPES = [
    'admin', 'member',
] as const;

export function validateMembershipEntity(
    body: Record<string, unknown>,
): Omit<MembershipEntity, 'id'> {
    assertOnlyKeys(
        body, MEMBERSHIP_BODY_KEYS, 'MembershipEntity',
    );
    const type = validateEnumField(
        body, 'type', MEMBERSHIP_TYPES,
        'membership type', 'MembershipEntity',
    );
    const at = validateTimestampField(
        body, 'at', 'MembershipEntity',
    );
    return {
        organization_id: pickString(
            body, 'organization_id',
        ),
        identity_id: pickString(body, 'identity_id'),
        type,
        at,
    };
}

const MEMBERSHIP_DOCUMENT_BODY_KEYS: readonly string[] = [
    'organization_id', 'identity_id', 'type', 'at',
];

export interface MembershipDocumentBody {
    readonly entity: Omit<MembershipEntity, 'id'>;
}

// The HTTP-body gate for PUT /memberships/:id: the eighth
// family, and the FOURTH 'stateless' one. Membership carries
// a privilege attribute (`type`: admin | member) baked into
// access-token claims at mint — not a pure join. THE LABEL
// MANDATE (a NAMED byte-parity-over-convention choice, the
// Phase 7 Objective precedent): the assertOnlyKeys label is
// 'MembershipEntity', matching validateMembershipEntity
// byte-for-byte, NOT the 'MembershipDocumentBody' naming
// convention every other *DocumentBody validator uses — the
// label appears in the wire 400 body ("unexpected key ... for
// MembershipEntity"), and the convention's label would change
// those bytes. Every key here is REQUIRED. position/state
// rules do not apply; the fields are the SAME pickString/
// enum/timestamp calls validateMembershipEntity already
// makes, so the missing-key 400 stays byte-identical on both
// paths too.
export function validateMembershipDocumentBody(
    body: Record<string, unknown>,
): MembershipDocumentBody {
    assertOnlyKeys(
        body, MEMBERSHIP_DOCUMENT_BODY_KEYS, 'MembershipEntity',
    );
    const type = validateEnumField(
        body, 'type', MEMBERSHIP_TYPES,
        'membership type', 'MembershipEntity',
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
            type,
            at,
        },
    };
}

const SEAT_DOCUMENT_BODY_KEYS: readonly string[] = [
    'type', 'at',
];

export interface SeatDocumentBody {
    readonly type: MembershipType;
    readonly at: string;
}

// PUT organizations/:organization-id/members/:identity-id.
// Organization and identity ride the path. Privilege type
// and the moment of union ride the body.
export function validateSeatDocumentBody(
    body: Record<string, unknown>,
): SeatDocumentBody {
    assertOnlyKeys(
        body, SEAT_DOCUMENT_BODY_KEYS, 'SeatDocumentBody',
    );
    return {
        type: validateEnumField(
            body, 'type', MEMBERSHIP_TYPES,
            'membership type', 'SeatDocumentBody',
        ),
        at: validateTimestampField(
            body, 'at', 'SeatDocumentBody',
        ),
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

export interface InvitationTransitionBody {
    readonly state: 'accepted' | 'declined'
        | 'revoked';
    readonly membershipId?: string;
    readonly eventId: string;
    readonly at: string;
}

const INVITATION_TRANSITION_KEYS:
    readonly string[] = [
    'state', 'eventId', 'at',
];

export function validateInvitationTransitionBody(
    body: Record<string, unknown>,
): InvitationTransitionBody {
    assertOnlyKeys(
        body,
        INVITATION_TRANSITION_KEYS,
        'InvitationTransitionBody',
        ['membershipId'],
    );
    const state = pickString(body, 'state');
    if (
        state !== 'accepted'
        && state !== 'declined'
        && state !== 'revoked'
    ) {
        throw new ValidationError(
            'InvitationTransitionBody.state must'
            + ' be accepted, declined, or revoked',
        );
    }
    const membershipId = 'membershipId' in body
        ? pickString(body, 'membershipId')
        : undefined;
    if (state === 'accepted') {
        if (
            membershipId === undefined
            || membershipId === ''
        ) {
            throw new ValidationError(
                'membershipId must be non-empty',
            );
        }
    }
    return {
        state,
        ...(membershipId !== undefined
            ? { membershipId }
            : {}),
        eventId: pickString(body, 'eventId'),
        at: validateTimestampField(
            body, 'at',
            'InvitationTransitionBody.at',
        ),
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

// Entity-field body only — lifecycle trio is GET stamp /
// document-body, never part of this validator's key set.
export type ObjectiveEntityFields = Omit<
    ObjectiveEntity,
    'id' | 'organization_id' | 'state'
>;

export function validateObjectiveEntity(
    body: Record<string, unknown>,
): ObjectiveEntityFields & { organization_id: string } {
    assertOnlyKeys(
        body, OBJECTIVE_BODY_KEYS, 'Objective',
    );
    return {
        organization_id: pickString(body, 'organization_id'),
        position: pickNumber(body, 'position'),
    };
}

// The HTTP-body gate for PUT /objectives/:id: entity field
// plus the lifecycle trio — the fifth trio family (states-
// address retirement). The old absence-as-active covenant
// (R2) and the genesis dilemma are RETIRED: genesis is an
// explicit event minted at create, archive/reactivate ride
// this SAME address, and no states/:id pair ever carries an
// objective lifecycle again. THE LABEL MANDATE (a NAMED
// byte-parity-over-convention choice): the assertOnlyKeys
// label is 'Objective', matching TODAY'S store validator
// (validateObjectiveEntity) byte-for-byte, NOT the
// 'ObjectiveDocumentBody' naming convention every other
// *DocumentBody validator uses — the label appears in the
// wire 400 body ("unexpected key ... for Objective"), and
// the convention's label would change those bytes.
// organization_id is a TOLERATED-BUT-IGNORED optional
// allowance, never expected: the live client's PUT body
// carries entity fields plus the trio, but the seed's
// below-facade create bodies carry organization_id too
// (documentOperationOrganization's read-back shape in
// routes.ts, mirrored by every sibling *DocumentBody
// validator), and the org-scoped store always stamps
// organization_id downstream regardless of what it finds —
// so a caller-forged value is tolerated, never rejected.
// position's own rule (pickNumber) is IDENTICAL to
// validateObjectiveEntity's — the missing-position 400 is
// the SAME assertOnlyKeys call with the SAME label, so its
// message stays byte-identical on both paths.
const OBJECTIVE_DOCUMENT_BODY_KEYS: readonly string[] = [
    'position',
    'state',
];

export interface ObjectiveDocumentBody {
    readonly entity: ObjectiveEntityFields;
    readonly state: ObjectiveState;
}

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
        state: assertObjectiveState(
            pickString(body, 'state'),
            'ObjectiveDocumentBody.state',
        ),
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
// request/response. Request `message_hash` is the sha256
// digest (`shared/digest.ts` sha256Hex) of `message`,
// hex-encoded lowercase. The response row has no hash
// column and no status column.
const MESSAGE_HASH = /^[0-9a-f]{64}$/;

const HTTP_METHOD = /^[A-Z]+$/;
const OPERATION_ID = /^[0-9A-Za-z]{22}$/;

const REQUEST_BODY_KEYS: readonly string[] = [
    'uri_collection', 'uri_id', 'at', 'requester_identity_id',
    'message_hash', 'message', 'method', 'operation_id',
];

export function validateRequestEntity(
    body: Record<string, unknown>,
): Omit<RequestEntity, 'id'> {
    assertOnlyKeys(
        body, REQUEST_BODY_KEYS, 'RequestEntity',
    );
    const uriCollection = pickString(body, 'uri_collection');
    if (!uriCollection.endsWith('/')) {
        throw new ValidationError(
            'RequestEntity.uri_collection must end with "/"',
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
    const method = pickString(body, 'method');
    if (!HTTP_METHOD.test(method)) {
        throw new ValidationError(
            'RequestEntity.method must match ^[A-Z]+$',
        );
    }
    const operationId = pickString(body, 'operation_id');
    if (!OPERATION_ID.test(operationId)) {
        throw new ValidationError(
            'RequestEntity.operation_id must be a 22-'
            + 'character id',
        );
    }
    return {
        uri_collection: uriCollection,
        uri_id: pickString(body, 'uri_id'),
        at,
        requester_identity_id: pickString(
            body, 'requester_identity_id',
        ),
        message_hash: messageHash,
        message: pickString(body, 'message'),
        method,
        operation_id: operationId,
    };
}

const RESPONSE_BODY_KEYS: readonly string[] = [
    'uri_collection', 'uri_id', 'at', 'version',
    'message', 'operation_id',
];

export function validateResponseEntity(
    body: Record<string, unknown>,
): Omit<ResponseEntity, 'id'> {
    assertOnlyKeys(
        body, RESPONSE_BODY_KEYS, 'ResponseEntity',
    );
    const uriCollection = pickString(body, 'uri_collection');
    if (!uriCollection.endsWith('/')) {
        throw new ValidationError(
            'ResponseEntity.uri_collection must end with "/"',
        );
    }
    const version = pickString(body, 'version');
    if (!HEX64.test(version)) {
        throw new ValidationError(
            'ResponseEntity.version must be a 64-'
            + 'character lowercase hex digest',
        );
    }
    const at = validateTimestampField(
        body, 'at', 'ResponseEntity',
    );
    const operationId = pickString(body, 'operation_id');
    if (!OPERATION_ID.test(operationId)) {
        throw new ValidationError(
            'ResponseEntity.operation_id must be a 22-'
            + 'character id',
        );
    }
    return {
        uri_collection: uriCollection,
        uri_id: pickString(body, 'uri_id'),
        at,
        version,
        message: pickString(body, 'message'),
        operation_id: operationId,
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
        ['version'],
    );
    const version = body['version'];
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
        ...(typeof version === 'string'
            ? { version }
            : {}),
    };
}

const RECORD_BODY_KEYS: readonly string[] = [
    'organization_id', 'name', 'description', 'position',
];

// Entity-field body only — lifecycle trio is GET stamp /
// document-body, never part of this validator's key set.
export type RecordEntityFields = Omit<
    RecordEntity,
    'id' | 'organization_id' | 'state'
>;

export function validateRecordEntity(
    body: Record<string, unknown>,
): RecordEntityFields & { organization_id: string } {
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
    'state',
];

export interface RecordDocumentBody {
    readonly entity: RecordEntityFields;
    readonly state: RecordState;
}

// The HTTP-body gate for PUT /records/:id (Decision 7): the
// full wire document — the entity's own fields plus the
// lifecycle trio folded in. organization_id is deliberately
// absent from the expected set (like every other org-owned
// write, the client never supplies it; the org fence stamps
// it on the response) yet rides the `optional` allowance
// rather than `expected` — a caller-forged organization_id is
// tolerated-but-ignored, not rejected. The trio holds to the
// SAME rules the bare states/:id route applies to an event
// (assertRecordState, an RFC-3339 `at`, a non-empty event
// id). Phase Final Task 2: records ROW half stripped — this
// gate is the sole entity-shape check for the document PUT
// (validateRecordEntity REQUIRES organization_id, which this
// body never carries pre-stamp). Name non-empty re-homes here.
// Instance PATCH create body (Task 20). Wire carries
// exactly {set}; [] legal. clear is update-only — on
// create it is an unexpected key. Empty string values
// rejected at the body gate (G9); type/constraint
// conformance is validateInstanceValues after ACL.
export interface InstancePutBody {
    readonly set: {
        readonly attribute_id: string;
        readonly value: string;
    }[];
}

export function validateInstancePutBody(
    body: Record<string, unknown>,
): InstancePutBody {
    assertOnlyKeys(
        body, ['set'], 'InstancePutBody',
    );
    const raw = asArray(
        body['set'], 'InstancePutBody.set',
    );
    const set: {
        attribute_id: string;
        value: string;
    }[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < raw.length; i++) {
        const label =
            'InstancePutBody.set[' + i + ']';
        const entry = asObject(raw[i], label);
        assertOnlyKeys(
            entry,
            ['attribute_id', 'value'],
            label,
        );
        const attributeId = pickString(
            entry, 'attribute_id',
        );
        if (attributeId === '') {
            throw new ValidationError(
                label
                    + '.attribute_id must be non-empty',
            );
        }
        if (seen.has(attributeId)) {
            throw new ValidationError(
                'duplicate attribute_id "'
                    + attributeId
                    + '" in InstancePutBody.set',
            );
        }
        seen.add(attributeId);
        const value = pickString(entry, 'value');
        if (value === '') {
            throw new ValidationError(
                label + '.value must not be empty',
            );
        }
        set.push({
            attribute_id: attributeId,
            value,
        });
    }
    return { set };
}

// Instance PATCH body (Task 17): keys ⊆ {set, clear};
// both optional; effective emptiness → 400. set∩clear
// overlap → 400; duplicate id within set → 400; '' in
// set → 400 (G9). Value type/constraint conformance is
// validateInstanceValues after ACL (set only).
export interface InstancePatchBody {
    readonly set: {
        readonly attribute_id: string;
        readonly value: string;
    }[];
    readonly clear: string[];
}

// Shared set/clear dialect (instance PATCH + WO transition
// instance shape). `label` prefixes every error string so
// instance call sites pass 'InstancePatchBody' and keep
// every existing message BYTE-IDENTICAL.
export function validateValueDelta(
    body: Record<string, unknown>,
    label: string,
): {
    set: {
        attribute_id: string;
        value: string;
    }[];
    clear: string[];
} {
    const set: {
        attribute_id: string;
        value: string;
    }[] = [];
    const setSeen = new Set<string>();
    if ('set' in body) {
        const raw = asArray(
            body['set'], label + '.set',
        );
        for (let i = 0; i < raw.length; i++) {
            const entryLabel =
                label + '.set[' + i + ']';
            const entry = asObject(raw[i], entryLabel);
            assertOnlyKeys(
                entry,
                ['attribute_id', 'value'],
                entryLabel,
            );
            const attributeId = pickString(
                entry, 'attribute_id',
            );
            if (attributeId === '') {
                throw new ValidationError(
                    entryLabel
                        + '.attribute_id must be '
                        + 'non-empty',
                );
            }
            if (setSeen.has(attributeId)) {
                throw new ValidationError(
                    'duplicate attribute_id "'
                        + attributeId
                        + '" in ' + label + '.set',
                );
            }
            setSeen.add(attributeId);
            const value = pickString(entry, 'value');
            if (value === '') {
                throw new ValidationError(
                    entryLabel
                        + '.value must not be empty',
                );
            }
            set.push({
                attribute_id: attributeId,
                value,
            });
        }
    }
    const clear: string[] = [];
    const clearSeen = new Set<string>();
    if ('clear' in body) {
        const raw = asArray(
            body['clear'], label + '.clear',
        );
        for (let i = 0; i < raw.length; i++) {
            const entryLabel =
                label + '.clear[' + i + ']';
            const attributeId = raw[i];
            if (
                typeof attributeId !== 'string'
                || attributeId === ''
            ) {
                throw new ValidationError(
                    entryLabel
                        + ' must be a non-empty string',
                );
            }
            if (clearSeen.has(attributeId)) {
                throw new ValidationError(
                    'duplicate attribute_id "'
                        + attributeId
                        + '" in ' + label + '.clear',
                );
            }
            clearSeen.add(attributeId);
            clear.push(attributeId);
        }
    }
    for (const attributeId of clear) {
        if (setSeen.has(attributeId)) {
            throw new ValidationError(
                'attribute_id "'
                    + attributeId
                    + '" appears in both set and clear',
            );
        }
    }
    return { set, clear };
}

export function validateInstancePatchBody(
    body: Record<string, unknown>,
): InstancePatchBody {
    assertOnlyKeys(
        body, [], 'InstancePatchBody',
        ['set', 'clear'],
    );
    const { set, clear } = validateValueDelta(
        body, 'InstancePatchBody',
    );
    if (set.length + clear.length === 0) {
        throw new ValidationError(
            'InstancePatchBody requires a non-empty '
                + 'set or clear',
        );
    }
    return { set, clear };
}

export function validateRecordDocumentBody(
    body: Record<string, unknown>,
): RecordDocumentBody {
    assertOnlyKeys(
        body, RECORD_DOCUMENT_BODY_KEYS,
        'RecordDocumentBody', ['organization_id'],
    );
    const name = pickString(body, 'name');
    if (name === '') {
        throw new ValidationError(
            'RecordDocumentBody.name must be non-empty',
        );
    }
    return {
        entity: {
            name,
            description: pickString(body, 'description'),
            position: pickNumber(body, 'position'),
        },
        state: assertRecordState(
            pickString(body, 'state'),
            'RecordDocumentBody.state',
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
    const constraintsArr = asArray(
        body['constraints'], 'constraints',
    );
    const constraints = constraintsArr.map(
        (item, i) => {
            const constraint = asConstraint(
                item,
                'constraints[' + i + ']',
            );
            assertConstraintAppliesTo(
                constraint.kind,
                attributeType,
                'constraints[' + i + ']',
            );
            return constraint;
        },
    );
    const options = pickStringArray(
        body, 'options',
    );
    if (
        (attributeType === 'select'
            || attributeType === 'radio')
        && options.length === 0
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
        options,
        constraints,
    };
}

const RECORD_ATTRIBUTE_DOCUMENT_BODY_KEYS:
    readonly string[] = [
    'record_id', 'name', 'attribute_type',
    'sort_order', 'options', 'constraints',
];

// Optional on the flat wire (Task 8 alias window): omitted
// keys stamp DEFAULT_ATTRIBUTE_ACL_ROLES so storage never
// drifts from the nested create-stamp voice.
const RECORD_ATTRIBUTE_DOCUMENT_OPTIONAL_KEYS:
    readonly string[] = [
    'organization_id', 'read_roles', 'write_roles',
];

export interface RecordAttributeDocumentBody {
    readonly entity: {
        record_id: string;
        name: string;
        attribute_type: AttributeType;
        sort_order: number;
        options: string[];
        constraints: Constraint[];
        read_roles: string[];
        write_roles: string[];
    };
}

// The HTTP-body gate for PUT /record-attributes/:id: the
// sixth family, and the SECOND 'stateless' one (work-orders is
// the first) — no lifecycle trio is admitted, so a document PUT
// here is a pure entity edit. organization_id is deliberately
// absent from the expected set (like every other org-owned
// write, the client never supplies it; the org fence stamps it
// on the response) yet rides the `optional` allowance rather
// than `expected` — a caller-forged organization_id is
// tolerated-but-ignored, not rejected. Task 8: flat wire keeps
// record_id for the alias window; ACL defaults stamp on both
// create and replace so nothing drifts from nested storage.
// Phase Final Task 2: record_attributes ROW half stripped —
// this gate is the sole entity-shape check for the document
// PUT.
export function validateRecordAttributeDocumentBody(
    body: Record<string, unknown>,
): RecordAttributeDocumentBody {
    assertOnlyKeys(
        body, RECORD_ATTRIBUTE_DOCUMENT_BODY_KEYS,
        'RecordAttributeDocumentBody',
        RECORD_ATTRIBUTE_DOCUMENT_OPTIONAL_KEYS,
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
    const constraintsArr = asArray(
        body['constraints'], 'constraints',
    );
    const constraints = constraintsArr.map(
        (item, i) => {
            const constraint = asConstraint(
                item,
                'constraints[' + i + ']',
            );
            assertConstraintAppliesTo(
                constraint.kind,
                attributeType,
                'constraints[' + i + ']',
            );
            return constraint;
        },
    );
    const options = pickStringArray(
        body, 'options',
    );
    if (
        (attributeType === 'select'
            || attributeType === 'radio')
        && options.length === 0
    ) {
        throw new ValidationError(
            'RecordAttributeDocumentBody.options'
            + ' must list at least one option'
            + " for attribute_type '"
            + attributeType + "'",
        );
    }
    const defaultRoles: string[] = [
        ...DEFAULT_ATTRIBUTE_ACL_ROLES,
    ];
    const label = 'RecordAttributeDocumentBody';
    const readRoles = 'read_roles' in body
        ? pickNonEmptyStringArray(
            body, 'read_roles', label,
        )
        : [...defaultRoles];
    const writeRoles = 'write_roles' in body
        ? pickNonEmptyStringArray(
            body, 'write_roles', label,
        )
        : [...defaultRoles];
    return {
        entity: {
            record_id: pickString(body, 'record_id'),
            name,
            attribute_type: attributeType,
            sort_order: pickNumber(body, 'sort_order'),
            options,
            constraints,
            read_roles: readRoles,
            write_roles: writeRoles,
        },
    };
}

// Nested attribute document under a record-type address
// (Task 6). No record_id — parentage is the URI. Create
// stamps DEFAULT_ATTRIBUTE_ACL_ROLES when ACL keys are
// omitted; replace requires both keys (no silent drift
// back to defaults). Role strings are free non-empty
// strings; [] is legal (admins only via bypass).
export const NESTED_ATTRIBUTE_DOCUMENT_BODY_KEYS = [
    'name', 'attribute_type', 'sort_order',
    'options', 'constraints',
    'read_roles', 'write_roles',
] as const;

const NESTED_ATTRIBUTE_CORE_KEYS = [
    'name', 'attribute_type', 'sort_order',
    'options', 'constraints',
] as const;

const NESTED_ATTRIBUTE_ACL_KEYS = [
    'read_roles', 'write_roles',
] as const;

export interface AttributeDocument {
    name: string;
    attribute_type: AttributeType;
    sort_order: number;
    options: string[];
    constraints: Constraint[];
    read_roles: string[];
    write_roles: string[];
}

function pickNonEmptyStringArray(
    body: Record<string, unknown>,
    key: string,
    entityLabel: string,
): string[] {
    const arr = asArray(body[key], key);
    return arr.map((item, i) => {
        const s = asString(item, key + '[' + i + ']');
        if (s === '') {
            throw new ValidationError(
                entityLabel + '.' + key + '['
                + i + '] must be non-empty',
            );
        }
        return s;
    });
}

function validateAttributeDocument(
    body: Record<string, unknown>,
    mode: 'create' | 'replace',
): AttributeDocument {
    const label = 'AttributeDocumentBody';
    if (mode === 'create') {
        assertOnlyKeys(
            body,
            NESTED_ATTRIBUTE_CORE_KEYS,
            label,
            NESTED_ATTRIBUTE_ACL_KEYS,
        );
    } else {
        assertOnlyKeys(
            body,
            NESTED_ATTRIBUTE_DOCUMENT_BODY_KEYS,
            label,
        );
    }
    const name = pickString(body, 'name');
    if (name === '') {
        throw new ValidationError(
            label + '.name must be non-empty',
        );
    }
    const attributeType = asAttributeType(
        body['attribute_type'],
        label + '.attribute_type',
    );
    const constraintsArr = asArray(
        body['constraints'], 'constraints',
    );
    const constraints = constraintsArr.map(
        (item, i) => {
            const constraint = asConstraint(
                item,
                'constraints[' + i + ']',
            );
            assertConstraintAppliesTo(
                constraint.kind,
                attributeType,
                'constraints[' + i + ']',
            );
            return constraint;
        },
    );
    const options = pickStringArray(body, 'options');
    if (
        (attributeType === 'select'
            || attributeType === 'radio')
        && options.length === 0
    ) {
        throw new ValidationError(
            label + '.options'
            + ' must list at least one option'
            + " for attribute_type '"
            + attributeType + "'",
        );
    }
    const defaultRoles: string[] = [
        ...DEFAULT_ATTRIBUTE_ACL_ROLES,
    ];
    const readRoles = 'read_roles' in body
        ? pickNonEmptyStringArray(
            body, 'read_roles', label,
        )
        : [...defaultRoles];
    const writeRoles = 'write_roles' in body
        ? pickNonEmptyStringArray(
            body, 'write_roles', label,
        )
        : [...defaultRoles];
    return {
        name,
        attribute_type: attributeType,
        sort_order: pickNumber(body, 'sort_order'),
        options,
        constraints,
        read_roles: readRoles,
        write_roles: writeRoles,
    };
}

export function validateAttributeDocumentCreate(
    body: Record<string, unknown>,
): AttributeDocument {
    return validateAttributeDocument(body, 'create');
}

export function validateAttributeDocumentReplace(
    body: Record<string, unknown>,
): AttributeDocument {
    return validateAttributeDocument(body, 'replace');
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

// A flow tag's own NAME is the FIRST user-authored address
// segment this codebase validates (every prior :id path segment
// is either server-generated or a client-picked-but-opaque
// identifier never rendered) — pinned at least as strict as
// GRAPH_ID_ALPHABET above, plus a length cap, since an address
// segment has no natural bound the way a body field's own
// pickString does.
const FLOW_TAG_NAME_MAX_LENGTH = 64;
const FLOW_TAG_NAME_ALPHABET = /^[A-Za-z0-9_-]+$/;

export function validateFlowTagName(value: string): string {
    if (
        value.length > FLOW_TAG_NAME_MAX_LENGTH
        || !FLOW_TAG_NAME_ALPHABET.test(value)
    ) {
        throw new ValidationError(
            'flow tag name must contain only [A-Za-z0-9_-],'
            + ' 1-' + FLOW_TAG_NAME_MAX_LENGTH
            + ' characters, got ' + value,
        );
    }
    return value;
}

// The tag's own body (design decision — Step 0, Phase 14 Task
// 9): MINIMAL — the pinned response id of the flow document pair
// this tag names, and nothing else. `flow_id` is never a client
// key here (the address's own :id segment already names it; the
// route stamps it onto the wire response) — Omit<FlowTagEntity,
// 'id' | 'flow_id'> mirrors validateFlowRecordEntity's own
// Omit<_, 'id'> shape, one field narrower.
const FLOW_TAG_BODY_KEYS: readonly string[] = ['flow_response_id'];

export function validateFlowTagEntity(
    body: Record<string, unknown>,
): Omit<FlowTagEntity, 'id' | 'flow_id'> {
    assertOnlyKeys(body, FLOW_TAG_BODY_KEYS, 'FlowTagEntity');
    const flowResponseId = pickString(body, 'flow_response_id');
    if (flowResponseId === '') {
        throw new ValidationError(
            'FlowTagEntity.flow_response_id must be non-empty',
        );
    }
    return { flow_response_id: flowResponseId };
}

export interface RecordWriteCreateBody {
    readonly kind: 'create';
    readonly id: RecordId;
    readonly record:
        RecordEntityFields & { organization_id: string };
    readonly attributes: readonly RecordAttributeEntity[];
    readonly initialState: RecordState;
    readonly initialStateEventId: string;
    readonly initialStateAt: string;
}

export interface RecordWriteEditBody {
    readonly kind: 'edit';
    readonly id: RecordId;
    readonly record:
        RecordEntityFields & { organization_id: string };
    readonly attributes: readonly RecordAttributeEntity[];
    // Domain `state` only — same as the document PUT body
    // the synthesized pair must match.
    readonly state: RecordState;
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
    'state',
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
        const state = assertRecordState(
            pickString(body, 'state'),
            'RecordWriteEditBody.state',
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
    readonly initialState: ObjectiveState;
    readonly initialStateEventId: string;
    readonly initialStateAt: string;
}

const OBJECTIVE_CREATE_KEYS: readonly string[] = [
    'id', 'objective', 'revisionId', 'revision',
    'initialState', 'initialStateEventId', 'initialStateAt',
];

// The HTTP-body gate for POST /objectives: the objective row
// plus its FIRST revision and the genesis lifecycle trio,
// written atomically. Genesis is an explicit event minted at
// create (states-address retirement); the trio folds onto
// the document pair via objectiveDocumentBodyOf. The
// objective fields are NOT fully validated here: the org-
// scoped store stamps organization_id from the verified
// token and re-validates through validateObjectiveEntity
// AFTER the stamp, so the body OMITS it. The revision sub-
// object is re-validated by the objective_revisions store's
// own validator; its member_id is a row column (who authored
// the definition), not state authorship.
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
    const initialState = assertObjectiveState(
        pickString(body, 'initialState'),
        'ObjectiveCreateBody.initialState',
    );
    const initialStateEventId = pickString(
        body, 'initialStateEventId',
    );
    if (initialStateEventId === '') {
        throw new ValidationError(
            'ObjectiveCreateBody.initialStateEventId'
            + ' must be non-empty',
        );
    }
    const initialStateAt = validateTimestampField(
        body, 'initialStateAt', 'ObjectiveCreateBody',
    );
    return {
        id, objective, revisionId, revision,
        initialState, initialStateEventId, initialStateAt,
    };
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

// The HTTP-body gate for POST /flows: the flow scalars, its
// project_flows join, the initial state event, and the
// initial graphDelta (native write-side sidecar for the
// default graph), written atomically as message pairs. The
// facet fields are NOT fully validated here — the org-
// scoped flows path stamps organization_id from the
// verified token and re-validates through
// validateFlowEntity AFTER the stamp (so the body OMITS
// organization_id), and the project_flows path re-validates
// the join through validateProjectFlowEntity when the
// composing POST puts it. Authorship of the initial event
// is stamped from the verified caller in the route, never
// the body; initialState is carried for symmetry with the
// other create endpoints (the flow creation paths pin it to
// 'active') and validated non-empty. graphDelta is the
// pre-built native delta for the default graph (2 nodes, 0
// edges, 0 member/attribute events) — validated here at the
// HTTP gate via validateFlowGraphDelta.
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

// Undo-as-replay (Phase 14 Task 8): the body shrinks to the
// state trio's two free fields — every OTHER field the old
// 6-field body carried (`flow`, `consumedVersionId`, `graph`,
// `graphDelta`, `revivals`) is now resolved/computed
// SERVER-SIDE (api/derive-flows.ts's resolveFlowUndoTarget,
// api/flow-graph-diff.ts) from the pair-plane, never the wire.
// Both remaining fields stay (not dropped to an empty body):
// an empty body would make every undo POST for the same flow
// canonically byte-identical (same method/path/headers),
// colliding on the gate's pre-tx idempotency fast path
// (storedResponseFor) and silently replaying the FIRST call's
// cached 204 for every later undo. `eventId`/`at` are the SAME
// state-trio convention every other document write already
// uses to keep each attempt's stored request unique — S1 (body
// timestamps belong to the message's creator), never
// pair.requestAt.
export interface FlowUndoBody {
    readonly eventId: string;
    readonly at: string;
}

const FLOW_UNDO_KEYS: readonly string[] = ['eventId', 'at'];

// The revivals array gate, shared by the flows/:id document
// body and (through Phase 13) the retired undo body: each
// element is the deletion/revival triple, so the route can
// post a 'restored' event that supersedes a prior tombstone.
// `label` names the enclosing body.
function validateRevivals(
    value: unknown,
    label: string,
): GraphRevival[] {
    return asArray(value, label).map((item, i) =>
        validateGraphTriple(item, label + '[' + i + ']'),
    );
}

// The HTTP-body gate for POST /flows/:id/undo: just the
// 'updated' state event's own trio fields — eventId non-empty,
// at a valid timestamp. The restore target, the flow row's
// scalar fields, the graph, and the graphDelta/revivals
// sidecars are ALL resolved/computed by the route itself
// (api/routes.ts) from the pair plane, never from this body.
export function validateFlowUndoBody(
    body: Record<string, unknown>,
): FlowUndoBody {
    assertOnlyKeys(body, FLOW_UNDO_KEYS, 'FlowUndoBody');
    const eventId = pickString(body, 'eventId');
    if (eventId === '') {
        throw new ValidationError(
            'FlowUndoBody.eventId must be non-empty',
        );
    }
    const at = validateTimestampField(
        body, 'at', 'FlowUndoBody',
    );
    return { eventId, at };
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

// Dual-tolerant body shapes (Task 4 dual-accept; Task 8
// gate cut): the LIVE gate rejects the fieldValues key in
// the dispatch arrow. This validator still accepts BOTH
// shapes for the below-facade / stored-data tier (seed
// pure-moves, history fold of stored pairs). Discriminated
// on the presence of the `fieldValues` key.
export interface WorkOrderLegacyTransitionBody {
    readonly kind: 'legacy';
    readonly transitionEventId: string;
    readonly targetState: string;
    readonly fieldValues:
        readonly WorkOrderTransitionFieldValue[];
    readonly release: WorkOrderTransitionRelease | null;
    readonly transitionAt: string;
}

export interface WorkOrderInstanceTransitionBody {
    readonly kind: 'instance';
    readonly transitionEventId: string;
    readonly targetState: string;
    readonly instanceId: string | null;
    readonly recordTypeId: string | null;
    readonly set: {
        readonly attribute_id: string;
        readonly value: string;
    }[];
    readonly clear: string[];
    readonly release: WorkOrderTransitionRelease | null;
    readonly transitionAt: string;
}

export type WorkOrderTransitionBody =
    | WorkOrderLegacyTransitionBody
    | WorkOrderInstanceTransitionBody;

const WORK_ORDER_LEGACY_TRANSITION_KEYS:
    readonly string[] = [
        'transitionEventId', 'targetState',
        'fieldValues', 'release', 'transitionAt',
    ];

const WORK_ORDER_INSTANCE_TRANSITION_KEYS:
    readonly string[] = [
        'transitionEventId', 'targetState',
        'release', 'transitionAt',
    ];

const WORK_ORDER_INSTANCE_TRANSITION_OPTIONAL:
    readonly string[] = [
        'instance_id', 'record_type_id',
        'set', 'clear',
    ];

const TRANSITION_RELEASE_KEYS: readonly string[] = [
    'id', 'state', 'at',
];

const TRANSITION_FIELD_VALUE_KEYS: readonly string[] = [
    'id', 'fields',
];

function parseTransitionRelease(
    rawRelease: unknown,
): WorkOrderTransitionRelease | null {
    if (rawRelease === null) return null;
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
    return { id, state, at };
}

// Legacy fieldValues branch — stored-data / below-facade
// tier only (Task 8 cut the live gate). kind:'legacy'.
// Every valid legacy body carries the fieldValues key;
// hybrids 400 in assertOnlyKeys.
function validateWorkOrderLegacyTransitionBody(
    body: Record<string, unknown>,
): WorkOrderLegacyTransitionBody {
    assertOnlyKeys(
        body,
        WORK_ORDER_LEGACY_TRANSITION_KEYS,
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
            'WorkOrderTransitionBody.fieldValues['
            + i + ']';
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
        const fields = asObject(
            row['fields'], label + '.fields',
        );
        // Wire delta (4) — MANDATORY (Phase 15 Task 3): a
        // transition-fold field value may only name THIS
        // transaction's own transitionEventId. Dangling,
        // foreign, or absent state_event_id values are
        // unmintable prospectively (historical orphans still
        // render via tier semantics on the read path). Shipped
        // UI always sends the transaction's own id; only a
        // forged client observes this 400. Soft-read so
        // absent folds into the same message as a mismatch
        // rather than pickString's type-error voice.
        const rawStateEventId = fields['state_event_id'];
        const stateEventId =
            typeof rawStateEventId === 'string'
                ? rawStateEventId
                : '';
        if (stateEventId !== transitionEventId) {
            throw new ValidationError(
                label + '.fields.state_event_id must equal'
                + ' transitionEventId',
            );
        }
        // Phase Final Task 2: re-home store put validation —
        // field values ride the op pair body only.
        validateStateFieldValueEntity(fields);
        return { id, fields };
    });
    const release = parseTransitionRelease(body['release']);
    const transitionAt = validateTimestampField(
        body, 'transitionAt',
        'WorkOrderTransitionBody',
    );
    return {
        kind: 'legacy',
        transitionEventId, targetState,
        fieldValues, release, transitionAt,
    };
}

// Instance set/clear branch (Task 4 dual-accept window).
// A2: bind-assert fields required with set/clear and
// forbidden on pure moves (one-dialect-per-shape).
function validateWorkOrderInstanceTransitionBody(
    body: Record<string, unknown>,
): WorkOrderInstanceTransitionBody {
    assertOnlyKeys(
        body,
        WORK_ORDER_INSTANCE_TRANSITION_KEYS,
        'WorkOrderTransitionBody',
        WORK_ORDER_INSTANCE_TRANSITION_OPTIONAL,
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
    const instanceId =
        pickOptionalString(
            body, 'instance_id',
            'WorkOrderTransitionBody',
        ) ?? null;
    const recordTypeId =
        pickOptionalString(
            body, 'record_type_id',
            'WorkOrderTransitionBody',
        ) ?? null;
    const valueBearing =
        'set' in body || 'clear' in body;
    let set: {
        attribute_id: string;
        value: string;
    }[] = [];
    let clear: string[] = [];
    if (valueBearing) {
        const delta = validateValueDelta(
            body, 'WorkOrderTransitionBody',
        );
        set = delta.set;
        clear = delta.clear;
        if (set.length + clear.length === 0) {
            throw new ValidationError(
                'WorkOrderTransitionBody requires a'
                + ' non-empty set or clear',
            );
        }
    }
    if (
        valueBearing
        && (instanceId === null
            || recordTypeId === null)
    ) {
        throw new ValidationError(
            'WorkOrderTransitionBody.instance_id and'
            + ' .record_type_id are required with'
            + ' set/clear',
        );
    }
    if (
        !valueBearing
        && (instanceId !== null
            || recordTypeId !== null)
    ) {
        throw new ValidationError(
            'WorkOrderTransitionBody.instance_id and'
            + ' .record_type_id are forbidden on a'
            + ' pure move',
        );
    }
    const release = parseTransitionRelease(body['release']);
    const transitionAt = validateTimestampField(
        body, 'transitionAt',
        'WorkOrderTransitionBody',
    );
    return {
        kind: 'instance',
        transitionEventId, targetState,
        instanceId, recordTypeId,
        set, clear, release, transitionAt,
    };
}

// Body gate for POST /work-orders/:id/transition (and the
// below-facade seed tier). Dual-tolerant: `fieldValues`
// key → legacy; else instance. The LIVE route dispatch
// rejects fieldValues before this runs (Task 8 CUT).
// Authorship of the transition event AND the release event
// is stamped from the verified caller in the route, never
// the body.
export function validateWorkOrderTransitionBody(
    body: Record<string, unknown>,
): WorkOrderTransitionBody {
    if ('fieldValues' in body) {
        return validateWorkOrderLegacyTransitionBody(
            body,
        );
    }
    return validateWorkOrderInstanceTransitionBody(body);
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
const WORK_ORDER_CLAIM_OPTIONAL: readonly string[] = [
    'expires_at',
];

export interface WorkOrderClaimBody {
    readonly claimEventId: string;
    readonly claimAt: string;
    readonly expireEventId: string;
    readonly expireAt: string;
    readonly expiresAt?: string;
}

// Gate for PUT /work-orders/:id/claim. The caller mints
// both event ids and timestamps; the route reads them via
// this validator and never calls generateCryptoSafeBase62
// for the claim events. Authorship is server-derived
// (actor for 'claimed', prior.member_id for
// 'claim_expired') — never supplied by the caller.
// expires_at is the stored claim-document fact; "claimed
// now" is judged at read against the clock.
export function validateWorkOrderClaimBody(
    body: Record<string, unknown>,
): WorkOrderClaimBody {
    assertOnlyKeys(
        body, WORK_ORDER_CLAIM_KEYS, 'WorkOrderClaimBody',
        WORK_ORDER_CLAIM_OPTIONAL,
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
    const expiresAt = Object.hasOwn(body, 'expires_at')
        ? validateTimestampField(
            body, 'expires_at', 'WorkOrderClaimBody',
        )
        : undefined;
    if (expiresAt === undefined) {
        return {
            claimEventId, claimAt, expireEventId, expireAt,
        };
    }
    return {
        claimEventId, claimAt, expireEventId, expireAt,
        expiresAt,
    };
}

const WORK_ORDER_RELEASE_KEYS: readonly string[] = [
    'releaseEventId', 'releaseAt',
];

export interface WorkOrderReleaseBody {
    readonly releaseEventId: string;
    readonly releaseAt: string;
}

// Gate for the retired POST /work-orders/:id/release
// body (legacy derive only). Live release is DELETE
// /work-orders/:id/claim (no body). The caller minted
// the event id and timestamp; authorship is server-
// derived (actor).
export function validateWorkOrderReleaseBody(
    body: Record<string, unknown>,
): WorkOrderReleaseBody {
    assertOnlyKeys(
        body, WORK_ORDER_RELEASE_KEYS, 'WorkOrderReleaseBody',
    );
    const releaseEventId = pickString(body, 'releaseEventId');
    if (releaseEventId === '') {
        throw new ValidationError(
            'WorkOrderReleaseBody.releaseEventId'
            + ' must be non-empty',
        );
    }
    const releaseAt = validateTimestampField(
        body, 'releaseAt', 'WorkOrderReleaseBody',
    );
    return { releaseEventId, releaseAt };
}

const WORK_ORDER_BINDING_KEYS: readonly string[] = [
    'instance_id', 'record_type_id',
];

export interface WorkOrderBindingBody {
    readonly instanceId: string;
    readonly recordTypeId: string;
}

// Gate for PUT /work-orders/:id/binding. Two opaque ids only —
// no timestamps, no event ids. The CURRENT bind derives from
// the pair prefix (workOrderBindingFor); rebind is 409.
export function validateWorkOrderBindingBody(
    body: Record<string, unknown>,
): WorkOrderBindingBody {
    assertOnlyKeys(
        body, WORK_ORDER_BINDING_KEYS,
        'WorkOrderBindingBody',
    );
    const instanceId = pickString(body, 'instance_id');
    if (instanceId === '') {
        throw new ValidationError(
            'WorkOrderBindingBody.instance_id'
            + ' must be non-empty',
        );
    }
    const recordTypeId = pickString(
        body, 'record_type_id',
    );
    if (recordTypeId === '') {
        throw new ValidationError(
            'WorkOrderBindingBody.record_type_id'
            + ' must be non-empty',
        );
    }
    return { instanceId, recordTypeId };
}

export interface AIMemberEditBody {
    readonly detail: Record<string, unknown>;
    readonly state: MemberState;
    readonly stateAt: string;
    readonly stateEventId: string;
}

const AI_MEMBER_EDIT_KEYS: readonly string[] = [
    'detail',
    'state', 'stateAt', 'stateEventId',
];

// The HTTP-body gate for POST /ai-members/:id: the parent
// member row plus the ai_members detail row re-put. The edit
// body ECHOES the current lifecycle trio verbatim; a byte-
// identical echoed members/:id body folds by message_hash
// (the memberDocument fold, api/message-pair.ts) so an echo
// never mints a phantom transition. As with create, the
// ai_members store re-validates its own body when the
// composing POST puts it; the id is the route param, the
// member type is a server-supplied fact.
export function validateAIMemberEditBody(
    body: Record<string, unknown>,
): AIMemberEditBody {
    assertOnlyKeys(
        body, AI_MEMBER_EDIT_KEYS, 'AIMemberEditBody',
    );
    const detail = asObject(
        body['detail'], 'AIMemberEditBody.detail',
    );
    const state = assertMemberState(
        pickString(body, 'state'),
        'AIMemberEditBody.state',
    );
    const stateEventId = pickString(body, 'stateEventId');
    if (stateEventId === '') {
        throw new ValidationError(
            'AIMemberEditBody.stateEventId must be non-empty',
        );
    }
    const stateAt = validateTimestampField(
        body, 'stateAt', 'AIMemberEditBody',
    );
    return { detail, state, stateAt, stateEventId };
}

export interface HumanMemberEditBody {
    readonly detail: Record<string, unknown>;
    readonly state: MemberState;
    readonly stateAt: string;
    readonly stateEventId: string;
}

const HUMAN_MEMBER_EDIT_KEYS: readonly string[] = [
    'detail',
    'state', 'stateAt', 'stateEventId',
];

// The HTTP-body gate for POST /human-members/:id: the member
// and identity facets re-pin, the detail facet re-puts. The
// edit body ECHOES the current lifecycle trio verbatim; a
// byte-identical echoed members/:id body folds by
// message_hash (the memberDocument fold) so an echo never
// mints a phantom transition. PII no longer rides this body
// (Phase 10 Task 2's intake decomposition) — it changes ONLY
// via the separate PUT identities/:id/pii, fired by the
// client IFF the caller's dirty check finds it changed. As
// with create, the detail facet is NOT fully validated here —
// human_members re-validates its own body when the composing
// POST puts it; the id is the route param, the member type
// and identity kind are server-supplied facts.
export function validateHumanMemberEditBody(
    body: Record<string, unknown>,
): HumanMemberEditBody {
    assertOnlyKeys(
        body, HUMAN_MEMBER_EDIT_KEYS, 'HumanMemberEditBody',
    );
    const detail = asObject(
        body['detail'], 'HumanMemberEditBody.detail',
    );
    const state = assertMemberState(
        pickString(body, 'state'),
        'HumanMemberEditBody.state',
    );
    const stateEventId = pickString(body, 'stateEventId');
    if (stateEventId === '') {
        throw new ValidationError(
            'HumanMemberEditBody.stateEventId'
            + ' must be non-empty',
        );
    }
    const stateAt = validateTimestampField(
        body, 'stateAt', 'HumanMemberEditBody',
    );
    return { detail, state, stateAt, stateEventId };
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
