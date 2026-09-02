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
    apiRequest, TEST_OPERATION_ID, storedPutBodyText,
} from './http-fixtures.ts';
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
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
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

function piiCollection(id: string): string {
    return '/identities/' + id + '/pii/';
}

async function pairsAtPii(
    db: MemoryDbAdapter,
    id: string,
) {
    const messagePairs = await db.messagePairs.getAll();
    return messagePairs.filter(
        r => r.uri_collection === piiCollection(id),
    );
}

async function loginPassword(
    db: MemoryDbAdapter,
    username: string,
): Promise<Response> {
    return handleRequest(db, new Request(
        BASE + '/authentication/authorize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'password',
                username,
                password: 's3cret-password-ok',
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
    const firstId = first.headers.get('Response-ID');
    const second = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        humanPii('Ann Marie'),
    ));
    assertStrictEquals(second.status, 201);
    const secondId = second.headers.get('Response-ID');
    assertNotStrictEquals(secondId, firstId);
    const atAddress = await pairsAtPii(db, id);
    assertStrictEquals(atAddress.length, 2);
    assert(atAddress.some(r => r.id === firstId));
    assert(atAddress.some(r => r.id === secondId));
    const head = await documentHeadAt(
        db, piiCollection(id), '',
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
    const putId = put.headers.get('Response-ID');
    const del = await handleRequest(db, req(
        'DELETE', '/identities/' + id + '/pii', DEV_TOKEN,
    ));
    assertStrictEquals(del.status, 204);
    const delId = del.headers.get('Response-ID');
    assertNotStrictEquals(delId, putId);
    const atAddress = await pairsAtPii(db, id);
    assertStrictEquals(atAddress.length, 2);
    const delRow = atAddress.find(r => r.id === delId);
    assert(delRow);
    assertStrictEquals(delRow!.method, 'DELETE');
    assert(!delRow!.request.includes('Bob'));
    assert(atAddress.some(r => r.id === putId
        && r.request.includes('Bob')));
    const head = await documentHeadAt(
        db, piiCollection(id), '',
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
    const atAddress = await pairsAtPii(db, id);
    assertStrictEquals(atAddress.length, 3);
    const head = await documentHeadAt(
        db, piiCollection(id), '',
    );
    assertStrictEquals(head?.id, put.headers.get('Response-ID'));
    assertStrictEquals(head?.method, 'PUT');
    const domainRow = await deriveIdentityPii(db, id);
    assertStrictEquals(domainRow.name, 'Cara Restored');
});

// ── 4. Ordinary document replay ──

Deno.test('a byte-identical resend against the LIVE slot replays'
+ ' the stored response and appends nothing', async () => {
    const db = await freshDb();
    const id = 'uKYubOSYwiunzyPztWBtkw';
    const first = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        humanPii('Dana'),
    ));
    assertStrictEquals(first.status, 201);
    const firstId = first.headers.get('Response-ID');
    const countAfterFirst = (await db.messagePairs.getAll())
        .length;
    const resend = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        humanPii('Dana'),
    ));
    assertStrictEquals(resend.status, 201);
    assertStrictEquals(resend.headers.get('Response-ID'), firstId);
    assertStrictEquals(
        (await db.messagePairs.getAll()).length,
        countAfterFirst,
    );
});

Deno.test('a byte-identical resend AFTER supersession replays'
+ ' the stored first pair and appends nothing', async () => {
    const db = await freshDb();
    const id = 'uLUQPJnlVuzeGqXLYqCItA';
    const first = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        humanPii('Erin'),
    ));
    assertStrictEquals(first.status, 201);
    const firstId = first.headers.get('Response-ID');
    const second = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        humanPii('Erin Marie'),
    ));
    assertStrictEquals(second.status, 201);
    assertNotStrictEquals(second.headers.get('Response-ID'), firstId);
    const countAfterSecond = (await db.messagePairs.getAll())
        .length;
    const resend = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        humanPii('Erin'),
    ));
    assertStrictEquals(resend.status, 201);
    assertStrictEquals(resend.headers.get('Response-ID'), firstId);
    assertStrictEquals(
        (await db.messagePairs.getAll()).length,
        countAfterSecond,
    );
    const atAddress = await pairsAtPii(db, id);
    assertStrictEquals(atAddress.length, 2);
    const domainRow = await deriveIdentityPii(db, id);
    assertStrictEquals(domainRow.name, 'Erin Marie');
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
            invitationId: generateIdentifier(),
            grantEventId: generateIdentifier(), grantAt: AT,
        },
    ));
    assertStrictEquals(grantRes.status, 200);
    const invitationId =
        ((await grantRes.json()) as { id: string }).id;
    const acceptRes = await handleRequest(db, req(
        'PUT',
        '/identities/' + id + '/invitations/' + invitationId,
        await organizationToken(id, 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            membershipId: generateIdentifier(),
            eventId: generateIdentifier(), at: AT,
        },
    ));
    assertStrictEquals(acceptRes.status, 204);
    const edit = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        {
            name: EDITED_NAME, email: EDITED_EMAIL,
            phone: EDITED_PHONE, bio: EDITED_BIO,
        },
    ));
    assertStrictEquals(edit.status, 201);
    const erase = await handleRequest(db, req(
        'DELETE', '/identities/' + id + '/pii', DEV_TOKEN,
    ));
    assertStrictEquals(erase.status, 204);
    await assertRejects(() => deriveIdentityPii(db, id));

    const atAddress = await pairsAtPii(db, id);
    assertStrictEquals(atAddress.length, 3);
    const piiText = atAddress
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
    const rosterText = JSON.stringify(await roster.json());
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

// ── 6. Confinement: no address splices ──

Deno.test('PUT-PUT-DELETE adds exactly three pairs (no address'
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
    assertStrictEquals(second.status, 201);
    const del = await handleRequest(db, req(
        'DELETE', '/identities/' + id + '/pii', DEV_TOKEN,
    ));
    assertStrictEquals(del.status, 204);
    const atAddress = await pairsAtPii(db, id);
    assertStrictEquals(atAddress.length, 3);
    const head = await documentHeadAt(
        db, piiCollection(id), '',
    );
    assertStrictEquals(head?.id, del.headers.get('Response-ID'));
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
            db, '/identities/' + id + '/pii/', '',
        ),
    );
    const expected = piiEntityOf(id, {
        uriId: '',
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
