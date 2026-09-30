import {
    generateIdentifier,
} from '../shared/identifier.ts';
import {
    nowUtc,
    type Id,
} from '../shared/types.ts';
import type { RequestContext } from './request-context.ts';

export async function postIdentityLogoutEverywhere(
    ctx: RequestContext,
    identityId: Id,
): Promise<void> {
    const id = generateIdentifier();
    await ctx.PUT(
        `identities/${identityId}/token-revocations/${id}`,
        { at: nowUtc() },
    );
}
