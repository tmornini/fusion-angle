import { $, $$, getRequiredAttribute } from '../app/dom';
import { mutateHtml } from '../app/safe-html';
import {
    buildSkeleton, buildErrorState,
} from '../app/loading-states';
import { log } from '../app/logger';
import {
    navigateTo,
} from '../app/core';
import {
    getOrganization,
} from '../app/adapters';
import {
    OrganizationPresenter,
} from '../app/presenters';

export async function init(): Promise<void> {
    const container =
        $('#organization-content', document);
    if (!container) return;

    mutateHtml(
        container,
        buildSkeleton('detail', 4),
    );

    let organization: Awaited<
        ReturnType<typeof getOrganization>
    >;
    try {
        organization = await getOrganization();
    } catch (err) {
        log.error(
            'getOrganization failed',
            'organization',
            err,
        );
        mutateHtml(
            container,
            buildErrorState(
                'Failed to load'
                + ' organization data.',
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
        new OrganizationPresenter(organization);
    mutateHtml(
        container,
        presenter.buildPage(),
    );

    $$('[data-nav-to]', document).forEach(
        navButton => {
            navButton.addEventListener(
                'click',
                () => navigateTo(
                    getRequiredAttribute(
                        navButton,
                        'data-nav-to',
                    ),
                ),
            );
        },
    );
}
