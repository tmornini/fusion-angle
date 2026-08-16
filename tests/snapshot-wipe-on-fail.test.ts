import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { memoryDbAdapter } from '../api/db-memory.ts';

const aRequest = {
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
};

// Wipe-on-fail is retired: the import runs in one
// transaction, so a validation error at the gate leaves
// prior data intact via the buffer discard.
test(
    'a rejected import leaves prior data intact',
    async () => {
        const adapter = memoryDbAdapter();
        await adapter.putSnapshot(JSON.stringify({
            requests: [
                { id: 'm1', ...aRequest },
            ],
        }));
        // An invalid row rejects at the validation gate,
        // before any storage touch — so the prior import
        // survives whole. `status` is unknown on requests.
        await assert.rejects(
            () => adapter.putSnapshot(JSON.stringify({
                requests: [
                    {
                        id: 'm2',
                        status: 'paused',
                    },
                ],
            })),
        );
        const requests =
            await adapter.requests.getAll();
        assert.equal(requests.length, 1);
        assert.equal(requests[0]!.id, 'm1');
    },
);
