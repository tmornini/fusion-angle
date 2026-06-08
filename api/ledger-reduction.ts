// Pure reduction over an append-only ledger: the WINNING row per
// key. `keyOf` groups the rows; `compare(candidate, incumbent)`
// decides when a later-iterated row replaces the one held. The
// default is the SECURE tiebreak: on an equal RFC-3339 zulu `at`
// (which sorts lexically = chronologically), the later-APPENDED
// row wins (>=), so a revoke beats a co-timestamped issue. Sites
// that must keep the FIRST-appended row on a tie pass an explicit
// strict compare ((a, b) => a.at > b.at). Single-key callers read
// `.get(key)`; callers needing the latest per key over every key
// use the whole map. The comparator stays at the call site, where
// its `>`/`>=` security intent is legible.
export function latestByKey<T extends { at: string }, K>(
    rows: readonly T[],
    keyOf: (row: T) => K,
    compare: (candidate: T, incumbent: T) => boolean
        = (candidate, incumbent) => candidate.at >= incumbent.at,
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
