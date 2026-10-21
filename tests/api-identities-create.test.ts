import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { GET, POST } from './in-page-facade.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';
import {
    apiRequest,
    storedPutBodyText,
} from './http-fixtures.ts';
import { identityDocumentEntityOf } from '../api/routes.ts';
import {
    deriveIdentityPii,
    deriveCredentialsFor,
} from '../api/derive-identity-spine.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { operationIdHeader } from
    './operation-id-header.ts';


const MEMBER = generateIdentifier();

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// The PII facet — the contact fields the identity_pii store
// re-validates after the composing POST puts it.
function pii(name: string) {
    return {
        name,
        email: `${name}@example.com`.toLowerCase(),
        phone: '',
        bio: '',
    };
}

// The client_secret credential facet — the row the
// identity_credentials store re-validates after the composing
// POST puts it. `secret` arrives already hashed; the test
// passes an opaque non-empty stand-in.
function credential(id: string) {
    return {
        id: `${id}-client-secret`,
        identity_id: id,
        kind: 'client_secret',
        status: 'set',
        secret: 'hashed-secret',
        at: '2026-01-01T00:00:00.000000Z',
    };
}

function req(
    method: string, path: string, token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
    });
}

function outside(method: string, path: string): string {
    return 'forbidden: ' + method + ' ' + path
        + ' names an identity outside this'
        + ' organization';
}

async function assertForbidden(
    db: MemoryDbAdapter,
    method: string,
    path: string,
    body?: unknown,
): Promise<void> {
    const res = await handleRequest(
        db, req(method, path, DEV_TOKEN, body),
    );
    assertStrictEquals(res.status, 403);
    assertEquals(await res.json(), {
        error: outside(method, path),
    });
}

Deno.test(
    'POST identities (person) stores the identity; an admin'
    + ' cannot read or write the membership-less id',
    async () => {
        const db = await freshDb();
        const id = 'pnXmXrxOWayANgDLdCjuBw';
        await POST(db, 'identities/', {
            id,
            kind: 'person',
        }, DEV_TOKEN,
            operationIdHeader());
        const stored = JSON.parse(
            await storedPutBodyText(db, '/identities/', id),
        ) as { kind: string };
        assertStrictEquals(stored.kind, 'person');
        await assertForbidden(db, 'GET', '/identities/' + id);
        await assertRejects(() => deriveIdentityPii(db, id));
        await assertForbidden(
            db, 'PUT', '/identities/' + id + '/pii',
            pii('Alice'),
        );
        await assertRejects(() => deriveIdentityPii(db, id));
        const creds = await deriveCredentialsFor(db, id);
        assertStrictEquals(creds.length, 0);
    },
);

Deno.test(
    'POST identities (service) writes the identity and its'
    + ' client_secret credential in one operation',
    async () => {
        const db = await freshDb();
        await POST(db, 'identities/', {
            id: 'syWUUcdBSbBgMwBiCrgbDw',
            kind: 'service',
            credential: credential('syWUUcdBSbBgMwBiCrgbDw'),
        }, DEV_TOKEN,
            operationIdHeader());
        await assertForbidden(
            db, 'GET', '/identities/syWUUcdBSbBgMwBiCrgbDw',
        );
        const creds = await deriveCredentialsFor(db
            , 'syWUUcdBSbBgMwBiCrgbDw');
        const cred = creds.find(c => c.kind === 'client_secret');
        assert(cred, 'credential exists on message plane');
        assertStrictEquals(cred.status, 'set');
        // A service carries no PII.
        await assertRejects(
            () => deriveIdentityPii(db, 'syWUUcdBSbBgMwBiCrgbDw'));
        // Phase Final Stage B: identity spine tables retired.
    },
);

Deno.test(
    'POST identities (person) rejects a legacy pii-bearing'
    + ' body: PII now enters ONLY via PUT identities/:id/pii'
    + ' (Phase 10 Task 2 retires the create-time PII facet, and'
    + ' with it the atomic create+PII rollback this body once'
    + ' exercised)',
    async () => {
        const db = await freshDb();
        const doomed = generateIdentifier();
        await assertRejects(
            () => POST(db, 'identities/', {
                id: doomed,
                kind: 'person',
                pii: {
                    name: 'Doomed',
                    email: 'doomed@example.com',
                    phone: '', bio: '',
                },
            }, DEV_TOKEN,
                operationIdHeader()),
        );
        // The unexpected `pii` key 400s before any facet lands.
        await assertRejects(
            () => GET(db, 'identities/' + doomed, DEV_TOKEN,
                operationIdHeader()));
        await assertRejects(
            () => deriveIdentityPii(db, doomed));
    },
);

Deno.test(
    'an admin PUT identities/:id/pii on a membership-less'
    + ' create is forbidden and leaves it PII-less',
    async () => {
        const db = await freshDb();
        const torn = generateIdentifier();
        await POST(db, 'identities/', {
            id: torn, kind: 'person',
        }, DEV_TOKEN,
            operationIdHeader());
        await assertForbidden(
            db, 'PUT', '/identities/' + torn + '/pii', {
                name: 'Torn',
                email: 'torn@example.com',
                phone: '',
            },
        );
        const stored = JSON.parse(
            await storedPutBodyText(db, '/identities/', torn),
        ) as { kind: string };
        assertStrictEquals(stored.kind, 'person');
        await assertForbidden(
            db, 'GET', '/identities/' + torn,
        );
        await assertRejects(
            () => deriveIdentityPii(db, torn));
    },
);

Deno.test(
    'POST identities (service) rolls back the identity when'
    + ' its credential sub-object is invalid',
    async () => {
        const db = await freshDb();
        const doomed = generateIdentifier();
        await assertRejects(
            // Credential with a malformed `at` — the
            // identity_credentials store rejects it mid-tx,
            // AFTER the identities put has landed, so both must
            // roll back.
            () => POST(db, 'identities/', {
                id: doomed,
                kind: 'service',
                credential: {
                    ...credential(doomed),
                    at: 'not-a-timestamp',
                },
            }, DEV_TOKEN,
                operationIdHeader()),
        );
        await assertRejects(
            () => GET(db, 'identities/' + doomed, DEV_TOKEN,
                operationIdHeader()));
        const creds = await deriveCredentialsFor(db, doomed);
        assertStrictEquals(creds.length, 0);
    },
);

Deno.test(
    'an admin may POST identities but a plain member is'
    + ' denied',
    async () => {
        const adminDb = await freshDb();
        const create = await handleRequest(adminDb, req(
            'POST', '/identities/', DEV_TOKEN, {
                id: 'pnXmXrxOWayANgDLdCjuBw',
                kind: 'person',
            }));
        assertStrictEquals(create.status, 201);

        const memberDb = memoryDbAdapter();
        await memberDb.postSchemaCreation();
        await seedOrganizationMember(memberDb, MEMBER);
        const token = await devToken(MEMBER);
        const denied = await handleRequest(
            memberDb, req('POST', '/identities/', token, {
                id: 'prBESZPjJDiuXCeZLmbiVw',
                kind: 'person',
            }));
        assertStrictEquals(denied.status, 403);
        // The denied member wrote nothing on the message plane
        // — no identities/prBESZPjJDiuXCeZLmbiVw document.
        await assertRejects(
            () => GET(memberDb, 'identities/prBESZPjJDiuXCeZLmbiVw', token,
                operationIdHeader()),
        );
    },
);

Deno.test(
    'POST identities (service) is 400 and stores nothing',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        const res = await handleRequest(db, req(
            'POST', '/identities/', DEV_TOKEN,
            { id, kind: 'service' },
        ));
        assertStrictEquals(res.status, 400);
        assertEquals(await res.json(), {
            error: 'invalid identity kind "service" on'
                + ' IdentityCreateBody',
        });
        assertStrictEquals(
            await db.messagePairs.getHeadPair('/identities/', id),
            null,
        );
    },
);

Deno.test('identity creation stores identityDocumentEntityOf',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    await POST(db, 'identities/', {
        id,
        kind: 'person',
    }, DEV_TOKEN,
        operationIdHeader());
    const stored = JSON.parse(
        await storedPutBodyText(db, '/identities/', id),
    );
    assertEquals(
        stored,
        identityDocumentEntityOf(
            {
                name: id,
                messagePairId: id,
                method: 'PUT',
                body: { kind: 'person' },
            },
            '',
        ),
    );
});

Deno.test(
    'POST identities/ answers 201 with the document\'s state'
    + ' and its location',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        const res = await handleRequest(db, req(
            'POST', '/identities/', DEV_TOKEN,
            { id, kind: 'person' },
        ));
        assertStrictEquals(res.status, 201);
        assertStrictEquals(res.headers.get('location'), id);
        assertEquals(
            await res.json(),
            JSON.parse(
                await storedPutBodyText(db, '/identities/', id),
            ),
        );
    },
);

Deno.test(
    'a resent POST identities/ is 409 and stores nothing',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        const body = { id, kind: 'person' };
        const first = await handleRequest(db, req(
            'POST', '/identities/', DEV_TOKEN, body,
        ));
        assertStrictEquals(first.status, 201);
        await first.body?.cancel();
        const before = (await db.messagePairs.getAll()).length;
        const second = await handleRequest(db, req(
            'POST', '/identities/', DEV_TOKEN, body,
        ));
        assertStrictEquals(second.status, 409);
        assertEquals(await second.json(), {
            error: 'Document already exists at /identities/' + id,
        });
        assertStrictEquals(
            (await db.messagePairs.getAll()).length, before,
        );
    },
);

// The created service has no seat. An admin PUT of its
// credential names an identity outside the organization.
Deno.test('a route PUT of the create\'s credential is forbidden'
+ ' and stores nothing', async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const credentialId = generateIdentifier();
    const created = await handleRequest(db, req(
        'POST', '/identities/', DEV_TOKEN, {
            id,
            kind: 'service',
            credential: { ...credential(id), id: credentialId },
        },
    ));
    assertStrictEquals(created.status, 201);
    await created.body?.cancel();
    const credentials = '/identities/' + id + '/credentials/';
    const head = await db.messagePairs.getHeadPair(
        credentials, credentialId,
    );
    assert(head !== null);
    const { id: _id, ...stored } = JSON.parse(
        await storedPutBodyText(db, credentials, credentialId),
    ) as Record<string, unknown>;
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, req(
        'PUT', credentials + credentialId, DEV_TOKEN, stored,
    ));
    assertStrictEquals(res.status, 403);
    assertEquals(await res.json(), {
        error: outside(
            'PUT', credentials + credentialId,
        ),
    });
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});
