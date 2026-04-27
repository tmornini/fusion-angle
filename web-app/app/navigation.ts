import { PAGE_REGISTRY } from './page-registry.ts';
import {
    getQueryString,
    setLocation,
} from './adapters/location.ts';

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

function getParams(): Record<string, string> {
    const params: Record<string, string> = {};
    new URLSearchParams(
        getQueryString(),
    ).forEach((value, key) => {
        params[key] = value;
    });
    return params;
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
        url += '?' + new URLSearchParams(params).toString();
    }
    return url;
}

function navigateTo(
    page: string,
    params?: Record<string, string>,
): void {
    setLocation(buildPageUrl(page, params));
}

export { buildPageUrl, navigateTo, getPageName, getParams };
