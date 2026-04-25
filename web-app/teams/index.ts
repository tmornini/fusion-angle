import {
    $, $input, populateIcons,
} from '../app/dom';
import { showToast } from '../app/toast';
import {
    buildSkeleton, withLoadingState,
} from '../app/loading-states';
import {
    iconUsers, iconSearch,
    iconActivity, iconPlus,
} from '../app/icons';
import {
    initTabs, initDialog, closeDialog,
} from '../app/core';
import { getTeamMembers } from '../app/adapters';
import {
    TeamListPresenter,
} from '../app/presenters';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

let presenter: TeamListPresenter | null = null;
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
        getTeamMembers,
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

    presenter = new TeamListPresenter(result);
    listEl = teamListEl;
    panelEl = $(
        '#team-detail-panel', document,
    );

    const summaryEl = $(
        '#team-summary', document,
    );
    if (summaryEl) {
        summaryEl.textContent =
            presenter.summary();
    }

    presenter.renderList(listEl);
    if (panelEl) {
        presenter.renderDetail(panelEl);
    }
    bindStableListeners(listEl);
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
        || !presenter
    ) return;
    const card = e.target.closest(
        '[data-member-card]',
    );
    if (!card) return;
    const id = card.getAttribute(
        'data-member-card',
    );
    presenter.select(id);
    if (listEl) {
        presenter.renderList(listEl);
    }
    if (panelEl) {
        presenter.renderDetail(panelEl);
        initTabs(
            '[data-tab]',
            '.tab-panel',
            'active',
        );
    }
}

function onSearchInput(e: Event): void {
    if (!presenter || !listEl) return;
    const target = e.target as HTMLInputElement;
    presenter.setSearch(target.value);
    presenter.renderList(listEl);
}
