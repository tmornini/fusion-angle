import {
    html, setHtml, SafeHtml,
} from '../safe-html.ts';
import { formatDateTime } from '../core.ts';
import type {
    ProviderEvent,
} from '../adapters/index.ts';

function actionBadgeClass(
    action: ProviderEvent['action'],
): string {
    return action === 'linked'
        ? 'badge badge-success'
        : 'badge badge-default';
}

function buildEventRow(
    event: ProviderEvent,
): SafeHtml {
    return html`
        <div class="${
            'card p-4 flex items-center gap-4'
        }">
            <div class="flex-fill min-w-0">
                <p class="font-medium truncate">
                    ${event.provider}
                </p>
                <p class="${
                    'text-xs text-muted truncate'
                }">
                    ${event.providerSubject}
                </p>
            </div>
            <div class="${
                'flex flex-col items-end gap-2 ml-6'
            }">
                <span class="${
                    actionBadgeClass(event.action)
                }">${event.action}</span>
                <span class="text-xs text-muted">
                    <time datetime="${event.at}">${
                        formatDateTime(event.at)
                    }</time>
                </span>
            </div>
        </div>`;
}

function buildEmptyState(): SafeHtml {
    return html`<div class="${
        'p-4 text-sm text-muted text-center'
    }">No linked providers.</div>`;
}

export class IdentityProvidersPresenter {
    readonly #events: readonly ProviderEvent[];

    constructor(
        events: readonly ProviderEvent[],
    ) {
        this.#events = events;
    }

    render(container: HTMLElement): void {
        setHtml(container, html`${
            this.#events.length === 0
                ? buildEmptyState()
                : html`${this.#events.map(buildEventRow)}`
        }`);
    }
}
