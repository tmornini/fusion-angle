import { $, $$, getRequiredAttribute } from '../app/dom.ts';
import { setHtml } from '../app/safe-html.ts';
import {
    buildSkeleton, buildErrorState,
} from '../app/loading-states.ts';
import { log } from '../app/logger.ts';
import {
    navigateTo,
} from '../app/core.ts';
import {
    getOrganization,
    getCompany,
    getActivityRows,
    getActivityActorRows,
    getUserMap,
    userName,
    createFetchContext,
    RECENT_ACTIVITY_COUNT,
    type RecentActivityItem,
} from '../app/adapters/index.ts';
import {
    OrganizationPresenter,
} from '../app/presenters/index.ts';

export async function init(): Promise<void> {
    const container =
        $('#organization-content', document);
    if (!container) return;

    setHtml(
        container,
        buildSkeleton('detail', 4),
    );

    const ctx = createFetchContext();
    let presenter: OrganizationPresenter;
    try {
        const [
            org, company,
            activities, actors, userMap,
        ] = await Promise.all([
            getOrganization(),
            getCompany(),
            getActivityRows(),
            getActivityActorRows(),
            getUserMap(ctx),
        ]);
        const actorMap = new Map(
            actors.map(a => [
                a.activity_id, a.user_id,
            ]),
        );
        const recent: RecentActivityItem[] =
            activities
                .slice(
                    0, RECENT_ACTIVITY_COUNT,
                )
                .map(a => {
                    const actorId =
                        actorMap.get(a.id);
                    if (!actorId) {
                        throw new Error(
                            'Activity has'
                            + ' no actor: '
                            + a.id,
                        );
                    }
                    const actor = userName(
                        userMap, actorId,
                    );
                    return {
                        type: a.type,
                        description:
                            actor + ' '
                            + a.action + ' '
                            + a.target,
                        time: a.timestamp,
                    };
                });
        presenter =
            new OrganizationPresenter(
                org,
                company.nameText(),
                recent,
            );
    } catch (err) {
        log.error(
            'getOrganization failed',
            'organization',
            err,
        );
        setHtml(
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
    setHtml(
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
