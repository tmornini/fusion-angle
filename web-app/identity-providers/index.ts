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
    getProviderEvents,
    subscribeIdentityProviderChanges,
} from '../app/adapters/index.ts';
import {
    IdentityProvidersPresenter,
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
            '#identity-providers-back-icon',
            iconArrowLeft(20, ''),
        ],
    ]);
    $('#identity-providers-back', document)
        ?.addEventListener('click', () => {
            navigateTo('identity-detail', { identityId });
        });

    const list = $required(
        '#identity-providers-list', document,
    );

    const ctx = sessionContext();
    const events = await withLoadingState(
        list,
        buildSkeleton('table', 3),
        () => getProviderEvents(ctx, identityId),
        () => init(params),
    );
    if (!events) return;

    new IdentityProvidersPresenter(events)
        .render(list);

    const refresh = async (): Promise<void> => {
        const fresh = await getProviderEvents(
            sessionContext(), identityId,
        );
        new IdentityProvidersPresenter(fresh)
            .render(list);
    };
    subscribeIdentityProviderChanges(
        () => void refresh(),
    );
}
