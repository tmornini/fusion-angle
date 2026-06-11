import {
    html, setHtml, SafeHtml,
} from '../safe-html.ts';
import { DISPLAY_ABSENT, formatDate } from '../format.ts';
import {
    INVITATION_STATE_CONFIG,
} from './state-display.ts';
import {
    type InvitationState,
    type InvitationView,
    type SentInvitation,
} from '../adapters/index.ts';

function stateBadge(state: InvitationState): SafeHtml {
    const cfg = INVITATION_STATE_CONFIG[state];
    return html`<span class="${
        'badge ' + cfg.className
    }">${cfg.label}</span>`;
}

function inviteeActions(): SafeHtml {
    return html`
        <div class="flex items-center gap-2">
            <button type="button"
                class="btn btn-primary btn-sm"
                data-invitation-action="accept"
            >Accept</button>
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
                    ${inv.organizationName ?? DISPLAY_ABSENT}
                </p>
                <p class="${
                    'text-xs text-muted truncate'
                }">${
                    inv.invitedByName !== undefined
                        ? html`Invited by ${
                            inv.invitedByName} · `
                        : ''
                }${formatDate(inv.invitedAt)}</p>
            </div>
            ${stateBadge(inv.state)}
            ${
                inv.state === 'pending'
                    ? inviteeActions()
                    : html``
            }
        </div>`;
}

function buildSentRow(inv: SentInvitation): SafeHtml {
    return html`
        <div class="${
            'card p-4 flex items-center gap-4'
        }" data-invitation-id="${inv.id}">
            <div class="flex-fill min-w-0">
                <p class="font-medium truncate">
                    ${inv.inviteeEmail ?? DISPLAY_ABSENT}
                </p>
                <p class="${
                    'text-xs text-muted truncate'
                }">Invited ${formatDate(inv.invitedAt)}</p>
            </div>
            ${stateBadge(inv.state)}
            <button type="button"
                class="btn btn-ghost btn-sm"
                data-invitation-action="revoke"
            >Revoke</button>
        </div>`;
}

function emptyState(message: string): SafeHtml {
    return html`<div class="${
        'p-4 text-sm text-muted text-center'
    }">${message}</div>`;
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

// The inviting org's outstanding invitations, each with a Revoke
// (admin only). Empty → "No outstanding invitations."
export class SentInvitationsPresenter {
    readonly #rows: readonly SentInvitation[];

    constructor(rows: readonly SentInvitation[]) {
        this.#rows = rows;
    }

    render(container: HTMLElement): void {
        setHtml(container, html`${
            this.#rows.length === 0
                ? emptyState('No outstanding invitations.')
                : html`${this.#rows.map(buildSentRow)}`
        }`);
    }
}
