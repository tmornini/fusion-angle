import {
    subscribeEventListener,
} from './event-listener.ts';

let interned:
    ((query: string) => MediaQueryList) | null = null;

export function internMatchMedia(): void {
    const w = globalThis.window;
    if (w === undefined) return;
    if (typeof w.matchMedia !== 'function') {
        return;
    }
    if (interned !== null && w.matchMedia === interned) {
        return;
    }
    const orig = w.matchMedia.bind(w);
    const cache = new Map<string, MediaQueryList>();
    const wrapped = (
        query: string,
    ): MediaQueryList => {
        const hit = cache.get(query);
        if (hit !== undefined) return hit;
        const mq = orig(query);
        cache.set(query, mq);
        return mq;
    };
    w.matchMedia = wrapped;
    interned = wrapped;
}

export function mediaQueryMatches(
    query: string,
): boolean {
    return window.matchMedia(query).matches;
}

export function subscribeMediaQuery(
    query: string,
    onChange: (matches: boolean) => void,
): () => void {
    internMatchMedia();
    const mq = window.matchMedia(query);
    const handler =
        (e: MediaQueryListEvent) =>
            onChange(e.matches);
    return subscribeEventListener(mq, 'change', handler);
}
