import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';
import {
    nowUtc,
    type Id,
    type IdentityTokenEntity,
} from '../../../api/types.ts';
import {
    chainState,
    chainIdForJti,
    type TokenChainState,
} from '../../../api/identity-tokens.ts';
import { RequestError } from '../../../api/api.ts';
import type { RequestContext, WriteOp } from './shared.ts';

const HTTP_CONFLICT = 409;

// Presenting a refresh jti that is not live (already rotated
// away, revoked, or never issued) is reuse — the chain is
// revoked and this is thrown so the caller fails the grant.
export class TokenReuseError extends Error {
    readonly jti: string;
    constructor(jti: string) {
        super('refresh token is not live (reuse): ' + jti);
        this.name = 'TokenReuseError';
        this.jti = jti;
    }
}

function eventOp(
    row: Omit<IdentityTokenEntity, 'id'>,
): WriteOp {
    return {
        method: 'put',
        resource:
            `identity-tokens/${generateCryptoSafeBase62()}`,
        body: row,
    };
}

// Issue a token as a fresh chain root. Returns the jti so the
// caller can mint an access/refresh token bound to it.
export async function postTokenIssue(
    ctx: RequestContext,
    identityId: Id,
): Promise<string> {
    const jti = generateCryptoSafeBase62();
    await ctx.commit({
        ops: [eventOp({
            jti,
            identity_id: identityId,
            action: 'issued',
            chain_id: generateCryptoSafeBase62(),
            parent_jti: '',
            at: nowUtc(),
        })],
    });
    return jti;
}

// Rotate a live refresh jti: the rotation route retires it
// and issues a successor in the same chain, deciding and
// appending in ONE server-side transaction (a concurrent
// reuse cannot double-rotate). A 409 is reuse — the route
// has already revoked the whole chain — surfaced here as
// TokenReuseError.
export async function postTokenRotation(
    ctx: RequestContext,
    presentedJti: string,
): Promise<string> {
    try {
        const { jti } = await ctx.POST<{ jti: string }>(
            `identity-tokens/${presentedJti}/rotation`, {},
        );
        return jti;
    } catch (err) {
        if (
            err instanceof RequestError
            && err.status === HTTP_CONFLICT
        ) {
            throw new TokenReuseError(presentedJti);
        }
        throw err;
    }
}

// Explicitly revoke the chain a jti belongs to (e.g. logging
// out a single session) — one atomic server-side transaction.
// A no-op for an unknown jti.
export async function postTokenRevocation(
    ctx: RequestContext,
    jti: string,
): Promise<void> {
    await ctx.POST(
        `identity-tokens/${jti}/revocation`, {},
    );
}

// One refresh-rotation event in the domain idiom: the
// presenter reads camelCase, never the snake_case row.
export interface TokenEvent {
    readonly jti: string;
    readonly parentJti: string;
    readonly action: IdentityTokenEntity['action'];
    readonly at: string;
}

// One refresh-rotation lineage: the chain_id plus its events
// in append (chronological) order.
export interface TokenChain {
    readonly chainId: string;
    readonly events: readonly TokenEvent[];
}

// All token chains for one identity: read the ledger, keep
// this identity's rows, then group by chain_id. The UI
// renders each chain so a session's issue/rotate/revoke
// lineage reads as one unit.
export async function getTokenChainsFor(
    ctx: RequestContext,
    identityId: Id,
): Promise<TokenChain[]> {
    const rows = await ctx.GET<IdentityTokenEntity[]>(
        'identity-tokens',
    );
    const byChain = new Map<string, TokenEvent[]>();
    for (const row of rows) {
        if (row.identity_id !== identityId) continue;
        const event: TokenEvent = {
            jti: row.jti,
            parentJti: row.parent_jti,
            action: row.action,
            at: row.at,
        };
        const events = byChain.get(row.chain_id);
        if (events) {
            events.push(event);
        } else {
            byChain.set(row.chain_id, [event]);
        }
    }
    const chains: TokenChain[] = [];
    for (const [chainId, events] of byChain) {
        chains.push({ chainId, events });
    }
    return chains;
}

// The current state of the chain a jti belongs to (null if the
// jti is unknown).
export async function getTokenChainState(
    ctx: RequestContext,
    jti: string,
): Promise<TokenChainState | null> {
    const rows = await ctx.GET<IdentityTokenEntity[]>(
        'identity-tokens',
    );
    const chainId = chainIdForJti(rows, jti);
    if (chainId === null) return null;
    return chainState(rows, chainId);
}
