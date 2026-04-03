import { applyTheme } from './state';
import { log } from './logger';
import { html, setHtml } from './safe-html';
import { buildErrorState, errorMessage } from './loading-states';
import {
    navigateTo,
    getPageName,
    getParams,
    initPrefetch,
} from './navigation';
import { initSidebarLayout } from './layout';

export { navigateTo } from './navigation';
export {
    displayText,
    formatDate,
    getTimeOfDay,
    initials,
    toDateInputValue,
    durationInDays,
    formatCompactCurrency,
    SECONDS_PER_DAY,
} from './format';
export { openDialog, closeDialog, initDialog, initTabs } from './dialog';

const pageModules: Record<
    string,
    () => Promise<{
        init: (
            params?: Record<string, string>,
        ) => void | Promise<void>;
    }>
> = {
    dashboard: () => import('../dashboard/index'),
    ideas: () => import('../ideas/index'),
    'idea-detail': () => import('../ideas/detail'),
    projects: () => import('../projects/index'),
    'project-detail': () => import('../projects/detail'),
    'idea-create': () => import('../ideas/create'),
    'idea-convert': () => import('../ideas/convert'),
    'idea-review-queue': () => import('../ideas/review-queue'),
    'approval-detail': () => import('../ideas/approval-detail'),
    flow: () => import('../flow/index'),
    'flow-detail': () => import('../flow/detail'),
    teams: () => import('../organization/teams'),
    account: () => import('../organization/index'),
    profile: () => import('../profile/index'),
    settings: () => import('../settings/index'),
    users: () => import('../organization/users'),
    'activity-feed': () => import('../organization/activity-feed'),
    snapshots: () => import('../snapshots/index'),
    'design-system': () => import('../design-system/index'),
    landing: () => import('../landing/index'),
    auth: () => import('../auth/index'),
    onboarding: () => import('../organization/onboarding'),
    'not-found': () => import('../not-found/index'),
};

async function initDatabase(
): Promise<boolean> {
    const { createLocalStorageAdapter } =
        await import(
            '../../api/db-localstorage'
        );
    const { initApi, GET } =
        await import('../../api/api');
    const adapter =
        await createLocalStorageAdapter();
    await adapter.initialize();
    initApi(adapter);
    const schema =
        await GET<string | null>(
            'snapshots/schema',
        );
    return schema !== null;
}

async function loadAndInitPage(
    pageName: string,
): Promise<void> {
    const loader = pageModules[pageName];
    if (!loader) {
        navigateTo('not-found');
        return;
    }
    const mod = await loader();
    await mod.init(getParams());
}

function handleDatabaseError(
    err: unknown,
): void {
    log.error(
        'Database initialization failed:',
        'core',
        err,
    );
    setHtml(document.body, html`<div
        style="padding:2rem;
            font-family:sans-serif;
            max-width:40rem">
        <h1 style="color:hsl(0 72% 51%)">
            Failed to initialize database
        </h1>
        <pre style="background:hsl(0 100% 97%);
            padding:1rem;
            border-radius:0.5rem;
            overflow:auto;
            white-space:pre-wrap"
>${errorMessage(err, 'Unknown database error')}</pre>
      <p>Try clearing site data
        and reloading.</p>
    </div>`);
}

function handlePageLoadError(
    pageName: string,
    err: unknown,
): void {
    log.error(
        `Page "${pageName}" failed to init:`,
        'core',
        err,
    );
    const container =
        document.querySelector<HTMLElement>(
            '.page-content',
        )
        || document.getElementById(
            'page-root',
        );
    if (container) {
        setHtml(
            container,
            buildErrorState(
                errorMessage(
                    err,
                    'This page failed to load.',
                ),
                'Try Again',
            ),
        );
        container
            .querySelector(
                '[data-retry-btn]',
            )
            ?.addEventListener(
                'click',
                () => location.reload(),
            );
    }
}

window.addEventListener('unhandledrejection', event => {
    const name = (event.reason as DOMException)?.name;
    if (name === 'InvalidStateError'
        || name === 'AbortError') {
        event.preventDefault();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    applyTheme();
    initPrefetch();

    let hasSchema: boolean;
    try {
        hasSchema = await initDatabase();
    } catch (err) {
        handleDatabaseError(err);
        return;
    }

    if (!hasSchema) {
        const page = getPageName();
        const skipRedirect = [
            'snapshots',
            'auth',
            'onboarding',
            'not-found',
            'design-system',
            'landing',
        ];
        if (!skipRedirect.includes(page)) {
            navigateTo('snapshots');
            return;
        }
    }

    const pageName = getPageName();

    if (document.querySelector('.sidebar-layout')) {
        await initSidebarLayout();
    }

    import('./command-palette')
        .then(m => m.initCommandPalette())
        .catch(err => log.error(
            'Failed to load command palette',
            'core',
            err,
        ));

    try {
        await loadAndInitPage(pageName);
    } catch (err) {
        handlePageLoadError(pageName, err);
    }
});
