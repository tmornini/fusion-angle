import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    POST,
    RequestError,
} from '../api/api.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    latestActionForJti,
} from '../api/identity-tokens.ts';

// POST identity-tokens/:jti/rotation decides and appends in
// ONE transaction: a live jti returns its successor; a
// known-but-not-live jti is reuse — the whole chain is
// revoked atomically, then 409; an unknown jti is a 409 that
// appends nothing. POST identity-tokens/:jti/revocation
// revokes the whole chain in one transaction; an unknown jti
// is an idempotent no-op.

const ROOT_JTI = 'jti-1';

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await db.identityTokens.put('t-root', {
        jti: ROOT_JTI, identity_id: 'current',
        action: 'issued', chain_id: 'chain-1',
        at: '2026-06-01T00:00:00.000000Z',
    });
    return db;
}

function rotate(
    db: MemoryDbAdapter,
    jti: string,
): Promise<{ jti: string }> {
    return POST(
        db, `identity-tokens/${jti}/rotation`, {},
        DEV_TOKEN,
    );
}

test(
    'rotating a live jti returns its successor',
    async () => {
        const db = await seededDb();
        const { jti: next } = await rotate(db, ROOT_JTI);
        assert.notEqual(next, ROOT_JTI);
        // issued(root) + rotated(root) + issued(next) = 3
        const rows = await db.identityTokens.getAll();
        assert.equal(rows.length, 3);
        assert.equal(
            latestActionForJti(rows, ROOT_JTI), 'rotated');
        assert.equal(
            latestActionForJti(rows, next), 'issued');
    },
);

test(
    'replaying a rotated-away jti is a 409 that revokes'
        + ' the chain',
    async () => {
        const db = await seededDb();
        const { jti: next } = await rotate(db, ROOT_JTI);
        await assert.rejects(
            () => rotate(db, ROOT_JTI),
            (err: unknown) =>
                err instanceof RequestError
                && err.status === 409,
        );
        const rows = await db.identityTokens.getAll();
        assert.equal(
            latestActionForJti(rows, ROOT_JTI), 'revoked');
        assert.equal(
            latestActionForJti(rows, next), 'revoked');
    },
);

test(
    'rotating an unknown jti is a 409 that appends nothing',
    async () => {
        const db = await seededDb();
        await assert.rejects(
            () => rotate(db, 'ghost'),
            (err: unknown) =>
                err instanceof RequestError
                && err.status === 409,
        );
        const rows = await db.identityTokens.getAll();
        assert.equal(rows.length, 1);
    },
);

test(
    'revocation kills every jti in the chain',
    async () => {
        const db = await seededDb();
        const { jti: next } = await rotate(db, ROOT_JTI);
        await POST(
            db, `identity-tokens/${next}/revocation`, {},
            DEV_TOKEN,
        );
        const rows = await db.identityTokens.getAll();
        assert.equal(
            latestActionForJti(rows, ROOT_JTI), 'revoked');
        assert.equal(
            latestActionForJti(rows, next), 'revoked');
    },
);

test(
    'revoking an unknown jti is an idempotent no-op',
    async () => {
        const db = await seededDb();
        await POST(
            db, 'identity-tokens/ghost/revocation', {},
            DEV_TOKEN,
        );
        const rows = await db.identityTokens.getAll();
        assert.equal(rows.length, 1);
    },
);
