import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { handleRequest, RequestError } from '../api/api.ts';
import { POST, PUT } from './in-page-facade.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import type { MemoryStorageBackend } from
    '../api/backend-memory.ts';
import { apiRequest } from './http-fixtures.ts';
import { DEV_TOKEN, organizationToken } from
    './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedOrganizationMember } from
    './root-admin-fixture.ts';
import {
    latestActionForJti,
} from '../shared/identity-tokens.ts';
import {
    deriveIdentityTokensFor,
    tokenHeadFor,
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
// is a 404 that appends nothing.

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

async function rotate(
    db: MemoryDbAdapter,
    jti: string,
): Promise<{ jti: string }> {
    return (await POST<{ jti: string }>(
        db, `identities/XXZruirZyAOoRpNxaDnpSA/tokens/${jti}/rotation`, {},
        DEV_TOKEN,
        operationIdHeader())).body().toValue();
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
    'revoking an unknown jti is a 404 that appends nothing',
    async () => {
        const db = await seededDb();
        const err = await assertRejects(
            () => POST(
                db, 'identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
                    + generateIdentifier() + '/revocation',
                {},
                DEV_TOKEN,
                operationIdHeader()),
        ) as RequestError;
        assertInstanceOf(err, RequestError);
        assertStrictEquals(err.status, 404);
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
    'revoking another identity\'s jti is unknown: 404, and'
        + ' the owning chain stays live',
    async () => {
        const db = await seededDb();
        const err = await assertRejects(
            () => POST(
                db,
                `identities/${OTHER_IDENTITY}/tokens/`
                    + `${ROOT_JTI}/revocation`,
                {},
                DEV_TOKEN,
                operationIdHeader()),
        ) as RequestError;
        assertInstanceOf(err, RequestError);
        assertStrictEquals(err.status, 404);
        const rows = await deriveIdentityTokensFor(
            db, 'XXZruirZyAOoRpNxaDnpSA',
        );
        assertStrictEquals(rows.length, 1);
        assertStrictEquals(
            latestActionForJti(rows, ROOT_JTI), 'issued');
    },
);

const IDENTITY = 'XXZruirZyAOoRpNxaDnpSA';

function tokenOperation(
    db: MemoryDbAdapter,
    jti: string,
    operation: 'rotation' | 'revocation',
): Promise<Response> {
    return handleRequest(db, apiRequest({
        method: 'POST',
        path: '/identities/' + IDENTITY + '/tokens/' + jti
            + '/' + operation,
        token: DEV_TOKEN,
        body: {},
    }));
}

Deno.test('a rotation answers the successor\'s state', async () => {
    const db = await seededDb();
    const res = await tokenOperation(db, ROOT_JTI, 'rotation');
    assertStrictEquals(res.status, 201);
    const body = await res.json() as Record<string, unknown>;
    const successor = body['jti'] as string;
    assertNotStrictEquals(successor, ROOT_JTI);
    const head = await tokenHeadFor(db, IDENTITY, successor);
    assert(head !== null);
    assertEquals(body, {
        id: successor,
        jti: successor,
        identity_id: IDENTITY,
        action: 'issued',
        chain_id: ROOT_CHAIN,
        at: head.entity.at,
        parent_jti: ROOT_JTI,
    });
});

Deno.test('a rotated token\'s head keeps its parent', async () => {
    const db = await seededDb();
    const { jti: middle } = await rotate(db, ROOT_JTI);
    const { jti: last } = await rotate(db, middle);
    const head = await tokenHeadFor(db, IDENTITY, middle);
    assert(head !== null);
    assertStrictEquals(head.entity.action, 'rotated');
    assertStrictEquals(head.entity.parent_jti, ROOT_JTI);
    const lastHead = await tokenHeadFor(db, IDENTITY, last);
    assert(lastHead !== null);
    assertStrictEquals(lastHead.entity.parent_jti, middle);
});

Deno.test('a refused rotation is not a rotation', async () => {
    const db = await seededDb();
    (db.backend as MemoryStorageBackend).refuseNextSuccessions(6);
    const res = await tokenOperation(db, ROOT_JTI, 'rotation');
    await res.body?.cancel();
    assertStrictEquals(res.status, 409);
    const head = await tokenHeadFor(db, IDENTITY, ROOT_JTI);
    assert(head !== null);
    assertStrictEquals(head.entity.action, 'issued');
    const rows = await deriveIdentityTokensFor(db, IDENTITY);
    assertStrictEquals(rows.length, 1);
});

Deno.test('a revocation answers the presented token\'s state',
async () => {
    const db = await seededDb();
    const res = await tokenOperation(db, ROOT_JTI, 'revocation');
    assertStrictEquals(res.status, 200);
    const body = await res.json() as Record<string, unknown>;
    assertStrictEquals(body['jti'], ROOT_JTI);
    assertStrictEquals(body['action'], 'revoked');
});

// WP8 self-only token-chain guard (Task 12a): a member may
// rotate or revoke only its OWN identity's chain; naming
// another identity 403s before any read, whether the jti is
// known or not. An admin still names any identity.
const MEMBER_ID = 'nkgaOHZISTQrILTfPThWCA';

async function memberSeededDb(): Promise<MemoryDbAdapter> {
    const db = await seededDb();
    await seedOrganizationMember(db, MEMBER_ID);
    return db;
}

function memberTokenPath(
    jti: string,
    operation: 'rotation' | 'revocation',
): string {
    return '/identities/' + IDENTITY + '/tokens/' + jti
        + '/' + operation;
}

Deno.test(
    "a member rotating another identity's jti is 403,"
        + " byte-pinned to the PUT guard's wording, and stores"
        + ' no pair, leaving the victim\'s jti head issued',
    async () => {
        const db = await memberSeededDb();
        const member = await organizationToken(MEMBER_ID);
        const before = (await db.messagePairs.getAll()).length;
        const path = memberTokenPath(ROOT_JTI, 'rotation');
        const res = await handleRequest(db, apiRequest({
            method: 'POST', path, token: member, body: {},
        }));
        assertStrictEquals(res.status, 403);
        assertEquals(await res.json(), {
            error: 'forbidden: POST ' + path
                + ' requires a role this principal lacks',
        });
        assertStrictEquals(
            (await db.messagePairs.getAll()).length, before,
        );
        const head = await tokenHeadFor(db, IDENTITY, ROOT_JTI);
        assert(head !== null);
        assertStrictEquals(head.entity.action, 'issued');
    },
);

Deno.test(
    "a member revoking another identity's jti is 403,"
        + " byte-pinned to the PUT guard's wording, and stores"
        + ' no pair, leaving the victim\'s jti head issued',
    async () => {
        const db = await memberSeededDb();
        const member = await organizationToken(MEMBER_ID);
        const before = (await db.messagePairs.getAll()).length;
        const path = memberTokenPath(ROOT_JTI, 'revocation');
        const res = await handleRequest(db, apiRequest({
            method: 'POST', path, token: member, body: {},
        }));
        assertStrictEquals(res.status, 403);
        assertEquals(await res.json(), {
            error: 'forbidden: POST ' + path
                + ' requires a role this principal lacks',
        });
        assertStrictEquals(
            (await db.messagePairs.getAll()).length, before,
        );
        const head = await tokenHeadFor(db, IDENTITY, ROOT_JTI);
        assert(head !== null);
        assertStrictEquals(head.entity.action, 'issued');
    },
);

Deno.test(
    'a member revoking an unknown jti under another identity'
        + ' is 403, not 404',
    async () => {
        const db = await memberSeededDb();
        const member = await organizationToken(MEMBER_ID);
        const path = memberTokenPath(
            generateIdentifier(), 'revocation',
        );
        const res = await handleRequest(db, apiRequest({
            method: 'POST', path, token: member, body: {},
        }));
        assertStrictEquals(res.status, 403);
    },
);
