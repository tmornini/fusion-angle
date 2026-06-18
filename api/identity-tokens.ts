import type {
    Id,
    IdentityTokenAction,
    IdentityTokenEntity,
} from './types.ts';
import {
    latestByKey,
    findFirstByKey,
} from '../shared/ledger-reduction.ts';

// Pure reductions over the append-only identity_tokens ledger.
// The store is a dumb log; current validity is derived here.

// On an equal-`at` tie the FAIL-CLOSED action wins regardless
// of row order — a revoke beats a co-timestamped rotate or
// issue on every backend. Equal actions fall to the id tail
// for determinism.
const ACTION_RANK: Record<IdentityTokenAction, number> = {
    revoked: 2,
    rotated: 1,
    issued: 0,
};

function failClosed(
    candidate: IdentityTokenEntity,
    incumbent: IdentityTokenEntity,
): boolean {
    if (candidate.at !== incumbent.at) {
        return candidate.at > incumbent.at;
    }
    const c = ACTION_RANK[candidate.action];
    const i = ACTION_RANK[incumbent.action];
    if (c !== i) return c > i;
    return candidate.id > incumbent.id;
}

// The latest lifecycle action for a jti, or null if it has no
// events. A same-`at` tie falls to the fail-closed rank above.
export function latestActionForJti(
    rows: readonly IdentityTokenEntity[],
    jti: string,
): IdentityTokenAction | null {
    const latest = latestByKey(
        rows, row => row.jti, failClosed,
    ).get(jti);
    return latest === undefined ? null : latest.action;
}

// The chain_id a jti belongs to (null if unknown). Every event
// for a jti carries the same chain_id, so the first match wins.
export function chainIdForJti(
    rows: readonly IdentityTokenEntity[],
    jti: string,
): string | null {
    return findFirstByKey(
        rows, row => row.jti === jti, row => row.chain_id,
    );
}

// Every distinct jti that has ever appeared in a chain — the
// set a chain-wide revocation must mark revoked.
export function jtisInChain(
    rows: readonly IdentityTokenEntity[],
    chainId: string,
): string[] {
    const seen = new Set<string>();
    for (const row of rows) {
        if (row.chain_id === chainId) seen.add(row.jti);
    }
    return [...seen];
}

// The gate's check: a presented token is denied iff its jti's
// latest action is 'revoked'. Unknown jtis (session / dev tokens
// never recorded here) and live ('issued') tokens pass; coarse
// log-out-everywhere is the SEPARATE identity_token_revocations
// ledger.
export function isTokenRevoked(
    rows: readonly IdentityTokenEntity[],
    jti: string,
): boolean {
    return latestActionForJti(rows, jti) === 'revoked';
}

// The identity that owns a jti (null if unknown). A chain
// belongs to one identity, so any row for the jti answers.
export function identityForJti(
    rows: readonly IdentityTokenEntity[],
    jti: string,
): Id | null {
    return findFirstByKey(
        rows, row => row.jti === jti, row => row.identity_id,
    );
}

// The predecessor of each successor jti, DERIVED from the
// ledger for display only: a rotation appends a 'rotated' (old)
// and an 'issued' (new) at one shared `at` within a chain, so a
// successor's parent is the jti 'rotated' at its 'issued'
// instant. A root 'issued' has no co-`at` 'rotated', so it gets
// no entry — absence IS root-of-chain (the value `parent_jti`
// once stored as ''). Scoped per chain so the pairing needs
// only a per-chain-unique `at`, not a global one.
//
// This drives no computation today; it feeds one display line.
// Promote to a STORED lineage relation only when a path must
// traverse or query lineage — when the parent would drive
// computation. Until then, deriving honors derive-from-ledger.
export function parentJtiByJti(
    rows: readonly IdentityTokenEntity[],
): Map<string, string> {
    const rotatedByChainAt =
        new Map<string, Map<string, string>>();
    for (const row of rows) {
        if (row.action !== 'rotated') continue;
        let byAt = rotatedByChainAt.get(row.chain_id);
        if (byAt === undefined) {
            byAt = new Map<string, string>();
            rotatedByChainAt.set(row.chain_id, byAt);
        }
        byAt.set(row.at, row.jti);
    }
    const parent = new Map<string, string>();
    for (const row of rows) {
        if (row.action !== 'issued') continue;
        const predecessor =
            rotatedByChainAt.get(row.chain_id)?.get(row.at);
        if (predecessor !== undefined) {
            parent.set(row.jti, predecessor);
        }
    }
    return parent;
}

// The chain-wide revocation rows: one 'revoked' event per jti
// ever seen in the chain, all at one instant. Shared by the
// replay path of planRotation and the explicit revocation
// operation — one truth for what "revoke the chain" appends.
export function revocationAppends(
    rows: readonly IdentityTokenEntity[],
    chainId: string,
    identityId: Id,
    at: string,
): Omit<IdentityTokenEntity, 'id'>[] {
    return jtisInChain(rows, chainId).map(jti => ({
        jti, identity_id: identityId,
        action: 'revoked' as const, chain_id: chainId, at,
    }));
}

// The lifecycle rows a refresh produces, decided purely. A LIVE
// jti rotates (retire it, issue a successor in the chain); a
// known but non-live jti is REPLAY (revoke every jti in the
// chain); an unknown jti was never issued by us. The caller
// supplies the new jti + timestamp and applies the appends.
export type RotationPlan =
    | {
        readonly kind: 'rotate';
        readonly newJti: string;
        readonly appends:
            readonly Omit<IdentityTokenEntity, 'id'>[];
    }
    | {
        readonly kind: 'replay';
        readonly appends:
            readonly Omit<IdentityTokenEntity, 'id'>[];
    }
    | { readonly kind: 'unknown' };

export function planRotation(
    rows: readonly IdentityTokenEntity[],
    presentedJti: string,
    newJti: string,
    at: string,
): RotationPlan {
    const chainId = chainIdForJti(rows, presentedJti);
    const identityId = identityForJti(rows, presentedJti);
    if (chainId === null || identityId === null) {
        return { kind: 'unknown' };
    }
    if (latestActionForJti(rows, presentedJti) === 'issued') {
        return {
            kind: 'rotate',
            newJti,
            appends: [
                {
                    jti: presentedJti, identity_id: identityId,
                    action: 'rotated', chain_id: chainId, at,
                },
                {
                    jti: newJti, identity_id: identityId,
                    action: 'issued', chain_id: chainId, at,
                },
            ],
        };
    }
    return {
        kind: 'replay',
        appends: revocationAppends(
            rows, chainId, identityId, at,
        ),
    };
}
