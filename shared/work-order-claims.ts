import {
    msSinceUtc,
    MS_PER_SECOND,
} from './types.ts';

// The closed claim vocabulary. Three strings: a claim
// either exists ('claimed'), is voluntarily relinquished
// ('claim_released'), or is forcibly superseded by a
// newer claim ('claim_expired'). Every other state
// string on a work_order entity_id is a node id
// recording a transition. The byte-level split between
// the two families is unambiguous: claim strings are
// snake-cased English, node ids are base62 tokens.
//
// Shared by the work-order version (api/) and the
// work-order adapters — one vocabulary, both sides of the
// wire.
export const CLAIM_STATES: ReadonlySet<string> = new Set([
    'claimed',
    'claim_released',
    'claim_expired',
]);

export function isClaimState(state: string): boolean {
    return CLAIM_STATES.has(state);
}

// Stored claim fact vs the clock: at expires_at itself the
// claim has lapsed.
export function isExpiresAtPassed(
    expiresAt: string,
): boolean {
    return msSinceUtc(expiresAt) >= 0;
}

export function addUtcSeconds(
    iso: string,
    seconds: number,
): string {
    const ms = Date.parse(iso)
        + seconds * MS_PER_SECOND;
    return new Date(ms).toISOString().replace(
        'Z', '000Z',
    );
}
