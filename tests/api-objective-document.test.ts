import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PUT } from '../api/api.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { ValidationError } from '../api/types.ts';
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

// Phase 7 Task 2 (seventh family, 'stateless' evidence #3 —
// Author gate 3, the SECOND named partial amendment to
// Decision 7): PUT /objectives/:id takes the entity's OWN
// field ({position}) only — no lifecycle trio. Objectives are
// a DIFFERENT 'stateless' fork than work-orders/record-
// attributes: the trio COULD represent the objective alphabet,
// but is FORBIDDEN three ways (the wire body would have to grow
// it — a zero-delta violation; a minted genesis event would
// abort the states 911 pin at reseed; absence-as-active is R2's
// named covenant). NEVER a states event for an objective — no
// genesis, no trio, no lifecycle walk anywhere in this plane.

function documentFields() {
    return { position: 3 };
}

// -- 1. validateObjectiveDocumentBody ------------------------

test('validateObjectiveDocumentBody accepts the entity field'
+ ' plus an optional organization_id', () => {
    const doc = validateObjectiveDocumentBody({
        ...documentFields(),
        organization_id: '1',
    });
    assert.deepEqual(doc.entity, documentFields());
});

test('validateObjectiveDocumentBody accepts the entity field'
+ ' with organization_id absent', () => {
    const doc = validateObjectiveDocumentBody(documentFields());
    assert.deepEqual(doc.entity, documentFields());
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

test('validateObjectiveDocumentBody rejects a trio key at the'
+ ' gate (Author gate 3 — objectives never carry lifecycle in'
+ ' the body)', () => {
    assert.throws(
        () => validateObjectiveDocumentBody({
            ...documentFields(), state: 'active',
        }),
        ValidationError,
    );
    assert.throws(
        () => validateObjectiveDocumentBody({
            ...documentFields(),
            state_at: '2026-01-01T00:00:00.000000Z',
        }),
        ValidationError,
    );
    assert.throws(
        () => validateObjectiveDocumentBody({
            ...documentFields(), state_event_id: 'ev-1',
        }),
        ValidationError,
    );
});

// -- 2. postObjectiveDocumentOp (below-gate, MemoryDbAdapter) -

test('postObjectiveDocumentOp writes exactly the pair and'
+ ' reconstructs the entity return (row half stripped)',
async () => {
    const db = new MemoryDbAdapter();
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
        ...documentFields(),
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
    const db = new MemoryDbAdapter();
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
// chain Supersedes-chains and the head derives; no lifecycle
// walk runs (a trio-less body never throws — the stateless-arm
// proof); a DELETE head derives absent, carrying notFoundTable,
// never the family. -------------------------------------------

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
+ ' and documentGetHandler derives the LATEST head with no'
+ ' lifecycle walk (a trio-less body never throws)',
async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await putDocumentPair(
        db, 'obj-chain-1', { position: 1 },
        '2026-01-01T00:00:00.000000Z',
    );
    await putDocumentPair(
        db, 'obj-chain-1', { position: 2 },
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
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await putDocumentPair(
        db, 'obj-del-1', { position: 1 },
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
