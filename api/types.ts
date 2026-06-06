import {
    validateStringArrayJson,
    validateStringNumberRecordJson,
} from './validators.ts';

export type Id = string;

export type MemberId = Id;

export type ModelId = Id;

export interface ProviderModel {
    id: ModelId;
    provider: string;
    name: string;
    // The vendor's real API model id (for brokering).
    api_name: string;
}

export type MemberKind = 'human' | 'ai' | 'system';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type RecordId = Id;
export type RecordAttributeId = Id;
export type FlowRecordId = Id;

export const ATTRIBUTE_TYPES = [
    'text',
    'number',
    'select',
    'radio',
    'date',
    'checkbox',
] as const;

export type AttributeType = typeof ATTRIBUTE_TYPES[number];

export type Constraint =
    | { kind: 'regex'; pattern: string }
    | { kind: 'range_min'; min: string }
    | { kind: 'range_max'; max: string };

// Hidden is encoded by absence from the array, so
// hidden + isRequired is structurally impossible.
export interface NodeAttribute {
    attribute_id: RecordAttributeId;
    mode: 'editable' | 'readonly';
    isRequired: boolean;
}

export const MEMBER_STATES = [
    'active',
    'pending',
    'archived',
] as const;

export type MemberState = typeof MEMBER_STATES[number];

export const IDEA_STATES = [
    'active',
    'in-review',
    'approved',
    'promoted',
    'sent-back',
    'archived',
    'deleted',
] as const;

export type IdeaState = typeof IDEA_STATES[number];

export const IDEA_READINESS = [
    'incomplete',
    'ready',
] as const;

export type IdeaReadiness =
    typeof IDEA_READINESS[number];

export type DimensionKey =
    | 'driver'
    | 'analytical'
    | 'expressive'
    | 'amiable';

const DIMENSION_KEYS:
    readonly DimensionKey[] = [
    'driver',
    'analytical',
    'expressive',
    'amiable',
];

export function isDimensionKey(
    v: string,
): v is DimensionKey {
    return (DIMENSION_KEYS as readonly string[])
        .includes(v);
}

export const PROJECT_STATES = [
    'submitted',
    'under-review',
    'sent-back',
    'approved',
    'declined',
    'archived',
    'deleted',
] as const;

export type ProjectState = typeof PROJECT_STATES[number];

// 'updated' marks content-change events; the
// other three are lifecycle.
export const FLOW_STATES = [
    'active',
    'archived',
    'deleted',
    'updated',
] as const;

export type FlowState = typeof FLOW_STATES[number];

export const RECORD_STATES = [
    'active',
    'archived',
    'deleted',
] as const;

export type RecordState = typeof RECORD_STATES[number];

export const OBJECTIVE_STATES = [
    'active',
    'archived',
] as const;

export type ObjectiveState =
    typeof OBJECTIVE_STATES[number];

export type StoredBoolean = 0 | 1;

export type JsonArrayField = string & {
    readonly __brand: 'JsonArrayField';
};

export type JsonObjectField = string & {
    readonly __brand: 'JsonObjectField';
};

export function jsonArrayField(
    value: unknown[],
): JsonArrayField {
    return JSON.stringify(
        value,
    ) as JsonArrayField;
}

export function jsonObjectField(
    value: Record<string, unknown>,
): JsonObjectField {
    return JSON.stringify(
        value,
    ) as JsonObjectField;
}

function includes<T extends string>(
    values: readonly T[],
    v: string,
): v is T {
    return (values as readonly string[])
        .includes(v);
}

const CONFIDENCE_LEVELS:
    readonly ConfidenceLevel[]
    = ['high', 'medium', 'low'];

export function isConfidenceLevel(
    v: string,
): v is ConfidenceLevel {
    return includes(
        CONFIDENCE_LEVELS, v,
    );
}

export function isAttributeType(
    v: string,
): v is AttributeType {
    return includes(ATTRIBUTE_TYPES, v);
}

export function assertAttributeType(
    v: string,
    label: string,
): AttributeType {
    if (!includes(ATTRIBUTE_TYPES, v)) {
        throw new Error(
            'expected AttributeType for '
                + label + ', got ' + v,
        );
    }
    return v;
}

export function assertConstraintAppliesTo(
    kind: Constraint['kind'],
    attributeType: AttributeType,
    label: string,
): void {
    if (kind === 'regex') {
        if (attributeType !== 'text') {
            throw new Error(
                "'regex' constraint requires"
                + " attribute_type 'text' for "
                + label + ", got "
                + attributeType,
            );
        }
        return;
    }
    if (
        attributeType !== 'number'
        && attributeType !== 'date'
    ) {
        throw new Error(
            "'" + kind + "' constraint"
            + " requires attribute_type"
            + " 'number' or 'date' for "
            + label + ', got '
            + attributeType,
        );
    }
}

export function isProjectState(
    v: string,
): v is ProjectState {
    return includes(
        PROJECT_STATES, v,
    );
}

export function assertProjectState(
    v: string,
    label: string,
): ProjectState {
    if (!includes(PROJECT_STATES, v)) {
        throw new Error(
            'expected ProjectState for '
                + label + ', got ' + v,
        );
    }
    return v;
}

export function isIdeaState(
    v: string,
): v is IdeaState {
    return includes(
        IDEA_STATES, v,
    );
}

export function assertIdeaState(
    v: string,
    label: string,
): IdeaState {
    if (!includes(IDEA_STATES, v)) {
        throw new Error(
            'expected IdeaState for '
                + label + ', got ' + v,
        );
    }
    return v;
}

export function isMemberState(
    v: string,
): v is MemberState {
    return includes(
        MEMBER_STATES, v,
    );
}

export function assertMemberState(
    v: string,
    label: string,
): MemberState {
    if (!includes(MEMBER_STATES, v)) {
        throw new Error(
            'expected MemberState for '
                + label + ', got ' + v,
        );
    }
    return v;
}

export function isFlowState(
    v: string,
): v is FlowState {
    return includes(FLOW_STATES, v);
}

export function assertFlowState(
    v: string,
    label: string,
): FlowState {
    if (!includes(FLOW_STATES, v)) {
        throw new Error(
            'expected FlowState for '
                + label + ', got ' + v,
        );
    }
    return v;
}

export function isRecordState(
    v: string,
): v is RecordState {
    return includes(RECORD_STATES, v);
}

export function assertRecordState(
    v: string,
    label: string,
): RecordState {
    if (!includes(RECORD_STATES, v)) {
        throw new Error(
            'expected RecordState for '
                + label + ', got ' + v,
        );
    }
    return v;
}

export function isObjectiveState(
    v: string,
): v is ObjectiveState {
    return includes(OBJECTIVE_STATES, v);
}

export function assertObjectiveState(
    v: string,
    label: string,
): ObjectiveState {
    if (!includes(OBJECTIVE_STATES, v)) {
        throw new Error(
            'expected ObjectiveState for '
                + label + ', got ' + v,
        );
    }
    return v;
}

export const MS_PER_SECOND = 1000;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
export const MS_PER_DAY =
    SECONDS_PER_DAY * MS_PER_SECOND;
export const COST_DIVISOR = 1000;

const BILLION = 1_000_000_000;
const MILLION = 1_000_000;
const THOUSAND = 1_000;
const BILLION_PRECISION = 2;
const MILLION_PRECISION = 1;

export function formatCompactCurrency(
    value: number,
): string {
    if (value >= BILLION)
        return `$${(value / BILLION).toFixed(BILLION_PRECISION)}B`;
    if (value >= MILLION)
        return `$${(value / MILLION).toFixed(MILLION_PRECISION)}M`;
    if (value >= THOUSAND)
        return `$${Math.round(value / THOUSAND)}K`;
    return `$${value}`;
}

export function nowUtc(): string {
    return new Date().toISOString();
}

export function msSinceUtc(
    iso: string,
): number {
    return Date.now()
        - new Date(iso).getTime();
}

export interface StateEntity {
    id: Id;
    entity_id: Id;
    state: string;
    member_id: Id;
    at: string;
}

export const SYSTEM_MEMBER_ID: Id = 'system';

export const SYSTEM_MEMBER_NAME = 'System';

// A principal that spans the whole platform. `kind` is the
// NATURE of the principal — a person (a human being) or a
// service (an automated agent / API client / the platform
// itself) — NOT a statement about whether it has sensitive
// data. Both kinds carry sensitive facets: persons an
// identity_pii row, services credentials (SP-5). The id is
// the universal key: member.id === identity.id, always.
export type IdentityKind = 'person' | 'service';

export interface IdentityEntity {
    id: Id;
    kind: IdentityKind;
}

// The person-PII facet, keyed by the shared identity id. A
// separately-erasable row: erasing PII splices THIS row;
// the identity, the member, and every member_id reference
// survive. Services have no row here (their secrets live in
// identity_credentials). All fields NOT NULL — absence of
// the row, not a null column, models erased PII.
export interface IdentityPiiEntity {
    id: Id;
    name: string;
    email: string;
    phone: string;
    bio: string;
}

export type IdentityCredentialKind =
    | 'password'        // person: interactive secret
    | 'client_secret';  // service: shared secret

export type IdentityCredentialStatus =
    | 'set' | 'rotated' | 'revoked';

// Append-only credential lifecycle event. One row per
// event; current validity = the latest event per
// (identity_id, kind). `secret` is OPAQUE material
// projected out at every read route (api.ts `withoutSecret`),
// so it never crosses the API boundary — never rendered.
// Revocation is a NEW 'revoked' event, never a splice
// (contrast identity_pii). Real crypto and the OAuth
// stores (clients, identity_tokens, identity_providers)
// are SP-5; this is only the seam.
export interface IdentityCredentialEntity {
    id: Id;
    identity_id: Id;
    kind: IdentityCredentialKind;
    status: IdentityCredentialStatus;
    secret: string;
    at: string;
}

// A log-out-everywhere event: every access token for this
// identity issued before `at` is revoked. Append-only — a
// new logout is a NEW row; the effective revoked-before
// stamp is the LATEST `at` per identity (derive from the
// ledger, never a mutable column). Mirrors
// identity_credentials' revoke-to-retain discipline.
export interface IdentityTokenRevocationEntity {
    id: Id;
    identity_id: Id;
    at: string;
}

// An identity's chosen default org. Append-only: a change is
// a NEW row; the current default is the LATEST `at` per
// identity, and no row means unset (never a nullable column —
// an identity is born org-less). The chosen org must be one
// of the identity's memberships, fenced at the write.
export interface IdentityDefaultOrgEntity {
    id: Id;
    identity_id: Id;
    organization_id: Id;
    at: string;
}

export type RoleGrantAction = 'granted' | 'revoked';

// Append-only role-assignment ledger event. One row per
// grant or revoke; the roles an identity CURRENTLY holds =
// the latest action per (identity_id, role) — a 'granted'
// with no later 'revoked'. Append-only: a revoke is a NEW
// 'revoked' row, never a splice (mirrors
// identity_credentials / identity_token_revocations).
// `by_member_id` is the actor (== their identity id, per
// member.id === identity.id). `at` is the RFC-3339 zulu
// moment. Authorization derives roles from THIS ledger
// fresh at the gate — never from a token claim.
export interface RoleGrantEntity {
    id: Id;
    organization_id: Id;
    identity_id: Id;
    role: string;
    action: RoleGrantAction;
    by_member_id: Id;
    at: string;
}

export type IdentityTokenAction =
    'issued' | 'rotated' | 'revoked';

// Append-only token-lifecycle ledger. One row per jti event; a
// token's current validity = the latest action for its jti.
// `chain_id` groups a refresh-rotation lineage: an issue creates
// a root (parent_jti = '' — a self-disclosing empty, never
// null); each rotation appends 'rotated' for the old jti and
// 'issued' for the new, sharing the chain_id. Presenting a
// rotated-away (or revoked) jti is replay → the whole chain is
// revoked. Distinct from identity_token_revocations (coarse
// per-identity log-out-everywhere); this is per-jti / per-chain.
export interface IdentityTokenEntity {
    id: Id;
    jti: string;
    identity_id: Id;
    action: IdentityTokenAction;
    chain_id: string;
    parent_jti: string;
    at: string;
}

export type ClientStatus = 'active' | 'disabled';

// An OAuth client registry row — the "websites built by us and
// others". Mutable config of record (EntityStore): redirect URIs
// change, JWKS rotate, a client is disabled. `grant_types` and
// `redirect_uris` are space-delimited (OAuth convention); `jwks`
// is the client's JSON Web Key Set as a JSON string (used to
// verify private_key_jwt assertions — real JWS verify is a
// server-tier seam); `aud` is the origin a token is minted for.
export interface ClientEntity {
    id: Id;
    grant_types: string;
    redirect_uris: string;
    jwks: string;
    aud: string;
    status: ClientStatus;
}

export type IdentityProviderAction = 'linked' | 'unlinked';

// Append-only ledger of external-IdP links for an identity. One
// row per link/unlink; a link is current = its latest action is
// 'linked'. `provider` names the IdP (e.g. 'google'),
// `provider_subject` is the identity's id AT that provider. An
// unlink is a NEW 'unlinked' row, never a splice.
export interface IdentityProviderEntity {
    id: Id;
    identity_id: Id;
    provider: string;
    provider_subject: string;
    action: IdentityProviderAction;
    at: string;
}

export type AuthorizationCodeStatus = 'issued' | 'consumed';

// Append-only ledger of authorization-code lifecycle. One row
// per issue/consume; a code's current status = the latest event
// for its `code`. The row `id` is a generated event id; `code`
// is the opaque single-use value bound to (identity, client). A
// consume is a NEW 'consumed' row — re-presenting a code whose
// latest status is already 'consumed' (or unknown) is replay.
export interface AuthorizationCodeEntity {
    id: Id;
    code: string;
    identity_id: Id;
    client_id: Id;
    status: AuthorizationCodeStatus;
    at: string;
}

// The person-PII display facet as a tagged union, so the
// ABSENCE of the row (erased PII) is represented without
// null and DECIDED AT THE CALL SITE. Presenters switch on
// `erased` and supply their own fallback constant.
export type MemberPii =
    | {
        readonly erased: false;
        readonly name: string;
        readonly email: string;
        readonly phone: string;
        readonly bio: string;
    }
    | { readonly erased: true };

export class Identity {
    readonly #id: Id;
    readonly #kind: IdentityKind;

    constructor(entity: IdentityEntity) {
        this.#id = entity.id;
        this.#kind = entity.kind;
    }

    idForLink(): string {
        return this.#id;
    }

    kindValue(): IdentityKind {
        return this.#kind;
    }

    isPerson(): boolean {
        return this.#kind === 'person';
    }

    isService(): boolean {
        return this.#kind === 'service';
    }
}

// Parent row: a member's shared identity. Only the kind
// discriminant lives here; the display name lives with the
// kind (ai_members.name, identity_pii.name) or as the
// SYSTEM_MEMBER_NAME constant. Kind-specific detail lives in
// human_members / ai_members keyed by the same id. A
// 'system' member is a parent row with no detail row.
export interface MemberEntity {
    id: MemberId;
    type: MemberKind;
}

// human_members detail row, keyed by the shared member id.
// Contact PII (name/email/phone/bio) lives in identity_pii;
// this row carries only the org profile.
export interface HumanMemberEntity {
    id: MemberId;
    title: string;
    department: string;
    strengths: JsonArrayField;
    team_dimensions: JsonObjectField;
}

export class HumanMember {
    readonly kind = 'human' as const;
    readonly #id: MemberId;
    readonly #pii: MemberPii;
    readonly #title: string;
    readonly #department: string;
    readonly #state: MemberState;
    readonly #strengths: string;
    readonly #teamDimensions: string;

    constructor(
        parent: MemberEntity,
        detail: HumanMemberEntity,
        pii: MemberPii,
        state: MemberState,
    ) {
        this.#id = parent.id;
        this.#pii = pii;
        this.#title = detail.title;
        this.#department =
            detail.department;
        this.#state = state;
        this.#strengths =
            detail.strengths;
        this.#teamDimensions =
            detail.team_dimensions;
    }

    idForLink(): string {
        return this.#id;
    }

    pii(): MemberPii {
        return this.#pii;
    }

    titleLabel(): string {
        return this.#title;
    }

    departmentLabel(): string {
        return this.#department;
    }

    isActive(): boolean {
        return this.#state === 'active';
    }

    isPending(): boolean {
        return this.#state === 'pending';
    }

    isArchived(): boolean {
        return this.#state === 'archived';
    }

    stateLabel(): string {
        return (
            MEMBER_STATE_CONFIG[this.#state]
        )!.label;
    }

    stateClassName(): string {
        return (
            MEMBER_STATE_CONFIG[this.#state]
        )!.className;
    }

    hasDepartment(): boolean {
        return this.#department !== '';
    }

    stateValue(): MemberState {
        return this.#state;
    }

    parsedStrengths(): string[] {
        return validateStringArrayJson(
            this.#strengths,
            'humanMember.strengths',
        );
    }

    parsedTeamDimensions():
        Record<string, number> {
        return (
            validateStringNumberRecordJson(
                this.#teamDimensions,
                'humanMember.teamDimensions',
            )
        );
    }

    matchesSearch(term: string): boolean {
        const t = term.toLowerCase();
        if (
            this.#title
                .toLowerCase().includes(t)
            || this.#department
                .toLowerCase().includes(t)
        ) {
            return true;
        }
        if (this.#pii.erased) return false;
        return (
            this.#pii.name
                .toLowerCase().includes(t)
            || this.#pii.email
                .toLowerCase().includes(t)
        );
    }
}

// ai_members detail row, keyed by the shared member id.
export interface AIMemberEntity {
    id: MemberId;
    name: string;
    description: string;
    skill_focus: string;
    model: ModelId;
}

export class AIMember {
    readonly kind = 'ai' as const;
    readonly #id: MemberId;
    readonly #name: string;
    readonly #description: string;
    readonly #skillFocus: string;
    readonly #model: ModelId;
    readonly #state: MemberState;

    constructor(
        parent: MemberEntity,
        detail: AIMemberEntity,
        state: MemberState,
    ) {
        this.#id = parent.id;
        this.#name = detail.name;
        this.#description =
            detail.description;
        this.#skillFocus =
            detail.skill_focus;
        this.#model = detail.model;
        this.#state = state;
    }

    idForLink(): string {
        return this.#id;
    }

    nameText(): string {
        return this.#name;
    }

    name(): string {
        return this.nameText();
    }

    descriptionText(): string {
        return this.#description;
    }

    skillFocusText(): string {
        return this.#skillFocus;
    }

    modelId(): ModelId {
        return this.#model;
    }

    isActive(): boolean {
        return this.#state === 'active';
    }

    isPending(): boolean {
        return this.#state === 'pending';
    }

    isArchived(): boolean {
        return this.#state === 'archived';
    }

    stateLabel(): string {
        return (
            MEMBER_STATE_CONFIG[this.#state]
        )!.label;
    }

    stateClassName(): string {
        return (
            MEMBER_STATE_CONFIG[this.#state]
        )!.className;
    }

    stateValue(): MemberState {
        return this.#state;
    }

    matchesSearch(term: string): boolean {
        const lowerTerm = term.toLowerCase();
        return (
            this.#name
                .toLowerCase()
                .includes(lowerTerm)
            || this.#description
                .toLowerCase()
                .includes(lowerTerm)
        );
    }
}

// System member: a synthetic, read-only actor — the
// platform itself as the author of seed-time state
// events. Exactly one exists; it has a parent row
// (type 'system') and no detail row, and no lifecycle
// a user manages, so it carries only identity + state.
export class SystemMember {
    readonly kind = 'system' as const;
    readonly #id: MemberId;
    readonly #name: string;
    readonly #state: MemberState;

    constructor(
        parent: MemberEntity,
        state: MemberState,
    ) {
        this.#id = parent.id;
        this.#name = SYSTEM_MEMBER_NAME;
        this.#state = state;
    }

    idForLink(): string {
        return this.#id;
    }

    name(): string {
        return this.#name;
    }

    stateValue(): MemberState {
        return this.#state;
    }

    stateLabel(): string {
        return (
            MEMBER_STATE_CONFIG[this.#state]
        )!.label;
    }

    stateClassName(): string {
        return (
            MEMBER_STATE_CONFIG[this.#state]
        )!.className;
    }

    matchesSearch(term: string): boolean {
        return this.#name
            .toLowerCase()
            .includes(term.toLowerCase());
    }
}

export type Member =
    | HumanMember
    | AIMember
    | SystemMember;

export function isHumanMember(
    w: Member,
): w is HumanMember {
    return w.kind === 'human';
}

export function isAIMember(
    w: Member,
): w is AIMember {
    return w.kind === 'ai';
}

export function isSystemMember(
    w: Member,
): w is SystemMember {
    return w.kind === 'system';
}

export interface IdeaEntity {
    id: Id;
    organization_id: Id;
    title: string;
    position: number;
    problem_statement: string;
    target_users: string;
    proposed_solution: string;
    expected_outcome: string;
    success_metrics: string;
}

export type ObjectiveId = Id;

export interface Objective {
    id: ObjectiveId;
    organization_id: Id;
    position: number;
}

export interface ObjectiveRevision {
    id: string;
    objective_id: ObjectiveId;
    name: string;
    description: string;
    member_id: Id;
    at: string;
}

export interface ProjectObjectiveBaselineScore {
    id: string;
    project_id: Id;
    objective_id: ObjectiveId;
    score: number;
    member_id: Id;
    at: string;
}

export interface ProjectObjectiveActualScore {
    id: string;
    project_id: Id;
    objective_id: ObjectiveId;
    score: number;
    member_id: Id;
    at: string;
}

export interface ProjectEntity {
    id: Id;
    organization_id: Id;
    title: string;
    description: string;
    progress: number;
    start_date: string;
    target_end_date: string;
    estimated_cost: number;
    actual_cost: number;
    position: number;
}

export interface GraphNode {
    id: string;
    name: string;
    positionX: number;
    positionY: number;
    isCreate: boolean;
    isArchive: boolean;
    memberIds: MemberId[];
    attributes: NodeAttribute[];
    taskInstructions: string;
}

export interface GraphEdge {
    id: string;
    name: string;
    fromNodeId: string;
    toNodeId: string;
}

export interface StoredGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export const DEFAULT_LOCK_TIMEOUT = 8 * SECONDS_PER_HOUR;

export const DEFAULT_NODE_ATTRIBUTES:
    readonly NodeAttribute[] = [];
export const DEFAULT_NEW_STATE_NAME =
    'New State';
export const DEFAULT_TRANSITION_NAME =
    'Transition';
export const DEFAULT_NODE_MEMBER_IDS:
    readonly MemberId[] = [];
export const DEFAULT_NODE_TASK_INSTRUCTIONS = '';

export interface FlowEntity {
    id: Id;
    organization_id: Id;
    name: string;
    is_locked: boolean;
    is_auto_layout: boolean;
    is_auto_fit: boolean;
    lock_timeout: number;
    graph: JsonObjectField;
}

export interface FlowVersionEntity {
    id: Id;
    flow_id: Id;
    name: string;
    is_locked: boolean;
    is_auto_layout: boolean;
    is_auto_fit: boolean;
    lock_timeout: number;
    graph: JsonObjectField;
    at: string;
}

export interface WorkOrderFlowGraph {
    flowId: Id;
    name: string;
    lockTimeout: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface WorkOrderEntity {
    id: Id;
    organization_id: Id;
    display_id: string;
    flow_graph: JsonObjectField;
    position: number;
}

export interface FlowWorkOrderEntity {
    id: Id;
    flow_id: Id;
    work_order_id: Id;
    at: string;
}

export interface RecordEntity {
    id: RecordId;
    organization_id: Id;
    name: string;
    description: string;
    position: number;
}

export interface RecordAttributeEntity {
    id: RecordAttributeId;
    organization_id: Id;
    record_id: RecordId;
    name: string;
    attribute_type: AttributeType;
    sort_order: number;
    options: JsonArrayField;
    constraints: JsonArrayField;
}

// The parsed domain twin of RecordAttributeEntity: the
// adapter is the divorce point, so above the storage seam
// `options` and `constraints` are real arrays, never the
// JsonArrayField strings the datastore persists.
export interface RecordAttribute {
    id: RecordAttributeId;
    organization_id: Id;
    record_id: RecordId;
    name: string;
    attribute_type: AttributeType;
    sort_order: number;
    options: string[];
    constraints: Constraint[];
}

export interface FlowRecordEntity {
    id: FlowRecordId;
    flow_id: Id;
    record_id: RecordId;
    at: string;
}

// Per-field values written when a state event
// records a work-order transition. Each row pins
// the payload to its parent event by state_event_id
// (Codd 1NF — a relation belongs in a table, not a
// column on the event row).
export interface StateFieldValueEntity {
    id: Id;
    state_event_id: Id;
    field_id: Id;
    value: string;
}

export interface OrganizationEntity {
    id: Id;
    name: string;
    domain: string;
    next_billing: string;
    seats: number;
    used_seats: number;
    projects_limit: number;
    ideas_limit: number;
    last_activity: string;
}

// The covenant binding an identity to an organization, with
// the moment of union. The source of "which orgs can this
// identity reach" — enumerated globally for a subject, scoped
// per-tenant through the org guard. A person in N orgs has N
// membership rows; member.id === identity.id stays global
// (one profile, many memberships).
export interface MembershipEntity {
    id: Id;
    organization_id: Id;
    identity_id: Id;
    at: string;
}

export interface IdeaSubmissionEntity {
    id: Id;
    idea_id: Id;
    member_id: Id;
    at: string;
}

export interface ProjectFlowEntity {
    id: Id;
    project_id: Id;
    flow_id: Id;
    at: string;
}

export interface StatusDisplay {
    label: string;
    className: string;
}

export const MEMBER_STATE_CONFIG: Record<
    MemberState,
    StatusDisplay
> = {
    active: {
        label: 'Active',
        className: 'badge-success',
    },
    pending: {
        label: 'Pending',
        className: 'badge-warning',
    },
    archived: {
        label: 'Archived',
        className: 'badge-default',
    },
};

export const IDEA_STATE_CONFIG: Record<
    IdeaState,
    StatusDisplay
> = {
    'active': {
        label: 'Active',
        className: 'badge-success',
    },
    'in-review': {
        label: 'In Review',
        className: 'badge-warning',
    },
    'approved': {
        label: 'Approved',
        className: 'badge-success',
    },
    'promoted': {
        label: 'Promoted',
        className: 'badge-primary',
    },
    'sent-back': {
        label: 'Sent Back',
        className: 'badge-error',
    },
    'archived': {
        label: 'Archived',
        className: 'badge-default',
    },
    'deleted': {
        label: 'Deleted',
        className: 'badge-default',
    },
};

export const IDEA_READINESS_CONFIG: Record<
    IdeaReadiness,
    StatusDisplay
> = {
    'incomplete': {
        label: 'Incomplete',
        className: 'badge-warning',
    },
    'ready': {
        label: 'Ready',
        className: 'badge-success',
    },
};

export const RECORD_STATE_CONFIG: Record<
    RecordState,
    StatusDisplay
> = {
    active: {
        label: 'Active',
        className: 'badge-success',
    },
    archived: {
        label: 'Archived',
        className: 'badge-default',
    },
    deleted: {
        label: 'Deleted',
        className: 'badge-default',
    },
};

export const PROJECT_STATE_CONFIG: Record<
    ProjectState,
    StatusDisplay
> = {
    'submitted': {
        label: 'Submitted',
        className: 'badge-default',
    },
    'under-review': {
        label: 'In Review',
        className: 'badge-warning',
    },
    'sent-back': {
        label: 'Sent Back',
        className: 'badge-error',
    },
    'approved': {
        label: 'Approved',
        className: 'badge-success',
    },
    'declined': {
        label: 'Declined',
        className: 'badge-error',
    },
    'archived': {
        label: 'Archived',
        className: 'badge-success',
    },
    'deleted': {
        label: 'Deleted',
        className: 'badge-default',
    },
};

export const CONFIDENCE_CONFIG: Record<
    ConfidenceLevel,
    StatusDisplay
> = {
    high: {
        label: 'High',
        className: 'text-success',
    },
    medium: {
        label: 'Medium',
        className: 'text-warning',
    },
    low: {
        label: 'Low',
        className: 'text-error',
    },
};

export class Idea {
    readonly #id: string;
    readonly #title: string;
    readonly #position: number;
    readonly #state: IdeaState;
    readonly #problemStatement: string;
    readonly #targetUsers: string;
    readonly #proposedSolution: string;
    readonly #expectedOutcome: string;
    readonly #successMetrics: string;

    constructor(
        entity: IdeaEntity,
        state: IdeaState,
    ) {
        this.#id = entity.id;
        this.#title = entity.title;
        this.#position = entity.position;
        this.#state = state;
        this.#problemStatement =
            entity.problem_statement;
        this.#targetUsers =
            entity.target_users;
        this.#proposedSolution =
            entity.proposed_solution;
        this.#expectedOutcome =
            entity.expected_outcome;
        this.#successMetrics =
            entity.success_metrics;
    }

    isReviewable(): boolean {
        return this.#state === 'in-review';
    }

    isConvertible(): boolean {
        return this.#state === 'approved';
    }

    canBeSubmittedForReview(): boolean {
        return (
            this.#state === 'active'
            || this.#state === 'sent-back'
        ) && this.isReady();
    }

    readinessValue(): IdeaReadiness {
        return (
            this.#title !== ''
            && this.#problemStatement !== ''
            && this.#proposedSolution !== ''
            && this.#expectedOutcome !== ''
        ) ? 'ready'
          : 'incomplete';
    }

    readinessLabel(): string {
        return IDEA_READINESS_CONFIG[
            this.readinessValue()
        ].label;
    }

    readinessClassName(): string {
        return IDEA_READINESS_CONFIG[
            this.readinessValue()
        ].className;
    }

    isReady(): boolean {
        return this.readinessValue() === 'ready';
    }

    stateLabel(): string {
        return (
            IDEA_STATE_CONFIG[this.#state]
        )!.label;
    }

    stateClassName(): string {
        return (
            IDEA_STATE_CONFIG[this.#state]
        )!.className;
    }

    matchesSearch(term: string): boolean {
        return this.#title
            .toLowerCase()
            .includes(term.toLowerCase());
    }

    idForLink(): string {
        return this.#id;
    }

    titleText(): string {
        return this.#title;
    }

    positionSortKey(): number {
        return this.#position;
    }

    stateValue(): IdeaState {
        return this.#state;
    }

    problemStatementText(): string {
        return this.#problemStatement;
    }

    targetUsersText(): string {
        return this.#targetUsers;
    }

    proposedSolutionText(): string {
        return this.#proposedSolution;
    }

    expectedOutcomeText(): string {
        return this.#expectedOutcome;
    }

    successMetricsText(): string {
        return this.#successMetrics;
    }
}

export class Project {
    readonly #id: string;
    readonly #title: string;
    readonly #description: string;
    readonly #state: ProjectState;
    readonly #progress: number;
    readonly #startDate: string;
    readonly #targetEndDate: string;
    readonly #estimatedCost: number;
    readonly #actualCost: number;
    readonly #position: number;

    constructor(
        entity: ProjectEntity,
        state: ProjectState,
    ) {
        this.#id = entity.id;
        this.#title = entity.title;
        this.#description =
            entity.description;
        this.#state = state;
        this.#progress = entity.progress;
        this.#startDate =
            entity.start_date;
        this.#targetEndDate =
            entity.target_end_date;
        this.#estimatedCost =
            entity.estimated_cost;
        this.#actualCost =
            entity.actual_cost;
        this.#position = entity.position;
    }

    isDeleted(): boolean {
        return this.#state === 'deleted';
    }

    isApproved(): boolean {
        return this.#state === 'approved';
    }

    timelineProgress(): number {
        if (this.#state === 'archived')
            return 100;
        const start =
            new Date(this.#startDate);
        const end =
            new Date(
                this.#targetEndDate,
            );
        if (
            isNaN(start.getTime())
            || isNaN(end.getTime())
        ) return 0;
        const total =
            end.getTime()
            - start.getTime();
        if (total <= 0) return 0;
        const elapsed =
            msSinceUtc(this.#startDate);
        return Math.max(
            0,
            Math.min(
                100,
                Math.round(
                    elapsed / total * 100,
                ),
            ),
        );
    }

    formattedCost(): string {
        return formatCompactCurrency(
            this.#estimatedCost,
        );
    }

    stateLabel(): string {
        return (
            PROJECT_STATE_CONFIG[
                this.#state
            ]
        )!.label;
    }

    stateClassName(): string {
        return (
            PROJECT_STATE_CONFIG[
                this.#state
            ]
        )!.className;
    }

    idForLink(): string {
        return this.#id;
    }

    titleText(): string {
        return this.#title;
    }

    descriptionText(): string {
        return this.#description;
    }

    stateValue(): ProjectState {
        return this.#state;
    }

    progressPercent(): number {
        return this.#progress;
    }

    startDateValue(): string {
        return this.#startDate;
    }

    targetEndDateValue(): string {
        return this.#targetEndDate;
    }

    estimatedCostAmount(): number {
        return this.#estimatedCost;
    }

    actualCostAmount(): number {
        return this.#actualCost;
    }

    positionSortKey(): number {
        return this.#position;
    }

    matchesSearch(term: string): boolean {
        const lowerTerm = term.toLowerCase();
        return this.#title
            .toLowerCase()
            .includes(lowerTerm);
    }
}

export class RecordModel {
    readonly #id: string;
    readonly #name: string;
    readonly #description: string;
    readonly #position: number;
    readonly #state: RecordState;

    constructor(
        entity: RecordEntity,
        state: RecordState,
    ) {
        this.#id = entity.id;
        this.#name = entity.name;
        this.#description = entity.description;
        this.#position = entity.position;
        this.#state = state;
    }

    idForLink(): string {
        return this.#id;
    }

    stateValue(): RecordState {
        return this.#state;
    }

    stateLabel(): string {
        return (
            RECORD_STATE_CONFIG[this.#state]
        )!.label;
    }

    stateClassName(): string {
        return (
            RECORD_STATE_CONFIG[this.#state]
        )!.className;
    }

    isActive(): boolean {
        return this.#state === 'active';
    }

    isArchived(): boolean {
        return this.#state === 'archived';
    }

    positionSortKey(): number {
        return this.#position;
    }

    nameText(): string {
        return this.#name;
    }

    descriptionText(): string {
        return this.#description;
    }

    matchesSearch(term: string): boolean {
        const lower = term.toLowerCase();
        return this.#name
            .toLowerCase()
            .includes(lower);
    }
}

export function ideaIsVisible(
    state: IdeaState,
): boolean {
    return state !== 'archived'
        && state !== 'deleted';
}

export function projectStateIsNotDeleted(
    state: ProjectState,
): boolean {
    return state !== 'deleted';
}

export function projectStateIsApproved(
    state: ProjectState,
): boolean {
    return state === 'approved';
}

export function projectStateIsScorable(
    state: ProjectState,
): boolean {
    return state === 'under-review';
}

export function projectStateAllowsMeasurement(
    state: ProjectState,
): boolean {
    return state === 'approved';
}

