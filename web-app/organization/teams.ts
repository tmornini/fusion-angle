import {
    $, $$, $input, populateIcons,
} from '../app/dom';
import { html, setHtml } from '../app/safe-html';
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
    UserPresenter,
} from '../app/presenters';

function mutateList(
    members: readonly UserPresenter[],
    selectedMemberId: string | null,
): void {
    const search =
        $input('#team-search', document)!
            .value.toLowerCase();
    const filtered = members.filter(
        member => member.matchesSearch(search),
    );
    const list = $('#team-list', document);
    if (list) {
        setHtml(
            list,
            html`${filtered.map(
                m => m.buildMemberCard(
                    selectedMemberId,
                ),
            )}`,
        );
    }

    const panel = $(
        '#team-detail-panel', document,
    );
    const member = selectedMemberId
        ? members.find(
            candidate =>
                candidate.idForLink()
                === selectedMemberId,
        )
        : null;
    if (panel) {
        setHtml(
            panel,
            member
                ? member.buildMemberDetail()
                : html`
            <div class="p-6 text-center">
                ${iconUsers(48, 'text-muted')}
                <p class="text-muted mt-4">
                    ${'Select a team member'
                        + ' to view details'}
                </p>
            </div>`,
        );
    }
    bindCards(members);
    bindDetailTabs();
}

function bindCards(
    members: readonly UserPresenter[],
): void {
    $$('[data-member-card]', document)
        .forEach(card => {
            card.addEventListener(
                'click',
                () => mutateList(
                    members,
                    card.getAttribute(
                        'data-member-card',
                    ),
                ),
            );
        });
}

function bindDetailTabs(): void {
    initTabs(
        '[data-tab]', '.tab-panel', 'active',
    );
}

export async function init(): Promise<void> {
    const teamListEl =
        $('#team-list', document);
    if (!teamListEl) return;

    const result = await withLoadingState(
        teamListEl,
        buildSkeleton('card-list', 4),
        getTeamMembers,
        init,
        {
            icon: iconUsers(24, ''),
            title: 'No Team Members'
                + ' Yet',
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

    initDialog(
        'add-member',
        'team-add-btn',
    );
    const sendBtn =
        $('#add-member-send', document);
    sendBtn?.addEventListener(
        'click',
        () => {
            const email =
                $input(
                    '#add-member-email',
                    document,
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
    );
    $input(
        '#add-member-email', document,
    )?.addEventListener(
        'keydown',
        (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendBtn?.click();
            }
        },
    );

    if (!result) return;
    const members = result;
    const presenters = members.map(
        m => new UserPresenter(m),
    );

    const summaryEl = $(
        '#team-summary', document,
    );
    if (summaryEl) {
        const word =
            presenters.length === 1
                ? 'member'
                : 'members';
        summaryEl.textContent =
            presenters.length + ' ' + word
            + ' \u2022 Manage roles,'
            + ' strengths,'
            + ' and availability';
    }

    const placeholderEl =
        $(
            '#team-detail-placeholder',
            document,
        );
    if (placeholderEl) {
        setHtml(placeholderEl, html`
            ${iconUsers(48, 'text-muted')}
            <p class="text-muted mt-4">
                ${'Select a team member'
                    + ' to view details'}
            </p>`);
    }

    $('#team-search', document)
        ?.addEventListener(
            'input',
            () => mutateList(
                presenters, null,
            ),
        );

    mutateList(presenters, null);
}
