import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UniqueConstraintError } from '../api/db.ts';
import {
    MemoryStorageBackend,
} from '../api/backend-memory.ts';
import {
    LocalStorageBackend,
} from '../api/backend-localstorage.ts';

function installShim(): Map<string, string> {
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
    return map;
}

const RESPONSE_ROW = {
    uri_prefix: '/organizations/1/flows/',
    uri_id: '7',
    at: '2026-01-01T00:00:00.000000Z',
    status: 204,
    etag: 'e'.repeat(64),
    message_hash: 'a'.repeat(64),
    message: '{"kind":"response"}',
};

test('second follower of one response is rejected',
async () => {
    const backend = new MemoryStorageBackend();
    await backend.ensureTables(['responses']);
    await backend.transaction(
        ['responses'], 'readwrite', async (tx) => {
            await tx.put('responses', {
                id: 'r2', ...RESPONSE_ROW,
                follows: 'r1',
            });
        },
    );
    await assert.rejects(
        backend.transaction(
            ['responses'], 'readwrite', async (tx) => {
                await tx.put('responses', {
                    id: 'r3', ...RESPONSE_ROW,
                    follows: 'r1',
                });
            },
        ),
        (err: unknown) =>
            err instanceof UniqueConstraintError
            && err.table === 'responses'
            && err.column === 'follows',
    );
});

test('rows without the unique column never collide',
async () => {
    const backend = new MemoryStorageBackend();
    await backend.ensureTables(['responses']);
    await backend.transaction(
        ['responses'], 'readwrite', async (tx) => {
            await tx.put('responses',
                { id: 'r1', ...RESPONSE_ROW });
            await tx.put('responses',
                { id: 'r2', ...RESPONSE_ROW });
        },
    );
    // absent keys are unindexed — genesis rows coexist
    const rows = await backend.transaction(
        ['responses'], 'readonly',
        (tx) => tx.getAll('responses'),
    );
    assert.equal(rows.length, 2);
    assert.deepEqual(
        rows.map((r) => r['id']).sort(),
        ['r1', 'r2'],
    );
});

test('a failed unique put aborts the whole transaction',
async () => {
    const backend = new MemoryStorageBackend();
    // Second table is requests (message-plane survivor)
    // — proves a unique-constraint abort rolls back every
    // store in the open multi-table transaction.
    await backend.ensureTables(
        ['responses', 'requests'],
    );
    await backend.transaction(
        ['responses'], 'readwrite', async (tx) => {
            await tx.put('responses', {
                id: 'r2', ...RESPONSE_ROW, follows: 'r1',
            });
        },
    );
    await assert.rejects(
        backend.transaction(
            ['responses', 'requests'], 'readwrite',
            async (tx) => {
                await tx.put('requests', {
                    id: 'q1',
                    uri_prefix:
                        '/organizations/1/ideas/',
                    uri_id: '42',
                    at: '2026-01-01T00:00:00.000000Z',
                    requester_identity_id: 'current',
                    message_hash: 'a'.repeat(64),
                    message: '{"kind":"request"}',
                });
                await tx.put('responses', {
                    id: 'r3', ...RESPONSE_ROW,
                    follows: 'r1',
                });
            },
        ),
    );
    const requests = await backend.transaction(
        ['requests'], 'readonly',
        (tx) => tx.getAll('requests'),
    );
    assert.equal(requests.length, 0); // never a half-write
});

test(
    'localStorage backend rejects a second follower',
    async () => {
        installShim();
        const backend = new LocalStorageBackend();
        await backend.ensureTables(['responses']);
        await backend.transaction(
            ['responses'], 'readwrite', async (tx) => {
                await tx.put('responses', {
                    id: 'r2', ...RESPONSE_ROW,
                    follows: 'r1',
                });
            },
        );
        await assert.rejects(
            backend.transaction(
                ['responses'], 'readwrite', async (tx) => {
                    await tx.put('responses', {
                        id: 'r3', ...RESPONSE_ROW,
                        follows: 'r1',
                    });
                },
            ),
            (err: unknown) =>
                err instanceof UniqueConstraintError
                && err.table === 'responses'
                && err.column === 'follows',
        );
    },
);
