import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { handleRequest } from '../api/api.ts';
import { MissingTableError } from '../api/db.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { reachableToken } from
    './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { captureConsole } from './console-capture.ts';

// Phase 12 Task 1: the pre-dispatch fence reads (handleRequest's
// two ownership-fence regions, api/api.ts) redact a thrown fault
// to the fixed 500 the domain-boundary catch (:938) already
// gives every OTHER thrown fault — closing the one gap where a
// fence read's own detail used to reach the wire unredacted.
// MissingTableError stays the one designed exception: it must
// still propagate past the fence catch, exactly as it already
// propagates past the domain-boundary catch. A missing table
// is a failed request; product boot does not recover it.

async function freshDb() {
    const db = memoryDbAdapter();
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
        // which derives from db.pairs/db.pairs at the
        // identity's default-organization address. Fault THAT
        // read alone
        // — every other read passes through unaffected.
        const original = db.pairs.getAllWhere.bind(db.pairs);
        (db.pairs as unknown as {
            getAllWhere: (
                column: string, key: string,
            ) => ReturnType<typeof original>;
        }).getAllWhere = async (column, key) => {
            if (key === '/identities/current/'
                + 'default-organization/') {
                throw new Error('secret fence fault detail');
            }
            return original(column, key);
        };
        const flatToken = await reachableToken();
        const { result: response, calls } =
            await captureConsole(
                'error',
                () => handleRequest(
                    db,
                    new Request('http://localhost/organizations/1/ideas/', {
                        headers: {
                            'Authorization':
                                'Bearer ' + flatToken,
                        },
                    }),
                ),
            );
        assert.equal(response.status, 500);
        const { error } =
            (await response.json()) as { error: string };
        assert.equal(error, 'internal error');
        assert.ok(
            calls.some(args =>
                args.includes('fence read failed')),
            'the fence catch must keep console evidence',
        );
    },
);

test(
    'a MissingTableError fence fault still propagates,'
    + ' never redacted to the fixed 500',
    async () => {
        const db = await freshDb();
        const original = db.pairs.getAllWhere.bind(db.pairs);
        (db.pairs as unknown as {
            getAllWhere: (
                column: string, key: string,
            ) => ReturnType<typeof original>;
        }).getAllWhere = async (column, key) => {
            if (key === '/identities/current/'
                + 'default-organization/') {
                throw new MissingTableError('pairs');
            }
            return original(column, key);
        };
        const flatToken = await reachableToken();
        await assert.rejects(
            () => handleRequest(
                db,
                new Request('http://localhost/organizations/1/ideas/', {
                    headers: {
                        'Authorization':
                            'Bearer ' + flatToken,
                    },
                }),
            ),
            (e: unknown) => e instanceof MissingTableError,
        );
    },
);
