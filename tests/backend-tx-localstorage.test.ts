import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    LocalStorageBackend,
} from '../api/backend-localstorage.ts';
import { MissingTableError } from '../api/db.ts';

const KEY_PREFIX = 'fusion-ai:';

interface Row { id: string; n: number }

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

async function gz1(json: string): Promise<string> {
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
    return 'gz1:' + btoa(binary);
}

test(
    'ensureTables seeds an empty JSON array',
    async () => {
        const map = installShim();
        const backend = new LocalStorageBackend();
        await backend.ensureTables(['members']);
        assert.equal(
            map.get(KEY_PREFIX + 'members'), '[]',
        );
    },
);

test(
    'transaction over a never-created table throws',
    async () => {
        installShim();
        const backend = new LocalStorageBackend();
        await assert.rejects(
            () => backend.transaction(
                ['ghost'], 'readonly',
                tx => tx.getAll('ghost'),
            ),
            (e: unknown) => e instanceof MissingTableError,
        );
    },
);

test(
    'a tx put to states flushes a gz1: payload',
    async () => {
        const map = installShim();
        const backend = new LocalStorageBackend();
        await backend.ensureTables(['states']);
        await backend.transaction(
            ['states'], 'readwrite',
            tx => tx.put('states', {
                id: 'evt-1',
                entity_id: 'wo-1',
                state: 'active',
                member_id: 'u-1',
                at: '2026-01-01T00:00:00.000000Z',
            }),
        );
        const stored = map.get(KEY_PREFIX + 'states');
        assert.ok(stored);
        assert.ok(stored.startsWith('gz1:'));
    },
);

test(
    'a tx put to an uncompressed table flushes raw JSON',
    async () => {
        const map = installShim();
        const backend = new LocalStorageBackend();
        await backend.ensureTables(['members']);
        await backend.transaction(
            ['members'], 'readwrite',
            tx => tx.put('members', {
                id: 'u1', type: 'human',
            }),
        );
        const stored = map.get(KEY_PREFIX + 'members');
        assert.ok(stored);
        assert.ok(stored.startsWith('['));
    },
);

test(
    'a tx put round-trips through preload and flush',
    async () => {
        installShim();
        const backend = new LocalStorageBackend();
        await backend.ensureTables(['t']);
        await backend.transaction(
            ['t'], 'readwrite',
            tx => tx.put<Row>('t', { id: 'a', n: 7 }),
        );
        const got = await backend.transaction(
            ['t'], 'readonly',
            tx => tx.get<Row>('t', 'a'),
        );
        assert.equal(got!.n, 7);
    },
);

test(
    'preload decompresses a gz1: payload',
    async () => {
        const map = installShim();
        const backend = new LocalStorageBackend();
        const rows = [{
            id: 'evt-1',
            entity_id: 'wo-1',
            state: 'active',
            member_id: 'u-1',
            at: '2026-01-01T00:00:00.000000Z',
        }];
        map.set(
            KEY_PREFIX + 'states',
            await gz1(JSON.stringify(rows)),
        );
        const got = await backend.transaction(
            ['states'], 'readonly',
            tx => tx.getAll('states'),
        );
        assert.equal(got.length, 1);
        assert.equal(got[0]!.id, 'evt-1');
    },
);

test(
    'a thrown tx leaves storage bytes untouched',
    async () => {
        const map = installShim();
        const backend = new LocalStorageBackend();
        await backend.ensureTables(['members']);
        await backend.transaction(
            ['members'], 'readwrite',
            tx => tx.put('members', {
                id: 'a', type: 'human',
            }),
        );
        const before = map.get(KEY_PREFIX + 'members');
        await assert.rejects(
            () => backend.transaction(
                ['members'], 'readwrite',
                async (tx) => {
                    await tx.put('members', {
                        id: 'b', type: 'human',
                    });
                    throw new Error('boom');
                },
            ),
            /boom/,
        );
        assert.equal(
            map.get(KEY_PREFIX + 'members'), before,
        );
    },
);

test(
    'a tx spanning two tables flushes both',
    async () => {
        installShim();
        const backend = new LocalStorageBackend();
        await backend.ensureTables(['members', 'states']);
        await backend.transaction(
            ['members', 'states'], 'readwrite',
            async (tx) => {
                await tx.put('members', {
                    id: 'u1', type: 'human',
                });
                await tx.put('states', {
                    id: 'evt-1',
                    entity_id: 'u1',
                    state: 'active',
                    member_id: 'u1',
                    at: '2026-01-01T00:00:00.000000Z',
                });
            },
        );
        const [members, states] = await backend.transaction(
            ['members', 'states'], 'readonly',
            async (tx) => [
                await tx.getAll('members'),
                await tx.getAll('states'),
            ],
        );
        assert.equal(members.length, 1);
        assert.equal(states.length, 1);
    },
);
