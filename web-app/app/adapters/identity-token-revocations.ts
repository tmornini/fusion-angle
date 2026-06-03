import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';
import {
    nowUtc,
    type Id,
    type IdentityTokenRevocationEntity,
} from '../../../api/types.ts';
import {
    latestRevocationAt,
} from '../../../api/access-token.ts';
import type { RequestContext } from './shared.ts';

export async function postIdentityLogoutEverywhere(
    ctx: RequestContext,
    identityId: Id,
): Promise<void> {
    const id = generateCryptoSafeBase62();
    await ctx.PUT(
        `identity-token-revocations/${id}`,
        { identity_id: identityId, at: nowUtc() },
    );
}

export async function getRevokedBefore(
    ctx: RequestContext,
    identityId: Id,
): Promise<string | null> {
    const all = await ctx.GET<
        IdentityTokenRevocationEntity[]
    >('identity-token-revocations');
    return latestRevocationAt(all, identityId);
}
