import {
    $,
    $input,
    $select,
    attr,
    populateIcons,
} from '../app/dom';
import {
    html,
    setHtml,
} from '../app/safe-html';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import {
    iconTarget,
    iconSearch,
} from '../app/icons';
import { navigateTo } from '../app/core';
import { getEdgeList } from '../app/adapters';
import {
    EdgeListPresenter,
} from '../app/presenters';

export async function init(): Promise<void> {
    const listEl = $('#edge-list', document);
    if (!listEl) return;

    const result = await withLoadingState(
        listEl,
        buildSkeleton('card-list', 4),
        getEdgeList,
        init,
        {
            icon: iconTarget(24, ''),
            title: 'No Edge Definitions',
            description:
                'Create Edge definitions'
                + ' for your ideas to track'
                + ' outcomes and metrics.',
            action: {
                label: 'View Ideas',
                href: '../ideas/index.html',
            },
        },
    );
    if (!result) return;

    const presenter =
        new EdgeListPresenter(result);

    populateIcons([
        [
            '#page-badge',
            html`${
                iconTarget(14, '')
            } Business Case Definition`,
        ],
        [
            '#search-field-icon',
            iconSearch(16, ''),
        ],
    ]);
    $('#page-badge', document)?.classList
        .remove('hidden');

    function renderPage(): void {
        const view = presenter.render();
        const statsEl =
            $('#edge-stats', document);
        const list =
            $('#edge-list', document);
        const empty =
            $('#edge-empty', document);
        if (statsEl)
            setHtml(statsEl, view.stats);
        if (list)
            setHtml(list, view.list);
        if (list)
            list.style.display =
                view.hasResults
                    ? '' : 'none';
        if (empty)
            setHtml(empty, view.empty);
        if (empty)
            empty.style.display =
                view.hasResults
                    ? 'none' : '';
        bindEvents();
    }

    function bindEvents(): void {
        $('#edge-list', document)
            ?.addEventListener(
                'click',
                (e) => {
                    if (
                        !(e.target
                            instanceof Element)
                    ) return;
                    const card =
                        e.target
                            .closest<HTMLElement>(
                                '[data-edge-card]',
                            );
                    if (card)
                        navigateTo(
                            'edge-detail',
                            {
                                ideaId: attr(
                                    card,
                                    'data-edge'
                                    + '-card',
                                ),
                            },
                        );
                },
            );
        $('#edge-search', document)
            ?.addEventListener(
                'input',
                () => {
                    presenter.setSearch(
                        $input(
                            '#edge-search',
                            document,
                        )!.value,
                    );
                    renderPage();
                },
            );
        $('#edge-status-filter', document)
            ?.addEventListener(
                'change',
                () => {
                    presenter
                        .setStatusFilter(
                            $select(
                                '#edge-status'
                                + '-filter',
                                document,
                            )!.value,
                        );
                    renderPage();
                },
            );
    }

    renderPage();
}
