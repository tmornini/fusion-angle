import { test } from 'node:test';
import assert from 'node:assert/strict';
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
    piiEntityOf,
} from '../api/derive-identity-spine.ts';
import {
    seedAdminSchema,
    organizationRow,
} from './test-fixtures.ts';

// Phase 10 Task 3: the /pii message-plane HARD-DELETE ZONE — the
// sanctioned non-append-only exception (gate 4's chainless
// single-slot register + gate 5's erasure-completeness theorem).
// Every write at identities/:id/pii physically replaces whatever
// pair occupies the slot; supersession and erasure are the same
// mechanism (api/pii-hard-delete.ts).

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

function humanCreateBody(id: string, eventId: string) {
    return {
        id,
        detail: humanDetail(),
        initialState: 'active',
        initialStateEventId: eventId,
        initialStateAt: AT,
    };
}

async function allMessages(
    db: MemoryDbAdapter,
): Promise<string[]> {
    const pairs = await db.pairs.getAll();
    return [
        ...pairs.map(r => r.request),
        ...pairs.map(r => r.response),
    ];
}

// ── 1. PUT-PUT: exactly ONE pair (the latest) ──

test('PUT-PUT at one address leaves exactly ONE pair (the'
+ ' latest)', async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'PUT', '/identities/slot-1/pii', DEV_TOKEN,
        humanPii('Ann'),
    ));
    assert.equal(first.status, 201);
    const second = await handleRequest(db, req(
        'PUT', '/identities/slot-1/pii', DEV_TOKEN,
        humanPii('Ann Marie'),
    ));
    assert.equal(second.status, 201);
    // Case 7: the tombstone/chain-Supersedes pin re-pinned to its
    // ABSENCE — stated explicitly, not merely the old assertion
    // deleted.
    assert.equal(second.headers.get('Supersedes'), null);
    const pairs = await db.pairs.getAll();
    const atAddress = pairs.filter(
        r => r.uri_collection === '/identities/slot-1/pii/',
    );
    assert.equal(atAddress.length, 1);
    assert.equal(
        atAddress[0]!.id, second.headers.get('Response-ID'),
    );
    // Phase Final Task 2: identity_pii ROW half stripped —
    // domain oracle is deriveIdentityPii. G5: PUT-PUT still
    // physically deletes the prior pair (one-role DELETE).
    const domainRow = await deriveIdentityPii(db, 'slot-1');
    assert.equal(domainRow.name, 'Ann Marie');
    // Phase Final Stage B: identity spine tables retired.
});

// ── 2. PUT-DELETE: exactly ONE bodyless tombstone pair ──

test('PUT-DELETE leaves exactly ONE bodyless DELETE pair (the'
+ ' erasure tombstone; no PII bytes anywhere in the ledger)',
async () => {
    const db = await freshDb();
    const put = await handleRequest(db, req(
        'PUT', '/identities/slot-2/pii', DEV_TOKEN,
        humanPii('Bob'),
    ));
    assert.equal(put.status, 201);
    const del = await handleRequest(db, req(
        'DELETE', '/identities/slot-2/pii', DEV_TOKEN,
    ));
    assert.equal(del.status, 204);
    // Case 7 (the DELETE half): the tombstone carries no
    // Supersedes either — chainless applies to BOTH verbs.
    assert.equal(del.headers.get('Supersedes'), null);
    const pairs = await db.pairs.getAll();
    const atAddress = pairs.filter(
        r => r.uri_collection === '/identities/slot-2/pii/',
    );
    assert.equal(atAddress.length, 1);
    const messages = await allMessages(db);
    assert.ok(!messages.some(m => m.includes('Bob')));
    assert.ok(!messages.some(m => m.includes('bob@example.com')));
    await assert.rejects(() => deriveIdentityPii(db, 'slot-2'));
});

// ── 3. DELETE-PUT: the slot re-sets (one PUT pair) ──

test('DELETE-PUT re-sets the slot to exactly one PUT pair',
async () => {
    const db = await freshDb();
    const del = await handleRequest(db, req(
        'DELETE', '/identities/slot-3/pii', DEV_TOKEN,
    ));
    assert.equal(del.status, 404);
    assert.equal(del.headers.get('Supersedes'), null);
    const put = await handleRequest(db, req(
        'PUT', '/identities/slot-3/pii', DEV_TOKEN,
        humanPii('Cara'),
    ));
    assert.equal(put.status, 201);
    assert.equal(put.headers.get('Supersedes'), null);
    const pairs = await db.pairs.getAll();
    const atAddress = pairs.filter(
        r => r.uri_collection === '/identities/slot-3/pii/',
    );
    assert.equal(atAddress.length, 1);
    assert.equal(
        atAddress[0]!.id, put.headers.get('Response-ID'),
    );
    const domainRow = await deriveIdentityPii(db, 'slot-3');
    assert.equal(domainRow.name, 'Cara');
});

// ── 4. The E6 branches (finding 15) ──

test('a byte-identical resend against the LIVE slot replays'
+ ' the stored response and appends nothing', async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'PUT', '/identities/slot-4a/pii', DEV_TOKEN,
        humanPii('Dana'),
    ));
    assert.equal(first.status, 201);
    const firstId = first.headers.get('Response-ID');
    const countAfterFirst = (await db.pairs.getAll()).length;
    const resend = await handleRequest(db, req(
        'PUT', '/identities/slot-4a/pii', DEV_TOKEN,
        humanPii('Dana'),
    ));
    assert.equal(resend.status, 201);
    // storedResponseFor's WHOLE-pair match (message-pair.ts) —
    // the pre-dispatch fast path, never replacePiiSlot — is what
    // answers this resend; the live slot's row is untouched.
    assert.equal(resend.headers.get('Response-ID'), firstId);
    assert.equal(
        (await db.pairs.getAll()).length, countAfterFirst,
    );
});

test('a byte-identical resend AFTER supersession finds no'
+ ' stored hash and appends fresh', async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'PUT', '/identities/slot-4b/pii', DEV_TOKEN,
        humanPii('Erin'),
    ));
    assert.equal(first.status, 201);
    const firstId = first.headers.get('Response-ID');
    const second = await handleRequest(db, req(
        'PUT', '/identities/slot-4b/pii', DEV_TOKEN,
        humanPii('Erin Marie'),
    ));
    assert.equal(second.status, 201);
    assert.notEqual(second.headers.get('Response-ID'), firstId);
    // The FIRST body's stored request row was physically removed
    // when the second PUT replaced the slot — storedResponseFor
    // finds no matching hash, so this is a FRESH write, never a
    // replay (Step 0(a): WHOLE-pair absence is tolerated).
    const resend = await handleRequest(db, req(
        'PUT', '/identities/slot-4b/pii', DEV_TOKEN,
        humanPii('Erin'),
    ));
    assert.equal(resend.status, 201);
    assert.equal(resend.headers.get('Supersedes'), null);
    assert.notEqual(resend.headers.get('Response-ID'), firstId);
    const pairs = await db.pairs.getAll();
    const atAddress = pairs.filter(
        r => r.uri_collection === '/identities/slot-4b/pii/',
    );
    assert.equal(atAddress.length, 1);
});

// ── 5. THE ERASURE-COMPLETENESS PIN (gate 5's theorem) ──

const ERASED_NAME = 'Erasable Person';
const ERASED_EMAIL = 'erasable@example.com';
const ERASED_PHONE = '555-0100';
const ERASED_BIO = 'the erasure-completeness pin body text';
const EDITED_NAME = 'Erasable Renamed';
const EDITED_EMAIL = 'erasable-renamed@example.com';
const EDITED_PHONE = '555-0199';
const EDITED_BIO = 'the edited erasure-completeness pin text';

test('grant -> accept -> human-member create -> edit -> erase'
+ ' leaves ZERO stored-server-plane trace of the erased PII'
+ ' (gate 5, the erasure-completeness theorem)', async () => {
    const db = await freshDb();
    const id = 'erasee-1';
    const create = await handleRequest(db, req(
        'PUT', '/identities/' + id, DEV_TOKEN,
        { kind: 'person', ...humanDetail() },
    ));
    assert.equal(create.status, 201);
    const intake = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        {
            name: ERASED_NAME, email: ERASED_EMAIL,
            phone: ERASED_PHONE, bio: ERASED_BIO,
        },
    ));
    assert.equal(intake.status, 201);
    const grantRes = await handleRequest(db, req(
        'POST', '/organizations/1/invitations/',
        await organizationToken(),
        {
            email: ERASED_EMAIL, invitationId: 'inv-erasee-1',
            grantEventId: 'ev-grant-erasee-1', grantAt: AT,
        },
    ));
    assert.equal(grantRes.status, 200);
    const invitationId =
        ((await grantRes.json()) as { id: string }).id;
    const acceptRes = await handleRequest(db, req(
        'PUT',
        '/identities/' + id + '/invitations/' + invitationId,
        await organizationToken(id, '1'),
        {
            state: 'accepted',
            membershipId: 'ms-erasee-1',
            eventId: 'ev-accept-erasee-1', at: AT,
        },
    ));
    assert.equal(acceptRes.status, 204);
    const edit = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii', DEV_TOKEN,
        {
            name: EDITED_NAME, email: EDITED_EMAIL,
            phone: EDITED_PHONE, bio: EDITED_BIO,
        },
    ));
    assert.equal(edit.status, 201);
    const erase = await handleRequest(db, req(
        'DELETE', '/identities/' + id + '/pii', DEV_TOKEN,
    ));
    assert.equal(erase.status, 204);
    await assert.rejects(() => deriveIdentityPii(db, id));

    const erasedValues = [
        ERASED_NAME, ERASED_EMAIL, ERASED_PHONE, ERASED_BIO,
        EDITED_NAME, EDITED_EMAIL, EDITED_PHONE, EDITED_BIO,
    ];
    const messages = await allMessages(db);
    for (const value of erasedValues) {
        assert.ok(
            !messages.some(m => m.includes(value)),
            'found an erased value in the ledger: ' + value,
        );
    }
    // Scoped to the STORED SERVER PLANE (gate 5): pre-phase
    // historical pairs, exported snapshots, the browser's
    // localStorage session-credentials JWT name claim, and
    // replay resurrection of a RETAINED pre-erasure PUT request
    // are named residuals OUTSIDE this theorem — see API.md.
    // Gate 6 residual: SCHEMA.md § Orphan stores (canonical).
    // Phase Final Stage B: identity spine tables retired.
});

// ── 6. The zone's confinement: a non-/pii DELETE still APPENDS ──

test("the zone's confinement: a non-/pii DELETE (a memberships"
+ ' tombstone) still APPENDS — the zone never leaks', async () => {
    const db = await freshDb();
    const put = await handleRequest(db, req(
        'PUT', '/organizations/1/members/confine-1',
        await organizationToken(),
        { type: 'admin', at: AT },
    ));
    assert.equal(put.status, 201);
    const putId = put.headers.get('Response-ID');
    const del = await handleRequest(db, req(
        'DELETE', '/organizations/1/members/confine-1',
        await organizationToken(),
    ));
    assert.equal(del.status, 204);
    // Unlike /pii, a seat DELETE still APPENDS — the
    // hard-delete zone is confined to identities/:id/pii alone.
    assert.equal(del.headers.get('Supersedes'), null);
    const pairs = await db.pairs.getAll();
    const atAddress = pairs.filter(
        r => r.uri_collection === '/organizations/1/members/'
            && r.uri_id === 'confine-1',
    );
    assert.equal(atAddress.length, 2);
});

// G5: stored PUT = piiEntityOf (GET derive). GET self-only
// so this pin writes and reads the caller's own slot.
test('stored PUT body equals piiEntityOf', async () => {
    const db = await freshDb();
    const id = 'current';
    const fields = humanPii('Gina');
    const put = await handleRequest(db, req(
        'PUT', '/identities/' + id + '/pii',
        DEV_TOKEN, fields,
    ));
    assert.equal(put.status, 201);
    const stored = JSON.parse(
        await storedPutBodyText(
            db, '/identities/' + id + '/pii/', '',
        ),
    );
    const expected = piiEntityOf(id, {
        uriId: '',
        pairId: id,
        method: 'PUT',
        body: fields,
    });
    assert.equal(Object.keys(expected)[0], 'id');
    assert.deepEqual(stored, expected);
    assert.deepEqual(stored, await deriveIdentityPii(db, id));
    assert.deepEqual(stored, await put.json());
    const got = await handleRequest(db, req(
        'GET', '/identities/' + id + '/pii', DEV_TOKEN,
    ));
    assert.equal(got.status, 200);
    assert.deepEqual(stored, await got.json());
});
