export function subscribeStorageEvent(
    handler: (e: StorageEvent) => void,
): () => void {
    if (typeof window === 'undefined') {
        return () => {};
    }
    window.addEventListener('storage', handler);
    return () => window.removeEventListener(
        'storage', handler,
    );
}
