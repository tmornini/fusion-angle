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

export type ConcurrencyClass = 'simple' | 'locked';

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
        family: 'records',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    },
    {
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
];

export function familyRegistration(
    family: string,
): FamilyRegistration | undefined {
    return FAMILY_REGISTRY.find(
        (entry) => entry.family === family,
    );
}
