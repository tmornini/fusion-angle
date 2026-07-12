import { ICON_SIZE, iconAlertTriangle } from './icons.ts';
import { $ } from './dom.ts';
import {
    extractErrorMessage,
} from './error-helpers.ts';
import {
    fetchMeasureName,
    markEnd,
    markStart,
    renderMeasureName,
} from './page-performance.ts';
import {
    SafeHtml,
    html,
    setHtml,
    trusted,
} from './safe-html.ts';

export type SkeletonType =
    | 'card-grid'
    | 'card-list'
    | 'detail'
    | 'table';

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
        iconAlertTriangle(ICON_SIZE['2xl'], '')}</div>
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

// The load process owns its whole arc: skeleton while
// fetching, error state (with retry) on failure, empty
// state on an empty list, and the onData continuation on
// success. Nothing returns to the call site — outcomes the
// process has already rendered are not the caller's to
// re-interrogate.
export interface LoadIntoConfig<T> {
    container: HTMLElement;
    skeleton: SafeHtml;
    fetch: () => Promise<T>;
    retry?: () => void;
    emptyState?: EmptyStateConfig;
    onData: (data: T) => void | Promise<void>;
}

export async function loadInto<T>(
    cfg: LoadIntoConfig<T>,
): Promise<void> {
    setHtml(cfg.container, cfg.skeleton);
    const fetchName = fetchMeasureName(
        cfg.container.id,
    );
    let data: T;
    try {
        markStart(fetchName);
        data = await cfg.fetch();
        markEnd(fetchName);
    } catch (e) {
        setHtml(
            cfg.container,
            buildErrorState(
                extractErrorMessage(
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
        const retryBtn = $(
            '[data-retry-btn]', cfg.container,
        );
        if (retryBtn && cfg.retry) {
            retryBtn.addEventListener(
                'click',
                cfg.retry,
            );
            retryBtn.focus();
        }
        return;
    }
    if (
        cfg.emptyState
        && Array.isArray(data)
        && data.length === 0
    ) {
        setHtml(
            cfg.container,
            buildEmptyState(
                cfg.emptyState.icon,
                cfg.emptyState.title,
                cfg.emptyState.description,
                cfg.emptyState.action,
            ),
        );
        cfg.emptyState.onEmpty?.();
        return;
    }
    const renderName = renderMeasureName(
        cfg.container.id,
    );
    markStart(renderName);
    await cfg.onData(data);
    markEnd(renderName);
}
