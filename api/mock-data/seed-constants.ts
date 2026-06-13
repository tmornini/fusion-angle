// Fixed seed constants shared by the mock-data composition: the
// reference timestamp and the two demo org ids the per-entity
// seed modules partition members across.

export const MOCK_SEED_TIMESTAMP =
    '2026-01-01T00:00:00.000000Z';

// The seed's root org id (Stark Industries). Local to the
// seed — there is no global default org any more.
export const STARK_ORG = '1';

// The demo's second organization. org '2' is a new ROW, not
// a new table — generate-schema-svg derives FK targets from
// *_id pluralization, so a new table would shift the schema.
export const ORG_TWO = '2';

// Deterministic org partition for non-admin seeds: even
// index → org '1', odd → org '2'. ~half/half; the seed test
// pins per-org invariants, not the exact assignments.
export function assignOrg(index: number): string {
    return index % 2 === 0 ? STARK_ORG : ORG_TWO;
}
