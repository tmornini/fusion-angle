// A promise-chain serializer that orders whole operations
// through one backend instance. The memory backend wraps
// each transaction in it: without it, two concurrent
// transactions both pre-load a table at v0 and the second
// flush clobbers the first (last writer wins). The chain
// forces each transaction to observe the prior one's
// flush. Cross-process ordering is Postgres's (advisory
// locks); this serializer orders one memory instance.
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
