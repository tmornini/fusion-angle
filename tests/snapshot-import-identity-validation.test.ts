import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { memoryDbAdapter } from '../api/db-memory.ts';

// Snapshot import is a second validation edge: the
// per-request write path is fenced at store
// construction, but importing a snapshot routes each
// row through validateSnapshotRow. Pins value-level
// validation on two message-plane survivors.
// Mirrors snapshot-import-validation.test.ts.

async function rejectsImport(
    json: string, pattern: RegExp,
): Promise<void> {
    const adapter = memoryDbAdapter();
    await assert.rejects(
        () => adapter.putSnapshot(json),
        pattern,
    );
}

async function acceptsImport(json: string): Promise<void> {
    const adapter = memoryDbAdapter();
    await adapter.putSnapshot(json);
}

// One valid row per surviving gated table, exact body keys.
const VALID_ROWS: Record<
    string, Record<string, unknown>
> = {
    requests: {
        id: 'rq1',
        uri_collection: '/organizations/1/ideas/',
        uri_id: '42',
        at: '2026-01-01T00:00:00.000000Z',
        requester_identity_id: 'current',
        message_hash: 'a'.repeat(64),
        message:
            'PUT /organizations/1/ideas/42'
            + ' HTTP/1.1\r\n\r\n',
        method: 'PUT',
        operation_id: '0123456789ABCDEFGHIJKL',
    },
    responses: {
        id: 'rs1',
        uri_collection: '/organizations/1/ideas/',
        uri_id: '42',
        at: '2026-01-01T00:00:00.000000Z',
        version: 'e'.repeat(64),
        message:
            'HTTP/1.1 204 No Content\r\n\r\n',
        operation_id: '0123456789ABCDEFGHIJKL',
    },
};

// One value-level malformation per table — the shape a
// real corrupt seed produces (bad enum / bad method /
// unknown key), spread over the valid row. Bad `at`
// width is pinned in snapshot-pre-break.test.ts.
const BAD_OVERRIDE: Record<
    string, Record<string, unknown>
> = {
    requests: { method: 'put' },
    responses: { version: 'not-a-digest' },
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
