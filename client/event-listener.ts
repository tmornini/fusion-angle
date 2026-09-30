// Subscribe a listener to a platform EventTarget and get back
// the matching unsubscribe — the add/remove pairing the
// platform-event adapters (broadcast-channel, media-query,
// storage-event) otherwise hand-roll. The lone cast bridges the
// caller's typed event handler to the stringly addEventListener
// API; pairing add with remove here means a caller can never
// remove a different listener than it added.
export function subscribeEventListener<E extends Event = Event>(
    target: EventTarget,
    type: string,
    listener: (event: E) => void,
): () => void {
    const fn = listener as EventListener;
    target.addEventListener(type, fn);
    return () => target.removeEventListener(type, fn);
}
