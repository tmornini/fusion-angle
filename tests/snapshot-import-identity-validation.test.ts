import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { localStorageDbAdapter } from '../api/db-localstorage.ts';

// Snapshot import is a second validation edge: the
// per-request write path is fenced at store
// construction, but importing a snapshot routes each
// row through validateSnapshotRow. Pins value-level
// validation on two message-plane survivors.
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
    requests: {
        id: 'rq1',
        uri_prefix: '/organizations/1/ideas/',
        uri_id: '42',
        at: '2026-01-01T00:00:00.000000Z',
        requester_identity_id: 'current',
        message_hash: 'a'.repeat(64),
        message: '{"kind":"request"}',
    },
    responses: {
        id: 'rs1',
        uri_prefix: '/organizations/1/ideas/',
        uri_id: '42',
        at: '2026-01-01T00:00:00.000000Z',
        status: 200,
        etag: 'e'.repeat(64),
        message_hash: 'b'.repeat(64),
        message: '{"kind":"response"}',
    },
};

// One value-level malformation per table — the shape a
// real corrupt seed produces (bad enum / bad timestamp /
// unknown key), spread over the valid row.
const BAD_OVERRIDE: Record<
    string, Record<string, unknown>
> = {
    requests: { at: 'not-a-timestamp' },
    responses: { status: 9999 },
};

for (const [table, valid] of Object.entries(VALID_ROWS)) {
    const bad = BAD_OVERRIDE[table]!;
    test(
        'snapshot gate rejects malformed '
        + table + ' row',
        () => rejectsImport(
            JSON.stringify({
                [table]: [{ ...valid, ...bad }],
            }),
            new RegExp('snapshot\\.' + table + '\\[0\\]'),
        ),
    );
    test(
        'snapshot gate accepts valid ' + table + ' row',
        () => acceptsImport(
            JSON.stringify({
                [table]: [valid],
            }),
        ),
    );
}
