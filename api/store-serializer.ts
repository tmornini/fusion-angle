// Per-store serializer mutex. Without this, two
// Promise.all'd puts both await backend.read, both
// see the pre-write array, and both write back a
// single-row result (last writer wins). The chain
// forces each write to observe the prior write's
// effect.
export function createSerializer():
    <R>(fn: () => Promise<R>) => Promise<R>
{
    let tail: Promise<unknown> = Promise.resolve();
    return function run<R>(
        fn: () => Promise<R>,
    ): Promise<R> {
        const next = tail.then(fn, fn);
        tail = next.then(
            () => undefined,
            () => undefined,
        );
        return next as Promise<R>;
    };
}
