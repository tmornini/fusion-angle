import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from
    '../api/db-memory.ts';

test(
    'postSchemaCreation/hasSchema/deleteSchema'
    + ' lifecycle',
    async () => {
        const adapter = memoryDbAdapter();
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
        const adapter = memoryDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.requests.put('u1', {
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
            operation_id: '0123456789ABCDEFGHIJKL',
        });
        await adapter.postSchemaCreation();
        const requests =
            await adapter.requests.getAll();
        assert.equal(
            requests.length, 1,
            'second postSchemaCreation preserves'
            + ' data',
        );
    },
);

test('DbAdapter has no snapshot dump or restore',
() => {
    const adapter = memoryDbAdapter();
    assert.equal(
        'getSnapshot' in adapter, false,
    );
    assert.equal(
        'putSnapshot' in adapter, false,
    );
});
