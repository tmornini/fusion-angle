import { PAGE_REGISTRY } from './page-registry.ts';
import { putLocation } from './adapters/location.ts';
import { buildQueryString } from './adapters/url-params.ts';

function getPageName(): string {
    const name = document
        .documentElement
        .getAttribute('data-page');
    if (!name) {
        throw new Error(
            'Missing data-page attribute'
            + ' on <html>',
        );
    }
    return name;
}

function buildPageUrl(
    page: string,
    params?: Record<string, string>,
): string {
    const entry = PAGE_REGISTRY[page];
    if (!entry) {
        throw new Error(
            `Unknown page: "${page}"`,
        );
    }
    let url = `../${entry.sourceDir}`
        + `/${entry.sourceFile}.html`;
    if (params && Object.keys(params).length > 0) {
        url += '?' + buildQueryString(params);
    }
    return url;
}

function navigateTo(
    page: string,
    params?: Record<string, string>,
): void {
    putLocation(buildPageUrl(page, params));
}

export { buildPageUrl, navigateTo, getPageName };
