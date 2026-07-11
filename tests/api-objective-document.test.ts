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
import { ValidationError, nowUtc } from '../api/types.ts';
import { EntityNotFoundError } from '../api/db.ts';
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

// Objectives are the FIFTH lifecycle-trio family (states-
// address retirement): PUT /objectives/:id carries the
// entity's own field ({position}) PLUS the lifecycle trio
// (state/state_at/state_event_id), exactly as ideas/projects/
// records/flows do. The absence-as-active covenant (R2) and
// the genesis dilemma are RETIRED — every objective now has
// an explicit genesis event minted at create, and archive/
// reactivate ride this SAME document address. The states/:id
// event-append path for objectives is dead.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        },
        ...(body === undefined
            ? {} : { body: JSON.stringify(body) }),
    });
}

function entityFields(position = 3) {
    return { position };
}

function documentFields(
    position = 3,
    state = 'active',
    stateAt = AT,
    stateEventId = 'ev-1',
) {
    return {
        ...entityFields(position),
        state,
        state_at: stateAt,
        state_event_id: stateEventId,
    };
}

// -- 1. validateObjectiveDocumentBody ------------------------

test('validateObjectiveDocumentBody accepts the entity field'
+ ' plus the lifecycle trio and an optional organization_id',
() => {
    const doc = validateObjectiveDocumentBody({
        ...documentFields(),
        organization_id: '1',
    });
    assert.deepEqual(doc.entity, entityFields());
    assert.equal(doc.state, 'active');
    assert.equal(doc.state_at, AT);
    assert.equal(doc.state_event_id, 'ev-1');
});

test('validateObjectiveDocumentBody accepts the entity field'
+ ' plus the trio with organization_id absent', () => {
    const doc = validateObjectiveDocumentBody(
        documentFields(),
    );
    assert.deepEqual(doc.entity, entityFields());
    assert.equal(doc.state, 'active');
    assert.equal(doc.state_at, AT);
    assert.equal(doc.state_event_id, 'ev-1');
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
            documentFields(3, 'deleted', AT, 'ev-bad'),
        ),
        ValidationError,
    );
});

// -- 1b. PUT objectives/:id wire trio ------------------------

test('PUT objectives/:id accepts the lifecycle trio and'
+ ' echoes the entity fields', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/objectives/obj-trio-1', token, {
            position: 7,
            state: 'active',
            state_at: nowUtc(),
            state_event_id: 'obj-trio-1-ev1',
        },
    ));
    assert.equal(res.status, 200);
    const wire = await res.json() as Record<string, unknown>;
    assert.equal(wire.id, 'obj-trio-1');
    assert.equal(wire.organization_id, '1');
    assert.equal(wire.position, 7);
    assert.ok(!('state' in wire));
    assert.ok(!('state_at' in wire));
    assert.ok(!('state_event_id' in wire));
});

test('PUT objectives/:id without the trio is 400',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/objectives/obj-trio-2', token,
        { position: 1 },
    ));
    assert.equal(res.status, 400);
});

test('PUT objectives/:id rejects a state outside the'
+ ' objective alphabet', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/objectives/obj-trio-3', token, {
            position: 1,
            state: 'deleted',
            state_at: nowUtc(),
            state_event_id: 'obj-trio-3-ev1',
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
        organization_id: '1',
    };
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/objectives/obj-doc-op-1',
        routePattern: 'objectives/:id',
        routeSegments: ['objectives', ':id'],
        pathSegments: ['objectives', 'obj-doc-op-1'],
        headerFields: [], body,
        requesterIdentityId: 'current',
        requestAt: '2026-01-01T00:00:00.000000Z',
        organization: '1',
        responseStatus: 200, responseBody: undefined,
        headPairId: undefined,
    });
    // Phase Final Task 2: objectives ROW half stripped —
    // op returns the reconstructed entity; only pairs land.
    const written = await postObjectiveDocumentOp(
        db, 'obj-doc-op-1', body, 'current', pair,
    );
    assert.deepEqual(written, {
        id: 'obj-doc-op-1',
        organization_id: '1',
        ...entityFields(),
    });
    // Phase Final Stage B: objectives table retired.
    assert.equal((await db.requests.getAll()).length, 1);
    assert.equal((await db.responses.getAll()).length, 1);
});

// -- 3. byte-identical resend (the shadow-ledger pin's sibling
// at the op level — see tests/api-record-attribute-document
// .test.ts's own resend case: the fast path lives at the gate
// (api.ts), agnostic to which op serves the route). ----------

test('a byte-identical PUT resend to objectives/:id converges'
+ ' to one stored request/response pair', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const body = documentFields();
    const first = await PUT(
        db, 'objectives/obj-resend-1', body, DEV_TOKEN,
    );
    const second = await PUT(
        db, 'objectives/obj-resend-1', body, DEV_TOKEN,
    );
    assert.deepEqual(first, second);
    assert.equal((await db.requests.getAll()).length, 4);
    assert.equal((await db.responses.getAll()).length, 4);
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
        pathname: '/objectives/' + id,
        routePattern: 'objectives/:id',
        routeSegments: ['objectives', ':id'],
        pathSegments: ['objectives', id],
        headerFields: [], body,
        requesterIdentityId: 'current',
        requestAt: at,
        organization: '1',
        responseStatus: 200, responseBody: undefined,
        headPairId: undefined,
    });
    await db.transaction(
        ['requests', 'responses'],
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
        pathname: '/objectives/' + id,
        routePattern: 'objectives/:id',
        routeSegments: ['objectives', ':id'],
        pathSegments: ['objectives', id],
        headerFields: [], body: {},
        requesterIdentityId: 'current',
        requestAt: at,
        organization: '1',
        responseStatus: 200, responseBody: undefined,
        headPairId: undefined,
    });
    await db.transaction(
        ['requests', 'responses'],
        (view) => appendMessagePair(view, pair),
    );
}

test('a PUT chain at one objective address Supersedes-chains,'
+ ' and documentGetHandler derives the LATEST head',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await putDocumentPair(
        db, 'obj-chain-1',
        documentFields(1, 'active', AT, 'obj-chain-1-ev1'),
        '2026-01-01T00:00:00.000000Z',
    );
    await putDocumentPair(
        db, 'obj-chain-1',
        documentFields(
            2, 'active',
            '2026-01-02T00:00:00.000000Z',
            'obj-chain-1-ev2',
        ),
        '2026-01-02T00:00:00.000000Z',
    );
    const wiring = documentFamilyWiring('objectives')!;
    const got = await documentGetHandler(wiring)(
        db, ['obj-chain-1'], 'current', '1',
    );
    assert.deepEqual(got, {
        id: 'obj-chain-1', organization_id: '1', position: 2,
    });
});

test('a DELETE-head derives absent through the generic'
+ ' document handlers, carrying notFoundTable, never the'
+ ' family', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await putDocumentPair(
        db, 'obj-del-1',
        documentFields(1, 'active', AT, 'obj-del-1-ev1'),
        '2026-01-01T00:00:00.000000Z',
    );
    await deleteDocumentPair(
        db, 'obj-del-1', '2026-01-02T00:00:00.000000Z',
    );
    const wiring = documentFamilyWiring('objectives')!;
    await assert.rejects(
        documentGetHandler(wiring)(
            db, ['obj-del-1'], 'current', '1',
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
