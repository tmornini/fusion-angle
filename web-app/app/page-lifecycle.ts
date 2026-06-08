// The page's AbortController paired with its signal. A page
// module passes the signal to every addEventListener so a single
// pageAbort.abort() on teardown removes them all at once. The
// pair the page modules otherwise hand-roll identically.
export function createPageAbort(): {
    pageAbort: AbortController;
    signal: AbortSignal;
} {
    const pageAbort = new AbortController();
    return { pageAbort, signal: pageAbort.signal };
}

// Bind a page's delegated listeners on one element, each scoped
// to `signal` so a single pageAbort.abort() removes them all.
// The event map keeps each handler typed to its own event; the
// lone `as EventListener` cast is the thin seam between that
// typed map and the stringly addEventListener API.
type PageListeners = {
    [K in keyof HTMLElementEventMap]?:
        (e: HTMLElementEventMap[K]) => void;
};

export function bindPageListeners(
    target: HTMLElement,
    handlers: PageListeners,
    signal: AbortSignal,
): void {
    for (const type of Object.keys(handlers)) {
        const handler = handlers[
            type as keyof HTMLElementEventMap
        ];
        if (handler !== undefined) {
            target.addEventListener(
                type,
                handler as EventListener,
                { signal },
            );
        }
    }
}
