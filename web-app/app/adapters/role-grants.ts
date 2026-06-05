import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';
import {
    nowUtc,
    DEFAULT_ORG,
    type Id,
    type RoleGrantAction,
    type RoleGrantEntity,
} from '../../../api/types.ts';
import {
    currentRolesForInOrg,
} from '../../../api/authorization.ts';
import type { RequestContext } from './shared.ts';

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

export async function postRoleGrant(
    ctx: RequestContext,
    identityId: Id,
    role: string,
): Promise<void> {
    await appendRoleEvent(ctx, identityId, role, 'granted');
}

export async function postRoleRevocation(
    ctx: RequestContext,
    identityId: Id,
    role: string,
): Promise<void> {
    await appendRoleEvent(ctx, identityId, role, 'revoked');
}

export async function getRolesFor(
    ctx: RequestContext,
    identityId: Id,
): Promise<string[]> {
    const all = await ctx.GET<RoleGrantEntity[]>(
        'role-grants',
    );
    return currentRolesForInOrg(
        all, identityId,
        ctx.identity.organization ?? DEFAULT_ORG,
    );
}
