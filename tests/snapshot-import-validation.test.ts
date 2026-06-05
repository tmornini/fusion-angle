import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    LocalStorageDbAdapter,
} from '../api/db-localstorage.ts';
import {
    TABLE_NAMES,
} from '../api/db.ts';
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
            new LocalStorageDbAdapter();
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
            new LocalStorageDbAdapter();
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
            new LocalStorageDbAdapter();
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
            new LocalStorageDbAdapter();
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
            new LocalStorageDbAdapter();
        const json = JSON.stringify({
            members: { not: 'an array' },
        });
        await assert.rejects(
            () => adapter.importSnapshot(json),
            /table "members" is not an array/,
        );
    },
);

test(
    'rejects row that is not an object',
    async () => {
        installShim();
        const adapter =
            new LocalStorageDbAdapter();
        const json = JSON.stringify({
            members: ['not an object'],
        });
        await assert.rejects(
            () => adapter.importSnapshot(json),
            /row 0 in table "members" is not an object/,
        );
    },
);

test(
    'rejects null row',
    async () => {
        installShim();
        const adapter =
            new LocalStorageDbAdapter();
        const json = JSON.stringify({
            members: [null],
        });
        await assert.rejects(
            () => adapter.importSnapshot(json),
            /row 0 in table "members" is not an object/,
        );
    },
);

test(
    'rejects array row',
    async () => {
        installShim();
        const adapter =
            new LocalStorageDbAdapter();
        const json = JSON.stringify({
            members: [['not', 'an', 'object']],
        });
        await assert.rejects(
            () => adapter.importSnapshot(json),
            /row 0 in table "members" is not an object/,
        );
    },
);

test(
    'rejects entity row with extra unknown key',
    async () => {
        installShim();
        const adapter =
            new LocalStorageDbAdapter();
        const json = JSON.stringify({
            members: [
                {
                    id: 'u1',
                    type: 'human',
                    rogue_field: 'invalid',
                },
            ],
        });
        await assert.rejects(
            () => adapter.importSnapshot(json),
            /snapshot\.members\[0\]/,
        );
    },
);

test(
    'rejects objective row with unknown key',
    async () => {
        installShim();
        const adapter =
            new LocalStorageDbAdapter();
        const json = JSON.stringify({
            objectives: [{
                id: 'o1',
                organization_id: '1',
                position: 1,
                rogue_field: 'invalid',
            }],
        });
        await assert.rejects(
            () => adapter.importSnapshot(json),
            /snapshot\.objectives\[0\]/,
        );
    },
);

test(
    'accepts valid objective row through the'
    + ' snapshot-validation gate',
    async () => {
        const map = installShim();
        const adapter =
            new LocalStorageDbAdapter();
        const json = JSON.stringify({
            objectives: [{
                id: 'o1', organization_id: '1',
                position: 1,
            }],
        });
        await adapter.importSnapshot(json);
        assert.ok(
            map.get(KEY_PREFIX + 'objectives'),
            'objective row should persist',
        );
    },
);

test(
    'happy-path import populates target table',
    async () => {
        const map = installShim();
        const adapter =
            new LocalStorageDbAdapter();
        const json = JSON.stringify({
            human_members: [
                {
                    id: 'u1',
                    title: 'product_manager',
                    strengths: '[]',
                    team_dimensions: '{}',
                    department: 'Product',
                },
            ],
        });
        await adapter.importSnapshot(json);
        const stored = map.get(
            KEY_PREFIX + 'human_members',
        );
        assert.ok(stored, 'humans should persist');
    },
);

test(
    'importSnapshot materializes every known table as empty',
    async () => {
        installShim();
        const adapter =
            new LocalStorageDbAdapter();
        await adapter.importSnapshot('{}');
        const reExported = JSON.parse(
            await adapter.exportSnapshot(),
        );
        for (const table of TABLE_NAMES) {
            assert.deepStrictEqual(
                reExported[table],
                [],
                'table missing or non-empty: ' + table,
            );
        }
    },
);

test(
    'createSchema/hasSchema/deleteSchema lifecycle',
    async () => {
        installShim();
        const adapter =
            new LocalStorageDbAdapter();
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
            new LocalStorageDbAdapter();
        await adapter.createSchema();
        await adapter.members.put('u1', {
            type: 'human',
        });
        await adapter.createSchema();
        const members = await adapter.members.getAll();
        assert.equal(
            members.length, 1,
            'second createSchema preserves data',
        );
        assert.ok(
            map.get(KEY_PREFIX + 'members'),
        );
    },
);

test(
    'exportSnapshot includes every known table',
    async () => {
        installShim();
        const adapter =
            new LocalStorageDbAdapter();
        await adapter.createSchema();
        await adapter.flowVersions.put('fv1', {
            flow_id: 'flow-aaaa',
            name: 'Flow',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout: 60,
            graph: jsonObjectField({
                nodes: [], edges: [],
            }),
            at: '2026-01-01T00:00:00.000Z',
        });
        const json =
            await adapter.exportSnapshot();
        const parsed = JSON.parse(json);
        for (const table of TABLE_NAMES) {
            assert.ok(
                Array.isArray(parsed[table]),
                'missing table in export: ' + table,
            );
        }
        assert.strictEqual(
            new Set(TABLE_NAMES).size,
            TABLE_NAMES.length,
            'TABLE_NAMES contains duplicates',
        );
        assert.strictEqual(
            Object.keys(parsed).length,
            TABLE_NAMES.length,
            'export key count !== TABLE_NAMES length',
        );
    },
);
