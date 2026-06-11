import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';
import {
    nowUtc,
    type Id,
    type RoleGrantAction,
} from '../../../api/types.ts';
import {
    type RequestContext,
} from './shared.ts';

async function appendRoleEvent(
    ctx: RequestContext,
    identityId: Id,
    role: string,
    action: RoleGrantAction,
): Promise<void> {
    const id = generateCryptoSafeBase62();
    await ctx.PUT(`role-grants/${id}`, {
        identity_id: identityId,
        role,
        action,
        by_member_id: ctx.identity.id,
        at: nowUtc(),
    });
}

export async function postRoleRevocation(
    ctx: RequestContext,
    identityId: Id,
    role: string,
): Promise<void> {
    await appendRoleEvent(ctx, identityId, role, 'revoked');
}
