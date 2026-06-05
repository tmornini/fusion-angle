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

// One provider link/unlink event in the domain idiom: the
// presenter reads camelCase, never the snake_case row.
export interface ProviderEvent {
    readonly provider: string;
    readonly providerSubject: string;
    readonly action: IdentityProviderAction;
    readonly at: string;
}

// The provider link/unlink EVENT LOG for one identity — the
// raw append-only ledger in chronological order, NOT the
// reduced current state (that is getProvidersFor). The UI
// renders this so a person sees every link and unlink.
export async function getProviderEvents(
    ctx: RequestContext,
    identityId: Id,
): Promise<ProviderEvent[]> {
    const all = await ctx.GET<IdentityProviderEntity[]>(
        'identity-providers',
    );
    return all
        .filter(ev => ev.identity_id === identityId)
        .map(ev => ({
            provider: ev.provider,
            providerSubject: ev.provider_subject,
            action: ev.action,
            at: ev.at,
        }));
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
    const latest = new Map<
        string,
        { action: IdentityProviderAction; at: string }
    >();
    for (const ev of all) {
        if (ev.identity_id !== identityId) continue;
        // Latest by `at`, not array order — same secure
        // `>=` tie-break the sibling ledgers reduce by.
        const prev = latest.get(ev.provider);
        if (prev === undefined || ev.at >= prev.at) {
            latest.set(
                ev.provider,
                { action: ev.action, at: ev.at },
            );
        }
    }
    const linked: string[] = [];
    for (const [provider, last] of latest) {
        if (last.action === 'linked') linked.push(provider);
    }
    return linked;
}
