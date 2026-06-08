import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    putSnapshotFromFile,
    SnapshotTooLargeError,
} from '../web-app/app/adapters/snapshots.ts';
import { seedAdminSchema } from './test-fixtures.ts';

test('SnapshotTooLargeError carries sizes', () => {
    const err = new SnapshotTooLargeError(100, 50);
    assert.equal(err.fileSize, 100);
    assert.equal(err.available, 50);
    assert.equal(
        err.name,
        'SnapshotTooLargeError',
    );
    assert.match(err.message, /Snapshot too large/);
    assert.ok(err instanceof Error);
});

test('rejects file larger than half of available quota', async () => {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    const ctx = createRequestContext(db, await devToken());
    const nav = navigator as unknown as {
        storage?: {
            estimate(): Promise<{
                quota?: number;
                usage?: number;
            }>;
        };
    };
    const previous = nav.storage;
    nav.storage = {
        estimate: async () => ({
            quota: 1000,
            usage: 0,
        }),
    };
    try {
        // Cap = 1000 * 0.5 = 500. A 600-byte file
        // must be rejected.
        const file = new File(
            [new Uint8Array(600)],
            'too-big.json',
        );
        await assert.rejects(
            () => putSnapshotFromFile(ctx, file),
            SnapshotTooLargeError,
        );
    } finally {
        if (previous === undefined) {
            delete nav.storage;
        } else {
            nav.storage = previous;
        }
    }
});
