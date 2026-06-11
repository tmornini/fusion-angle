import {
    $, $required, populateIcons,
} from '../app/dom.ts';
import {
    buildSkeleton, withLoadingState,
} from '../app/loading-states.ts';
import { navigateTo } from '../app/core.ts';
import { iconArrowLeft } from '../app/icons.ts';
import {
    sessionContext,
    getTokenChainsFor,
    subscribeIdentityTokenChanges,
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

    const list = $required(
        '#identity-tokens-list', document,
    );

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

    const refresh = async (): Promise<void> => {
        const fresh = await getTokenChainsFor(
            sessionContext(), identityId,
        );
        new IdentityTokensPresenter(fresh)
            .render(list);
    };
    subscribeIdentityTokenChanges(
        () => void refresh(),
    );
}
