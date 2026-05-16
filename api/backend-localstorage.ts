import {
    MissingTableError,
    TABLE_NAMES,
    type StorageBackend,
} from './db.ts';

const KEY_PREFIX = 'fusion-ai:';

const COMPRESSED_TABLES: ReadonlySet<string> = new Set([
    'states',
    'flow_versions',
]);

const COMPRESSION_PREFIX = 'gz1:';

function isRowShaped(
    row: unknown,
): row is { id: string } {
    return typeof row === 'object'
        && row !== null
        && 'id' in row
        && typeof (
            row as { id: unknown }
        ).id === 'string';
}

async function compressJson(
    json: string,
): Promise<string> {
    const stream = new Blob([json]).stream().pipeThrough(
        new CompressionStream('gzip'),
    );
    const buffer =
        await new Response(stream).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const b of bytes) {
        binary += String.fromCharCode(b);
    }
    return COMPRESSION_PREFIX + btoa(binary);
}

async function decompressJson(
    stored: string,
): Promise<string> {
    if (!stored.startsWith(COMPRESSION_PREFIX)) {
        return stored;
    }
    const b64 = stored.slice(COMPRESSION_PREFIX.length);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const stream = new Blob([bytes]).stream().pipeThrough(
        new DecompressionStream('gzip'),
    );
    return new Response(stream).text();
}

function serializeValue(
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

function serializeRecord(
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

export class LocalStorageBackend
    implements StorageBackend
{
    async read<T extends { id: string }>(
        table: string,
    ): Promise<T[]> {
        const raw = localStorage.getItem(
            KEY_PREFIX + table,
        );
        if (raw === null) {
            throw new MissingTableError(table);
        }
        let json: string;
        try {
            json = await decompressJson(raw);
        } catch (e) {
            throw new Error(
                'Decompressing table "'
                + table + '" failed: '
                + (e instanceof Error
                    ? e.message
                    : String(e)),
            );
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(json);
        } catch (e) {
            throw new Error(
                'Parsing table "'
                + table + '" failed: '
                + (e instanceof Error
                    ? e.message
                    : String(e)),
            );
        }
        if (!Array.isArray(parsed)) {
            throw new Error(
                'Table "' + table
                + '" is not an array.'
                + ' Clear data or import'
                + ' a valid snapshot.',
            );
        }
        if (!parsed.every(isRowShaped)) {
            throw new Error(
                'Table "' + table
                + '" has malformed row(s).'
                + ' Clear data or import'
                + ' a valid snapshot.',
            );
        }
        return parsed as T[];
    }

    async write<T extends { id: string }>(
        table: string,
        rows: T[],
    ): Promise<void> {
        const serialized = rows.map(
            row => ({
                ...serializeRecord(
                    row as Record<string, unknown>,
                    table,
                ),
                id: row.id,
            }),
        );
        const json = JSON.stringify(serialized);
        const payload = COMPRESSED_TABLES.has(table)
            ? await compressJson(json)
            : json;
        try {
            localStorage.setItem(
                KEY_PREFIX + table,
                payload,
            );
        } catch (e) {
            if (
                e instanceof DOMException
                && e.name === 'QuotaExceededError'
            ) {
                throw new Error(
                    'Storage quota exceeded'
                    + ' writing "'
                    + table
                    + '". Clear old data or'
                    + ' export a snapshot first.',
                );
            }
            throw e;
        }
    }

    async remove(table: string): Promise<void> {
        localStorage.removeItem(KEY_PREFIX + table);
    }

    async clearAll(): Promise<void> {
        for (const table of TABLE_NAMES) {
            localStorage.removeItem(
                KEY_PREFIX + table,
            );
        }
    }

    async list(): Promise<string[]> {
        return TABLE_NAMES.filter(
            t => localStorage.getItem(
                KEY_PREFIX + t,
            ) !== null,
        );
    }
}
