import { log } from './logger.ts';
import { setHtml } from './safe-html.ts';
import {
    buildErrorState,
} from './loading-states.ts';
import {
    extractErrorMessage,
} from './error-helpers.ts';
import { navigateTo } from './navigation.ts';
import {
    getUrlParams,
} from './adapters/url-params.ts';
import { PAGE_REGISTRY } from './page-registry.ts';

export async function initPageModule(
    pageName: string,
): Promise<void> {
    const entry = PAGE_REGISTRY[pageName];
    if (!entry) {
        navigateTo('not-found');
        return;
    }
    const mod = await entry.loader();
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
                extractErrorMessage(
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
