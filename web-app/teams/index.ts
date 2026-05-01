import {
    $, $input, populateIcons,
} from '../app/dom.ts';
import { showToast } from '../app/toast.ts';
import {
    buildSkeleton, withLoadingState,
} from '../app/loading-states.ts';
import {
    iconUsers, iconSearch,
    iconActivity, iconPlus,
} from '../app/icons.ts';
import {
    initTabs, initDialog, closeDialog,
} from '../app/core.ts';
import {
    createFetchContext,
    getTeamMembers,
    subscribeUserChanges,
} from '../app/adapters/index.ts';
import {
    TeamListPresenter,
    buildInitialTeamListState,
    applyTeamSearch,
    applyTeamSelection,
    type TeamListState,
} from '../app/presenters/index.ts';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

let teamState: TeamListState | null = null;
let listEl: HTMLElement | null = null;
let panelEl: HTMLElement | null = null;

export async function init(): Promise<void> {
    const teamListEl = $(
        '#team-list', document,
    );
    if (!teamListEl) return;

    const result = await withLoadingState(
        teamListEl,
        buildSkeleton('card-list', 4),
        () => getTeamMembers(
            createFetchContext(),
        ),
        init,
        {
            icon: iconUsers(24, ''),
            title: 'No Team Members Yet',
            description:
                'Invite team members to start'
                + ' collaborating on projects.',
        },
    );

    populateIcons([
        [
            '#activity-feed-btn-icon',
            iconActivity(16, ''),
        ],
        [
            '#add-member-btn-icon',
            iconPlus(16, ''),
        ],
        [
            '#search-field-icon',
            iconSearch(16, ''),
        ],
    ]);

    bindAddMemberDialog();

    if (!result) return;

    teamState = buildInitialTeamListState(result);
    listEl = teamListEl;
    panelEl = $(
        '#team-detail-panel', document,
    );

    const summaryEl = $(
        '#team-summary', document,
    );
    if (summaryEl) {
        summaryEl.textContent =
            new TeamListPresenter(
                teamState,
            ).summary();
    }

    rerenderTeam();
    bindStableListeners(listEl);

    subscribeUserChanges(async () => {
        if (!teamState || !listEl) return;
        const fresh = await getTeamMembers(
            createFetchContext(),
        );
        teamState = buildInitialTeamListState(
            fresh,
        );
        rerenderTeam();
    });
}

function rerenderTeam(): void {
    if (!teamState || !listEl) return;
    const presenter =
        new TeamListPresenter(teamState);
    presenter.renderList(listEl);
    if (panelEl) {
        presenter.renderDetail(panelEl);
    }
}

function bindAddMemberDialog(): void {
    initDialog('add-member', 'team-add-btn');
    const sendBtn = $(
        '#add-member-send', document,
    );
    sendBtn?.addEventListener(
        'click',
        () => {
            const email = $input(
                '#add-member-email', document,
            )?.value;
            showToast(
                email
                    ? 'Invitation sent to '
                      + email
                    : 'Member invited',
                'success',
            );
            closeDialog('add-member');
        },
        { signal },
    );
    $input(
        '#add-member-email', document,
    )?.addEventListener(
        'keydown',
        e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendBtn?.click();
            }
        },
        { signal },
    );
}

function bindStableListeners(
    teamListEl: HTMLElement,
): void {
    teamListEl.addEventListener(
        'click', onCardClick,
        { signal },
    );
    $('#team-search', document)
        ?.addEventListener(
            'input',
            onSearchInput,
            { signal },
        );
}

function onCardClick(e: MouseEvent): void {
    if (
        !(e.target instanceof Element)
        || !teamState
    ) return;
    const card = e.target.closest(
        '[data-member-card]',
    );
    if (!card) return;
    const id = card.getAttribute(
        'data-member-card',
    );
    teamState = applyTeamSelection(
        teamState, id,
    );
    rerenderTeam();
    if (panelEl) {
        initTabs(
            '[data-tab]',
            '.tab-panel',
            'active',
        );
    }
}

function onSearchInput(e: Event): void {
    if (!teamState || !listEl) return;
    const target = e.target as HTMLInputElement;
    teamState = applyTeamSearch(
        teamState, target.value,
    );
    rerenderTeam();
}
