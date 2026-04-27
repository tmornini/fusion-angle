import { getQueryString } from './location.ts';

export function getUrlParam(
    name: string,
): string | null {
    return new URLSearchParams(
        getQueryString(),
    ).get(name);
}

export function getUrlParams():
    Record<string, string> {
    const params: Record<string, string> = {};
    new URLSearchParams(
        getQueryString(),
    ).forEach((value, key) => {
        params[key] = value;
    });
    return params;
}

export function buildQueryString(
    params: Record<string, string>,
): string {
    return new URLSearchParams(
        params,
    ).toString();
}
