import {
    html, setHtml, SafeHtml,
} from '../safe-html.ts';
import {
    DISPLAY_ABSENT, formatDate, formatCalendarDate,
} from '../format.ts';
import {
    INVITATION_STATE_CONFIG,
} from './state-display.ts';
import {
    invitationIsExpired,
    type InvitationView,
    type SentInvitation,
} from '../../../client/index.ts';
import {
    type InvitationState, nowUtc,
} from '../../../shared/types.ts';
import {
    type IconSize,
    ICON_SIZE,
    iconMail,
    iconXCircle,
} from '../icons.ts';

function stateBadge(state: InvitationState): SafeHtml {
    const cfg = INVITATION_STATE_CONFIG[state];
    return html`<span class="${
        'badge ' + cfg.className
    }">${cfg.label}</span>`;
}

function inviteeActions(inv: InvitationView): SafeHtml {
    const accept = invitationIsExpired(inv, nowUtc())
        ? html``
        : html`
            <button type="button"
                class="btn btn-primary btn-sm"
                data-invitation-action="accept"
            >Accept</button>`;
    return html`
        <div class="flex items-center gap-2">
            ${accept}
            <button type="button"
                class="btn btn-secondary btn-sm"
                data-invitation-action="decline"
            >Decline</button>
        </div>`;
}

function buildInviteeRow(inv: InvitationView): SafeHtml {
    return html`
        <div class="${
            'card p-4 flex items-center gap-4'
        }" data-invitation-id="${inv.id}">
            <div class="flex-fill min-w-0">
                <p class="font-medium truncate">
                    ${DISPLAY_ABSENT}
                </p>
                <p class="${
                    'text-xs text-muted truncate'
                }">${formatDate(inv.invitedAt)}</p>
            </div>
            ${stateBadge(inv.state)}
            ${
                inv.state === 'pending'
                    ? inviteeActions(inv)
                    : html``
            }
        </div>`;
}

function revokeAction(): SafeHtml {
    return html`
        <button type="button"
            class="btn btn-ghost btn-sm"
            data-invitation-action="revoke"
        >Revoke</button>`;
}

function sentInviteeTitle(inv: SentInvitation): string {
    return inv.inviteeName
        ?? inv.inviteeEmail
        ?? DISPLAY_ABSENT;
}

function sentInviteeSub(inv: SentInvitation): string {
    const invited = 'Invited '
        + formatCalendarDate(inv.invitedAt);
    if (
        inv.inviteeName !== undefined
        && inv.inviteeEmail !== undefined
    ) {
        return inv.inviteeEmail + ' · ' + invited;
    }
    return invited;
}

function buildSentRow(inv: SentInvitation): SafeHtml {
    return html`
        <div class="${
            'card p-4 flex items-center gap-4'
        }" data-invitation-id="${inv.id}">
            <div class="flex-fill min-w-0">
                <p class="font-medium truncate">
                    ${sentInviteeTitle(inv)}
                </p>
                <p class="${
                    'text-xs text-muted truncate'
                }">${sentInviteeSub(inv)}</p>
            </div>
            ${stateBadge(inv.state)}
            ${
                inv.state === 'pending'
                    ? revokeAction()
                    : html``
            }
        </div>`;
}

type SentListState = 'pending' | 'declined' | 'revoked';

const SENT_FILTER_STATES: readonly SentListState[] = [
    'pending', 'declined', 'revoked',
];

const SENT_FILTER_ICONS: Record<
    SentListState,
    (size: IconSize, className: string) => SafeHtml
> = {
    pending: iconMail,
    declined: iconXCircle,
    revoked: iconXCircle,
};

function emptySentMessage(state: SentListState): string {
    switch (state) {
        case 'pending':
            return 'No pending invitations.';
        case 'declined':
            return 'No declined invitations.';
        case 'revoked':
            return 'No revoked invitations.';
    }
}

function emptyState(message: string): SafeHtml {
    return html`<div class="${
        'p-4 text-sm text-muted text-center'
    }">${message}</div>`;
}

function sentFilterChip(
    state: SentListState,
    selected: SentListState,
): SafeHtml {
    const cfg = INVITATION_STATE_CONFIG[state];
    const isActive = state === selected;
    const icon = SENT_FILTER_ICONS[state];
    return html`<button type="button" class="${
        'badge '
        + cfg.className
        + ' text-xs badge-fixed-w'
        + ' cursor-pointer'
    }" data-invitation-state="${state}" data-state="${
        state
    }" data-dimmed="${
        isActive ? 'false' : 'true'
    }" aria-pressed="${
        isActive ? 'true' : 'false'
    }">${icon(ICON_SIZE.sm, '')} ${cfg.label}</button>`;
}

function buildSentFilters(
    selected: SentListState,
): SafeHtml {
    return html`
        <div class="flex items-center gap-2"
            role="group"
            aria-label="Filter invitations by state"
        >${SENT_FILTER_STATES.map(
            (state) => sentFilterChip(state, selected),
        )}</div>`;
}

// The invitee's own invitations, each with Accept / Decline on
// the pending ones. Empty → "No invitations."
export class InvitationListPresenter {
    readonly #rows: readonly InvitationView[];

    constructor(rows: readonly InvitationView[]) {
        this.#rows = rows;
    }

    render(container: HTMLElement): void {
        setHtml(container, html`${
            this.#rows.length === 0
                ? emptyState('No invitations.')
                : html`${this.#rows.map(buildInviteeRow)}`
        }`);
    }
}

// The inviting organization's invitations in one state.
// Revoke is on a pending row only. An empty list names
// the state, which the rows cannot.
export class SentInvitationsPresenter {
    readonly #rows: readonly SentInvitation[];
    readonly #state: SentListState;

    constructor(
        rows: readonly SentInvitation[],
        state: SentListState,
    ) {
        this.#rows = rows;
        this.#state = state;
    }

    buildBox(): SafeHtml {
        const list = this.#rows.length === 0
            ? emptyState(emptySentMessage(this.#state))
            : html`${this.#rows.map(buildSentRow)}`;
        return html`
            <div class="card card-hover p-6 mt-6">
                <div class="${
                    'flex items-center'
                    + ' justify-between mb-4'
                    + ' flex-wrap gap-2'
                }">
                    <h3 class="${
                        'font-display'
                        + ' font-semibold'
                        + ' flex items-center gap-2'
                    }">Sent invitations</h3>
                    ${buildSentFilters(this.#state)}
                </div>
                <div id="sent-invitations-list"
                    class="flex flex-col gap-3"
                >${list}</div>
            </div>`;
    }

    render(container: HTMLElement): void {
        setHtml(container, this.buildBox());
    }
}
