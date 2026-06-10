// Pure reduction over an append-only ledger: the WINNING row per
// key. `keyOf` groups the rows; `compare(candidate, incumbent)`
// decides when a later-iterated row replaces the one held. The
// default is the (at, id) TOTAL order: a later RFC-3339 zulu `at`
// (which sorts lexically = chronologically) wins, and an equal-
// `at` tie falls to the larger row id — arbitrary but identical
// on every backend and every row permutation, where iteration
// order (append order on the simulated tiers, primary-key order
// on IndexedDB) is not. Security reducers that must rank equal-
// `at` events by ACTION (a revoke beats a co-timestamped grant)
// pass their own fail-closed comparator. Single-key callers read
// `.get(key)`; callers needing the latest per key over every key
// use the whole map.
export function latestByKey<
    T extends { at: string; id: string },
    K,
>(
    rows: readonly T[],
    keyOf: (row: T) => K,
    compare: (candidate: T, incumbent: T) => boolean
        = (candidate, incumbent) =>
            candidate.at > incumbent.at
            || (candidate.at === incumbent.at
                && candidate.id > incumbent.id),
): Map<K, T> {
    const latest = new Map<K, T>();
    for (const row of rows) {
        const key = keyOf(row);
        const incumbent = latest.get(key);
        if (incumbent === undefined || compare(row, incumbent)) {
            latest.set(key, row);
        }
    }
    return latest;
}

// The field extracted from the FIRST row matching `match`, or
// null if none matches. Composes the find-then-extract idiom the
// lookups repeat: predicate and extractor injected, the caller
// keeps its own field choice. The absence is modelled as null
// here; a caller wanting a fallback supplies it (`?? fallback`).
export function findFirstByKey<T, V>(
    rows: readonly T[],
    match: (row: T) => boolean,
    extract: (row: T) => V,
): V | null {
    const row = rows.find(match);
    return row === undefined ? null : extract(row);
}
