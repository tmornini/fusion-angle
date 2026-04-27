import { getQueryString } from './location.ts';

export function getUrlParam(
    name: string,
): string | null {
    return new URLSearchParams(
        getQueryString(),
    ).get(name);
}
