import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { handleRequest } from '../api/api.ts';
import { MissingTableError } from '../api/db.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

// Phase 12 Task 1: the pre-dispatch fence reads (handleRequest's
// two ownership-fence regions, api/api.ts) redact a thrown fault
// to the fixed 500 the domain-boundary catch (:938) already
// gives every OTHER thrown fault — closing the one gap where a
// fence read's own detail used to reach the wire unredacted.
// MissingTableError stays the one designed exception: it must
// still propagate past the fence catch, exactly as it already
// propagates past the domain-boundary catch, so web-app/core.ts's
// redirectIfMissingTable recovery still fires.

async function freshDb() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

test(
    'a Region A fence-read fault (fenceRequest itself) redacts'
    + ' to the fixed 500',
    async () => {
        const db = await freshDb();
        // DEV_TOKEN carries no `organization` claim, so
        // fenceRequest falls back to identityDefaultOrganization,
        // which derives from db.requests/db.responses at the
        // identity's default-org address. Fault THAT read alone
        // — every other read passes through unaffected.
        const original = db.requests.getAllWhere.bind(db.requests);
        (db.requests as unknown as {
            getAllWhere: (
                column: string, key: string,
            ) => ReturnType<typeof original>;
        }).getAllWhere = async (column, key) => {
            if (key === '/identities/current/default-org/') {
                throw new Error('secret fence fault detail');
            }
            return original(column, key);
        };
        const response = await handleRequest(
            db,
            new Request('http://localhost/ideas', {
                headers: {
                    'Authorization': 'Bearer ' + DEV_TOKEN,
                },
            }),
        );
        assert.equal(response.status, 500);
        const { error } =
            (await response.json()) as { error: string };
        assert.equal(error, 'internal error');
    },
);

test(
    'a Region B fence-read fault (the states/:id PUT ownership'
    + ' guard) redacts to the fixed 500',
    async () => {
        const db = await freshDb();
        // The states/:id PUT ownership fence resolves the named
        // entity's owner via resolveOwningOrganization (pair
        // plane), which reads responses by uri_id first. Fault
        // THAT read alone, keyed to the entity id this PUT
        // names.
        const original =
            db.responses.getAllWhere.bind(db.responses);
        (db.responses as unknown as {
            getAllWhere: (
                column: string, key: string,
            ) => ReturnType<typeof original>;
        }).getAllWhere = async (column, key) => {
            if (column === 'uri_id' && key === 'fault-entity') {
                throw new Error('secret fence fault detail');
            }
            return original(column, key);
        };
        const response = await handleRequest(
            db,
            new Request('http://localhost/states/s1', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + DEV_TOKEN,
                },
                body: JSON.stringify({
                    entity_id: 'fault-entity',
                    state: 'active',
                    at: '2026-01-01T00:00:00.000000Z',
                }),
            }),
        );
        assert.equal(response.status, 500);
        const { error } =
            (await response.json()) as { error: string };
        assert.equal(error, 'internal error');
    },
);

test(
    'a MissingTableError fence fault still propagates,'
    + ' never redacted to the fixed 500',
    async () => {
        const db = await freshDb();
        const original = db.requests.getAllWhere.bind(db.requests);
        (db.requests as unknown as {
            getAllWhere: (
                column: string, key: string,
            ) => ReturnType<typeof original>;
        }).getAllWhere = async (column, key) => {
            if (key === '/identities/current/default-org/') {
                throw new MissingTableError('requests');
            }
            return original(column, key);
        };
        await assert.rejects(
            () => handleRequest(
                db,
                new Request('http://localhost/ideas', {
                    headers: {
                        'Authorization': 'Bearer ' + DEV_TOKEN,
                    },
                }),
            ),
            (e: unknown) => e instanceof MissingTableError,
        );
    },
);
