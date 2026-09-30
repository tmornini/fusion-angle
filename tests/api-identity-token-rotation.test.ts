import {
    assertInstanceOf,
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    POST,
    PUT,
    RequestError,
} from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    latestActionForJti,
} from '../api/identity-tokens.ts';
import {
    deriveIdentityTokensFor,
} from '../api/derive-identity-tokens.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { operationIdHeader } from
    './operation-id-header.ts';


// POST identity-tokens/:jti/rotation decides and appends in
// ONE transaction: a live jti returns its successor; a
// known-but-not-live jti is reuse — the whole chain is
// revoked atomically, then 409; an unknown jti is a 409 that
// appends nothing. POST identity-tokens/:jti/revocation
// revokes the whole chain in one transaction; an unknown jti
// is an idempotent no-op.

const ROOT_JTI = generateIdentifier();
const ROOT_CHAIN = generateIdentifier();

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    // Seeded via the PUT route (not a raw store write): both
    // PRE-TX and IN-TX chain lookups read the message ledger
    // (Phase 13 Task 6/9a), so a pair-less event is invisible to
    // them — the PUT route forms the SAME event pair a live write
    // uses (Phase 13 Task 9: pair-only, no row).
    await PUT(db
        , 'identities/XXZruirZyAOoRpNxaDnpSA/tokens/' + ROOT_JTI, {
        jti: ROOT_JTI, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        action: 'issued', chain_id: ROOT_CHAIN,
        at: '2026-06-01T00:00:00.000000Z',
    }, DEV_TOKEN,
        operationIdHeader());
    return db;
}

function rotate(
    db: MemoryDbAdapter,
    jti: string,
): Promise<{ jti: string }> {
    return POST(
        db, `identities/XXZruirZyAOoRpNxaDnpSA/tokens/${jti}/rotation`, {},
        DEV_TOKEN,
        operationIdHeader());
}

Deno.test(
    'rotating a live jti returns its successor',
    async () => {
        const db = await seededDb();
        const { jti: next } = await rotate(db, ROOT_JTI);
        assertNotStrictEquals(next, ROOT_JTI);
        // root head 'rotated' + successor head 'issued' = 2
        const rows = await deriveIdentityTokensFor(
            db, 'XXZruirZyAOoRpNxaDnpSA',
        );
        assertStrictEquals(rows.length, 2);
        assertStrictEquals(
            latestActionForJti(rows, ROOT_JTI), 'rotated');
        assertStrictEquals(
            latestActionForJti(rows, next), 'issued');
    },
);

Deno.test(
    'replaying a rotated-away jti is a 409 that revokes'
        + ' the chain',
    async () => {
        const db = await seededDb();
        const { jti: next } = await rotate(db, ROOT_JTI);
        const err = await assertRejects(
            () => rotate(db, ROOT_JTI),
        ) as RequestError;
        assertInstanceOf(err, RequestError);
        assertStrictEquals(err.status, 409);
        const rows = await deriveIdentityTokensFor(
            db, 'XXZruirZyAOoRpNxaDnpSA',
        );
        assertStrictEquals(
            latestActionForJti(rows, ROOT_JTI), 'revoked');
        assertStrictEquals(
            latestActionForJti(rows, next), 'revoked');
    },
);

Deno.test(
    'rotating an unknown jti is a 409 that appends nothing',
    async () => {
        const db = await seededDb();
        const err = await assertRejects(
            () => rotate(db, generateIdentifier()),
        ) as RequestError;
        assertInstanceOf(err, RequestError);
        assertStrictEquals(err.status, 409);
        const rows = await deriveIdentityTokensFor(
            db, 'XXZruirZyAOoRpNxaDnpSA',
        );
        assertStrictEquals(rows.length, 1);
    },
);

Deno.test(
    'revocation kills every jti in the chain',
    async () => {
        const db = await seededDb();
        const { jti: next } = await rotate(db, ROOT_JTI);
        await POST(
            db, `identities/XXZruirZyAOoRpNxaDnpSA/tokens/${next}/revocation`,
            {},
            DEV_TOKEN,
            operationIdHeader());
        const rows = await deriveIdentityTokensFor(
            db, 'XXZruirZyAOoRpNxaDnpSA',
        );
        assertStrictEquals(
            latestActionForJti(rows, ROOT_JTI), 'revoked');
        assertStrictEquals(
            latestActionForJti(rows, next), 'revoked');
    },
);

Deno.test(
    'revoking an unknown jti is an idempotent no-op',
    async () => {
        const db = await seededDb();
        await POST(
            db, 'identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
                + generateIdentifier() + '/revocation',
            {},
            DEV_TOKEN,
            operationIdHeader());
        const rows = await deriveIdentityTokensFor(
            db, 'XXZruirZyAOoRpNxaDnpSA',
        );
        assertStrictEquals(rows.length, 1);
    },
);

// Spec § 1 "Unknown": a jti outside THIS identity's own
// tokens collection is unknown to this identity — the
// chain lookup reads one collection, never the plane, so a
// chain another identity owns is not seen, not 403'd. Same
// security (you cannot rotate or revoke a chain you do not
// own), the unknown status. DEV_TOKEN is the root admin, so
// the gate admits the foreign path and the handler decides.
const OTHER_IDENTITY = 'toccYYkLEABmlbpHJalgtQ';

Deno.test(
    'rotating another identity\'s jti is unknown: 409, and'
        + ' the owning chain stays live',
    async () => {
        const db = await seededDb();
        const err = await assertRejects(
            () => POST(
                db,
                `identities/${OTHER_IDENTITY}/tokens/`
                    + `${ROOT_JTI}/rotation`,
                {},
                DEV_TOKEN,
                operationIdHeader()),
        ) as RequestError;
        assertInstanceOf(err, RequestError);
        assertStrictEquals(err.status, 409);
        const rows = await deriveIdentityTokensFor(
            db, 'XXZruirZyAOoRpNxaDnpSA',
        );
        assertStrictEquals(rows.length, 1);
        assertStrictEquals(
            latestActionForJti(rows, ROOT_JTI), 'issued');
    },
);

Deno.test(
    'revoking another identity\'s jti is a 2xx no-op that'
        + ' leaves the owning chain live',
    async () => {
        const db = await seededDb();
        await POST(
            db,
            `identities/${OTHER_IDENTITY}/tokens/`
                + `${ROOT_JTI}/revocation`,
            {},
            DEV_TOKEN,
            operationIdHeader());
        const rows = await deriveIdentityTokensFor(
            db, 'XXZruirZyAOoRpNxaDnpSA',
        );
        assertStrictEquals(rows.length, 1);
        assertStrictEquals(
            latestActionForJti(rows, ROOT_JTI), 'issued');
    },
);
