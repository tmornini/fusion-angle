import {
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
