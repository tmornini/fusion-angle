import { NIL_IDENTIFIER } from
    '../shared/identifier.ts';

export type Id = string;

export type MemberId = Id;
export type AgentId = Id;

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

// Stamped into nested attribute document bodies on CREATE
// when read_roles / write_roles are omitted. Storage always
// carries both arrays explicitly — never filled at read time.
// ONE constant for both roles (Uniformity).
export const DEFAULT_ATTRIBUTE_ACL_ROLES =
    ['member', 'admin'] as const;

export type Constraint =
    | { kind: 'regex'; pattern: string }
    | { kind: 'range_min'; min: string }
    | { kind: 'range_max'; max: string };

// Hidden is encoded by absence from the array, so
// hidden + isRequired is structurally impossible.
// Storage spells the id key attribute_id; the seam maps
// it (validators.ts asNodeAttribute in, storedGraph out).
export interface NodeAttribute {
    attributeId: RecordAttributeId;
    mode: 'editable' | 'readonly';
    isRequired: boolean;
}

export const IDEA_STATES = [
    'active',
    'in_review',
    'approved',
    'promoted',
    'sent_back',
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
    'under_review',
    'sent_back',
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

// The invitation lifecycle, append-only in the states log keyed
// to the invitation id. Grant (admin) appends 'pending'; the
// invitee appends 'accepted' (which writes the membership) or
// 'declined'; the admin appends 'revoked' to cancel a pending
// invite. Current status = the latest event — derive, never
// mutate. No 'deleted': an invitation persists as audit.
export const INVITATION_STATES = [
    'pending',
    'accepted',
    'declined',
    'revoked',
] as const;

export type InvitationState =
    typeof INVITATION_STATES[number];

export type StoredBoolean = 0 | 1;

function includes<T extends string>(
    values: readonly T[],
    v: string,
): v is T {
    return (values as readonly string[])
        .includes(v);
}

// A validation rejection is an EXPECTED failure: profane
// input stopped at the gate. The api layer maps it to 400
// with the message on the wire — unlike a bug, which gets
// the opaque 500.
export class ValidationError extends Error {}

// Alphabet membership assert: one throw shape for every
// state alphabet (and AttributeType). Named is*/assert*
// exports stay as the Rectification of Names surface.
function assertInAlphabet<T extends string>(
    alphabet: readonly T[],
    typeName: string,
    v: string,
    label: string,
): T {
    if (!includes(alphabet, v)) {
        throw new ValidationError(
            'expected ' + typeName + ' for '
                + label + ', got ' + v,
        );
    }
    return v;
}

export function assertAttributeType(
    v: string,
    label: string,
): AttributeType {
    return assertInAlphabet(
        ATTRIBUTE_TYPES, 'AttributeType', v, label,
    );
}

export function assertConstraintAppliesTo(
    kind: Constraint['kind'],
    attributeType: AttributeType,
    label: string,
): void {
    if (kind === 'regex') {
        if (attributeType !== 'text') {
            throw new ValidationError(
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
        throw new ValidationError(
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
    return includes(PROJECT_STATES, v);
}

export function assertProjectState(
    v: string,
    label: string,
): ProjectState {
    return assertInAlphabet(
        PROJECT_STATES, 'ProjectState', v, label,
    );
}

export function isIdeaState(
    v: string,
): v is IdeaState {
    return includes(IDEA_STATES, v);
}

export function assertIdeaState(
    v: string,
    label: string,
): IdeaState {
    return assertInAlphabet(
        IDEA_STATES, 'IdeaState', v, label,
    );
}

export function assertObjectiveState(
    v: string,
    label: string,
): ObjectiveState {
    return assertInAlphabet(
        OBJECTIVE_STATES, 'ObjectiveState', v, label,
    );
}

// No isFlowState — nothing narrows a bare string against
// FLOW_STATES at runtime today (unlike ideas/projects/records,
// which each drive a page-level string-to-enum guard); the
// document validator (validateFlowDocumentBody) is the ONE
// caller, and it always needs the throwing form.
export function assertFlowState(
    v: string,
    label: string,
): FlowState {
    return assertInAlphabet(
        FLOW_STATES, 'FlowState', v, label,
    );
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
    return assertInAlphabet(
        RECORD_STATES, 'RecordState', v, label,
    );
}

export function isInvitationState(
    v: string,
): v is InvitationState {
    return includes(INVITATION_STATES, v);
}

export function assertInvitationState(
    v: string,
    label: string,
): InvitationState {
    return assertInAlphabet(
        INVITATION_STATES, 'InvitationState', v, label,
    );
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

// Test-only clock seam. Production reads Date.now(); a suite
// that must assert age without sleeping installs a fake here
// and MUST resetClock() in afterEach. Deterministic tests
// over real-clock false prophets (Office of Verification).
// Both msSinceUtc (live claim-expiry gate) and nowUtc (body
// claimAt mints that derive's isExpiredAsOf re-decides) read
// this seam — real sleep used to advance both together.
let clockNowMs: () => number = () => Date.now();

export function setClockForTest(
    nowMs: () => number,
): void {
    clockNowMs = nowMs;
}

export function resetClock(): void {
    clockNowMs = () => Date.now();
    // A fake advance can leave lastMintMs in the future of
    // wall-clock; clear the mint so the next real nowUtc is
    // not stuck riding the same-ms counter forever.
    lastMintMs = 0;
    sameMsSequence = 0;
}

export function nowEpochSeconds(): number {
    return Math.floor(clockNowMs() / MS_PER_SECOND);
}

// The mint's monotonicity state: the last millisecond stamped
// and the same-ms sequence counter that fills the final three
// fraction digits. Owned by nowUtc alone.
let lastMintMs = 0;
let sameMsSequence = 0;

export function nowUtc(): string {
    // JS Date resolves only to milliseconds; SCHEMA.md
    // documents the 6-digit microsecond zulu width. The final
    // three fraction digits are a same-ms sequence counter, so
    // within a realm every mint is STRICTLY later than the one
    // before — the ledger reductions' latest-wins total order
    // starts at the mint. A clock that stalls or steps back
    // rides the counter; on counter overflow the mint
    // busy-advances to the next millisecond.
    const ms = clockNowMs();
    if (ms > lastMintMs) {
        lastMintMs = ms;
        sameMsSequence = 0;
    } else {
        sameMsSequence += 1;
        if (sameMsSequence > 999) {
            let next = clockNowMs();
            while (next <= lastMintMs) next = clockNowMs();
            lastMintMs = next;
            sameMsSequence = 0;
        }
    }
    return new Date(lastMintMs).toISOString().replace(
        'Z',
        String(sameMsSequence).padStart(3, '0') + 'Z',
    );
}

export function msSinceUtc(
    iso: string,
): number {
    return clockNowMs()
        - new Date(iso).getTime();
}

export interface StateEntity {
    id: Id;
    entity_id: Id;
    state: string;
    member_id: Id;
    at: string;
    // Present on /versions index rows; value is that
    // revision's pair id.
    etag?: string;
}

// Nested field-value shape on work-order history events
// (GET work-orders/:id/history). Folded from transition pair
// bodies — no state_event_id on the wire (the parent event
// already carries id). Distinct from StateFieldValueEntity,
// which still carries state_event_id for the RESTRICT
// referrer derive (deriveStateFieldValueReferrers).
export interface TransitionFieldValueEntity {
    id: Id;
    attribute_id: Id;
    // Present on set rows (legacy + new-shape). New-shape
    // clear rows omit the key at runtime (cleared: true);
    // typed required so legacy consumers stay string-narrow.
    value: string;
    // New-shape clear marker only; legacy rows never carry it
    // so their wire bytes stay unchanged (JSON omits absent).
    readonly cleared?: true;
}

// Work-order history row: a lifecycle StateEntity plus the
// transition field values whose state_event_id === id. Claim/
// birth/release rows carry field_values: [].
export interface WorkOrderHistoryEventEntity
    extends StateEntity {
    field_values: TransitionFieldValueEntity[];
}

export const SYSTEM_MEMBER_ID: Id = NIL_IDENTIFIER;

export const SYSTEM_MEMBER_NAME = 'System';

// A principal that spans the whole platform. `kind` is the
// NATURE of the principal — a person (a human being) or a
// service (an automated agent / API client / the platform
// itself) — NOT a statement about whether it has sensitive
// data. Both kinds carry sensitive facets: persons an
// identity_pii row, services credentials (SP-5). The id is
// the universal key: member.id === identity.id, always.
export type IdentityKind = 'person' | 'service';

// Person-only org profile. Whole or absent — never a
// partial. Title is not PII; name/email/phone/bio stay
// on the pii facet.
export interface IdentityProfileFields {
    title: string;
    department: string;
    strengths: string[];
    team_dimensions: Record<string, number>;
}

// The entity less its id: a service, a person without
// a profile, or a person with all four profile fields.
// `Omit<IdentityEntity, 'id'>` would collapse the union
// to its common keys, so callers name this type instead.
export type IdentityEntityFields =
    | { kind: 'service' }
    | { kind: 'person' }
    | ({ kind: 'person' } & IdentityProfileFields);

export type IdentityEntity =
    IdentityEntityFields & { id: Id };

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
// (contrast identity_pii). The client-assertion crypto is
// REAL (RFC 7523 JWS, RS256/ES256) and the OAuth spine
// (client registrations, identity-tokens,
// identity_providers) is live; the remaining SP-5 items
// are the ones access-token.ts names: per-client
// multi-audience, DPoP cnf binding, jti reuse-detection.
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

// An identity's chosen default organization. A simple
// document: PUT { organization_id } (must be a live seat);
// GET that document or 404 if never SET. Revoke does not
// rewrite it. Token resolution uses the SET if it is a live
// seat, else PRIMARY, else deny.
export interface IdentityDefaultOrganizationEntity {
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
// `chain_id` groups a refresh-rotation lineage: each rotation
// appends 'rotated' for the old jti and 'issued' for the new at
// one shared `at`, both carrying the chain_id. A token's
// predecessor is DERIVED, not stored — the jti 'rotated' at its
// 'issued' instant (parentJtiByJti); a root has none. Presenting
// a rotated-away (or revoked) jti is replay → the whole chain is
// revoked. Distinct from identity_token_revocations (coarse
// per-identity log-out-everywhere); this is per-jti / per-chain.
export interface IdentityTokenEntity {
    id: Id;
    jti: string;
    identity_id: Id;
    action: IdentityTokenAction;
    chain_id: string;
    at: string;
}

export type ClientStatus = 'active' | 'disabled';

// The client-registration facet — the message-plane document at
// identities/:id/registration that replaces the clients
// table (clients elimination). Same five columns; `id` is
// the OWNING kind-'service' identity's id. PUT-overwrite via
// the Supersedes chain; a DELETE tombstone is deregistration.
// Derived by deriveClientRegistration
// (api/derive-identity-spine.ts).
export interface ClientRegistrationEntity {
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
    strengths: string[];
    team_dimensions: Record<string, number>;
}

// A person's org profile as read from the identity
// document: whole, or absent. No field is ever
// defaulted — a reader that needs a label decides what
// absence looks like at its own call site.
export type HumanProfile =
    | {
        readonly present: true;
        readonly title: string;
        readonly department: string;
        readonly strengths: readonly string[];
        readonly team_dimensions:
            Readonly<Record<string, number>>;
    }
    | { readonly present: false };

export class HumanMember {
    readonly kind = 'human' as const;
    readonly #id: MemberId;
    readonly #pii: MemberPii;
    readonly #profile: HumanProfile;

    constructor(
        parent: MemberEntity,
        profile: HumanProfile,
        pii: MemberPii,
    ) {
        this.#id = parent.id;
        this.#pii = pii;
        this.#profile = profile;
    }

    idForLink(): string {
        return this.#id;
    }

    pii(): MemberPii {
        return this.#pii;
    }

    profile(): HumanProfile {
        return this.#profile;
    }

    department():
        | { present: true; label: string }
        | { present: false } {
        return this.#profile.present
            && this.#profile.department !== ''
            ? {
                present: true,
                label: this.#profile.department,
            }
            : { present: false };
    }

    matchesSearch(term: string): boolean {
        const t = term.toLowerCase();
        if (
            this.#profile.present
            && (
                this.#profile.title
                    .toLowerCase().includes(t)
                || this.#profile.department
                    .toLowerCase().includes(t)
            )
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

// Standing AI agent document — not a member, not an
// identity. Agents do not log in.
export interface AIAgentEntity {
    id: AgentId;
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

    constructor(
        parent: MemberEntity,
        detail: AIMemberEntity,
    ) {
        this.#id = parent.id;
        this.#name = detail.name;
        this.#description =
            detail.description;
        this.#skillFocus =
            detail.skill_focus;
        this.#model = detail.model;
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
// a user manages, so it carries only identity.
export class SystemMember {
    readonly kind = 'system' as const;
    readonly #id: MemberId;
    readonly #name: string;

    constructor(
        parent: MemberEntity,
    ) {
        this.#id = parent.id;
        this.#name = SYSTEM_MEMBER_NAME;
    }

    idForLink(): string {
        return this.#id;
    }

    name(): string {
        return this.#name;
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
    // Domain lifecycle state. Ledger facts (at, event id)
    // live on the pair / etag / versions list, not here.
    state: string;
}

export type ObjectiveId = Id;

export interface ObjectiveEntity {
    id: ObjectiveId;
    organization_id: Id;
    position: number;
    // Domain lifecycle state. Ledger facts (at, event id)
    // live on the pair / etag / versions list, not here.
    state: string;
}

export interface ObjectiveRevisionEntity {
    id: Id;
    objective_id: ObjectiveId;
    name: string;
    description: string;
    member_id: Id;
    at: string;
}

export interface ProjectObjectiveBaselineScoreEntity {
    id: Id;
    project_id: Id;
    objective_id: ObjectiveId;
    score: number;
    member_id: Id;
    at: string;
}

export interface ProjectObjectiveActualScoreEntity {
    id: Id;
    project_id: Id;
    objective_id: ObjectiveId;
    score: number;
    member_id: Id;
    at: string;
}

// One row per stored HTTP pair. The canonical
// messages ARE the two BYTEA columns; the
// columns beside them are addressing and index
// machinery, never a second truth.
export interface MessagePairEntity {
    id: Id;
    uri_collection: string;
    uri_id: string;
    requester_identity_id: Id;
    method: string;
    request_at: string;
    request_hash: string;
    request: string;
    response_at: string;
    response: string;
    operation_id: string;
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
    // Domain lifecycle state. Ledger facts (at, event id)
    // live on the pair / etag / versions list, not here.
    state: string;
}

export interface GraphNode {
    id: Id;
    name: string;
    positionX: number;
    positionY: number;
    isCreate: boolean;
    isArchive: boolean;
    memberIds: MemberId[];
    // Write-path roster for /ai-agents ids.
    agentIds?: AgentId[];
    attributes: NodeAttribute[];
    taskInstructions: string;
}

export interface GraphEdge {
    id: Id;
    name: string;
    fromNodeId: Id;
    toNodeId: Id;
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
export const DEFAULT_NODE_AGENT_IDS:
    readonly AgentId[] = [];
export const DEFAULT_NODE_TASK_INSTRUCTIONS = '';

// The stored flow scalars. The live graph is NOT on this
// type: it rides the flow document body's `graph` field as
// native nested JSON (FlowWithGraph / FlowDocumentBody). The
// frozen plane (`work_orders.flow_graph`) keeps its own
// native copy (same shape plus name / lockTimeout).
export interface FlowEntity {
    id: Id;
    organization_id: Id;
    name: string;
    is_locked: boolean;
    is_auto_layout: boolean;
    is_auto_fit: boolean;
    lock_timeout: number;
}

// The GET-response shape for a flow: the stored row plus the
// `graph` field (the head document message pair's OWN `graph`
// field as native nested JSON — api/derive-flows.ts's
// flowEntityOf; single GET /flows/:id and the list GET
// /flows both serve this shape). The live graph rides the
// flow document body; the frozen plane
// (`work_orders.flow_graph`) keeps its own copy.
// `hasUndoHistory` (Phase 14 Task 8) is a CHEAP, approximate
// signal — this flow's own flows/:id document-message-pair
// count exceeds 1 (i.e. it has been edited past genesis) —
// reusing whatever GET already fetched the flow (page load,
// the post-undo refresh) rather than a new wire read; a rare
// false positive (undo has already reached genesis, but a
// save/undo cycle since kept the pair count above 1)
// degrades to a silent server-side no-op on the next undo,
// never a crash or wrong restore.
export type FlowWithGraph = FlowEntity & {
    graph: Record<string, unknown>;
    hasUndoHistory: boolean;
};

export type FlowNodeId = Id;
export type FlowEdgeId = Id;

// A flow-graph node as its own relation — the node is an
// entity, not an array element welded into the flow's graph
// blob (Commandment IX). The id IS the canvas node id: the
// real FK target for flow_edges and the node-relationship
// ledgers. EntityStore — an edit is a PUT by stable id, a
// removal a 'deleted' states-log event, never a splice. `at`
// is the client-minted moment of the last write.
export interface FlowNodeEntity {
    id: FlowNodeId;
    flow_id: Id;
    name: string;
    position_x: number;
    position_y: number;
    is_create: boolean;
    is_archive: boolean;
    task_instructions: string;
    at: string;
}

// A named transition between two nodes, its own relation. The
// id IS the canvas edge id; from_node_id / to_node_id are real
// FKs to flow_nodes. EntityStore, same removal idiom as nodes.
export interface FlowEdgeEntity {
    id: FlowEdgeId;
    flow_id: Id;
    name: string;
    from_node_id: FlowNodeId;
    to_node_id: FlowNodeId;
    at: string;
}

// The relationship-ledger action vocabulary shared by both
// node-relationship ledgers: a union is 'added', its
// dissolution a NEW 'removed' row — never a splice. Current
// state derives via latestByKey keeping the latest 'added'; a
// same-`at` tie fails closed ('removed' outranks 'added',
// mirroring role_grants' revoke-beats-grant).
export type FlowNodeRelationAction = 'added' | 'removed';

// node↔member as its own relation with a moment of union — a
// pure join (Codd) plus `at`. HistoryEntityStore (append-only
// ledger); removal is a new 'removed' row. The members a node
// currently holds derive from this ledger, never a stored set.
export interface FlowNodeMemberEntity {
    id: Id;
    flow_node_id: FlowNodeId;
    member_id: MemberId;
    action: FlowNodeRelationAction;
    at: string;
}

// node↔attribute as its own relation: a relationship-entity
// (it carries payload — mode and is_required — beyond the
// joined identities). HistoryEntityStore; a mode/required
// change is a NEW 'added' row, never an UPDATE, so latest-wins
// reads the current payload. Storage spells attribute_id; the
// read seam maps it to the domain NodeAttribute.
export interface FlowNodeAttributeEntity {
    id: Id;
    flow_node_id: FlowNodeId;
    attribute_id: RecordAttributeId;
    mode: 'editable' | 'readonly';
    is_required: boolean;
    action: FlowNodeRelationAction;
    at: string;
}

export interface WorkOrderFlowGraph {
    name: string;
    lockTimeout: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
}

// The graph storage seam, serialize half — the parse half is
// asStoredGraph in validators.ts. The live flow document body's
// `graph` field carries this native nested object; the frozen
// plane (`work_orders.flow_graph`) keeps its own native copy.
// The stored JSON shape is a pinned
// contract (SCHEMA.md documents it; old rows and exported
// backups carry it), so domain graphs cross into rows ONLY
// through these mappers — a domain-type change cannot silently
// rewrite storage.
function storedNodeAttribute(
    ref: NodeAttribute,
): Record<string, unknown> {
    return {
        attribute_id: ref.attributeId,
        mode: ref.mode,
        isRequired: ref.isRequired,
    };
}

function storedGraphNode(
    node: GraphNode,
): Record<string, unknown> {
    const stored: Record<string, unknown> = {
        id: node.id,
        name: node.name,
        positionX: node.positionX,
        positionY: node.positionY,
        isCreate: node.isCreate,
        isArchive: node.isArchive,
        memberIds: node.memberIds,
        attributes:
            node.attributes.map(storedNodeAttribute),
        taskInstructions: node.taskInstructions,
    };
    const agentIds = node.agentIds;
    if (agentIds !== undefined && agentIds.length > 0) {
        stored['agentIds'] = agentIds;
    }
    return stored;
}

function storedGraphEdge(
    edge: GraphEdge,
): Record<string, unknown> {
    return {
        id: edge.id,
        name: edge.name,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
    };
}

export function storedGraph(
    graph: StoredGraph,
): Record<string, unknown> {
    return {
        nodes: graph.nodes.map(storedGraphNode),
        edges: graph.edges.map(storedGraphEdge),
    };
}

export function storedWorkOrderFlowGraph(
    graph: WorkOrderFlowGraph,
): Record<string, unknown> {
    return {
        name: graph.name,
        lockTimeout: graph.lockTimeout,
        nodes: graph.nodes.map(storedGraphNode),
        edges: graph.edges.map(storedGraphEdge),
    };
}

export interface WorkOrderEntity {
    id: Id;
    organization_id: Id;
    display_id: string;
    flow_graph: Record<string, unknown>;
    position: number;
    // GET embed when bound (absent when unbound).
    instance_id?: Id;
    record_type_id?: Id;
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
    // Domain lifecycle state. Ledger facts (at, event id)
    // live on the pair / etag / versions list, not here.
    state: string;
}

export interface RecordAttributeEntity {
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

// A flow tag: the codebase's FIRST message-plane-ONLY document
// family (Phase 14 Task 9) — no backing table, derived entirely
// from message pairs at /flows/:id/tags/:name. `id` is the tag's
// own NAME — user-authored address text (validateFlowTagName,
// api/validators.ts), never a generated id, unlike every sibling
// entity's `id` above. The body carries ONLY the pinned response
// id of the flow document message pair this tag names — never a
// copy of the flow's own content (Entangled Nouns).
export interface FlowTagEntity {
    id: string;
    flow_id: Id;
    flow_response_id: Id;
}

// Per-field values written when a state event
// records a work-order transition. Each row pins
// the payload to its parent event by state_event_id
// (Codd 1NF — a relation belongs in a table, not a
// column on the event row).
export interface StateFieldValueEntity {
    id: Id;
    state_event_id: Id;
    attribute_id: Id;
    value: string;
}

// Seat usage and last activity are NOT columns: both are
// derived from their ledgers at read time (memberships count;
// max states.at) — a stored aggregate would be a second truth
// kept in sync by nothing.
export interface OrganizationEntity {
    id: Id;
    name: string;
    domain: string;
    next_billing: string;
    seats: number;
    projects_limit: number;
    ideas_limit: number;
}

// Membership privilege within an organization. Baked into
// access-token role claims at mint as `{type}:{organization_id}`
// (e.g. admin:1). Elevate/demote is a membership PUT; there is
// no separate role-grants family.
export type MembershipType = 'admin' | 'member';

// The covenant binding an identity to an organization, with
// the moment of union and the privilege of that join. Source
// of "which orgs can this identity reach" and mint-time role
// baking. A person in N orgs has N membership rows;
// member.id === identity.id stays global (one profile, many
// memberships). Not a pure join: `type` is a privilege
// attribute of the relationship.
export interface MembershipEntity {
    id: Id;
    organization_id: Id;
    identity_id: Id;
    type: MembershipType;
    // The seat's own grant time
    // (validateSeatDocumentBody), a domain fact — NOT a
    // ledger fact. GET .../members/:id/versions/ stamps a
    // DIFFERENT `at` on each row: the message pair's own
    // arrival time (versionSnapshotsAt, document-family.ts,
    // seatEntityOf in derive-memberships.ts). Same name on
    // this entity and on that versions row, different facts.
    at: string;
}

// An invitation binding an identity to an organization, awaiting
// the holder's answer. Immutable like a membership, but its
// lifecycle lives in the states log (INVITATION_STATES). The org
// is the inviting admin's; the identity is the invitee. An
// ACCEPTED invitation is what writes the real membership row —
// the invitation itself never grants reach. Global-spine (not
// org-fenced), because the invitee must read an invitation to an
// org they are not yet in; the invitation routes fence by the
// caller's identity (invitee) or admin role (inviter).
export interface InvitationEntity {
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

// Domain lifecycle state for an idea. Ledger facts stay
// on the pair / etag / versions list.
export interface IdeaStateDetail {
    readonly state: IdeaState;
}

// Domain lifecycle state for an objective. Ledger facts
// stay on the pair / etag / versions list.
export interface ObjectiveStateDetail {
    readonly state: ObjectiveState;
}

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
        detail: IdeaStateDetail,
    ) {
        this.#id = entity.id;
        this.#title = entity.title;
        this.#position = entity.position;
        this.#state = detail.state;
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
        return this.#state === 'in_review';
    }

    isConvertible(): boolean {
        return this.#state === 'approved';
    }

    canBeSubmittedForReview(): boolean {
        return (
            this.#state === 'active'
            || this.#state === 'sent_back'
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

    isReady(): boolean {
        return this.readinessValue() === 'ready';
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

// Domain lifecycle state for a project. Ledger facts stay
// on the pair / etag / versions list.
export interface ProjectStateDetail {
    readonly state: ProjectState;
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
        detail: ProjectStateDetail,
    ) {
        this.#id = entity.id;
        this.#title = entity.title;
        this.#description =
            entity.description;
        this.#state = detail.state;
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

// Domain lifecycle state for a record-type. Ledger facts
// stay on the pair / etag / versions list.
export interface RecordStateDetail {
    readonly state: RecordState;
}

export class RecordModel {
    readonly #id: string;
    readonly #name: string;
    readonly #description: string;
    readonly #position: number;
    readonly #state: RecordState;

    constructor(
        entity: RecordEntity,
        detail: RecordStateDetail,
    ) {
        this.#id = entity.id;
        this.#name = entity.name;
        this.#description = entity.description;
        this.#position = entity.position;
        this.#state = detail.state;
    }

    idForLink(): string {
        return this.#id;
    }

    stateValue(): RecordState {
        return this.#state;
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
