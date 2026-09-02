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
    deriveIdentityTokens,
} from '../api/derive-identity-tokens.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

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
    }, DEV_TOKEN);
    return db;
}

function rotate(
    db: MemoryDbAdapter,
    jti: string,
): Promise<{ jti: string }> {
    return POST(
        db, `identities/XXZruirZyAOoRpNxaDnpSA/tokens/${jti}/rotation`, {},
        DEV_TOKEN,
    );
}

Deno.test(
    'rotating a live jti returns its successor',
    async () => {
        const db = await seededDb();
        const { jti: next } = await rotate(db, ROOT_JTI);
        assertNotStrictEquals(next, ROOT_JTI);
        // issued(root) + rotated(root) + issued(next) = 3
        const rows = await deriveIdentityTokens(db);
        assertStrictEquals(rows.length, 3);
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
        const rows = await deriveIdentityTokens(db);
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
        const rows = await deriveIdentityTokens(db);
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
        );
        const rows = await deriveIdentityTokens(db);
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
        );
        const rows = await deriveIdentityTokens(db);
        assertStrictEquals(rows.length, 1);
    },
);
