import {
    type Id,
    type IdentityProviderAction,
    type IdentityProviderEntity,
} from '../../../api/types.ts';
import {
    filterByField,
    type RequestContext,
} from './shared.ts';
import {
    latestByKey,
} from '../../../api/ledger-reduction.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';

const providerChanges =
    createSubscriptionChannel(
        ['identity_providers'],
    );

export function subscribeIdentityProviderChanges(
    fn: () => void,
): () => void {
    return providerChanges.subscribe(fn);
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
    return filterByField(all, 'identity_id', identityId)
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
    const forIdentity = filterByField(
        all, 'identity_id', identityId,
    );
    // Latest by `at`, not array order — latestByKey's default
    // >= tiebreak is the secure direction the siblings share.
    const latest = latestByKey(forIdentity, ev => ev.provider);
    const linked: string[] = [];
    for (const [provider, last] of latest) {
        if (last.action === 'linked') linked.push(provider);
    }
    return linked;
}
