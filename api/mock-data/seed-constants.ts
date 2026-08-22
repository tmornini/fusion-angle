// Fixed seed constants shared by the mock-data composition: the
// reference timestamp and the two demo org ids the per-entity
// seed modules partition members across.

export const MOCK_SEED_TIMESTAMP =
    '2026-01-01T00:00:00.000000Z';

// The seed's root org id (Stark Industries). Local to the
// seed — there is no global default org any more.
export const STARK_ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';

// The demo's second organization. org 'BBjWJsjYIDkTRKIIPrzWRw' is a new ROW,
// not
// a new table — generate-schema-svg derives FK targets from
// *_id pluralization, so a new table would shift the schema.
export const ORGANIZATION_TWO = 'BBjWJsjYIDkTRKIIPrzWRw';

// Deterministic org partition for non-admin seeds: even
// index → org 'AjdvjuECVZEgZoFajaIEkg', odd →
// org 'BBjWJsjYIDkTRKIIPrzWRw'.
// ~half/half; the seed test
// pins per-org invariants, not the exact assignments.
export function assignOrganization(index: number): string {
    return index % 2 === 0 ? STARK_ORGANIZATION : ORGANIZATION_TWO;
}

// The tier limits every seeded organization row carries.
// Shared so the organization row write (mock-data.ts) and its
// own organizations/:id message pair (seed-message-pairs.ts's
// organizationSeedBody) can never diverge on these values —
// Phase 12 Task 3.
export const TIER_SEATS_LIMIT = 200;
export const TIER_PROJECTS_LIMIT = 50;
export const TIER_IDEAS_LIMIT = 1000;
