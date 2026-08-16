import {
    msSinceUtc,
    MS_PER_SECOND,
    type Id,
    type StateEntity,
} from './types.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';

// The closed claim vocabulary. Three strings: a claim
// either exists ('claimed'), is voluntarily relinquished
// ('claim_released'), or is forcibly superseded by a
// newer claim ('claim_expired'). Every other state
// string on a work_order entity_id is a node id
// recording a transition. The byte-level split between
// the two families is unambiguous: claim strings are
// snake-cased English, node ids are base62 tokens.
//
// Shared by the claim route (api.ts) and the work-order
// adapters — one vocabulary, one reduction, both sides
// of the wire.
export const CLAIM_STATES: ReadonlySet<string> = new Set([
    'claimed',
    'claim_released',
    'claim_expired',
]);

export function isClaimState(state: string): boolean {
    return CLAIM_STATES.has(state);
}

// Locate the latest claim-vocabulary event for one work
// order from a snapshot of the states log. Returns null
// if none. The claim route reduces with this inside the
// claim transaction; the transition adapter uses it to
// notice a live claim its transition implicitly releases.
export function latestClaimEvent(
    states: readonly StateEntity[],
    workOrderId: Id,
): StateEntity | null {
    const claims = states.filter(
        ev => ev.entity_id === workOrderId
            && CLAIM_STATES.has(ev.state),
    );
    return latestByKey(claims, ev => ev.entity_id)
        .get(workOrderId) ?? null;
}

// A 'claimed' event older than the flow's lockTimeout is
// implicitly expired: it reads as no live claim, and the
// next claim materializes the 'claim_expired' event.
export function isClaimEventExpired(
    claim: StateEntity,
    lockTimeoutSeconds: number,
): boolean {
    return msSinceUtc(claim.at)
        >= lockTimeoutSeconds * MS_PER_SECOND;
}

// Stored claim-document fact vs the clock. A missing
// expires_at is not judged here — callers fall back to
// isClaimEventExpired (at + lockTimeout).
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
