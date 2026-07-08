import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    LocalStorageDbAdapter,
} from '../api/db-localstorage.ts';
import {
    jsonObjectField,
} from '../api/types.ts';
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

const baseVersion = {
    flow_id: 'flow-aaaaaaaaaaaaaaaaaaaa',
    name: 'Test Flow',
    is_locked: false,
    is_auto_layout: true,
    is_auto_fit: true,
    lock_timeout: 60,
    graph: jsonObjectField({
        nodes: [
            {
                id: 'n1',
                name: 'Start',
                isCreate: true,
                isArchive: false,
                memberIds: [],
                attributes: [],
                positionX: 0,
                positionY: 0,
                taskInstructions: '',
            },
        ],
        edges: [],
    }),
    at: '2026-01-01T00:00:00.000000Z',
};

// Writes are plain JSON since the F-080 measurement
// retired compression; the gz1: decoder survives for
// READS of legacy payloads only (pinned below).
test(
    'flow_versions write stores raw JSON',
    async () => {
        const map = installShim();
        const adapter = new LocalStorageDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.flowVersions.put(
            'fv-prefix-test', baseVersion,
        );
        const stored = map.get(
            KEY_PREFIX + 'flow_versions',
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
    'flow_versions round-trips through put → getById',
    async () => {
        installShim();
        const adapter = new LocalStorageDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.flowVersions.put(
            'fv-rt', baseVersion,
        );
        const got = await adapter.flowVersions.getById(
            'fv-rt',
        );
        assert.equal(got.id, 'fv-rt');
        assert.equal(got.name, 'Test Flow');
        assert.equal(got.flow_id, baseVersion.flow_id);
    },
);

test(
    'booleans round-trip as booleans, not 1|0 numbers',
    async () => {
        installShim();
        const adapter = new LocalStorageDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.flowVersions.put(
            'fv-bool', baseVersion,
        );
        const got = await adapter.flowVersions.getById(
            'fv-bool',
        );
        assert.strictEqual(got.is_locked, false);
        assert.strictEqual(got.is_auto_layout, true);
        assert.strictEqual(got.is_auto_fit, true);
        assert.strictEqual(
            typeof got.is_locked, 'boolean',
        );
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
            (_, i) => `u-${i}`,
        );
        await Promise.all(
            ids.map(id => adapter.members.put(id, {
                type: 'human',
            })),
        );
        const all = await adapter.members.getAll();
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
    'states write stores raw JSON',
    async () => {
        const map = installShim();
        const adapter = new LocalStorageDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.states.put(
            'evt-prefix-test',
            {
                entity_id: 'wo-1',
                state: 'n-to',
                member_id: 'u-1',
                at:
                    '2026-01-01T00:00:00.000000Z',
            },
        );
        const stored = map.get(
            KEY_PREFIX + 'states',
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
    'members table is not compressed (raw JSON in storage)',
    async () => {
        const map = installShim();
        const adapter = new LocalStorageDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.members.put('u1', {
            type: 'human',
        });
        const stored = map.get(KEY_PREFIX + 'members');
        assert.ok(stored, 'expected stored people value');
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
        await adapter.flowVersions.put(
            'fv-export', baseVersion,
        );
        const json = await adapter.getSnapshot();
        const parsed = JSON.parse(json);
        assert.ok(
            Array.isArray(parsed.flow_versions),
            'flow_versions should be an array in snapshot',
        );
        assert.equal(parsed.flow_versions.length, 1);
        assert.equal(
            parsed.flow_versions[0].id, 'fv-export',
        );
    },
);

test(
    'snapshot import stores flow_versions raw',
    async () => {
        const map = installShim();
        const adapter = new LocalStorageDbAdapter();
        const snapshot = JSON.stringify({
            [SNAPSHOT_SCHEMA_VERSION_KEY]:
                SNAPSHOT_SCHEMA_VERSION,
            flow_versions: [
                { id: 'fv-imp', ...baseVersion },
            ],
        });
        await adapter.putSnapshot(snapshot);
        const stored = map.get(
            KEY_PREFIX + 'flow_versions',
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
        const flowRow = {
            id: 'flow-aaaaaaaaaaaaaaaaaaaa',
            name: 'Test',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout: 60,
            graph: jsonObjectField({
                nodes: [], edges: [],
            }),
        };
        const rawJson = JSON.stringify([flowRow]);
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
            KEY_PREFIX + 'flows',
            'gz1:' + btoa(binary),
        );
        const result = await adapter.flows.getAll();
        assert.equal(result.length, 1);
        assert.equal(result[0]!.name, 'Test');
    },
);
