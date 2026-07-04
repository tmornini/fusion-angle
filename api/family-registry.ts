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
// PROVISIONAL until the third family registers: the slot count
// and names above may still change. Two instances are
// coincidence; three is pattern — do not add slots, families,
// or helpers ahead of that third entry.

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
];

export function familyRegistration(
    family: string,
): FamilyRegistration | undefined {
    return FAMILY_REGISTRY.find(
        (entry) => entry.family === family,
    );
}
