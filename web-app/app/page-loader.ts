import { log } from './logger.ts';
import { setHtml } from './safe-html.ts';
import {
    buildErrorState,
    formatErrorMessage,
} from './loading-states.ts';
import { navigateTo } from './navigation.ts';
import {
    getUrlParams,
} from './adapters/url-params.ts';

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
    organization: () =>
        import(
            '../organization/index'
        ),
    billing: () =>
        import('../billing/index'),
    people: () =>
        import('../people/index'),
    'people-detail': () =>
        import('../people/detail'),
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
    await mod.init(getUrlParams());
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
                formatErrorMessage(
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
