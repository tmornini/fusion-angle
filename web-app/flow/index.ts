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
import { getWorkflows } from '../app/adapters';
import {
    WorkflowPresenter,
} from '../app/presenters';

export async function init(
): Promise<void> {
    const listEl = $(
        '#workflow-list', document,
    );
    if (!listEl) return;

    const result = await withLoadingState(
        listEl,
        buildSkeleton('card-list', 4),
        getWorkflows,
        init,
        {
            icon: iconGitBranch(24, ''),
            title: 'No Workflows Yet',
            description:
                'Workflows are created'
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
    const workflows = result.map(
        wf => new WorkflowPresenter(wf),
    );

    setHtml(
        listEl,
        html`${workflows.map(
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
                    '[data-workflow-card]',
                );
            if (card)
                navigateTo(
                    'flow-detail',
                    {
                        workflowId: attr(
                            card,
                            'data-workflow'
                            + '-card',
                        ),
                    },
                );
        },
    );
}
