import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    LocalStorageDbAdapter,
} from '../api/db-localstorage.ts';
import {
    SNAPSHOT_SCHEMA_VERSION,
    SNAPSHOT_SCHEMA_VERSION_KEY,
} from '../api/db.ts';

const KEY_PREFIX = 'fusion-ai:';

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

// Phase Final Stage B: clients retired — pin the
// localStorage write surface on clients (surviving
// store with string fields + status enum).
const baseClient = {
    grant_types: '["password"]',
    redirect_uris: '[]',
    jwks: '{}',
    aud: 'fusion-ai',
    status: 'active' as const,
};

// Writes are plain JSON since the F-080 measurement
// retired compression; the gz1: decoder survives for
// READS of legacy payloads only (pinned below).
test(
    'clients write stores raw JSON',
    async () => {
        const map = installShim();
        const adapter = new LocalStorageDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.clients.put(
            'cli-prefix-test', baseClient,
        );
        const stored = map.get(
            KEY_PREFIX + 'clients',
        );
        assert.ok(stored, 'expected stored value');
        assert.ok(
            stored.startsWith('['),
            'expected raw JSON array, got '
            + stored.slice(0, 20),
        );
    },
);

test(
    'clients round-trips through put → getById',
    async () => {
        installShim();
        const adapter = new LocalStorageDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.clients.put(
            'cli-rt', baseClient,
        );
        const got = await adapter.clients.getById(
            'cli-rt',
        );
        assert.equal(got.id, 'cli-rt');
        assert.equal(
            got.name,
            baseClient.name,
        );
    },
);

test(
    'status enum round-trips as a string',
    async () => {
        installShim();
        const adapter = new LocalStorageDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.clients.put(
            'cli-status', baseClient,
        );
        const got = await adapter.clients.getById(
            'cli-status',
        );
        assert.strictEqual(got.status, 'active');
        assert.strictEqual(typeof got.status, 'string');
    },
);

test(
    'concurrent puts to same store do not race',
    async () => {
        installShim();
        const adapter = new LocalStorageDbAdapter();
        await adapter.postSchemaCreation();
        const ids = Array.from(
            { length: 11 },
            (_, i) => `cli-${i}`,
        );
        await Promise.all(
            ids.map(id => adapter.clients.put(
                id, baseClient,
            )),
        );
        const all = await adapter.clients.getAll();
        assert.equal(
            all.length, 11,
            'all 11 concurrent puts must persist',
        );
        const gotIds = new Set(all.map(u => u.id));
        for (const id of ids) {
            assert.ok(
                gotIds.has(id),
                'expected id ' + id + ' present',
            );
        }
    },
);


test(
    'clients table is not compressed (raw JSON in storage)',
    async () => {
        const map = installShim();
        const adapter = new LocalStorageDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.clients.put('c1', {
            grant_types: '["password"]',
            redirect_uris: '[]',
            jwks: '{}',
            aud: 'fusion-ai',
            status: 'active',
        });
        const stored = map.get(KEY_PREFIX + 'clients');
        assert.ok(stored, 'expected stored clients value');
        assert.ok(
            stored.startsWith('['),
            'expected raw JSON array, got '
            + stored.slice(0, 20),
        );
    },
);

test(
    'snapshot export emits parsed objects, not gz1: blob',
    async () => {
        installShim();
        const adapter = new LocalStorageDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.clients.put(
            'cli-export', baseClient,
        );
        const json = await adapter.getSnapshot();
        const parsed = JSON.parse(json);
        assert.ok(
            Array.isArray(parsed.clients),
            'clients should be an array in snapshot',
        );
        assert.equal(parsed.clients.length, 1);
        assert.equal(
            parsed.clients[0].id, 'cli-export',
        );
    },
);

test(
    'snapshot import stores clients raw',
    async () => {
        const map = installShim();
        const adapter = new LocalStorageDbAdapter();
        const snapshot = JSON.stringify({
            [SNAPSHOT_SCHEMA_VERSION_KEY]:
                SNAPSHOT_SCHEMA_VERSION,
            clients: [
                { id: 'cli-imp', ...baseClient },
            ],
        });
        await adapter.putSnapshot(snapshot);
        const stored = map.get(
            KEY_PREFIX + 'clients',
        );
        assert.ok(stored, 'expected stored value');
        assert.ok(
            stored.startsWith('['),
            'expected raw JSON array after import, got '
            + (stored?.slice(0, 20) ?? ''),
        );
    },
);

test(
    'read tolerates gz1: payload on normally-uncompressed table',
    async () => {
        const map = installShim();
        const adapter = new LocalStorageDbAdapter();
        await adapter.postSchemaCreation();
        const clientRow = {
            id: 'cli-gz1',
            ...baseClient,
        };
        const rawJson = JSON.stringify([clientRow]);
        const stream = new Blob([rawJson]).stream()
            .pipeThrough(new CompressionStream('gzip'));
        const buffer = await new Response(stream)
            .arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (const b of bytes) {
            binary += String.fromCharCode(b);
        }
        map.set(
            KEY_PREFIX + 'clients',
            'gz1:' + btoa(binary),
        );
        const result = await adapter.clients.getAll();
        assert.equal(result.length, 1);
        assert.equal(result[0]!.status, 'active');
    },
);
