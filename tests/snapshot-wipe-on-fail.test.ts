import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { localStorageDbAdapter } from '../api/db-localstorage.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    SNAPSHOT_SCHEMA_VERSION,
    SNAPSHOT_SCHEMA_VERSION_KEY,
} from '../api/db.ts';

function installFailingShim(
    failOnSetCall: number,
): Map<string, string> {
    const map = new Map<string, string>();
    let calls = 0;
    (globalThis as unknown as {
        localStorage: {
            getItem(k: string): string | null;
            setItem(k: string, v: string): void;
            removeItem(k: string): void;
        };
    }).localStorage = {
        getItem(key) {
            return map.get(key) ?? null;
        },
        setItem(key, value) {
            calls += 1;
            if (calls === failOnSetCall) {
                throw new Error('simulated quota error');
            }
            map.set(key, value);
        },
        removeItem(key) {
            map.delete(key);
        },
    };
    return map;
}

const aRequest = {
    uri_prefix: '/organizations/1/ideas/',
    uri_id: '42',
    at: '2026-01-01T00:00:00.000000Z',
    requester_identity_id: 'current',
    message_hash: 'a'.repeat(64),
    message: '{"kind":"request"}',
};

// Wipe-on-fail is retired: the import now runs in one
// transaction, so a validation error (at the gate) or a
// logic error (inside the tx) leaves prior data intact via
// the buffer discard. A mid-flush OS error (quota) on
// localStorage is the one gap left — its multi-key write is
// not atomic — and the IndexedDB tier (Phase B) closes it.
test(
    'a storage write failure surfaces as a rejection',
    async () => {
        installFailingShim(3);
        const adapter = localStorageDbAdapter();
        await adapter.initialize();
        const snapshot = JSON.stringify({
            [SNAPSHOT_SCHEMA_VERSION_KEY]:
                SNAPSHOT_SCHEMA_VERSION,
            requests: [],
        });
        await assert.rejects(
            () => adapter.putSnapshot(snapshot),
        );
    },
);

test(
    'a rejected import leaves prior data intact',
    async () => {
        const adapter = memoryDbAdapter();
        await adapter.putSnapshot(JSON.stringify({
            [SNAPSHOT_SCHEMA_VERSION_KEY]:
                SNAPSHOT_SCHEMA_VERSION,
            requests: [
                { id: 'm1', ...aRequest },
            ],
        }));
        // An invalid row rejects at the validation gate,
        // before any storage touch — so the prior import
        // survives whole. `status` is unknown on requests.
        await assert.rejects(
            () => adapter.putSnapshot(JSON.stringify({
                [SNAPSHOT_SCHEMA_VERSION_KEY]:
                    SNAPSHOT_SCHEMA_VERSION,
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
