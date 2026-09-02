import {
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import { PUT, handleRequest } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    DEV_TOKEN,
    organizationToken,
} from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { ValidationError } from '../api/types.ts';
import type { ObjectiveEntity } from '../api/types.ts';
import {
    EntityNotFoundError,
    MESSAGE_TABLES,
} from '../api/db.ts';
import {
    validateObjectiveDocumentBody,
} from '../api/validators.ts';
import { postObjectiveDocumentOp } from '../api/routes.ts';
import {
    formWriteMessagePair,
    appendMessagePair,
} from '../api/message-pair.ts';
import {
    documentFamilyWiring,
    documentGetHandler,
} from '../api/document-family.ts';
import {
    apiRequest, TEST_OPERATION_ID,
    storedPutBodyText,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Objectives are the FIFTH lifecycle-trio family (states-
// address retirement): PUT
// /organizations/:id/objectives/:id carries the entity's
// own field ({position}) PLUS the lifecycle trio
// (state/state_at/state_event_id), exactly as ideas,
// projects, records, and flows do. The absence-as-active
// covenant (R2) and the genesis dilemma are RETIRED —
// every objective now has an explicit genesis event
// minted at create, and archive/reactivate ride this SAME
// document address. The states/:id event-append path for
// objectives is dead.

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

function entityFields(position = 3) {
    return { position };
}

function documentFields(
    position = 3,
    state = 'active',
) {
    return {
        ...entityFields(position),
        state,
    };
}

// -- 1. validateObjectiveDocumentBody ------------------------

Deno.test('validateObjectiveDocumentBody accepts the entity field'
+ ' plus the lifecycle trio and an optional organization_id',
() => {
    const doc = validateObjectiveDocumentBody({
        ...documentFields(),
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    });
    assertEquals(doc.entity, entityFields());
    assertStrictEquals(doc.state, 'active');
    assertStrictEquals('state_at' in doc, false);
});

Deno.test('validateObjectiveDocumentBody accepts the entity field'
+ ' plus state with organization_id absent', () => {
    const doc = validateObjectiveDocumentBody(
        documentFields(),
    );
    assertEquals(doc.entity, entityFields());
    assertStrictEquals(doc.state, 'active');
    assertStrictEquals('state_at' in doc, false);
});

Deno.test('validateObjectiveDocumentBody rejects a stray key with'
+ ' the byte-exact, label-mandated message ("for Objective",'
+ ' matching today\'s store validator, not the *DocumentBody'
+ ' convention)', () => {
    const err = assertThrows(
        () => validateObjectiveDocumentBody({
            ...documentFields(),
            bogus: 'x',
        }),
    ) as Error;
    assertStrictEquals(
        err.message, 'unexpected key "bogus" for Objective',
    );
});

Deno.test('validateObjectiveDocumentBody rejects a missing'
+ ' position with the byte-exact message, identical on both'
+ ' the store-validator path and this one', () => {
    const err = assertThrows(
        () => validateObjectiveDocumentBody({}),
    ) as Error;
    assertStrictEquals(
        err.message,
        'missing required key "position" for Objective',
    );
});

Deno.test('validateObjectiveDocumentBody rejects a body missing'
+ ' the lifecycle trio', () => {
    assertThrows(
        () => validateObjectiveDocumentBody(entityFields()),
        ValidationError,
    );
});

Deno.test('validateObjectiveDocumentBody rejects a state outside'
+ ' the objective alphabet', () => {
    assertThrows(
        () => validateObjectiveDocumentBody(
            documentFields(3, 'deleted'),
        ),
        ValidationError,
    );
});

// -- 1b. PUT organizations/:id/objectives/:id wire trio
// ------------------------

Deno.test('PUT organizations/:id/objectives/:id accepts state and'
+ ' echoes the entity fields', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'pSZRYqLDXMzjAeMTNhjdng', token, {
            position: 7,
            state: 'active',
        },
    ));
    assertStrictEquals(res.status, 201);
    const wire = await res.json() as Record<string, unknown>;
    assertStrictEquals(wire.id, 'pSZRYqLDXMzjAeMTNhjdng');
    assertStrictEquals(wire.organization_id, 'AjdvjuECVZEgZoFajaIEkg');
    assertStrictEquals(wire.position, 7);
    assertStrictEquals(wire.state, 'active');
    assertStrictEquals('state_at' in wire, false);
    assertStrictEquals('state_event_id' in wire, false);
});

Deno.test('PUT organizations/:id/objectives/:id without the trio is 400',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'pSrXXWazOYSiAhkQARWgfw', token,
        { position: 1 },
    ));
    assertStrictEquals(res.status, 400);
});

Deno.test('PUT organizations/:id/objectives/:id rejects a state outside the'
+ ' objective alphabet', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'pVfejvZpqZyysULfKUqYrA', token, {
            position: 1,
            state: 'deleted',
        },
    ));
    assertStrictEquals(res.status, 400);
});

// -- 2. postObjectiveDocumentOp (below-gate, MemoryDbAdapter) -

Deno.test('postObjectiveDocumentOp writes exactly the pair and'
+ ' reconstructs the entity return (row half stripped)',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const body = {
        ...documentFields(),
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    };
    const messagePair = await formWriteMessagePair({
        method: 'PUT',
        pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'pPvOknZUChYizyOOiXWBVg',
        routePattern: 'organizations/:id/objectives/:id',
        routeSegments: ['objectives', ':id'],
        pathSegments: ['objectives', 'pPvOknZUChYizyOOiXWBVg'],
        headerFields: [], body,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: '2026-01-01T00:00:00.000000Z',
        organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseStatus: 200, responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    // Phase Final Task 2: objectives ROW half stripped —
    // op returns the reconstructed entity; only pairs land.
    const written = await postObjectiveDocumentOp(
        db, 'pPvOknZUChYizyOOiXWBVg', body,
        'XXZruirZyAOoRpNxaDnpSA', messagePair,
    );
    assertEquals(written, {
        id: 'pPvOknZUChYizyOOiXWBVg',
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        ...entityFields(),
    } as ObjectiveEntity);
    // Phase Final Stage B: objectives table retired.
    assertStrictEquals((await db.messagePairs.getAll()).length, 1);
    assertStrictEquals((await db.messagePairs.getAll()).length, 1);
});

// -- 3. byte-identical resend (the shadow-ledger pin's sibling
// at the op level — see tests/api-record-attribute-document
// .test.ts's own resend case: the fast path lives at the gate
// (api.ts), agnostic to which op serves the route). ----------

Deno.test('a byte-identical PUT resend to'
    + ' organizations/:id/objectives/:id converges'
+ ' to one stored request/response pair', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const id = generateIdentifier();
    const body = documentFields();
    const first = await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + id, body, DEV_TOKEN,
    );
    const second = await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + id
            , body, DEV_TOKEN,
    );
    assertEquals(first, second);
    assertStrictEquals((await db.messagePairs.getAll()).length, 3);
    assertStrictEquals((await db.messagePairs.getAll()).length, 3);
});

// -- 4. below-route via the generic handlers, against the REAL
// registered wiring row (the Phase 4 idiom document-family
// .test.ts's own "stateless lifecycle" section names): a PUT
// chain Supersedes-chains and the head derives; a DELETE head
// derives absent, carrying notFoundTable, never the family. --

async function putDocumentMessagePair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
    at: string,
): Promise<void> {
    const messagePair = await formWriteMessagePair({
        method: 'PUT',
        pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + id,
        routePattern: 'organizations/:id/objectives/:id',
        routeSegments: ['objectives', ':id'],
        pathSegments: ['objectives', id],
        headerFields: [], body,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: at,
        organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseStatus: 200, responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        MESSAGE_TABLES,
        (view) => appendMessagePair(view, messagePair),
    );
}

async function deleteDocumentMessagePair(
    db: MemoryDbAdapter,
    id: string,
    at: string,
): Promise<void> {
    const messagePair = await formWriteMessagePair({
        method: 'DELETE',
        pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + id,
        routePattern: 'organizations/:id/objectives/:id',
        routeSegments: ['objectives', ':id'],
        pathSegments: ['objectives', id],
        headerFields: [], body: {},
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: at,
        organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseStatus: 200, responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        MESSAGE_TABLES,
        (view) => appendMessagePair(view, messagePair),
    );
}

Deno.test('a PUT chain at one objective address Supersedes-chains,'
+ ' and documentGetHandler derives the LATEST head',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const id = generateIdentifier();
    await putDocumentMessagePair(
        db, id,
        documentFields(1, 'active'),
        '2026-01-01T00:00:00.000000Z',
    );
    await putDocumentMessagePair(
        db, id,
        documentFields(2, 'active'),
        '2026-01-02T00:00:00.000000Z',
    );
    const wiring = documentFamilyWiring('objectives')!;
    const got = await documentGetHandler(wiring)(
        db, ['AjdvjuECVZEgZoFajaIEkg', id]
            , 'XXZruirZyAOoRpNxaDnpSA', 'AjdvjuECVZEgZoFajaIEkg',
        [],
    );
    assertEquals(got, {
        id,
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        position: 2,
        state: 'active',
    });
});

Deno.test('a DELETE-head derives absent through the generic'
+ ' document handlers, carrying notFoundTable, never the'
+ ' family', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const id = generateIdentifier();
    await putDocumentMessagePair(
        db, id,
        documentFields(1, 'active'),
        '2026-01-01T00:00:00.000000Z',
    );
    await deleteDocumentMessagePair(
        db, id, '2026-01-02T00:00:00.000000Z',
    );
    const wiring = documentFamilyWiring('objectives')!;
    const err = await assertRejects(
        () => documentGetHandler(wiring)(
            db, ['AjdvjuECVZEgZoFajaIEkg', id]
                , 'XXZruirZyAOoRpNxaDnpSA', 'AjdvjuECVZEgZoFajaIEkg',
            [],
        ),
    ) as EntityNotFoundError;
    assertInstanceOf(err, EntityNotFoundError);
    assertStrictEquals(err.table, 'objectives');
});

Deno.test('stored PUT body equals objectiveDocumentEntityOf of'
+ ' the same chain', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const id = generateIdentifier();
    const put = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + id
            , token,
        documentFields(3, 'active'),
    ));
    assertStrictEquals(put.status, 201);
    const prefix = '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/';
    const stored = JSON.parse(
        await storedPutBodyText(db, prefix, id),
    );
    const expected = {
        id,
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        position: 3,
        state: 'active',
    };
    assertEquals(stored, expected);
    const wiring = documentFamilyWiring('objectives')!;
    const derived = await documentGetHandler(wiring)(
        db, ['AjdvjuECVZEgZoFajaIEkg', id], 'XXZruirZyAOoRpNxaDnpSA'
            , 'AjdvjuECVZEgZoFajaIEkg',
        [],
    );
    assertEquals(stored, derived);
    const later = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + id
            , token,
        documentFields(99, 'archived'),
    ));
    assertStrictEquals(later.status, 201);
    const after: Record<string, unknown> = JSON.parse(
        await storedPutBodyText(db, prefix, id),
    );
    assertEquals(
        after,
        await documentGetHandler(wiring)(
            db, ['AjdvjuECVZEgZoFajaIEkg', id], 'XXZruirZyAOoRpNxaDnpSA'
                , 'AjdvjuECVZEgZoFajaIEkg',
            [],
        ),
    );
    assertStrictEquals(after.state, 'archived');
    assertStrictEquals(after.position, 99);
    assertStrictEquals('state_at' in after, false);
});
