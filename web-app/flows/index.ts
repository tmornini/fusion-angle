import {
    $required,
    getRequiredAttribute,
} from '../app/dom.ts';
import {
    html,
    setHtml,
} from '../app/safe-html.ts';
import {
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import { subscribeOnce } from '../../client/channels.ts';
import { handlePageLoadError } from '../app/page-loader.ts';
import {
    ICON_SIZE,
    iconGitBranch,
} from '../app/icons.ts';
import { navigateTo } from '../app/navigation.ts';
import {
    subscribeFlowChanges,
    getFlowsWithProjectNames,
} from '../../client/index.ts';
import { sessionContext } from '../app/client.ts';
import {
    FlowPresenter,
} from '../app/presenters/index.ts';

export async function init(
): Promise<void> {
    const listEl = $required(
        '#flow-list', document,
    );

    await loadInto({
        container: listEl,
        skeleton: buildSkeleton('card-list', 4),
        fetch: () => getFlowsWithProjectNames(
            sessionContext(),
        ),
        retry: init,
        emptyState: {
            icon: iconGitBranch(ICON_SIZE['2xl'], ''),
            title: 'No Flows Yet',
            description:
                'Flows are created'
                + ' from the project'
                + ' detail page.',
            action: {
                label: 'View Projects',
                href:
                    '../projects/'
                    + 'index.html',
            },
            onEmpty: () => {
                subscribeOnce(
                    subscribeFlowChanges, init,
                    err => handlePageLoadError('flows', err),
                );
            },
        },
        onData: result => onFlowsLoaded(
            result, listEl,
        ),
    });
}

function onFlowsLoaded(
    result: Awaited<ReturnType<
        typeof getFlowsWithProjectNames
    >>,
    listEl: HTMLElement,
): void {
    const rendered = result.map(
        ({ summary, projectName }) =>
            new FlowPresenter(
                summary, projectName,
            ).render(),
    );

    setHtml(
        listEl,
        html`${rendered}`,
    );

    listEl.addEventListener(
        'click',
        (e) => {
            if (
                !(e.target
                    instanceof Element)
            ) return;
            // Real links navigate
            // themselves; the delegate
            // must not double-fire.
            if (
                e.target.closest('a[href]')
            ) return;
            // Stats button takes priority
            // so it doesn't also fire
            // card navigation.
            const statsBtn =
                e.target
                    .closest<HTMLElement>(
                    '[data-flow-stats]',
                );
            if (statsBtn) {
                navigateTo(
                    'flow-stats',
                    {
                        flowId:
                            getRequiredAttribute(
                                statsBtn,
                                'data-flow'
                                + '-stats',
                            ),
                    },
                );
                return;
            }
            const card =
                e.target
                    .closest<HTMLElement>(
                    '[data-flow-card]',
                );
            if (card)
                navigateTo(
                    'flow-detail',
                    {
                        flowId: getRequiredAttribute(
                            card,
                            'data-flow'
                            + '-card',
                        ),
                    },
                );
        },
    );

    subscribeFlowChanges(
        () => void rerenderFlowList(listEl),
    );
}

async function rerenderFlowList(
    listEl: HTMLElement,
): Promise<void> {
    const items =
        await getFlowsWithProjectNames(
            sessionContext(),
        );
    const rendered = items.map(
        ({ summary, projectName }) =>
            new FlowPresenter(
                summary, projectName,
            ).render(),
    );
    setHtml(listEl, html`${rendered}`);
}
