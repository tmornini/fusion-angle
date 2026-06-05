import {
    html, setHtml, SafeHtml,
} from '../safe-html.ts';
import { formatDateTime } from '../core.ts';
import { DISPLAY_ABSENT } from '../format.ts';
import type {
    IdentityTokenEntity,
    TokenChain,
} from '../adapters/index.ts';

function actionBadgeClass(
    action: IdentityTokenEntity['action'],
): string {
    if (action === 'issued') return 'badge badge-success';
    if (action === 'revoked') return 'badge badge-error';
    return 'badge badge-default';
}

function buildEventRow(
    event: IdentityTokenEntity,
): SafeHtml {
    return html`
        <div class="${
            'flex items-center gap-4 py-2'
        }">
            <div class="flex-fill min-w-0">
                <p class="${
                    'text-sm font-medium truncate'
                }">${event.jti}</p>
                <p class="${
                    'text-xs text-muted truncate'
                }">
                    parent: ${
                        event.parent_jti === ''
                            ? DISPLAY_ABSENT
                            : event.parent_jti
                    }
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

function buildChainCard(chain: TokenChain): SafeHtml {
    return html`
        <div class="card p-6">
            <h3 class="${
                'font-display font-semibold mb-2'
                + ' text-sm truncate'
            }">Chain ${chain.chainId}</h3>
            <div class="flex flex-col gap-1">
                ${chain.events.map(buildEventRow)}
            </div>
        </div>`;
}

function buildEmptyState(): SafeHtml {
    return html`<div class="${
        'p-4 text-sm text-muted text-center'
    }">No tokens.</div>`;
}

export class IdentityTokensPresenter {
    readonly #chains: readonly TokenChain[];

    constructor(chains: readonly TokenChain[]) {
        this.#chains = chains;
    }

    render(container: HTMLElement): void {
        setHtml(container, html`${
            this.#chains.length === 0
                ? buildEmptyState()
                : html`${this.#chains.map(buildChainCard)}`
        }`);
    }
}
