import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { localStorageDbAdapter } from '../api/db-localstorage.ts';

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

// Pin the localStorage write surface on requests
// (message-plane survivor with string fields).
const baseRequest = {
    uri_prefix: '/organizations/1/ideas/',
    uri_id: '42',
    at: '2026-01-01T00:00:00.000000Z',
    requester_identity_id: 'current',
    message_hash: 'a'.repeat(64),
    message: '{"kind":"request"}',
};

// Writes are plain JSON since the F-080 measurement
// retired compression; the gz1: decoder survives for
// READS of legacy payloads only (pinned below).
test(
    'requests write stores raw JSON',
    async () => {
        const map = installShim();
        const adapter = localStorageDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.requests.put(
            'req-prefix-test', baseRequest,
        );
        const stored = map.get(
            KEY_PREFIX + 'requests',
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
    'requests round-trips through put → getById',
    async () => {
        installShim();
        const adapter = localStorageDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.requests.put(
            'req-rt', baseRequest,
        );
        const got = await adapter.requests.getById(
            'req-rt',
        );
        assert.equal(got.id, 'req-rt');
        assert.equal(
            got.message,
            baseRequest.message,
        );
    },
);

test(
    'message field round-trips as a string',
    async () => {
        installShim();
        const adapter = localStorageDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.requests.put(
            'req-msg', baseRequest,
        );
        const got = await adapter.requests.getById(
            'req-msg',
        );
        assert.strictEqual(
            got.message, baseRequest.message,
        );
        assert.strictEqual(
            typeof got.message, 'string',
        );
    },
);

test(
    'concurrent puts to same store do not race',
    async () => {
        installShim();
        const adapter = localStorageDbAdapter();
        await adapter.postSchemaCreation();
        const ids = Array.from(
            { length: 11 },
            (_, i) => `req-${i}`,
        );
        await Promise.all(
            ids.map(id => adapter.requests.put(
                id, baseRequest,
            )),
        );
        const all = await adapter.requests.getAll();
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
    'requests table is not compressed (raw JSON in storage)',
    async () => {
        const map = installShim();
        const adapter = localStorageDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.requests.put('r1', {
            uri_prefix: '/organizations/1/ideas/',
            uri_id: '42',
            at: '2026-01-01T00:00:00.000000Z',
            requester_identity_id: 'current',
            message_hash: 'a'.repeat(64),
            message: '{"kind":"request"}',
        });
        const stored = map.get(KEY_PREFIX + 'requests');
        assert.ok(stored, 'expected stored requests value');
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
        const adapter = localStorageDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.requests.put(
            'req-export', baseRequest,
        );
        const json = await adapter.getSnapshot();
        const parsed = JSON.parse(json);
        assert.ok(
            Array.isArray(parsed.requests),
            'requests should be an array in snapshot',
        );
        assert.equal(parsed.requests.length, 1);
        assert.equal(
            parsed.requests[0].id, 'req-export',
        );
    },
);

test(
    'snapshot import stores requests raw',
    async () => {
        const map = installShim();
        const adapter = localStorageDbAdapter();
        const snapshot = JSON.stringify({
            requests: [
                { id: 'req-imp', ...baseRequest },
            ],
        });
        await adapter.putSnapshot(snapshot);
        const stored = map.get(
            KEY_PREFIX + 'requests',
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
        const adapter = localStorageDbAdapter();
        await adapter.postSchemaCreation();
        const requestRow = {
            id: 'req-gz1',
            ...baseRequest,
        };
        const rawJson = JSON.stringify([requestRow]);
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
            KEY_PREFIX + 'requests',
            'gz1:' + btoa(binary),
        );
        const result = await adapter.requests.getAll();
        assert.equal(result.length, 1);
        assert.equal(
            result[0]!.message, baseRequest.message,
        );
    },
);
