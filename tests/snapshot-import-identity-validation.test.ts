import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { localStorageDbAdapter } from '../api/db-localstorage.ts';
import {
    SNAPSHOT_SCHEMA_VERSION,
    SNAPSHOT_SCHEMA_VERSION_KEY,
} from '../api/db.ts';

// Snapshot import is a second validation edge: the
// per-request write path is fenced at store
// construction, but importing a snapshot routes each
// row through validateSnapshotRow. Phase Final Stage B
// retired the identity spine tables — only clients
// remains from this family on TABLE_NAMES.
// Mirrors snapshot-import-validation.test.ts.

function installShim(): void {
    const map = new Map<string, string>();
    (globalThis as unknown as {
        localStorage: {
            getItem(key: string): string | null;
            setItem(key: string, value: string): void;
            removeItem(key: string): void;
        };
    }).localStorage = {
        getItem(key) { return map.get(key) ?? null; },
        setItem(key, value) { map.set(key, value); },
        removeItem(key) { map.delete(key); },
    };
}

async function rejectsImport(
    json: string, pattern: RegExp,
): Promise<void> {
    installShim();
    const adapter = localStorageDbAdapter();
    await assert.rejects(
        () => adapter.putSnapshot(json),
        pattern,
    );
}

async function acceptsImport(json: string): Promise<void> {
    installShim();
    const adapter = localStorageDbAdapter();
    await adapter.putSnapshot(json);
}

// One valid row per surviving gated table, exact body keys.
const VALID_ROWS: Record<
    string, Record<string, unknown>
> = {
    clients: {
        id: 'cl1', grant_types: 'authorization_code',
        redirect_uris: 'https://example.com/cb',
        jwks: '{}', aud: 'aud', status: 'active',
    },
};

// One value-level malformation per table — the shape a
// real corrupt seed produces (bad enum / bad timestamp /
// unknown key), spread over the valid row.
const BAD_OVERRIDE: Record<
    string, Record<string, unknown>
> = {
    clients: { status: 'paused' },
};

for (const [table, valid] of Object.entries(VALID_ROWS)) {
    const bad = BAD_OVERRIDE[table]!;
    test(
        'snapshot gate rejects malformed '
        + table + ' row',
        () => rejectsImport(
            JSON.stringify({
                [SNAPSHOT_SCHEMA_VERSION_KEY]:
                    SNAPSHOT_SCHEMA_VERSION,
                [table]: [{ ...valid, ...bad }],
            }),
            new RegExp('snapshot\\.' + table + '\\[0\\]'),
        ),
    );
    test(
        'snapshot gate accepts valid ' + table + ' row',
        () => acceptsImport(
            JSON.stringify({
                [SNAPSHOT_SCHEMA_VERSION_KEY]:
                    SNAPSHOT_SCHEMA_VERSION,
                [table]: [valid],
            }),
        ),
    );
}
