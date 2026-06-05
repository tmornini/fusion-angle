// A promise-chain serializer that orders whole operations
// through one backend instance. The simulated backends
// (memory, localStorage) wrap each transaction in it:
// without it, two concurrent transactions both pre-load a
// table at v0 and the second flush clobbers the first (last
// writer wins). The chain forces each transaction to observe
// the prior one's flush. Cross-tab ordering is out of reach
// here — separate heaps — until the IndexedDB tier (Phase B).
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
