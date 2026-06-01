// Storage-edge serialization shared by both backends.
// The NOT NULL gate lives here so both LocalStorageBackend
// and MemoryStorageBackend reject null/undefined fields
// identically — the test backend cannot lie about what the
// production gate enforces.

export function isRowShaped(
    row: unknown,
): row is { id: string } {
    return typeof row === 'object'
        && row !== null
        && 'id' in row
        && typeof (
            row as { id: unknown }
        ).id === 'string';
}

export function serializeValue(
    value: unknown,
    key: string,
    tableName: string,
): unknown {
    if (value === null || value === undefined) {
        throw new Error(
            `NOT NULL violation: "${key}"`
            + ` in "${tableName}" is`
            + ` ${String(value)}.`,
        );
    }
    return value;
}

export function serializeRecord(
    record: Record<string, unknown>,
    tableName: string,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (
        const [key, value]
        of Object.entries(record)
    ) {
        result[key] = serializeValue(
            value, key, tableName,
        );
    }
    return result;
}
