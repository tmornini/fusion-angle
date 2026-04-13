type Listener<T> = (value: T) => void;

export interface Channel<T> {
    send(value: T): void;
    subscribe(
        fn: Listener<T>,
    ): () => void;
}

export function createChannel<T>(
): Channel<T> {
    const subs = new Set<Listener<T>>();
    return {
        send(value: T): void {
            for (const fn of subs) {
                fn(value);
            }
        },
        subscribe(
            fn: Listener<T>,
        ): () => void {
            subs.add(fn);
            return () => {
                subs.delete(fn);
            };
        },
    };
}
