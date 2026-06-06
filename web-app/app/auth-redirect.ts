import { PAGE_REGISTRY } from './page-registry.ts';
import { getPageName, navigateTo } from './navigation.ts';
import {
    getUrlParams,
    buildQueryString,
} from './adapters/url-params.ts';

// Where a login with no usable ?return= lands. A named
// constant, never a buried ?? 'dashboard': the destination is a
// decision, not a fallback masking absence.
export const DEFAULT_POST_LOGIN_PAGE = 'dashboard';

export interface ReturnTarget {
    readonly page: string;
    readonly params: Record<string, string>;
}

// Encode the current location as one ?return= value: the page
// key, plus its query string when present. navigateTo applies
// the percent-encoding, so this stays the raw "page?a=b" form.
export function encodeReturnTarget(
    page: string,
    params: Record<string, string>,
): string {
    const query = buildQueryString(params);
    return query === '' ? page : `${page}?${query}`;
}

// Decode a ?return= value to a destination, defending against
// open redirects: only a KNOWN, auth-gated page is honored — a
// raw URL, an unknown key, or an exempt page falls to
// DEFAULT_POST_LOGIN_PAGE. An absent return likewise defaults.
export function decodeReturnTarget(
    raw: string | null,
): ReturnTarget {
    if (raw === null) {
        return defaultTarget();
    }
    const queryAt = raw.indexOf('?');
    const page = queryAt === -1 ? raw : raw.slice(0, queryAt);
    const query =
        queryAt === -1 ? '' : raw.slice(queryAt + 1);
    if (!isGatedPage(page)) {
        return defaultTarget();
    }
    return { page, params: parseQuery(query) };
}

// Bounce an auth-required page to login, carrying a ?return= so
// the user lands back where they started. No-ops on an exempt
// page — the second deadlock / re-entrancy guard: a login-free
// page must never redirect to itself.
export function redirectToLogin(): void {
    const page = getPageName();
    if (PAGE_REGISTRY[page]?.requiresAuth === false) {
        return;
    }
    navigateTo('auth', {
        return: encodeReturnTarget(page, getUrlParams()),
    });
}

function defaultTarget(): ReturnTarget {
    return { page: DEFAULT_POST_LOGIN_PAGE, params: {} };
}

function isGatedPage(page: string): boolean {
    const entry = PAGE_REGISTRY[page];
    return entry !== undefined && entry.requiresAuth !== false;
}

function parseQuery(query: string): Record<string, string> {
    const params: Record<string, string> = {};
    new URLSearchParams(query).forEach((value, key) => {
        params[key] = value;
    });
    return params;
}
