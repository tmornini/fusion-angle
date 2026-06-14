import {
    $, $required, populateIcons,
} from '../app/dom.ts';
import {
    buildSkeleton, loadInto,
} from '../app/loading-states.ts';
import { navigateTo } from '../app/core.ts';
import { ICON_SIZE, iconArrowLeft } from '../app/icons.ts';
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
            iconArrowLeft(ICON_SIZE.xl, ''),
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
    await loadInto({
        container: list,
        skeleton: buildSkeleton('table', 3),
        fetch: () => getTokenChainsFor(
            ctx, identityId,
        ),
        retry: () => init(params),
        onData: chains => {
            new IdentityTokensPresenter(chains)
                .render(list);

            const refresh =
                async (): Promise<void> => {
                    const fresh =
                        await getTokenChainsFor(
                            sessionContext(),
                            identityId,
                        );
                    new IdentityTokensPresenter(
                        fresh,
                    ).render(list);
                };
            subscribeIdentityTokenChanges(
                () => void refresh(),
            );
        },
    });
}
