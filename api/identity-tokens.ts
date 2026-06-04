import type {
    Id,
    IdentityTokenAction,
    IdentityTokenEntity,
} from './types.ts';

// Pure reductions over the append-only identity_tokens ledger.
// The store is a dumb log; current validity is derived here.

// The latest lifecycle action for a jti, or null if it has no
// events. RFC-3339 zulu `at` sorts lexically = chronologically;
// a same-instant tie keeps the LATER-APPENDED event (>=) — the
// secure direction, so a revoke beats a co-timestamped issue.
export function latestActionForJti(
    rows: readonly IdentityTokenEntity[],
    jti: string,
): IdentityTokenAction | null {
    let latest:
        { action: IdentityTokenAction; at: string } | null
        = null;
    for (const row of rows) {
        if (row.jti !== jti) continue;
        if (latest === null || row.at >= latest.at) {
            latest = { action: row.action, at: row.at };
        }
    }
    return latest === null ? null : latest.action;
}

// The chain_id a jti belongs to (null if unknown). Every event
// for a jti carries the same chain_id, so the first match wins.
export function chainIdForJti(
    rows: readonly IdentityTokenEntity[],
    jti: string,
): string | null {
    for (const row of rows) {
        if (row.jti === jti) return row.chain_id;
    }
    return null;
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
    for (const row of rows) {
        if (row.jti === jti) return row.identity_id;
    }
    return null;
}

// The derived state of a chain: its current live jti (the one
// whose latest action is 'issued', or null if none) and whether
// any jti in it has been revoked.
export interface TokenChainState {
    readonly chainId: string;
    readonly liveJti: string | null;
    readonly revoked: boolean;
}

export function chainState(
    rows: readonly IdentityTokenEntity[],
    chainId: string,
): TokenChainState | null {
    const jtis = jtisInChain(rows, chainId);
    if (jtis.length === 0) return null;
    let liveJti: string | null = null;
    let revoked = false;
    for (const jti of jtis) {
        const action = latestActionForJti(rows, jti);
        if (action === 'issued') liveJti = jti;
        if (action === 'revoked') revoked = true;
    }
    return { chainId, liveJti, revoked };
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
                    action: 'rotated', chain_id: chainId,
                    parent_jti: '', at,
                },
                {
                    jti: newJti, identity_id: identityId,
                    action: 'issued', chain_id: chainId,
                    parent_jti: presentedJti, at,
                },
            ],
        };
    }
    return {
        kind: 'replay',
        appends: jtisInChain(rows, chainId).map(jti => ({
            jti, identity_id: identityId,
            action: 'revoked' as const, chain_id: chainId,
            parent_jti: '', at,
        })),
    };
}
