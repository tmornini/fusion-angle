import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    TABLE_NAMES,
} from '../api/db.ts';

test(
    'rejects malformed JSON with not-valid-JSON message',
    async () => {
        const adapter =
            memoryDbAdapter();
        await assert.rejects(
            () => adapter.putSnapshot(
                '{not valid',
            ),
            /not valid JSON/,
        );
    },
);

test(
    'rejects array root with object-with-table-keys message',
    async () => {
        const adapter =
            memoryDbAdapter();
        await assert.rejects(
            () => adapter.putSnapshot(
                '[]',
            ),
            /object with table keys/,
        );
    },
);

test(
    'rejects null root with object-with-table-keys message',
    async () => {
        const adapter =
            memoryDbAdapter();
        await assert.rejects(
            () => adapter.putSnapshot(
                'null',
            ),
            /object with table keys/,
        );
    },
);

test(
    'rejects scalar root with object-with-table-keys message',
    async () => {
        const adapter =
            memoryDbAdapter();
        await assert.rejects(
            () => adapter.putSnapshot(
                '"string"',
            ),
            /object with table keys/,
        );
    },
);

test(
    'accepts a version-free snapshot',
    async () => {
        const adapter =
            memoryDbAdapter();
        const json = JSON.stringify({
            requests: [],
        });
        await adapter.putSnapshot(json);
        const requests =
            await adapter.requests.getAll();
        assert.deepStrictEqual(requests, []);
    },
);

test(
    'rejects table value that is not an array',
    async () => {
        const adapter =
            memoryDbAdapter();
        const json = JSON.stringify({
            requests: { not: 'an array' },
        });
        await assert.rejects(
            () => adapter.putSnapshot(json),
            /table "requests" is not an array/,
        );
    },
);

test(
    'rejects row that is not an object',
    async () => {
        const adapter =
            memoryDbAdapter();
        const json = JSON.stringify({
            requests: ['not an object'],
        });
        await assert.rejects(
            () => adapter.putSnapshot(json),
            /row 0 in table "requests" is not an object/,
        );
    },
);

test(
    'rejects null row',
    async () => {
        const adapter =
            memoryDbAdapter();
        const json = JSON.stringify({
            requests: [null],
        });
        await assert.rejects(
            () => adapter.putSnapshot(json),
            /row 0 in table "requests" is not an object/,
        );
    },
);

test(
    'rejects array row',
    async () => {
        const adapter =
            memoryDbAdapter();
        const json = JSON.stringify({
            requests: [['not', 'an', 'object']],
        });
        await assert.rejects(
            () => adapter.putSnapshot(json),
            /row 0 in table "requests" is not an object/,
        );
    },
);

test(
    'rejects entity row with extra unknown key',
    async () => {
        const adapter =
            memoryDbAdapter();
        const json = JSON.stringify({
            requests: [
                {
                    id: 'u1',
                    uri_collection:
                        '/organizations/1/ideas/',
                    uri_id: '42',
                    at: '2026-01-01T00:00:00.000000Z',
                    requester_identity_id: 'current',
                    message_hash: 'a'.repeat(64),
                    message:
                        'PUT /organizations/1/ideas/42'
                        + ' HTTP/1.1\r\n\r\n',
                    method: 'PUT',
                    operation_id:
                        '0123456789ABCDEFGHIJKL',
                    rogue_field: 'invalid',
                },
            ],
        });
        await assert.rejects(
            () => adapter.putSnapshot(json),
            /snapshot\.requests\[0\]/,
        );
    },
);

test(
    'rejects response row with unknown key',
    async () => {
        const adapter =
            memoryDbAdapter();
        const json = JSON.stringify({
            responses: [{
                id: 'o1',
                uri_collection: '/organizations/1/ideas/',
                uri_id: '42',
                at: '2026-01-01T00:00:00.000000Z',
                version: 'e'.repeat(64),
                message:
                    'HTTP/1.1 204 No Content\r\n\r\n',
                operation_id: '0123456789ABCDEFGHIJKL',
                rogue_field: 'invalid',
            }],
        });
        await assert.rejects(
            () => adapter.putSnapshot(json),
            /snapshot\.responses\[0\]/,
        );
    },
);

test(
    'accepts valid request row through the'
    + ' snapshot-validation gate',
    async () => {
        const adapter =
            memoryDbAdapter();
        const json = JSON.stringify({
            requests: [{
                id: 'o1',
                uri_collection: '/organizations/1/ideas/',
                uri_id: '42',
                at: '2026-01-01T00:00:00.000000Z',
                requester_identity_id: 'current',
                message_hash: 'a'.repeat(64),
                message:
                    'PUT /organizations/1/ideas/42'
                    + ' HTTP/1.1\r\n\r\n',
                method: 'PUT',
                operation_id: '0123456789ABCDEFGHIJKL',
            }],
        });
        await adapter.putSnapshot(json);
        const rows = await adapter.requests.getAll();
        assert.equal(rows.length, 1);
    },
);

test(
    'happy-path import populates target table',
    async () => {
        const adapter =
            memoryDbAdapter();
        const json = JSON.stringify({
            requests: [
                {
                    id: 'u1',
                    uri_collection:
                        '/organizations/1/ideas/',
                    uri_id: '42',
                    at: '2026-01-01T00:00:00.000000Z',
                    requester_identity_id: 'current',
                    message_hash: 'a'.repeat(64),
                    message:
                        'PUT /organizations/1/ideas/42'
                        + ' HTTP/1.1\r\n\r\n',
                    method: 'PUT',
                    operation_id:
                        '0123456789ABCDEFGHIJKL',
                },
            ],
        });
        await adapter.putSnapshot(json);
        const stored = await adapter.requests.getAll();
        assert.equal(stored.length, 1);
    },
);

test(
    'putSnapshot materializes every known table as empty',
    async () => {
        const adapter =
            memoryDbAdapter();
        await adapter.putSnapshot(
            JSON.stringify({}),
        );
        const reExported = JSON.parse(
            await adapter.getSnapshot(),
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
    'postSchemaCreation/hasSchema/deleteSchema lifecycle',
    async () => {
        const adapter =
            memoryDbAdapter();
        assert.equal(
            await adapter.hasSchema(), false,
            'fresh storage has no schema',
        );
        await adapter.postSchemaCreation();
        assert.equal(
            await adapter.hasSchema(), true,
            'postSchemaCreation makes hasSchema true',
        );
        await adapter.deleteSchema();
        assert.equal(
            await adapter.hasSchema(), false,
            'deleteSchema returns to empty',
        );
    },
);

test(
    'postSchemaCreation is idempotent on re-run',
    async () => {
        const adapter =
            memoryDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.requests.put('u1', {
            uri_collection: '/organizations/1/ideas/',
            uri_id: '42',
            at: '2026-01-01T00:00:00.000000Z',
            requester_identity_id: 'current',
            message_hash: 'a'.repeat(64),
            message:
                'PUT /organizations/1/ideas/42'
                + ' HTTP/1.1\r\n\r\n',
            method: 'PUT',
            operation_id: '0123456789ABCDEFGHIJKL',
        });
        await adapter.postSchemaCreation();
        const requests =
            await adapter.requests.getAll();
        assert.equal(
            requests.length, 1,
            'second postSchemaCreation preserves data',
        );
    },
);

test(
    'getSnapshot includes every known table',
    async () => {
        const adapter =
            memoryDbAdapter();
        await adapter.postSchemaCreation();
        // Pin export surface on requests
        // (message-plane survivor).
        await adapter.requests.put('m1', {
            uri_collection: '/organizations/1/ideas/',
            uri_id: '42',
            at: '2026-01-01T00:00:00.000000Z',
            requester_identity_id: 'current',
            message_hash: 'a'.repeat(64),
            message:
                'PUT /organizations/1/ideas/42'
                + ' HTTP/1.1\r\n\r\n',
            method: 'PUT',
            operation_id: '0123456789ABCDEFGHIJKL',
        });
        const json =
            await adapter.getSnapshot();
        const parsed = JSON.parse(json);
        assert.equal(parsed.requests.length, 1);
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
        // TABLE_NAMES entries only — no reserved version
        // marker on the export.
        assert.strictEqual(
            Object.keys(parsed).length,
            TABLE_NAMES.length,
            'export key count !== TABLE_NAMES length',
        );
    },
);
