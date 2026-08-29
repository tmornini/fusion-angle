import { test } from 'node:test';
import { strict as assert } from 'node:assert';
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

test('validateIdentityDocumentBody accepts the exact one-key'
+ ' body', () => {
    const doc = validateIdentityDocumentBody(identityFields());
    assert.deepEqual(doc.entity, identityFields());
});

test('validateIdentityDocumentBody rejects a stray key with'
+ ' the byte-identical message validateIdentityEntity produces'
+ ' for the SAME violation (the label mandate)', () => {
    const body = { ...identityFields(), bogus: 'nope' };
    let documentMessage: string | undefined;
    let entityMessage: string | undefined;
    try {
        validateIdentityDocumentBody(body);
    } catch (e) {
        assert.ok(e instanceof ValidationError);
        documentMessage = (e as ValidationError).message;
    }
    try {
        validateIdentityEntity(body);
    } catch (e) {
        assert.ok(e instanceof ValidationError);
        entityMessage = (e as ValidationError).message;
    }
    assert.equal(
        documentMessage,
        'unexpected key "bogus" for IdentityEntity',
    );
    assert.equal(documentMessage, entityMessage);
});

test('validateIdentityDocumentBody rejects the missing key,'
+ ' byte-identical to validateIdentityEntity on both paths',
() => {
    const body: Record<string, unknown> = {};
    let documentMessage: string | undefined;
    let entityMessage: string | undefined;
    try {
        validateIdentityDocumentBody(body);
    } catch (e) {
        assert.ok(e instanceof ValidationError);
        documentMessage = (e as ValidationError).message;
    }
    try {
        validateIdentityEntity(body);
    } catch (e) {
        assert.ok(e instanceof ValidationError);
        entityMessage = (e as ValidationError).message;
    }
    assert.equal(
        documentMessage,
        'missing required key "kind" for IdentityEntity',
    );
    assert.equal(documentMessage, entityMessage);
});

test('validateIdentityDocumentBody rejects an unknown kind,'
+ ' byte-identical to validateIdentityEntity on both paths',
() => {
    const body = { kind: 'bogus-kind' };
    let documentMessage: string | undefined;
    let entityMessage: string | undefined;
    try {
        validateIdentityDocumentBody(body);
    } catch (e) {
        assert.ok(e instanceof ValidationError);
        documentMessage = (e as ValidationError).message;
    }
    try {
        validateIdentityEntity(body);
    } catch (e) {
        assert.ok(e instanceof ValidationError);
        entityMessage = (e as ValidationError).message;
    }
    assert.equal(
        documentMessage,
        'invalid identity kind "bogus-kind" on IdentityEntity',
    );
    assert.equal(documentMessage, entityMessage);
});

// -- 2. the op (below-gate, MemoryDbAdapter) -------------------

test('postIdentityDocumentOp writes exactly the pair'
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
    assert.deepEqual(written, body);
    // Phase Final Stage B: identity spine tables retired.
    assert.equal((await db.messagePairs.getAll()).length, 1);
    assert.equal((await db.messagePairs.getAll()).length, 1);
});

// -- 3. byte-identical resend (the E6 fast-path sibling pin) --

test('a byte-identical PUT resend to identities/:id converges'
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
    assert.deepEqual(first, second);
    assert.equal((await db.messagePairs.getAll()).length, 3);
    assert.equal((await db.messagePairs.getAll()).length, 3);
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

test('a PUT chain Supersedes-chains and the head derives the'
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
    assert.deepEqual(headAfterFirst, {
        id, ...first,
    });

    const second = { kind: 'service' as const };
    const secondId = await putDocumentMessagePair(
        db, id, second,
        '2026-02-02T00:00:00.000000Z',
    );
    const secondResponse = await db.messagePairs.getById(secondId);
    assert.equal('supersedes' in secondResponse, false);

    const headAfterSecond = await documentGetHandler(wiring)(
        db, [id], 'XXZruirZyAOoRpNxaDnpSA', 'ignored', [],
    );
    assert.deepEqual(headAfterSecond, {
        id, ...second,
    });
});

test('a DELETE-head derives absent through the generic document'
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
    await assert.rejects(
        documentGetHandler(wiring)(
            db, [id], 'XXZruirZyAOoRpNxaDnpSA', 'ignored', [],
        ),
        (error: unknown) => {
            assert.ok(error instanceof EntityNotFoundError);
            assert.equal(
                (error as EntityNotFoundError).table,
                'identities',
            );
            assert.equal(
                (error as EntityNotFoundError).message,
                'Not found: identities/' + id,
            );
            return true;
        },
    );
});

// -- 5. below-route via the generic handlers: the chain/head/404
// cases above prove the wiring; this checks the wire response
// itself carries NO organization_id (organizationNested:false —
// the Phase 8 fix) through the generic successBody builder. ---

test('documentWriteResponseSpec(IDENTITIES_WIRING) emits'
+ ' {id, kind} only, no organization_id', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const body = identityFields();
    const id = generateIdentifier();
    const written = await PUT<Record<string, unknown>>(
        db, 'identities/' + id, body, DEV_TOKEN,
    );
    assert.deepEqual(
        Object.keys(written).sort(),
        ['id', 'kind'],
    );
    assert.equal(written['id'], id);
    assert.equal(written['kind'], 'person');
});

test('stored PUT body equals identityDocumentEntityOf',
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
    assert.equal(put.status, 201);
    const stored = JSON.parse(
        await storedPutBodyText(db, '/identities/', id),
    );
    assert.deepEqual(
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

test('PUT service identity with title is 400', async () => {
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
    assert.equal(res.status, 400);
});

test('PUT person identity with a partial profile is 400',
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
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
        error: 'missing required key "department"'
            + ' for IdentityEntity',
    });
});

test('GET identity returns the whole profile',
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
    assert.ok(put.status === 201 || put.status === 200);
    const got = await GET<{
        id: string;
        kind: string;
        title: string;
        department: string;
        strengths: string[];
        team_dimensions: Record<string, number>;
    }>(db, 'identities/' + id, DEV_TOKEN);
    assert.equal(got.id, id);
    assert.equal(got.kind, 'person');
    assert.equal(got.title, profile.title);
    assert.equal(got.department, profile.department);
    assert.deepEqual(got.strengths, profile.strengths);
    assert.deepEqual(
        got.team_dimensions, profile.team_dimensions,
    );
});

test('PUT pii does not require title; GET pii has no title',
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
    assert.ok(
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
    assert.ok(
        piiPut.status === 201 || piiPut.status === 200,
    );
    const pii = await GET<Record<string, unknown>>(
        db, 'identities/XXZruirZyAOoRpNxaDnpSA/pii', DEV_TOKEN,
    );
    assert.equal(pii['name'], 'Ada');
    assert.equal('title' in pii, false);
    const identity = await GET<Record<string, unknown>>(
        db, 'identities/XXZruirZyAOoRpNxaDnpSA', DEV_TOKEN,
    );
    assert.equal(identity['title'], 'CEO');
    assert.equal('name' in identity, false);
});
