export function mediaQueryMatches(
    query: string,
): boolean {
    return window.matchMedia(query).matches;
}

export function subscribeMediaQuery(
    query: string,
    onChange: (matches: boolean) => void,
): () => void {
    const mq = window.matchMedia(query);
    const handler =
        (e: MediaQueryListEvent) =>
            onChange(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener(
        'change', handler,
    );
}
