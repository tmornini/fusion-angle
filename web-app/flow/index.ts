import { $, attr } from '../app/dom';
import {
    html,
    setHtml,
} from '../app/safe-html';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import {
    iconGitBranch,
} from '../app/icons';
import { navigateTo } from '../app/core';
import { getFlows } from '../app/adapters';
import {
    FlowPresenter,
} from '../app/presenters';

export async function init(
): Promise<void> {
    const listEl = $(
        '#flow-list', document,
    );
    if (!listEl) return;

    const result = await withLoadingState(
        listEl,
        buildSkeleton('card-list', 4),
        getFlows,
        init,
        {
            icon: iconGitBranch(24, ''),
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
        },
    );
    if (!result) return;
    const flows = result.map(
        wf => new FlowPresenter(wf),
    );

    setHtml(
        listEl,
        html`${flows.map(
            wf => wf.buildCard(),
        )}`,
    );

    listEl.addEventListener(
        'click',
        (e) => {
            if (
                !(e.target
                    instanceof Element)
            ) return;
            const card =
                e.target
                    .closest<HTMLElement>(
                    '[data-flow-card]',
                );
            if (card)
                navigateTo(
                    'flow-detail',
                    {
                        flowId: attr(
                            card,
                            'data-flow'
                            + '-card',
                        ),
                    },
                );
        },
    );
}
