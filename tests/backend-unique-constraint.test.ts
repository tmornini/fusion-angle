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
});

test('a failed unique put aborts the whole transaction',
async () => {
    const backend = new MemoryStorageBackend();
    // Phase Final Stage B: ideas retired — second table is
    // clients (a permanent survivor).
    await backend.ensureTables(['responses', 'clients']);
    await backend.transaction(
        ['responses'], 'readwrite', async (tx) => {
            await tx.put('responses', {
                id: 'r2', ...RESPONSE_ROW, follows: 'r1',
            });
        },
    );
    await assert.rejects(
        backend.transaction(
            ['responses', 'clients'], 'readwrite',
            async (tx) => {
                await tx.put('clients', {
                    id: 'c1',
                    grant_types: '[]',
                    redirect_uris: '[]',
                    jwks: '{}',
                    aud: 'fusion-ai',
                    status: 'active',
                });
                await tx.put('responses', {
                    id: 'r3', ...RESPONSE_ROW,
                    follows: 'r1',
                });
            },
        ),
    );
    const clients = await backend.transaction(
        ['clients'], 'readonly',
        (tx) => tx.getAll('clients'),
    );
    assert.equal(clients.length, 0); // never a half-write
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
