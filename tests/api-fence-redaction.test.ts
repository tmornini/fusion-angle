import { assert, assertRejects, assertStrictEquals } from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { MissingTableError } from '../api/db.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { reachableToken } from
    './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { captureConsole } from './fixtures/console-capture.ts';

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

Deno.test(
    'a Region A fence-read fault (fenceRequest itself) redacts'
    + ' to the fixed 500',
    async () => {
        const db = await freshDb();
        // DEV_TOKEN carries no `organization` claim, so
        // fenceRequest falls back to identityDefaultOrganization,
        // which derives from db.messagePairs/db.messagePairs at the
        // identity's default-organization address. Fault THAT
        // read alone
        // — every other read passes through unaffected.
        const original = db.messagePairs.getAllWhere.bind(db.messagePairs);
        (db.messagePairs as unknown as {
            getAllWhere: (
                column: string, key: string,
            ) => ReturnType<typeof original>;
        }).getAllWhere = async (column, key) => {
            if (key === '/identities/XXZruirZyAOoRpNxaDnpSA/'
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
                    new Request('http://localhost/organizations/'
                        + 'AjdvjuECVZEgZoFajaIEkg/ideas/', {
                        headers: {
                            'Authorization':
                                'Bearer ' + flatToken,
                        },
                    }),
                ),
            );
        assertStrictEquals(response.status, 500);
        const { error } =
            (await response.json()) as { error: string };
        assertStrictEquals(error, 'internal error');
        assert(
            calls.some(args =>
                args.includes('fence read failed')),
            'the fence catch must keep console evidence',
        );
    },
);

Deno.test(
    'a MissingTableError fence fault still propagates,'
    + ' never redacted to the fixed 500',
    async () => {
        const db = await freshDb();
        const original = db.messagePairs.getAllWhere.bind(db.messagePairs);
        (db.messagePairs as unknown as {
            getAllWhere: (
                column: string, key: string,
            ) => ReturnType<typeof original>;
        }).getAllWhere = async (column, key) => {
            if (key === '/identities/XXZruirZyAOoRpNxaDnpSA/'
                + 'default-organization/') {
                throw new MissingTableError('message_pairs');
            }
            return original(column, key);
        };
        const flatToken = await reachableToken();
        await assertRejects(
            () => handleRequest(
                db,
                new Request('http://localhost/organizations/'
                    + 'AjdvjuECVZEgZoFajaIEkg/ideas/', {
                    headers: {
                        'Authorization':
                            'Bearer ' + flatToken,
                    },
                }),
            ),
            MissingTableError,
        );
    },
);
