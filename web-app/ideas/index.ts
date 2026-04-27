import { $, getRequiredAttribute, populateIcons } from '../app/dom.ts';
import { html } from '../app/safe-html.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import {
    iconPlus, iconLightbulb,
} from '../app/icons.ts';
import { navigateTo } from '../app/core.ts';
import {
    getIdeas,
    getIdeaRow,
    putIdea,
    subscribeToIdeaChanges,
    isIdeaStatus,
    createFetchContext,
} from '../app/adapters/index.ts';
import {
    IdeaListPresenter,
    buildInitialIdeaListState,
    applyIdeaListUpdate,
    applyIdeaFilterToggle,
    type IdeaListState,
} from '../app/presenters/index.ts';
import {
    initDragReorder,
} from '../app/drag-reorder.ts';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

let ideaState: IdeaListState | null = null;
let listEl: HTMLElement | null = null;
let badgesEl: HTMLElement | null = null;

export async function init(): Promise<void> {
    const teamListEl = $(
        '#ideas-list', document,
    );
    if (!teamListEl) return;

    const ctx = createFetchContext();
    const ideas = await withLoadingState(
        teamListEl,
        buildSkeleton('card-list', 4),
        () => getIdeas(ctx),
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

    ideaState = buildInitialIdeaListState(ideas);
    listEl = teamListEl;
    badgesEl = $(
        '#status-badges', document,
    );

    rerenderIdeas();
    if (badgesEl) {
        badgesEl.addEventListener(
            'click', onBadgeClick,
            { signal },
        );
    }
    listEl.addEventListener(
        'click', onCardClick,
        { signal },
    );

    subscribeToIdeaChanges(async () => {
        if (!ideaState || !listEl) return;
        const updated = await getIdeas();
        ideaState = applyIdeaListUpdate(
            ideaState, updated,
        );
        rerenderIdeas();
    });

    initDragReorder(
        listEl,
        '[data-idea-card]',
        'data-idea-card',
        async (id, newPosition) => {
            const entity =
                await getIdeaRow(id);
            await putIdea(id, {
                ...entity,
                position: newPosition,
            });
        },
    );
}

function rerenderIdeas(): void {
    if (!ideaState || !listEl) return;
    const presenter =
        new IdeaListPresenter(ideaState);
    if (badgesEl) {
        presenter.renderBadges(badgesEl);
    }
    presenter.renderList(listEl);
}

function onBadgeClick(e: MouseEvent): void {
    if (
        !ideaState || !badgesEl || !listEl
    ) return;
    if (
        !(e.target instanceof HTMLElement)
    ) return;
    const badge = e.target.closest<HTMLElement>(
        '[data-status]',
    );
    if (!badge) return;
    const s = getRequiredAttribute(badge, 'data-status');
    if (!isIdeaStatus(s)) return;
    ideaState = applyIdeaFilterToggle(
        ideaState, s,
    );
    rerenderIdeas();
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
            ideaId: getRequiredAttribute(
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
            ideaId: getRequiredAttribute(
                card, 'data-idea-card',
            ),
        });
    }
}
