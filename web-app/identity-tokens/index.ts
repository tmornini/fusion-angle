import { $, populateIcons } from '../app/dom.ts';
import {
    buildSkeleton, withLoadingState,
} from '../app/loading-states.ts';
import { navigateTo } from '../app/core.ts';
import { iconArrowLeft } from '../app/icons.ts';
import {
    sessionContext,
    getTokenChainsFor,
} from '../app/adapters/index.ts';
import {
    IdentityTokensPresenter,
} from '../app/presenters/index.ts';

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const identityId = params?.identityId;
    if (!identityId) {
        navigateTo('identities');
        return;
    }

    populateIcons([
        [
            '#identity-tokens-back-icon',
            iconArrowLeft(20, ''),
        ],
    ]);
    $('#identity-tokens-back', document)
        ?.addEventListener('click', () => {
            navigateTo('identity-detail', { identityId });
        });

    const list = $('#identity-tokens-list', document);
    if (!list) return;

    const ctx = sessionContext();
    const chains = await withLoadingState(
        list,
        buildSkeleton('table', 3),
        () => getTokenChainsFor(ctx, identityId),
        () => init(params),
    );
    if (!chains) return;

    new IdentityTokensPresenter(chains)
        .render(list);
}
