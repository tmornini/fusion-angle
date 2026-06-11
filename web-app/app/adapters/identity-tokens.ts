import {
    type Id,
    type IdentityTokenEntity,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';

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
