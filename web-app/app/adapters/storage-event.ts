import {
    subscribeEventListener,
} from './event-listener.ts';

export function subscribeStorageEvent(
    handler: (e: StorageEvent) => void,
): () => void {
    if (typeof window === 'undefined') {
        return () => {};
    }
    return subscribeEventListener(window, 'storage', handler);
}
