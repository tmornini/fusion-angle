import { PAGE_REGISTRY } from './page-registry';

function getPageName(): string {
    return document.documentElement.getAttribute('data-page') || '';
}

function getParams(): Record<string, string> {
    const params: Record<string, string> = {};
    new URLSearchParams(
        window.location.search,
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
    let url: string;
    if (entry?.sourceFile) {
        url = `../${entry.sourceDir || page}/${entry.sourceFile}.html`;
    } else {
        url = `../${entry?.sourceDir || page}/index.html`;
    }
    if (params && Object.keys(params).length > 0) {
        url += '?' + new URLSearchParams(params).toString();
    }
    return url;
}

function navigateTo(
    page: string,
    params?: Record<string, string>,
): void {
    window.location.href =
        buildPageUrl(page, params);
}

function initPrefetch(): void {
    if (location.protocol === 'file:') return;
    const prefetched = new Set<string>();
    document.addEventListener('pointerenter', (e) => {
        if (!(e.target instanceof Element)) return;
        const anchor = e.target.closest<HTMLAnchorElement>('a[href]');
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        if (
            href
            && href.endsWith('.html')
            && !href.startsWith('http')
            && !prefetched.has(href)
        ) {
            prefetched.add(href);
            const link = document.createElement('link');
            link.rel = 'prefetch';
            link.href = href;
            document.head.appendChild(link);
        }
    }, { capture: true });
}

export { buildPageUrl, navigateTo, getPageName, getParams, initPrefetch };
