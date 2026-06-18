import { FieldValue } from './field-value.ts';

// Resolve a dotted path against an already-decoded structured
// value (a parsed JSON body), returning a FieldValue leaf. The
// single traversal engine: the body section of a message query
// and the Decoded value object both descend through it, so a
// JSON path means one thing everywhere (one codebase, one
// voice). An empty path returns the value itself as a leaf.
export function navigateValue(
    value: unknown,
    path: readonly string[],
): FieldValue {
    let current = value;
    for (const key of path) {
        if (Array.isArray(current)) {
            const index = Number(key);
            if (
                !Number.isInteger(index)
                || index < 0
                || index >= current.length
            ) {
                return FieldValue.absent();
            }
            current = current[index];
        } else if (current !== null && typeof current === 'object') {
            const record = current as Record<string, unknown>;
            if (!(key in record)) return FieldValue.absent();
            current = record[key];
        } else {
            return FieldValue.absent();
        }
    }
    return leafValue(current);
}

function leafValue(value: unknown): FieldValue {
    if (
        typeof value === 'string'
        || typeof value === 'number'
        || typeof value === 'boolean'
    ) {
        return FieldValue.present(value);
    }
    return FieldValue.absent();
}
