import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    createLocalStorageAdapter,
} from '../api/db-localstorage.ts';
import {
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
        getItem(key) {
            return map.get(key) ?? null;
        },
        setItem(key, value) {
            map.set(key, value);
        },
        removeItem(key) {
            map.delete(key);
        },
    };
    return map;
}

test(
    'rejects malformed JSON with not-valid-JSON message',
    async () => {
        installShim();
        const adapter =
            await createLocalStorageAdapter();
        await assert.rejects(
            () => adapter.importSnapshot(
                '{not valid',
            ),
            /not valid JSON/,
        );
    },
);

test(
    'rejects array root with object-with-table-keys message',
    async () => {
        installShim();
        const adapter =
            await createLocalStorageAdapter();
        await assert.rejects(
            () => adapter.importSnapshot(
                '[]',
            ),
            /object with table keys/,
        );
    },
);

test(
    'rejects null root with object-with-table-keys message',
    async () => {
        installShim();
        const adapter =
            await createLocalStorageAdapter();
        await assert.rejects(
            () => adapter.importSnapshot(
                'null',
            ),
            /object with table keys/,
        );
    },
);

test(
    'rejects scalar root with object-with-table-keys message',
    async () => {
        installShim();
        const adapter =
            await createLocalStorageAdapter();
        await assert.rejects(
            () => adapter.importSnapshot(
                '"string"',
            ),
            /object with table keys/,
        );
    },
);

test(
    'rejects table value that is not an array',
    async () => {
        installShim();
        const adapter =
            await createLocalStorageAdapter();
        const json = JSON.stringify({
            workers: { not: 'an array' },
        });
        await assert.rejects(
            () => adapter.importSnapshot(json),
            /table "workers" is not an array/,
        );
    },
);

test(
    'rejects row that is not an object',
    async () => {
        installShim();
        const adapter =
            await createLocalStorageAdapter();
        const json = JSON.stringify({
            workers: ['not an object'],
        });
        await assert.rejects(
            () => adapter.importSnapshot(json),
            /row 0 in table "workers" is not an object/,
        );
    },
);

test(
    'rejects null row',
    async () => {
        installShim();
        const adapter =
            await createLocalStorageAdapter();
        const json = JSON.stringify({
            workers: [null],
        });
        await assert.rejects(
            () => adapter.importSnapshot(json),
            /row 0 in table "workers" is not an object/,
        );
    },
);

test(
    'rejects array row',
    async () => {
        installShim();
        const adapter =
            await createLocalStorageAdapter();
        const json = JSON.stringify({
            workers: [['not', 'an', 'object']],
        });
        await assert.rejects(
            () => adapter.importSnapshot(json),
            /row 0 in table "workers" is not an object/,
        );
    },
);

test(
    'rejects entity row with extra unknown key',
    async () => {
        installShim();
        const adapter =
            await createLocalStorageAdapter();
        const json = JSON.stringify({
            workers: [
                {
                    id: 'u1',
                    first_name: 'Alice',
                    last_name: 'Adams',
                    email: 'a@example.com',
                    phone: '',
                    title: 'product_manager',
                    status: 'active',
                    strengths: '[]',
                    team_dimensions: '{}',
                    bio: '',
                    department: 'Product',
                    rogue_field: 'invalid',
                },
            ],
        });
        await assert.rejects(
            () => adapter.importSnapshot(json),
            /snapshot\.workers\[0\]/,
        );
    },
);

test(
    'happy-path import populates target table',
    async () => {
        const map = installShim();
        const adapter =
            await createLocalStorageAdapter();
        const json = JSON.stringify({
            workers: [
                {
                    id: 'u1',
                    first_name: 'Alice',
                    last_name: 'Adams',
                    email: 'a@example.com',
                    phone: '',
                    title: 'product_manager',
                    status: 'active',
                    strengths: '[]',
                    team_dimensions: '{}',
                    bio: '',
                    department: 'Product',
                },
            ],
        });
        await adapter.importSnapshot(json);
        const stored = map.get(
            KEY_PREFIX + 'workers',
        );
        assert.ok(stored, 'users should persist');
    },
);

test(
    'omitted table keys default to empty arrays',
    async () => {
        const map = installShim();
        const adapter =
            await createLocalStorageAdapter();
        await adapter.importSnapshot('{}');
        const usersBlob = map.get(
            KEY_PREFIX + 'workers',
        );
        assert.equal(
            usersBlob,
            '[]',
            'missing table key materialises as []',
        );
    },
);

test(
    'createSchema/hasSchema/deleteSchema lifecycle',
    async () => {
        installShim();
        const adapter =
            await createLocalStorageAdapter();
        assert.equal(
            await adapter.hasSchema(), false,
            'fresh storage has no schema',
        );
        await adapter.createSchema();
        assert.equal(
            await adapter.hasSchema(), true,
            'createSchema makes hasSchema true',
        );
        await adapter.deleteSchema();
        assert.equal(
            await adapter.hasSchema(), false,
            'deleteSchema returns to empty',
        );
    },
);

test(
    'createSchema is idempotent on re-run',
    async () => {
        const map = installShim();
        const adapter =
            await createLocalStorageAdapter();
        await adapter.createSchema();
        await adapter.workers.put('u1', {
            first_name: 'Alice',
            last_name: 'Adams',
            email: 'a@example.com',
            phone: '',
            title: 'product_manager',
            status: 'active',
            strengths: '[]' as never,
            team_dimensions: '{}' as never,
            bio: '',
            department: 'Product',
        });
        await adapter.createSchema();
        const workers = await adapter.workers.getAll();
        assert.equal(
            workers.length, 1,
            'second createSchema preserves data',
        );
        assert.ok(
            map.get(KEY_PREFIX + 'workers'),
        );
    },
);

test(
    'exportSnapshot includes every known table',
    async () => {
        installShim();
        const adapter =
            await createLocalStorageAdapter();
        await adapter.createSchema();
        await adapter.flowVersions.put('fv1', {
            flow_id: 'flow-aaaa',
            name: 'Flow',
            description: '',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout: 60,
            graph: jsonObjectField({
                nodes: [], edges: [],
            }),
            created_at:
                '2026-01-01T00:00:00.000Z',
        });
        const json =
            await adapter.exportSnapshot();
        const parsed = JSON.parse(json);
        const expected = [
            'workers', 'ai_workers',
            'ideas', 'projects',
            'activities',
            'flows', 'flow_versions',
            'project_flows', 'work_orders',
            'flow_work_orders',
            'work_order_transitions',
            'transition_field_values',
            'work_order_claims',
            'organization',
            'idea_submissions',
            'activity_actors', 'deleted',
        ];
        for (const table of expected) {
            assert.ok(
                Array.isArray(parsed[table]),
                'missing table in export: ' + table,
            );
        }
    },
);
