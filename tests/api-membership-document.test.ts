import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PUT } from '../api/api.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { ValidationError } from '../api/types.ts';
import { EntityNotFoundError } from '../api/db.ts';
import {
    validateMembershipDocumentBody,
    validateMembershipEntity,
} from '../api/validators.ts';
import { postMembershipDocumentOp } from '../api/routes.ts';
import {
    formWritePair,
    appendMessagePair,
} from '../api/message-pair.ts';
import {
    documentFamilyWiring,
    documentGetHandler,
} from '../api/document-family.ts';

// Phase 8 Task 2 (eighth family, 'stateless'): PUT
// /memberships/:id takes the entity's OWN fields only — no
// lifecycle trio, and no lifecycle concept exists for a
// membership row AT ALL (a pure join relation — the
// record-attributes precedent's actual sibling, not
// work-orders'/objectives' own distinct 'stateless'
// rationales). UNLIKE work-orders/record-attributes/objectives,
// every entity field (INCLUDING organization_id) is REQUIRED on
// the wire — memberships' PUT body carries its own
// organization_id today, never a fence-stamped omission.

function documentFields() {
    return {
        organization_id: '1',
        identity_id: 'sarah',
        at: '2026-01-01T00:00:00.000000Z',
    };
}

// -- 1. validateMembershipDocumentBody -----------------------

test('validateMembershipDocumentBody accepts the exact'
+ ' three-key body', () => {
    const doc = validateMembershipDocumentBody(documentFields());
    assert.deepEqual(doc.entity, documentFields());
});

test('validateMembershipDocumentBody rejects a stray key with'
+ ' the byte-identical message validateMembershipEntity'
+ ' produces for the SAME violation (the label mandate)', () => {
    const body = { ...documentFields(), bogus: 'nope' };
    let documentMessage: string | undefined;
    let entityMessage: string | undefined;
    try {
        validateMembershipDocumentBody(body);
    } catch (e) {
        assert.ok(e instanceof ValidationError);
        documentMessage = (e as ValidationError).message;
    }
    try {
        validateMembershipEntity(body);
    } catch (e) {
        assert.ok(e instanceof ValidationError);
        entityMessage = (e as ValidationError).message;
    }
    assert.equal(
        documentMessage,
        'unexpected key "bogus" for MembershipEntity',
    );
    assert.equal(documentMessage, entityMessage);
});

test('validateMembershipDocumentBody rejects each missing key,'
+ ' byte-identical to validateMembershipEntity on both paths',
() => {
    for (const key of ['organization_id', 'identity_id', 'at']) {
        const body = { ...documentFields() };
        delete (body as Record<string, unknown>)[key];
        let documentMessage: string | undefined;
        let entityMessage: string | undefined;
        try {
            validateMembershipDocumentBody(body);
        } catch (e) {
            assert.ok(e instanceof ValidationError);
            documentMessage = (e as ValidationError).message;
        }
        try {
            validateMembershipEntity(body);
        } catch (e) {
            assert.ok(e instanceof ValidationError);
            entityMessage = (e as ValidationError).message;
        }
        assert.equal(
            documentMessage,
            'missing required key "' + key
                + '" for MembershipEntity',
        );
        assert.equal(documentMessage, entityMessage);
    }
});

// -- 2. postMembershipDocumentOp (below-gate, MemoryDbAdapter) --

test('postMembershipDocumentOp writes exactly the pair and'
+ ' reconstructs the entity return (row half stripped)',
async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    const body = documentFields();
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/memberships/ms-doc-op-1',
        routePattern: 'memberships/:id',
        routeSegments: ['memberships', ':id'],
        pathSegments: ['memberships', 'ms-doc-op-1'],
        headerFields: [], body,
        requesterIdentityId: 'current',
        requestAt: '2026-01-01T00:00:00.000000Z',
        organization: '1',
        responseStatus: 200, responseBody: undefined,
        headPairId: undefined,
    });
    // Phase Final Task 2: memberships ROW half stripped —
    // op returns the reconstructed entity; only pairs land.
    const written = await postMembershipDocumentOp(
        db, 'ms-doc-op-1', body, 'current', pair,
    );
    assert.deepEqual(written, documentFields());
    // Phase Final Stage B: roster tables retired.
    assert.equal((await db.requests.getAll()).length, 1);
    assert.equal((await db.responses.getAll()).length, 1);
});

// -- 3. byte-identical resend (the E6 fast-path sibling pin) --

test('a byte-identical PUT resend to memberships/:id converges'
+ ' to one stored request/response pair', async () => {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    const body = documentFields();
    const first = await PUT(
        db, 'memberships/ms-resend-1', body, DEV_TOKEN,
    );
    const second = await PUT(
        db, 'memberships/ms-resend-1', body, DEV_TOKEN,
    );
    assert.deepEqual(first, second);
    assert.equal((await db.requests.getAll()).length, 4);
    assert.equal((await db.responses.getAll()).length, 4);
});

// -- 4. below-route via the generic handlers (the drift-file
// mirror idiom, against the REAL registered wiring row rather
// than a synthetic stand-in — documentFamilyWiring returns
// undefined until MEMBERSHIPS_WIRING registers, so this case
// stays red until that commit lands): a PUT chain Supersedes-
// chains and the head derives the LATEST body; a DELETE head
// derives to absence. No states event is ever posted in this
// test — the stateless arm's ONLY tombstone signal is the
// DELETE-method head itself (derive-documents.ts), so a clean
// pass here is itself proof no lifecycle walk ever runs for
// this family. --------------------------------------------------

async function putDocumentPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
    requestAt: string,
    headPairId?: string,
): Promise<string> {
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/memberships/' + id,
        routePattern: 'memberships/:id',
        routeSegments: ['memberships', ':id'],
        pathSegments: ['memberships', id],
        headerFields: [], body,
        requesterIdentityId: 'current',
        requestAt,
        organization: '1',
        responseStatus: 200, responseBody: undefined,
        headPairId,
    });
    await db.transaction(
        ['requests', 'responses'],
        (view) => appendMessagePair(view, pair),
    );
    return pair.id;
}

async function deleteDocumentPair(
    db: MemoryDbAdapter,
    id: string,
    requestAt: string,
    headPairId?: string,
): Promise<void> {
    const pair = await formWritePair({
        method: 'DELETE',
        pathname: '/memberships/' + id,
        routePattern: 'memberships/:id',
        routeSegments: ['memberships', ':id'],
        pathSegments: ['memberships', id],
        headerFields: [], body: {},
        requesterIdentityId: 'current',
        requestAt,
        organization: '1',
        responseStatus: 204, responseBody: undefined,
        headPairId,
    });
    await db.transaction(
        ['requests', 'responses'],
        (view) => appendMessagePair(view, pair),
    );
}

test('a PUT chain Supersedes-chains and the head derives the'
+ ' LATEST body, through the generic document handlers',
async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    const wiring = documentFamilyWiring('memberships')!;
    const first = documentFields();
    const firstId = await putDocumentPair(
        db, 'ms-chain-1', first,
        '2026-02-01T00:00:00.000000Z',
    );
    const headAfterFirst = await documentGetHandler(wiring)(
        db, ['ms-chain-1'], 'current', '1',
    );
    assert.deepEqual(headAfterFirst, {
        id: 'ms-chain-1', ...first,
    });

    const second = {
        ...first, at: '2026-02-02T00:00:00.000000Z',
    };
    const secondId = await putDocumentPair(
        db, 'ms-chain-1', second,
        '2026-02-02T00:00:00.000000Z', firstId,
    );
    const secondResponse =
        await db.responses.getById(secondId);
    assert.equal(secondResponse.supersedes, firstId);

    const headAfterSecond = await documentGetHandler(wiring)(
        db, ['ms-chain-1'], 'current', '1',
    );
    assert.deepEqual(headAfterSecond, {
        id: 'ms-chain-1', ...second,
    });
});

test('a DELETE-head derives absent through the generic'
+ ' document handlers, carrying notFoundTable (never the'
+ ' entity-store table name coincidence)', async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    const wiring = documentFamilyWiring('memberships')!;
    await putDocumentPair(
        db, 'ms-del-1', documentFields(),
        '2026-02-01T00:00:00.000000Z',
    );
    await deleteDocumentPair(
        db, 'ms-del-1', '2026-02-02T00:00:00.000000Z',
    );
    await assert.rejects(
        documentGetHandler(wiring)(
            db, ['ms-del-1'], 'current', '1',
        ),
        (error: unknown) => {
            assert.ok(error instanceof EntityNotFoundError);
            assert.equal(
                (error as EntityNotFoundError).table,
                'memberships',
            );
            assert.equal(
                (error as EntityNotFoundError).message,
                'Not found: memberships/ms-del-1',
            );
            return true;
        },
    );
});
