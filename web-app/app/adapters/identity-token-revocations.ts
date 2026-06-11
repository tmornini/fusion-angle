import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';
import {
    nowUtc,
    type Id,
} from '../../../api/types.ts';
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
