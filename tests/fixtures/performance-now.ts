// Swap performance.now for a stub for the span of one body —
// the shared voice for tests that pin a duration the product
// measures on the monotonic clock. The stub reads a value the
// test advances inside the work it drives, never a call
// count, so the pinned duration cannot flake. `now` lives on
// the Performance prototype, not the instance: an own
// property shadows it, and deleting that property restores
// it.

export async function withPerformanceNow<T>(
    now: () => number,
    body: () => T | Promise<T>,
): Promise<T> {
    Object.defineProperty(performance, 'now', {
        value: now,
        configurable: true,
    });
    try {
        return await body();
    } finally {
        Reflect.deleteProperty(performance, 'now');
    }
}
