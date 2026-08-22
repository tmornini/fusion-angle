import { test } from 'node:test';
import { strict as assert } from 'node:assert';
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
import {
    EntityNotFoundError,
    MESSAGE_TABLES,
} from '../api/db.ts';
import {
    validateObjectiveDocumentBody,
} from '../api/validators.ts';
import { postObjectiveDocumentOp } from '../api/routes.ts';
import {
    formWritePair,
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

const BASE = 'http://localhost';

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

test('validateObjectiveDocumentBody accepts the entity field'
+ ' plus the lifecycle trio and an optional organization_id',
() => {
    const doc = validateObjectiveDocumentBody({
        ...documentFields(),
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    });
    assert.deepEqual(doc.entity, entityFields());
    assert.equal(doc.state, 'active');
    assert.equal('state_at' in doc, false);
});

test('validateObjectiveDocumentBody accepts the entity field'
+ ' plus state with organization_id absent', () => {
    const doc = validateObjectiveDocumentBody(
        documentFields(),
    );
    assert.deepEqual(doc.entity, entityFields());
    assert.equal(doc.state, 'active');
    assert.equal('state_at' in doc, false);
});

test('validateObjectiveDocumentBody rejects a stray key with'
+ ' the byte-exact, label-mandated message ("for Objective",'
+ ' matching today\'s store validator, not the *DocumentBody'
+ ' convention)', () => {
    assert.throws(
        () => validateObjectiveDocumentBody({
            ...documentFields(),
            bogus: 'x',
        }),
        {
            message: 'unexpected key "bogus" for Objective',
        },
    );
});

test('validateObjectiveDocumentBody rejects a missing'
+ ' position with the byte-exact message, identical on both'
+ ' the store-validator path and this one', () => {
    assert.throws(
        () => validateObjectiveDocumentBody({}),
        {
            message:
                'missing required key "position" for Objective',
        },
    );
});

test('validateObjectiveDocumentBody rejects a body missing'
+ ' the lifecycle trio', () => {
    assert.throws(
        () => validateObjectiveDocumentBody(entityFields()),
        ValidationError,
    );
});

test('validateObjectiveDocumentBody rejects a state outside'
+ ' the objective alphabet', () => {
    assert.throws(
        () => validateObjectiveDocumentBody(
            documentFields(3, 'deleted'),
        ),
        ValidationError,
    );
});

// -- 1b. PUT organizations/:id/objectives/:id wire trio
// ------------------------

test('PUT organizations/:id/objectives/:id accepts state and'
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
    assert.equal(res.status, 201);
    const wire = await res.json() as Record<string, unknown>;
    assert.equal(wire.id, 'pSZRYqLDXMzjAeMTNhjdng');
    assert.equal(wire.organization_id, 'AjdvjuECVZEgZoFajaIEkg');
    assert.equal(wire.position, 7);
    assert.equal(wire.state, 'active');
    assert.equal('state_at' in wire, false);
    assert.equal('state_event_id' in wire, false);
});

test('PUT organizations/:id/objectives/:id without the trio is 400',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'pSrXXWazOYSiAhkQARWgfw', token,
        { position: 1 },
    ));
    assert.equal(res.status, 400);
});

test('PUT organizations/:id/objectives/:id rejects a state outside the'
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
    assert.equal(res.status, 400);
});

// -- 2. postObjectiveDocumentOp (below-gate, MemoryDbAdapter) -

test('postObjectiveDocumentOp writes exactly the pair and'
+ ' reconstructs the entity return (row half stripped)',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const body = {
        ...documentFields(),
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    };
    const pair = await formWritePair({
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
        db, 'pPvOknZUChYizyOOiXWBVg', body, 'XXZruirZyAOoRpNxaDnpSA', pair,
    );
    assert.deepEqual(written, {
        id: 'pPvOknZUChYizyOOiXWBVg',
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        ...entityFields(),
    });
    // Phase Final Stage B: objectives table retired.
    assert.equal((await db.pairs.getAll()).length, 1);
    assert.equal((await db.pairs.getAll()).length, 1);
});

// -- 3. byte-identical resend (the shadow-ledger pin's sibling
// at the op level — see tests/api-record-attribute-document
// .test.ts's own resend case: the fast path lives at the gate
// (api.ts), agnostic to which op serves the route). ----------

test('a byte-identical PUT resend to'
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
    assert.deepEqual(first, second);
    assert.equal((await db.pairs.getAll()).length, 3);
    assert.equal((await db.pairs.getAll()).length, 3);
});

// -- 4. below-route via the generic handlers, against the REAL
// registered wiring row (the Phase 4 idiom document-family
// .test.ts's own "stateless lifecycle" section names): a PUT
// chain Supersedes-chains and the head derives; a DELETE head
// derives absent, carrying notFoundTable, never the family. --

async function putDocumentPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
    at: string,
): Promise<void> {
    const pair = await formWritePair({
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
        (view) => appendMessagePair(view, pair),
    );
}

async function deleteDocumentPair(
    db: MemoryDbAdapter,
    id: string,
    at: string,
): Promise<void> {
    const pair = await formWritePair({
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
        (view) => appendMessagePair(view, pair),
    );
}

test('a PUT chain at one objective address Supersedes-chains,'
+ ' and documentGetHandler derives the LATEST head',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const id = generateIdentifier();
    await putDocumentPair(
        db, id,
        documentFields(1, 'active'),
        '2026-01-01T00:00:00.000000Z',
    );
    await putDocumentPair(
        db, id,
        documentFields(2, 'active'),
        '2026-01-02T00:00:00.000000Z',
    );
    const wiring = documentFamilyWiring('objectives')!;
    const got = await documentGetHandler(wiring)(
        db, ['AjdvjuECVZEgZoFajaIEkg', id]
            , 'XXZruirZyAOoRpNxaDnpSA', 'AjdvjuECVZEgZoFajaIEkg',
    );
    assert.deepEqual(got, {
        id,
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        position: 2,
        state: 'active',
    });
});

test('a DELETE-head derives absent through the generic'
+ ' document handlers, carrying notFoundTable, never the'
+ ' family', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const id = generateIdentifier();
    await putDocumentPair(
        db, id,
        documentFields(1, 'active'),
        '2026-01-01T00:00:00.000000Z',
    );
    await deleteDocumentPair(
        db, id, '2026-01-02T00:00:00.000000Z',
    );
    const wiring = documentFamilyWiring('objectives')!;
    await assert.rejects(
        documentGetHandler(wiring)(
            db, ['AjdvjuECVZEgZoFajaIEkg', id]
                , 'XXZruirZyAOoRpNxaDnpSA', 'AjdvjuECVZEgZoFajaIEkg',
        ),
        (error: unknown) => {
            assert.ok(error instanceof EntityNotFoundError);
            assert.equal(
                (error as EntityNotFoundError).table,
                'objectives',
            );
            return true;
        },
    );
});

test('stored PUT body equals objectiveDocumentEntityOf of'
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
    assert.equal(put.status, 201);
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
    assert.deepEqual(stored, expected);
    const wiring = documentFamilyWiring('objectives')!;
    const derived = await documentGetHandler(wiring)(
        db, ['AjdvjuECVZEgZoFajaIEkg', id], 'XXZruirZyAOoRpNxaDnpSA'
            , 'AjdvjuECVZEgZoFajaIEkg',
    );
    assert.deepEqual(stored, derived);
    const later = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + id
            , token,
        documentFields(99, 'archived'),
    ));
    assert.equal(later.status, 201);
    const after = JSON.parse(
        await storedPutBodyText(db, prefix, id),
    );
    assert.deepEqual(
        after,
        await documentGetHandler(wiring)(
            db, ['AjdvjuECVZEgZoFajaIEkg', id], 'XXZruirZyAOoRpNxaDnpSA'
                , 'AjdvjuECVZEgZoFajaIEkg',
        ),
    );
    assert.equal(after.state, 'archived');
    assert.equal(after.position, 99);
    assert.equal('state_at' in after, false);
});
