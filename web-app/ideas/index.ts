import { $, attr, populateIcons } from '../app/dom';
import { html } from '../app/safe-html';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import {
    iconPlus, iconLightbulb,
} from '../app/icons';
import { navigateTo } from '../app/core';
import {
    getIdeas,
    getIdeaEntity,
    putIdea,
    ideaChanged,
    isIdeaStatus,
} from '../app/adapters';
import {
    IdeaListPresenter,
} from '../app/presenters';
import {
    initDragReorder,
} from '../app/drag-reorder';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

let presenter: IdeaListPresenter | null = null;
let listEl: HTMLElement | null = null;
let badgesEl: HTMLElement | null = null;

export async function init(): Promise<void> {
    const teamListEl = $(
        '#ideas-list', document,
    );
    if (!teamListEl) return;

    const ideas = await withLoadingState(
        teamListEl,
        buildSkeleton('card-list', 4),
        getIdeas,
        init,
        {
            icon: iconLightbulb(24, ''),
            title: 'No Ideas Yet',
            description:
                'Start innovating by creating'
                + ' your first idea.',
            action: {
                label: html`${iconPlus(16, '')}
                    Create Your First Idea`,
                href: 'create.html',
            },
            onEmpty: () => {
                $(
                    '#create-idea-btn', document,
                )?.remove();
            },
        },
    );

    populateIcons([
        ['#create-btn-icon', iconPlus(16, '')],
    ]);

    $('#create-idea-btn', document)
        ?.addEventListener(
            'click',
            () => navigateTo('idea-create'),
            { signal },
        );

    if (!ideas) return;

    presenter = new IdeaListPresenter(ideas);
    listEl = teamListEl;
    badgesEl = $(
        '#status-badges', document,
    );

    if (badgesEl) {
        presenter.renderBadges(badgesEl);
        badgesEl.addEventListener(
            'click', onBadgeClick,
            { signal },
        );
    }

    presenter.renderList(listEl);
    listEl.addEventListener(
        'click', onCardClick,
        { signal },
    );

    ideaChanged.subscribe(async () => {
        if (!presenter || !listEl) return;
        const updated = await getIdeas();
        presenter.update(updated);
        if (badgesEl) {
            presenter.renderBadges(badgesEl);
        }
        presenter.renderList(listEl);
    });

    initDragReorder(
        listEl,
        '[data-idea-card]',
        'data-idea-card',
        async (id, newPosition) => {
            const entity =
                await getIdeaEntity(id);
            await putIdea(id, {
                ...entity,
                position: newPosition,
            });
        },
    );
}

function onBadgeClick(e: MouseEvent): void {
    if (
        !presenter || !badgesEl || !listEl
    ) return;
    if (
        !(e.target instanceof HTMLElement)
    ) return;
    const badge = e.target.closest<HTMLElement>(
        '[data-status]',
    );
    if (!badge) return;
    const s = attr(badge, 'data-status');
    if (!isIdeaStatus(s)) return;
    presenter.applyFilterToggle(
        s, badgesEl, listEl,
    );
}

function onCardClick(e: MouseEvent): void {
    if (
        !(e.target instanceof Element)
    ) return;
    const convertBtn = e.target
        .closest<HTMLElement>(
            '[data-idea-convert]',
        );
    if (convertBtn) {
        navigateTo('idea-convert', {
            ideaId: attr(
                convertBtn,
                'data-idea-convert',
            ),
            from: 'list',
        });
        return;
    }
    const card = e.target.closest<HTMLElement>(
        '[data-idea-card]',
    );
    if (card) {
        navigateTo('idea-detail', {
            ideaId: attr(
                card, 'data-idea-card',
            ),
        });
    }
}
