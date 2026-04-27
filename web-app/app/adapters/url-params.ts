import { getQueryString } from './location';

export function getUrlParam(
    name: string,
): string | null {
    return new URLSearchParams(
        getQueryString(),
    ).get(name);
}
