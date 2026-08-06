// The per-family registry: the single source of truth for a
// family's cross-cutting properties — organization-nesting
// tier, PUT concurrency class, and create-address body field —
// that Phase 1 spread across parallel literal tables in
// message-pair.ts (ORGANIZATION_NESTED_FIRST_SEGMENTS,
// CREATE_BODY_ID_FIELDS). Ideas is the FIRST registered family
// (Phase 2 Task 1); each later family's registration retires
// its OWN entries from those literals, never both at once — a
// registered family answers ONLY from here.
//
// The standing rule: this registry is the single source of
// family wiring. Slots grow only on per-family evidence — two
// instances are coincidence, three is pattern — never ahead of
// it. Aspirational families (policy, transform, ownership,
// among others) wait for their own demand before a slot, a
// registration, or a helper is added on their behalf.

export type ConcurrencyClass =
    'simple' | 'locked' | 'create-only';

export interface FamilyRegistration {
    readonly family: string;        // first path segment
    readonly organizationNested: boolean; // address tier
    readonly concurrency: ConcurrencyClass; // REQUIRED —
        // no default; every PUT family declares its class
        // before it ships (spec: the two PUT classes)
    readonly createBodyIdField: string; // genesis address
}

export const FAMILY_REGISTRY: readonly FamilyRegistration[] = [
    {
        family: 'ideas',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    },
    {
        family: 'projects',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    },
    {
        family: 'flows',
        organizationNested: true,
        concurrency: 'locked',
        createBodyIdField: 'id',
    },
    {
        family: 'work-orders',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    },
    {
        family: 'record-types',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    },
    {
        // Nested attributes under a type share storage under
        // the type prefix; this row remains for registry
        // completeness (stateless sub-family).
        family: 'record-attributes',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    },
    {
        family: 'objectives',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    },
    {
        family: 'memberships',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id', // INERT — no collection POST
            // exists for memberships; a row is created only
            // when an invitee accepts an invitation (see
            // adapters/invitations.ts) — the projects-precedent
            // inert slot (message-pair.ts): this lookup never
            // fires.
    },
    {
        family: 'members',
        organizationNested: false, // the FIRST global-plane
            // row: the members roster is derived from the
            // memberships ledger across every organization,
            // never an organization-scoped store.
        concurrency: 'simple',
        createBodyIdField: 'id', // INERT — no collection POST
            // exists for members either; the same inert slot
            // as memberships above.
    },
    {
        family: 'ai-members',
        organizationNested: false,
        concurrency: 'simple',
        createBodyIdField: 'id',
    },
    {
        family: 'human-members',
        organizationNested: false,
        concurrency: 'simple',
        createBodyIdField: 'id',
    },
    {
        family: 'identities',
        organizationNested: false, // GLOBAL plane, like
            // members/ai-members/human-members: the identity
            // spine spans every organization, never scoped to
            // one.
        concurrency: 'simple',
        createBodyIdField: 'id', // LIVE — POST /identities
            // consults this slot for its bare collection-POST
            // create route (unlike the projects/members-family
            // inert-slot precedent above).
    },
    {
        family: 'organizations',
        organizationNested: false, // the tenant ROOT itself:
            // an organization can never be nested under
            // another organization — global plane, like
            // members/ai-members/human-members/identities.
        concurrency: 'simple', // routes.ts's own PUT
            // organizations/:id comment: "a repeat PUT
            // records Supersedes" — the simple-class chain
            // (spec §The two PUT classes), never
            // If-Response-ID/Follows.
        createBodyIdField: 'id', // INERT — no collection POST
            // exists for organizations either (route(
            // 'organizations', {get}) is GET-only); the same
            // inert slot as memberships/members above.
    },
];

export function familyRegistration(
    family: string,
): FamilyRegistration | undefined {
    return FAMILY_REGISTRY.find(
        (entry) => entry.family === family,
    );
}

// Org-nested record-types wire addresses (Task 2). Nested-
// primary; the path org is never authorization alone — the
// gate's org-match arm compares it to the fenced token org.
export const RECORD_TYPES_COLLECTION_PATTERN =
    'organizations/:organization-id/record-types';
export const RECORD_TYPE_DETAIL_PATTERN =
    RECORD_TYPES_COLLECTION_PATTERN + '/:record-type-id';
export const RECORD_TYPE_HISTORY_PATTERN =
    RECORD_TYPE_DETAIL_PATTERN + '/history';
// Nested attributes under a record type (Task 7).
export const ATTRIBUTES_COLLECTION_PATTERN =
    RECORD_TYPE_DETAIL_PATTERN + '/attributes';
export const ATTRIBUTE_DETAIL_PATTERN =
    ATTRIBUTES_COLLECTION_PATTERN + '/:attribute-id';
// Nested instances under a record type (Task 14 patterns;
// routes land in Tasks 15–19).
export const INSTANCES_COLLECTION_PATTERN =
    RECORD_TYPE_DETAIL_PATTERN + '/instances';
export const INSTANCE_DETAIL_PATTERN =
    INSTANCES_COLLECTION_PATTERN + '/:instance-id';
export const INSTANCE_HISTORY_PATTERN =
    INSTANCE_DETAIL_PATTERN + '/history';

// Create-only PUT addresses (Task 15): If-Match rejected;
// in-tx spent-address check owns the race. NOT registered
// in DOCUMENT_CLASS_ROUTE_PATTERNS (R10) — headPairId stays
// undefined so genesis carries neither supersedes nor
// follows.
export const CREATE_ONLY_PUT_ROUTE_PATTERNS:
    ReadonlySet<string> =
    new Set([INSTANCE_DETAIL_PATTERN]);
