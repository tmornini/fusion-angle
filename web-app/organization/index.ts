import { $, $$, attr } from '../app/dom';
import { setHtml } from '../app/safe-html';
import {
    buildSkeleton, buildErrorState,
} from '../app/loading-states';
import {
    navigateTo,
} from '../app/core';
import {
    getAccount,
} from '../app/adapters';
import {
    AccountPresenter,
} from '../app/presenters';

export async function init(): Promise<void> {
    const container =
        $('#account-content', document);
    if (!container) return;

    setHtml(
        container,
        buildSkeleton('detail', 4),
    );

    let account: Awaited<
        ReturnType<typeof getAccount>
    >;
    try {
        account = await getAccount();
    } catch {
        setHtml(
            container,
            buildErrorState(
                'Failed to load'
                + ' account data.',
                'Try Again',
            ),
        );
        container
            .querySelector(
                '[data-retry-btn]',
            )
            ?.addEventListener(
                'click', () => init(),
            );
        return;
    }

    const presenter =
        new AccountPresenter(account);
    setHtml(
        container,
        presenter.buildPage(),
    );

    $$('[data-nav-to]', document).forEach(
        navButton => {
            navButton.addEventListener(
                'click',
                () => navigateTo(
                    attr(
                        navButton,
                        'data-nav-to',
                    ),
                ),
            );
        },
    );
}
