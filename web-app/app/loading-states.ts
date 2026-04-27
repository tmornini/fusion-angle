import { iconAlertTriangle } from './icons';
import {
    SafeHtml,
    html,
    mutateHtml,
    trusted,
} from './safe-html';

export type SkeletonType =
    | 'card-grid'
    | 'card-list'
    | 'detail'
    | 'table'
    | 'stats-row';

const SHIMMER_CLASS = 'skeleton-shimmer';

function buildSkeletonCard(): SafeHtml {
    return html`<div class="skeleton-card">
    <div class="${SHIMMER_CLASS}
        skeleton-badge mb-3"></div>
    <div class="${SHIMMER_CLASS}
        skeleton-heading"></div>
    <div class="${SHIMMER_CLASS}
        skeleton-text"></div>
    <div class="${SHIMMER_CLASS}
        skeleton-text w-80"></div>
    </div>`;
}

function buildSkeletonListItem(
): SafeHtml {
    return html`<div
    class="skeleton-card flex
        items-center gap-4">
    <div class="${SHIMMER_CLASS}
        skeleton-avatar"></div>
    <div class="flex-1">
        <div class="${SHIMMER_CLASS}
            skeleton-text w-60 mb-1"></div>
        <div class="${SHIMMER_CLASS}
            skeleton-text-sm w-40"></div>
    </div>
    <div class="${SHIMMER_CLASS}
        skeleton-badge"></div>
    </div>`;
}

function buildSkeletonStatsRow(
): SafeHtml {
    return html`<div
    class="grid grid-cols-4 gap-4 mb-6">
    ${Array(4).fill(trusted(
        `<div class="skeleton-card p-4">`
        + `<div class="${SHIMMER_CLASS}`
        + ` skeleton-text-sm mb-2 w-50">`
        + `</div>`
        + `<div class="${SHIMMER_CLASS}`
        + ` skeleton-heading w-40">`
        + `</div>`
        + `</div>`,
    ))}
    </div>`;
}

export function buildSkeleton(
    type: SkeletonType,
    count: number,
): SafeHtml {
    switch (type) {
        case 'card-grid':
            return html`<div
                class="skeleton-grid">
                ${Array(count).fill(
                    buildSkeletonCard(),
                )}
            </div>`;
        case 'card-list':
            return html`<div
        class="flex flex-col gap-3">
        ${Array(count).fill(
            buildSkeletonListItem(),
        )}
        </div>`;
        case 'detail':
            return html`<div>
        <div class="${SHIMMER_CLASS}
            skeleton-heading mb-6 w-40"></div>
        <div class="skeleton-card mb-6">
            <div class="${SHIMMER_CLASS}
                skeleton-text w-90"></div>
            <div class="${SHIMMER_CLASS}
                skeleton-text w-75"></div>
            <div class="${SHIMMER_CLASS}
                skeleton-text mb-4 w-60"></div>
            <div
                class="grid grid-cols-3 gap-4">
                ${Array(3).fill(trusted(
                    '<div>'
                    + `<div class="`
                    + `${SHIMMER_CLASS}`
                    + ` skeleton-text-sm">`
                    + `</div>`
                    + `<div class="`
                    + `${SHIMMER_CLASS}`
                    + ` skeleton-heading`
                    + ` w-60"></div>`
                    + `</div>`,
                ))}
            </div>
        </div>
        </div>`;
        case 'table':
            return html`<div
        class="skeleton-card p-0
            overflow-hidden">
        <div class="p-4 border-b">
            <div class="${SHIMMER_CLASS}
                skeleton-text w-30"></div>
        </div>
        ${Array(count).fill(trusted(
            '<div'
            + ' class="flex items-center'
            + ' gap-4 py-3 px-4 border-b">'
            + `<div class="`
            + `${SHIMMER_CLASS}`
            + ` skeleton-avatar-sm">`
            + `</div>`
            + `<div class="`
            + `${SHIMMER_CLASS}`
            + ` skeleton-text w-25 m-0">`
            + `</div>`
            + `<div class="`
            + `${SHIMMER_CLASS}`
            + ` skeleton-text w-20 m-0">`
            + `</div>`
            + `<div class="`
            + `${SHIMMER_CLASS}`
            + ` skeleton-badge`
            + ` ml-auto"></div>`
            + `</div>`,
        ))}
        </div>`;
        case 'stats-row':
            return buildSkeletonStatsRow();
        default:
            return html``;
    }
}

export function buildErrorState(
    message: string,
    retryLabel: string,
): SafeHtml {
    return html`<div
    class="state-container">
    <div class="state-icon
        state-icon-error">${
        iconAlertTriangle(24, '')}</div>
    <p class="state-title"
        >Something went wrong</p>
    <p class="state-description">${
        message}</p>
    <button class="btn btn-outline"
        data-retry-btn>${retryLabel
    }</button>
    </div>`;
}

export function buildEmptyState(
    iconHtml: SafeHtml,
    title: string,
    description: string,
    action?: {
        label: string | SafeHtml;
        href: string;
    },
): SafeHtml {
    return html`<div
    class="state-container">
    <div class="state-icon
        state-icon-empty">${iconHtml}</div>
    <p class="state-title">${title}</p>
    <p class="state-description">${
        description}</p>
    ${action
        ? html`<a href="${action.href}"
            class="btn btn-primary">${
            action.label}</a>`
        : html``}
    </div>`;
}

export function formatErrorMessage(
    error: unknown,
    noMatchMessage: string,
): string {
    if (error instanceof Error)
        return error.message;
    if (
        typeof error === 'string'
        && error.length > 0
    ) return error;
    return noMatchMessage;
}

export interface EmptyStateConfig {
    icon: SafeHtml;
    title: string;
    description: string;
    action?: {
        label: string | SafeHtml;
        href: string;
    };
    onEmpty?: () => void;
}

export class TimeoutError extends Error {
    constructor() {
        super(
            'Request timed out.'
            + ' Please try again.',
        );
        this.name = 'TimeoutError';
    }
}

async function fetchWithTimeout<T>(
    fetchFn: () => Promise<T>,
    timeoutMs: number,
): Promise<T> {
    return Promise.race([
        fetchFn(),
        new Promise<never>(
            (_, reject) =>
                setTimeout(
                    () => reject(
                        new TimeoutError(),
                    ),
                    timeoutMs,
                ),
        ),
    ]);
}

export async function withLoadingState<T>(
    container: HTMLElement,
    skeletonHtml: SafeHtml,
    fetchFn: () => Promise<T>,
    retryFn?: () => void,
    emptyState?: EmptyStateConfig,
    timeoutMs?: number,
): Promise<T | null> {
    mutateHtml(container, skeletonHtml);
    const run = timeoutMs
        ? () => fetchWithTimeout(
            fetchFn, timeoutMs,
        )
        : fetchFn;
    let data: T;
    try {
        data = await run();
    } catch (e) {
        mutateHtml(
            container,
            buildErrorState(
                formatErrorMessage(
                    e,
                    'An unexpected'
                    + ' error'
                    + ' occurred.'
                    + ' Please try'
                    + ' again.',
                ),
                'Try Again',
            ),
        );
        const retryBtn =
            container
                .querySelector<
                    HTMLElement
                >(
                    '[data-retry-btn]',
                );
        if (retryBtn && retryFn) {
            retryBtn.addEventListener(
                'click',
                retryFn,
            );
            retryBtn.focus();
        }
        return null;
    }
    if (
        emptyState
        && Array.isArray(data)
        && data.length === 0
    ) {
        mutateHtml(
            container,
            buildEmptyState(
                emptyState.icon,
                emptyState.title,
                emptyState.description,
                emptyState.action,
            ),
        );
        emptyState.onEmpty?.();
        return null;
    }
    return data;
}
