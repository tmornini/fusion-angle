import { log } from './logger.ts';
import { $ } from './dom.ts';
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
import {
    markStart,
    markEnd,
    MEASURE_BOOT_MODULE_IMPORT,
    MEASURE_BOOT_PAGE_INIT,
} from './page-performance.ts';

export async function initPageModule(
    pageName: string,
): Promise<void> {
    const entry = PAGE_REGISTRY[pageName];
    if (!entry) {
        navigateTo('not-found');
        return;
    }
    markStart(MEASURE_BOOT_MODULE_IMPORT);
    const mod = await entry.loader();
    markEnd(MEASURE_BOOT_MODULE_IMPORT);
    markStart(MEASURE_BOOT_PAGE_INIT);
    await mod.init(getUrlParams());
    markEnd(MEASURE_BOOT_PAGE_INIT);
}

export function handlePageLoadError(
    pageName: string,
    err: unknown,
): void {
    log.error(
        'page failed to init',
        'core',
        { page: pageName },
        err,
    );
    const container =
        $('.page-content', document)
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
        $('[data-retry-btn]', container)
            ?.addEventListener(
                'click',
                () => location.reload(),
            );
    }
}
