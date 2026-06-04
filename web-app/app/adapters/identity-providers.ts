import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';
import {
    nowUtc,
    type Id,
    type IdentityProviderAction,
    type IdentityProviderEntity,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';

async function appendProviderEvent(
    ctx: RequestContext,
    identityId: Id,
    provider: string,
    providerSubject: string,
    action: IdentityProviderAction,
): Promise<void> {
    const id = generateCryptoSafeBase62();
    await ctx.PUT(`identity-providers/${id}`, {
        identity_id: identityId,
        provider,
        provider_subject: providerSubject,
        action,
        at: nowUtc(),
    });
}

export async function postProviderLink(
    ctx: RequestContext,
    identityId: Id,
    provider: string,
    providerSubject: string,
): Promise<void> {
    await appendProviderEvent(
        ctx, identityId, provider, providerSubject, 'linked',
    );
}

export async function postProviderUnlink(
    ctx: RequestContext,
    identityId: Id,
    provider: string,
    providerSubject: string,
): Promise<void> {
    await appendProviderEvent(
        ctx, identityId, provider, providerSubject,
        'unlinked',
    );
}

// The providers an identity currently has linked: the latest
// action per provider that is 'linked'. Append order is
// chronological → last wins (same reduce as credentials).
export async function getProvidersFor(
    ctx: RequestContext,
    identityId: Id,
): Promise<string[]> {
    const all = await ctx.GET<IdentityProviderEntity[]>(
        'identity-providers',
    );
    const latest = new Map<string, IdentityProviderAction>();
    for (const ev of all) {
        if (ev.identity_id !== identityId) continue;
        latest.set(ev.provider, ev.action);
    }
    const linked: string[] = [];
    for (const [provider, action] of latest) {
        if (action === 'linked') linked.push(provider);
    }
    return linked;
}
