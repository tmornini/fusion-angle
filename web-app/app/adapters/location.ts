import { latchPageLeaving } from '../error-helpers.ts';

export function getQueryString(): string {
    return window.location.search;
}

export function putLocation(url: string): void {
    latchPageLeaving();
    window.location.href = url;
}

export function reloadLocation(): void {
    latchPageLeaving();
    window.location.reload();
}
