import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    createLocalStorageAdapter,
} from '../api/db-localstorage.ts';
import {
    jsonArrayField,
    jsonObjectField,
} from '../api/types.ts';

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
    description: 'A test',
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
                workerIds: [],
                fields: [],
                positionX: 0,
                positionY: 0,
                description: '',
            },
        ],
        edges: [],
    }),
    created_at: '2026-01-01T00:00:00.000Z',
};

test(
    'flow_versions write produces gz1: prefix in storage',
    async () => {
        const map = installShim();
        const adapter = await createLocalStorageAdapter();
        await adapter.createSchema();
        await adapter.flowVersions.put(
            'fv-prefix-test', baseVersion,
        );
        const stored = map.get(
            KEY_PREFIX + 'flow_versions',
        );
        assert.ok(stored, 'expected stored value');
        assert.ok(
            stored.startsWith('gz1:'),
            'expected gz1: prefix, got '
            + stored.slice(0, 20),
        );
    },
);

test(
    'flow_versions round-trips through put → getById',
    async () => {
        installShim();
        const adapter = await createLocalStorageAdapter();
        await adapter.createSchema();
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
        const adapter = await createLocalStorageAdapter();
        await adapter.createSchema();
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
        const adapter = await createLocalStorageAdapter();
        await adapter.createSchema();
        const ids = Array.from(
            { length: 11 },
            (_, i) => `u-${i}`,
        );
        await Promise.all(
            ids.map(id => adapter.workers.put(id, {
                first_name: 'F' + id,
                last_name: 'L' + id,
                email: id + '@example.com',
                title: 'member',
                department: 'eng',
                status: 'active',
                strengths: jsonArrayField([]),
                team_dimensions:
                    jsonObjectField({}),
                phone: '',
                bio: '',
            })),
        );
        const all = await adapter.workers.getAll();
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
    'work_order_transitions write produces gz1: prefix',
    async () => {
        const map = installShim();
        const adapter = await createLocalStorageAdapter();
        await adapter.createSchema();
        await adapter.workOrderTransitions.put(
            'wot-prefix-test',
            {
                work_order_id: 'wo-1',
                from_node_id: 'n-from',
                to_node_id: 'n-to',
                person_id: 'u-1',
                transitioned_at:
                    '2026-01-01T00:00:00.000Z',
            },
        );
        const stored = map.get(
            KEY_PREFIX + 'work_order_transitions',
        );
        assert.ok(stored, 'expected stored value');
        assert.ok(
            stored.startsWith('gz1:'),
            'expected gz1: prefix, got '
            + stored.slice(0, 20),
        );
    },
);

test(
    'workers table is not compressed (raw JSON in storage)',
    async () => {
        const map = installShim();
        const adapter = await createLocalStorageAdapter();
        await adapter.createSchema();
        await adapter.workers.put('u1', {
            first_name: 'Alice',
            last_name: 'Adams',
            email: 'alice@example.com',
            phone: '',
            title: 'product_manager',
            status: 'active',
            strengths: jsonArrayField([]),
            team_dimensions: jsonObjectField({}),
            bio: '',
            department: 'Product',
        });
        const stored = map.get(KEY_PREFIX + 'workers');
        assert.ok(stored, 'expected stored people value');
        assert.ok(
            stored.startsWith('['),
            'expected raw JSON array, got '
            + stored.slice(0, 20),
        );
    },
);

test(
    'compression actually shrinks flow_versions storage',
    async () => {
        const map = installShim();
        const adapter = await createLocalStorageAdapter();
        await adapter.createSchema();
        for (let i = 0; i < 10; i++) {
            await adapter.flowVersions.put(
                `fv-${i}`, baseVersion,
            );
        }
        const stored = map.get(
            KEY_PREFIX + 'flow_versions',
        )!;
        // Raw JSON for 10 versions of this entity:
        // ~5,000+ bytes. Compressed: should be < 1,500.
        assert.ok(
            stored.length < 2000,
            'expected compressed length < 2000, got '
            + String(stored.length),
        );
    },
);

test(
    'snapshot export emits parsed objects, not gz1: blob',
    async () => {
        installShim();
        const adapter = await createLocalStorageAdapter();
        await adapter.createSchema();
        await adapter.flowVersions.put(
            'fv-export', baseVersion,
        );
        const json = await adapter.exportSnapshot();
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
    'snapshot import stores flow_versions compressed',
    async () => {
        const map = installShim();
        const adapter = await createLocalStorageAdapter();
        const snapshot = JSON.stringify({
            flow_versions: [
                { id: 'fv-imp', ...baseVersion },
            ],
        });
        await adapter.importSnapshot(snapshot);
        const stored = map.get(
            KEY_PREFIX + 'flow_versions',
        );
        assert.ok(stored, 'expected stored value');
        assert.ok(
            stored.startsWith('gz1:'),
            'expected gz1: prefix after import, got '
            + (stored?.slice(0, 20) ?? ''),
        );
    },
);
