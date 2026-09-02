import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { PUT, GET, handleRequest } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { ValidationError } from '../api/types.ts';
import {
    EntityNotFoundError,
    MESSAGE_TABLES,
} from '../api/db.ts';
import {
    validateIdentityDocumentBody,
    validateIdentityEntity,
} from '../api/validators.ts';
import {
    postIdentityDocumentOp,
    identityDocumentEntityOf,
} from '../api/routes.ts';
import {
    formWriteMessagePair,
    appendMessagePair,
} from '../api/message-pair.ts';
import {
    documentFamilyWiring,
    documentGetHandler,
} from '../api/document-family.ts';
import {
    TEST_OPERATION_ID,
    apiRequest,
    storedPutBodyText,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Phase 10 Task 4 (twelfth registered family): PUT
// /identities/:id takes `kind` plus, for a person, the
// optional human profile — no lifecycle trio. Member
// lifecycle rides the members/:id document address
// (states-address retirement), and the shared identity id
// (member.id === identity.id) must not carry a competing trio
// that would FREEZE or double-emit lifecycle. Global plane
// (organizationNested:false), like members/ai-members/
// human-members: no organization_id on the wire.

function identityFields() {
    return { kind: 'person' as const };
}

// -- 1. validators: accept + the label mandate + missing key --

Deno.test('validateIdentityDocumentBody accepts the exact one-key'
+ ' body', () => {
    const doc = validateIdentityDocumentBody(identityFields());
    assertEquals(doc.entity, identityFields());
});

Deno.test('validateIdentityDocumentBody rejects a stray key with'
+ ' the byte-identical message validateIdentityEntity produces'
+ ' for the SAME violation (the label mandate)', () => {
    const body = { ...identityFields(), bogus: 'nope' };
    let documentMessage: string | undefined;
    let entityMessage: string | undefined;
    try {
        validateIdentityDocumentBody(body);
    } catch (e) {
        assert(e instanceof ValidationError);
        documentMessage = (e as ValidationError).message;
    }
    try {
        validateIdentityEntity(body);
    } catch (e) {
        assert(e instanceof ValidationError);
        entityMessage = (e as ValidationError).message;
    }
    assertStrictEquals(
        documentMessage,
        'unexpected key "bogus" for IdentityEntity',
    );
    assertStrictEquals(documentMessage, entityMessage);
});

Deno.test('validateIdentityDocumentBody rejects the missing key,'
+ ' byte-identical to validateIdentityEntity on both paths',
() => {
    const body: Record<string, unknown> = {};
    let documentMessage: string | undefined;
    let entityMessage: string | undefined;
    try {
        validateIdentityDocumentBody(body);
    } catch (e) {
        assert(e instanceof ValidationError);
        documentMessage = (e as ValidationError).message;
    }
    try {
        validateIdentityEntity(body);
    } catch (e) {
        assert(e instanceof ValidationError);
        entityMessage = (e as ValidationError).message;
    }
    assertStrictEquals(
        documentMessage,
        'missing required key "kind" for IdentityEntity',
    );
    assertStrictEquals(documentMessage, entityMessage);
});

Deno.test('validateIdentityDocumentBody rejects an unknown kind,'
+ ' byte-identical to validateIdentityEntity on both paths',
() => {
    const body = { kind: 'bogus-kind' };
    let documentMessage: string | undefined;
    let entityMessage: string | undefined;
    try {
        validateIdentityDocumentBody(body);
    } catch (e) {
        assert(e instanceof ValidationError);
        documentMessage = (e as ValidationError).message;
    }
    try {
        validateIdentityEntity(body);
    } catch (e) {
        assert(e instanceof ValidationError);
        entityMessage = (e as ValidationError).message;
    }
    assertStrictEquals(
        documentMessage,
        'invalid identity kind "bogus-kind" on IdentityEntity',
    );
    assertStrictEquals(documentMessage, entityMessage);
});

// -- 2. the op (below-gate, MemoryDbAdapter) -------------------

Deno.test('postIdentityDocumentOp writes exactly the pair'
+ ' (Phase Final Task 2: identities ROW half stripped)',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const body = identityFields();
    const messagePair = await formWriteMessagePair({
        method: 'PUT',
        pathname: '/identities/gTMDzYjclgPKfPUYsUdtoQ',
        routePattern: 'identities/:id',
        routeSegments: ['identities', ':id'],
        pathSegments: ['identities', 'gTMDzYjclgPKfPUYsUdtoQ'],
        headerFields: [], body,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: '2026-01-01T00:00:00.000000Z',
        organization: undefined,
        responseStatus: 200, responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    const written = await postIdentityDocumentOp(
        db, 'gTMDzYjclgPKfPUYsUdtoQ', body,
        'XXZruirZyAOoRpNxaDnpSA', messagePair,
    );
    assertEquals(written, body);
    // Phase Final Stage B: identity spine tables retired.
    assertStrictEquals((await db.messagePairs.getAll()).length, 1);
    assertStrictEquals((await db.messagePairs.getAll()).length, 1);
});

// -- 3. byte-identical resend (the E6 fast-path sibling pin) --

Deno.test('a byte-identical PUT resend to identities/:id converges'
+ ' to one stored request/response pair', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const body = identityFields();
    const id = generateIdentifier();
    const first = await PUT(
        db, 'identities/' + id, body, DEV_TOKEN,
    );
    const second = await PUT(
        db, 'identities/' + id, body, DEV_TOKEN,
    );
    assertEquals(first, second);
    assertStrictEquals((await db.messagePairs.getAll()).length, 3);
    assertStrictEquals((await db.messagePairs.getAll()).length, 3);
});

// -- 4. below-route via the generic handlers (the drift-file
// mirror idiom, against the REAL registered wiring row) — a PUT
// chain Supersedes-chains and the head derives the LATEST body;
// a DELETE head derives to absence. No states event is ever
// posted in either test — the stateless arm's ONLY tombstone
// signal is the DELETE-method head itself (derive-documents.ts),
// so a clean pass here is itself proof no lifecycle walk ever
// runs, exactly as the members/ai-members/human-members
// precedent established. -------------------------------------

async function putDocumentMessagePair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
    requestAt: string,
): Promise<string> {
    const messagePair = await formWriteMessagePair({
        method: 'PUT',
        pathname: '/identities/' + id,
        routePattern: 'identities/:id',
        routeSegments: ['identities', ':id'],
        pathSegments: ['identities', id],
        headerFields: [], body,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt,
        organization: undefined,
        responseStatus: 200, responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        MESSAGE_TABLES,
        (view) => appendMessagePair(view, messagePair),
    );
    return messagePair.id;
}

async function deleteDocumentMessagePair(
    db: MemoryDbAdapter,
    id: string,
    requestAt: string,
): Promise<void> {
    const messagePair = await formWriteMessagePair({
        method: 'DELETE',
        pathname: '/identities/' + id,
        routePattern: 'identities/:id',
        routeSegments: ['identities', ':id'],
        pathSegments: ['identities', id],
        headerFields: [], body: {},
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt,
        organization: undefined,
        responseStatus: 204, responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        MESSAGE_TABLES,
        (view) => appendMessagePair(view, messagePair),
    );
}

Deno.test('a PUT chain Supersedes-chains and the head derives the'
+ ' LATEST body, through the generic document handlers'
+ ' (identities)', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const wiring = documentFamilyWiring('identities')!;
    const first = identityFields();
    const id = generateIdentifier();
    await putDocumentMessagePair(
        db, id, first,
        '2026-02-01T00:00:00.000000Z',
    );
    const headAfterFirst = await documentGetHandler(wiring)(
        db, [id], 'XXZruirZyAOoRpNxaDnpSA', 'ignored', [],
    );
    assertEquals(headAfterFirst, {
        id, ...first,
    });

    const second = { kind: 'service' as const };
    const secondId = await putDocumentMessagePair(
        db, id, second,
        '2026-02-02T00:00:00.000000Z',
    );
    const secondResponse = await db.messagePairs.getById(secondId);
    assertStrictEquals('supersedes' in secondResponse, false);

    const headAfterSecond = await documentGetHandler(wiring)(
        db, [id], 'XXZruirZyAOoRpNxaDnpSA', 'ignored', [],
    );
    assertEquals(headAfterSecond, {
        id, ...second,
    });
});

Deno.test('a DELETE-head derives absent through the generic document'
+ ' handlers, carrying notFoundTable (identities)', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const wiring = documentFamilyWiring('identities')!;
    const id = generateIdentifier();
    await putDocumentMessagePair(
        db, id, identityFields(),
        '2026-02-01T00:00:00.000000Z',
    );
    await deleteDocumentMessagePair(
        db, id, '2026-02-02T00:00:00.000000Z',
    );
    const err = await assertRejects(
        () => documentGetHandler(wiring)(
            db, [id], 'XXZruirZyAOoRpNxaDnpSA', 'ignored', [],
        ),
    ) as EntityNotFoundError;
    assertInstanceOf(err, EntityNotFoundError);
    assertStrictEquals(err.table, 'identities');
    assertStrictEquals(err.message, 'Not found: identities/' + id);
});

// -- 5. below-route via the generic handlers: the chain/head/404
// cases above prove the wiring; this checks the wire response
// itself carries NO organization_id (organizationNested:false —
// the Phase 8 fix) through the generic successBody builder. ---

Deno.test('documentWriteResponseSpec(IDENTITIES_WIRING) emits'
+ ' {id, kind} only, no organization_id', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const body = identityFields();
    const id = generateIdentifier();
    const written = await PUT<Record<string, unknown>>(
        db, 'identities/' + id, body, DEV_TOKEN,
    );
    assertEquals(
        Object.keys(written).sort(),
        ['id', 'kind'],
    );
    assertStrictEquals(written['id'], id);
    assertStrictEquals(written['kind'], 'person');
});

Deno.test('stored PUT body equals identityDocumentEntityOf',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const id = generateIdentifier();
    const body = identityFields();
    const put = await handleRequest(
        db,
        apiRequest({
            method: 'PUT',
            path: '/identities/' + id,
            token: DEV_TOKEN,
            body,
            operationId: TEST_OPERATION_ID,
        }),
    );
    assertStrictEquals(put.status, 201);
    const stored = JSON.parse(
        await storedPutBodyText(db, '/identities/', id),
    );
    assertEquals(
        stored,
        identityDocumentEntityOf(
            {
                uriId: id,
                messagePairId: id,
                method: 'PUT',
                body,
            },
            '',
        ),
    );
});

// Task 51: fold human profile onto the person identity
// document. Title is not PII. Service must not name any of
// title / department / strengths / team_dimensions.

const PII_FACET = {
    name: 'Ada',
    email: 'ada@example.com',
    phone: '',
    bio: '',
};

Deno.test('PUT service identity with title is 400', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const res = await handleRequest(
        db,
        apiRequest({
            method: 'PUT',
            path: '/identities/uYxxmcHuFJghfKLveLDneg',
            token: DEV_TOKEN,
            body: { kind: 'service', title: 'Bot' },
            operationId: TEST_OPERATION_ID,
        }),
    );
    assertStrictEquals(res.status, 400);
});

Deno.test('PUT person identity with a partial profile is 400',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const res = await handleRequest(
        db,
        apiRequest({
            method: 'PUT',
            path: '/identities/qUceZILomWDFIEtnAaLHKg',
            token: DEV_TOKEN,
            body: { kind: 'person', title: 'Engineer' },
            operationId: TEST_OPERATION_ID,
        }),
    );
    assertStrictEquals(res.status, 400);
    assertEquals(await res.json(), {
        error: 'missing required key "department"'
            + ' for IdentityEntity',
    });
});

Deno.test('GET identity returns the whole profile',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const id = generateIdentifier();
    const profile = {
        title: 'Engineer',
        department: 'Product',
        strengths: ['Leadership'],
        team_dimensions: { driver: 60 },
    };
    const put = await handleRequest(
        db,
        apiRequest({
            method: 'PUT',
            path: '/identities/' + id,
            token: DEV_TOKEN,
            body: { kind: 'person', ...profile },
            operationId: TEST_OPERATION_ID,
        }),
    );
    assert(put.status === 201 || put.status === 200);
    const got = await GET<{
        id: string;
        kind: string;
        title: string;
        department: string;
        strengths: string[];
        team_dimensions: Record<string, number>;
    }>(db, 'identities/' + id, DEV_TOKEN);
    assertStrictEquals(got.id, id);
    assertStrictEquals(got.kind, 'person');
    assertStrictEquals(got.title, profile.title);
    assertStrictEquals(got.department, profile.department);
    assertEquals(got.strengths, profile.strengths);
    assertEquals(
        got.team_dimensions, profile.team_dimensions,
    );
});

Deno.test('PUT pii does not require title; GET pii has no title',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const profile = await handleRequest(
        db,
        apiRequest({
            method: 'PUT',
            path: '/identities/XXZruirZyAOoRpNxaDnpSA',
            token: DEV_TOKEN,
            body: {
                kind: 'person',
                title: 'CEO',
                department: 'Product',
                strengths: ['Leadership'],
                team_dimensions: { driver: 60 },
            },
            operationId: TEST_OPERATION_ID,
        }),
    );
    assert(
        profile.status === 201 || profile.status === 200,
    );
    const piiPut = await handleRequest(
        db,
        apiRequest({
            method: 'PUT',
            path: '/identities/XXZruirZyAOoRpNxaDnpSA/pii',
            token: DEV_TOKEN,
            body: PII_FACET,
            operationId: TEST_OPERATION_ID,
        }),
    );
    assert(
        piiPut.status === 201 || piiPut.status === 200,
    );
    const pii = await GET<Record<string, unknown>>(
        db, 'identities/XXZruirZyAOoRpNxaDnpSA/pii', DEV_TOKEN,
    );
    assertStrictEquals(pii['name'], 'Ada');
    assertStrictEquals('title' in pii, false);
    const identity = await GET<Record<string, unknown>>(
        db, 'identities/XXZruirZyAOoRpNxaDnpSA', DEV_TOKEN,
    );
    assertStrictEquals(identity['title'], 'CEO');
    assertStrictEquals('name' in identity, false);
});
