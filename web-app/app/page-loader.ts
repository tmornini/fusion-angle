import { log } from './logger';
import { setHtml } from './safe-html';
import {
    buildErrorState,
    errorMessage,
} from './loading-states';
import {
    navigateTo,
    getParams,
} from './navigation';

const pageModules: Record<
    string,
    () => Promise<{
        init: (
            params?: Record<
                string, string
            >,
        ) => void | Promise<void>;
    }>
> = {
    dashboard: () =>
        import('../dashboard/index'),
    workbox: () =>
        import('../workbox/index'),
    'workbox-detail': () =>
        import('../workbox/detail'),
    ideas: () =>
        import('../ideas/index'),
    'idea-detail': () =>
        import('../ideas/detail'),
    projects: () =>
        import('../projects/index'),
    'project-detail': () =>
        import('../projects/detail'),
    'idea-create': () =>
        import('../ideas/create'),
    'idea-convert': () =>
        import('../ideas/convert'),
    flows: () =>
        import('../flows/index'),
    'flow-detail': () =>
        import('../flows/detail'),
    teams: () =>
        import(
            '../organization/teams'
        ),
    organization: () =>
        import(
            '../organization/index'
        ),
    profile: () =>
        import('../profile/index'),
    settings: () =>
        import('../settings/index'),
    billing: () =>
        import('../billing/index'),
    users: () =>
        import(
            '../organization/users'
        ),
    'activity-feed': () =>
        import(
            '../organization/'
            + 'activity-feed'
        ),
    snapshots: () =>
        import('../snapshots/index'),
    'design-system': () =>
        import(
            '../design-system/index'
        ),
    landing: () =>
        import('../landing/index'),
    auth: () =>
        import('../auth/index'),
    onboarding: () =>
        import(
            '../organization/'
            + 'onboarding'
        ),
    'not-found': () =>
        import('../not-found/index'),
};

export async function initPageModule(
    pageName: string,
): Promise<void> {
    const loader =
        pageModules[pageName];
    if (!loader) {
        navigateTo('not-found');
        return;
    }
    const mod = await loader();
    await mod.init(getParams());
}

export function handlePageLoadError(
    pageName: string,
    err: unknown,
): void {
    log.error(
        `Page "${pageName}"`
        + ' failed to init:',
        'core',
        err,
    );
    const container =
        document
            .querySelector<HTMLElement>(
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
                    'This page'
                    + ' failed to'
                    + ' load.',
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
