import {
    assert,
    assertEquals,
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { DEV_TOKEN, organizationToken } from './token-fixtures.ts';
import {
    apiRequest, pairIdOf, storedPutBodyText,
    framedRequest,
    invitationLatched,
    partBodiesOf,
} from './http-fixtures.ts';
import { basicAuthorization } from
    '../api/authentication.ts';
import {
    deriveIdentityPii,
    deriveIdentityPiiRows,
    piiEntityOf,
} from '../api/derive-identity-spine.ts';
import { documentHeadAt } from '../api/message-pair.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { seedIdentityCredential } from
    './identity-fixtures.ts';
import { testHashPassword } from './mock-seed.ts';
import { sha256Bytes } from '../shared/digest.ts';
import { bytesToBase64Url } from '../shared/base64url.ts';

// PII writes append. DELETE is a marked tombstone; derive
// treats a DELETE head as absence. Erased values remain in
// superseded pairs.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    operationId?: string,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(operationId !== undefined ? { operationId } : {}),
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

function humanPii(name: string) {
    return {
        name,
        email: `${name}@example.com`.toLowerCase(),
        phone: '',
        bio: '',
    };
}

function humanDetail() {
    return {
        title: 'Engineer',
        department: 'Product',
        strengths: [],
        team_dimensions: {},
    };
}

function piiPath(id: string): string {
    return '/identities/' + id + '/';
}

async function pairsAtPii(
    db: MemoryDbAdapter,
    id: string,
) {
    const messagePairs = await db.messagePairs.getAll();
    return messagePairs.filter(
        r => r.path === piiPath(id) && r.name === 'pii',
    );
}

async function loginPassword(
    db: MemoryDbAdapter,
    username: string,
): Promise<Response> {
    return handleRequest(db, framedRequest(
        BASE + '/authentication/authorize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                authorization: basicAuthorization(
                    username, 's3cret-password-ok',
                ),
            },
            body: JSON.stringify({
                method: 'password',
                client_id: 'web',
                code_challenge: bytesToBase64Url(
                    await sha256Bytes('pkce-verifier-test'),
                ),
                code_challenge_method: 'S256',
            }),
        },
    ));
}

// ── 1. PUT-PUT: two pairs, the head supersedes ──

Deno.test('PUT-PUT leaves two pairs and Supersedes', async () => {
    const db = await freshDb();
    const id = 'tyqfBGunVEufdtzApefuyw';
    const first = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        humanPii('Ann'),
    ));
    assertStrictEquals(first.status, 201);
    const firstId = pairIdOf(first);
    const second = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        humanPii('Ann Marie'),
    ));
    assertStrictEquals(second.status, 200);
    const secondId = pairIdOf(second);
    assertNotStrictEquals(secondId, firstId);
    const pairsAt = await pairsAtPii(db, id);
    assertStrictEquals(pairsAt.length, 2);
    assert(pairsAt.some(r => r.id === firstId));
    assert(pairsAt.some(r => r.id === secondId));
    const head = await documentHeadAt(
        db, piiPath(id), 'pii',
    );
    assertStrictEquals(head?.id, secondId);
    assertStrictEquals(head?.method, 'PUT');
    const domainRow = await deriveIdentityPii(db, id);
    assertStrictEquals(domainRow.name, 'Ann Marie');
});

// ── 2. PUT-DELETE: bodyless DELETE head, derive absent ──

Deno.test('PUT-DELETE leaves a bodyless DELETE head and an'
+ ' absent derive', async () => {
    const db = await freshDb();
    const id = 'uEYoNLWQrgIToJPFkyvdPw';
    const put = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        humanPii('Bob'),
    ));
    assertStrictEquals(put.status, 201);
    const putId = pairIdOf(put);
    const del = await handleRequest(db, req(
        'DELETE', '/identities/' + id + '/pii', DEV_TOKEN,
    ));
    assertStrictEquals(del.status, 204);
    const delId = pairIdOf(del);
    assertNotStrictEquals(delId, putId);
    const pairsAt = await pairsAtPii(db, id);
    assertStrictEquals(pairsAt.length, 2);
    const delRow = pairsAt.find(r => r.id === delId);
    assert(delRow);
    assertStrictEquals(delRow!.method, 'DELETE');
    assert(!delRow!.request.includes('Bob'));
    assert(pairsAt.some(r => r.id === putId
        && r.request.includes('Bob')));
    const head = await documentHeadAt(
        db, piiPath(id), 'pii',
    );
    assertStrictEquals(head?.id, delId);
    assertStrictEquals(head?.method, 'DELETE');
    await assertRejects(() => deriveIdentityPii(db, id));
});

// ── 3. DELETE-PUT: live again at three pairs ──

Deno.test('DELETE-PUT is live again at three pairs', async () => {
    const db = await freshDb();
    const id = 'uFgKFelNjvJcrtefsfZxrA';
    const first = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        humanPii('Cara'),
    ));
    assertStrictEquals(first.status, 201);
    const del = await handleRequest(db, req(
        'DELETE', '/identities/' + id + '/pii', DEV_TOKEN,
    ));
    assertStrictEquals(del.status, 204);
    await assertRejects(() => deriveIdentityPii(db, id));
    const put = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        humanPii('Cara Restored'),
    ));
    assertStrictEquals(put.status, 201);
    const pairsAt = await pairsAtPii(db, id);
    assertStrictEquals(pairsAt.length, 3);
    const head = await documentHeadAt(
        db, piiPath(id), 'pii',
    );
    assertStrictEquals(head?.id, pairIdOf(put));
    assertStrictEquals(head?.method, 'PUT');
    const domainRow = await deriveIdentityPii(db, id);
    assertStrictEquals(domainRow.name, 'Cara Restored');
});

// ── 4. Ordinary document replay ──

Deno.test('a byte-identical resend against the LIVE slot replays'
+ ' the stored response and appends nothing', async () => {
    const db = await freshDb();
    const id = 'uKYubOSYwiunzyPztWBtkw';
    const operationId = generateIdentifier();
    const first = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        humanPii('Dana'), operationId,
    ));
    assertStrictEquals(first.status, 201);
    const firstId = pairIdOf(first);
    const countAfterFirst = (await db.messagePairs.getAll())
        .length;
    const resend = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        humanPii('Dana'), operationId,
    ));
    assertStrictEquals(resend.status, 200);
    assertStrictEquals(pairIdOf(resend), firstId);
    assertStrictEquals(
        (await db.messagePairs.getAll()).length,
        countAfterFirst,
    );
});

Deno.test('a superseded body put again stores a new row',
async () => {
    const db = await freshDb();
    const id = 'uLUQPJnlVuzeGqXLYqCItA';
    const operationId = generateIdentifier();
    const first = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        humanPii('Erin'), operationId,
    ));
    assertStrictEquals(first.status, 201);
    const firstId = pairIdOf(first);
    const second = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        humanPii('Erin Marie'),
    ));
    assertStrictEquals(second.status, 200);
    assertNotStrictEquals(pairIdOf(second), firstId);
    const countAfterSecond = (await db.messagePairs.getAll())
        .length;
    const resend = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        humanPii('Erin'), operationId,
    ));
    assertStrictEquals(resend.status, 200);
    assertNotStrictEquals(pairIdOf(resend), firstId);
    assertStrictEquals(
        (await db.messagePairs.getAll()).length,
        countAfterSecond + 1,
    );
    const pairsAt = await pairsAtPii(db, id);
    assertStrictEquals(pairsAt.length, 3);
    const domainRow = await deriveIdentityPii(db, id);
    assertStrictEquals(domainRow.name, 'Erin');
});

// ── 5. Seam: erased PII remains in superseded pairs ──

const ERASED_NAME = 'Erasable Person';
const ERASED_EMAIL = 'erasable@example.com';
const ERASED_PHONE = '555-0100';
const ERASED_BIO = 'the erasure-completeness pin body text';
const EDITED_NAME = 'Erasable Renamed';
const EDITED_EMAIL = 'erasable-renamed@example.com';
const EDITED_PHONE = '555-0199';
const EDITED_BIO = 'the edited erasure-completeness pin text';

Deno.test('erased PII remains in superseded pairs; login is 401',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const create = await handleRequest(db, req(
        'PUT', '/identities/' + id, DEV_TOKEN,
        { kind: 'person', ...humanDetail() },
    ));
    assertStrictEquals(create.status, 201);
    const intake = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        {
            name: ERASED_NAME, email: ERASED_EMAIL,
            phone: ERASED_PHONE, bio: ERASED_BIO,
        },
    ));
    assertStrictEquals(intake.status, 201);
    await seedIdentityCredential(
        db, id, generateIdentifier(), {
            identity_id: id, kind: 'password',
            status: 'set',
            secret: await testHashPassword(
                's3cret-password-ok',
            ),
            at: AT,
        },
    );
    const grantRes = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/invitations/',
        await organizationToken(),
        {
            email: ERASED_EMAIL,
            grantAt: AT,
        },
    ));
    assertStrictEquals(grantRes.status, 201);
    const invitationId =
        ((await grantRes.json()) as { id: string }).id;
    const acceptRes = await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/' + id + '/invitations/' + invitationId,
        await organizationToken(id, 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            at: AT,
        },
    )));
    assertStrictEquals(acceptRes.status, 200);
    const edit = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        {
            name: EDITED_NAME, email: EDITED_EMAIL,
            phone: EDITED_PHONE, bio: EDITED_BIO,
        },
    ));
    assertStrictEquals(edit.status, 200);
    const erase = await handleRequest(db, req(
        'DELETE', '/identities/' + id + '/pii', DEV_TOKEN,
    ));
    assertStrictEquals(erase.status, 204);
    await assertRejects(() => deriveIdentityPii(db, id));

    const pairsAt = await pairsAtPii(db, id);
    assertStrictEquals(pairsAt.length, 3);
    const piiText = pairsAt
        .map(r => r.request + r.response).join('');
    assert(piiText.includes(ERASED_NAME));
    assert(piiText.includes(ERASED_EMAIL));
    assert(piiText.includes(EDITED_NAME));
    assert(piiText.includes(EDITED_EMAIL));
    const livePii = await deriveIdentityPiiRows(db);
    assert(!livePii.some(r => r.id === id));
    assert(!livePii.some(r =>
        r.name === ERASED_NAME
            || r.name === EDITED_NAME
            || r.email === ERASED_EMAIL
            || r.email === EDITED_EMAIL));
    const roster = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/members/',
        await organizationToken(),
    ));
    assertStrictEquals(roster.status, 200);
    const rosterText = JSON.stringify(await partBodiesOf(roster));
    assert(!rosterText.includes(ERASED_NAME));
    assert(!rosterText.includes(EDITED_NAME));
    assert(!rosterText.includes(ERASED_EMAIL));
    assert(!rosterText.includes(EDITED_EMAIL));
    for (const username of [ERASED_EMAIL, EDITED_EMAIL]) {
        const login = await loginPassword(db, username);
        assertStrictEquals(login.status, 401);
        assertEquals(
            await login.json(), { error: 'invalid_grant' },
        );
    }
});

// ── 6. Confinement: no document splices ──

Deno.test('PUT-PUT-DELETE adds exactly three pairs (no document'
+ ' splices)', async () => {
    const db = await freshDb();
    const id = 'XSNEaxodzAorrAiVBegDGw';
    const first = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        humanPii('Ann'),
    ));
    assertStrictEquals(first.status, 201);
    const second = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        humanPii('Ann Marie'),
    ));
    assertStrictEquals(second.status, 200);
    const del = await handleRequest(db, req(
        'DELETE', '/identities/' + id + '/pii', DEV_TOKEN,
    ));
    assertStrictEquals(del.status, 204);
    const pairsAt = await pairsAtPii(db, id);
    assertStrictEquals(pairsAt.length, 3);
    const head = await documentHeadAt(
        db, piiPath(id), 'pii',
    );
    assertStrictEquals(head?.id, pairIdOf(del));
    assertStrictEquals(head?.method, 'DELETE');
});

// G5: stored PUT = piiEntityOf (GET derive). GET self-only
// so this pin writes and reads the caller's own slot.
Deno.test('stored PUT body equals piiEntityOf', async () => {
    const db = await freshDb();
    const id = 'XXZruirZyAOoRpNxaDnpSA';
    const fields = humanPii('Gina');
    const put = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii',
        DEV_TOKEN, fields,
    ));
    assertStrictEquals(put.status, 201);
    const stored = JSON.parse(
        await storedPutBodyText(
            db, '/identities/' + id + '/', 'pii',
        ),
    );
    const expected = piiEntityOf(id, {
        name: 'pii',
        messagePairId: id,
        method: 'PUT',
        body: fields,
    });
    assertStrictEquals(Object.keys(expected)[0], 'id');
    assertEquals(stored, expected);
    assertEquals(stored, await deriveIdentityPii(db, id));
    assertEquals(stored, await put.json());
    const got = await handleRequest(db, req(
        'GET', '/identities/' + id + '/pii', DEV_TOKEN,
    ));
    assertStrictEquals(got.status, 200);
    assertEquals(stored, await got.json());
});
