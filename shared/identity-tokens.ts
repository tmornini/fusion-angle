import type {
    Id,
    IdentityTokenAction,
    IdentityTokenEntity,
} from './types.ts';

// Pure reads over token heads. The head of tokens/<jti> is
// the token's whole state (§6); succession orders one
// jti's events, so no rank breaks a tie.

function headOf(
    heads: readonly IdentityTokenEntity[],
    jti: string,
): IdentityTokenEntity | undefined {
    return heads.find((head) => head.jti === jti);
}

export function latestActionForJti(
    heads: readonly IdentityTokenEntity[],
    jti: string,
): IdentityTokenAction | null {
    const head = headOf(heads, jti);
    return head === undefined ? null : head.action;
}

export function chainIdForJti(
    heads: readonly IdentityTokenEntity[],
    jti: string,
): string | null {
    const head = headOf(heads, jti);
    return head === undefined ? null : head.chain_id;
}

export function jtisInChain(
    heads: readonly IdentityTokenEntity[],
    chainId: string,
): string[] {
    return heads
        .filter((head) => head.chain_id === chainId)
        .map((head) => head.jti);
}

// A presented token is denied iff its head is revoked.
export function isTokenRevoked(
    heads: readonly IdentityTokenEntity[],
    jti: string,
): boolean {
    return latestActionForJti(heads, jti) === 'revoked';
}

export function identityForJti(
    heads: readonly IdentityTokenEntity[],
    jti: string,
): Id | null {
    const head = headOf(heads, jti);
    return head === undefined ? null : head.identity_id;
}

// A later version keeps the parent its jti was issued with.
function parentOf(
    heads: readonly IdentityTokenEntity[],
    jti: string,
): { readonly parent_jti?: string } {
    const parent = headOf(heads, jti)?.parent_jti;
    return parent === undefined ? {} : { parent_jti: parent };
}

// The chain-wide revocation rows: one 'revoked' event per jti
// ever seen in the chain, all at one instant. Shared by the
// replay path of planRotation and the explicit revocation
// operation — one truth for what "revoke the chain" appends.
export function revocationAppends(
    heads: readonly IdentityTokenEntity[],
    chainId: string,
    identityId: Id,
    at: string,
): Omit<IdentityTokenEntity, 'id'>[] {
    return jtisInChain(heads, chainId).map(jti => ({
        jti, identity_id: identityId,
        action: 'revoked' as const, chain_id: chainId, at,
        ...parentOf(heads, jti),
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

// Whether two jtis sets are identical, order- and
// duplicate-insensitive — the token-write retry loop's
// divergence check (authentication.ts, Phase 13 Task 5): the
// FULL set of jtis a plan's appends touch, never `kind` alone.
// A concurrent sibling rotation can grow a replay's revocation
// set between the pre-tx and in-tx reads while `kind` stays
// 'replay' on both sides — comparing kinds alone would miss
// that growth and leave the new jti unrevoked.
export function jtiSetsEqual(
    a: readonly string[],
    b: readonly string[],
): boolean {
    const setA = new Set(a);
    const setB = new Set(b);
    if (setA.size !== setB.size) return false;
    for (const jti of setA) {
        if (!setB.has(jti)) return false;
    }
    return true;
}

export function planRotation(
    heads: readonly IdentityTokenEntity[],
    presentedJti: string,
    newJti: string,
    at: string,
): RotationPlan {
    const chainId = chainIdForJti(heads, presentedJti);
    const identityId = identityForJti(heads, presentedJti);
    if (chainId === null || identityId === null) {
        return { kind: 'unknown' };
    }
    if (latestActionForJti(heads, presentedJti) === 'issued') {
        return {
            kind: 'rotate',
            newJti,
            appends: [
                {
                    jti: presentedJti, identity_id: identityId,
                    action: 'rotated', chain_id: chainId, at,
                    ...parentOf(heads, presentedJti),
                },
                {
                    jti: newJti, identity_id: identityId,
                    action: 'issued', chain_id: chainId, at,
                    parent_jti: presentedJti,
                },
            ],
        };
    }
    return {
        kind: 'replay',
        appends: revocationAppends(
            heads, chainId, identityId, at,
        ),
    };
}
