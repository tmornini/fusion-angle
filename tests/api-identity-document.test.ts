import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PUT } from '../api/api.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { ValidationError } from '../api/types.ts';
import { EntityNotFoundError } from '../api/db.ts';
import {
    validateIdentityDocumentBody,
    validateIdentityEntity,
} from '../api/validators.ts';
import { postIdentityDocumentOp } from '../api/routes.ts';
import {
    formWritePair,
    appendMessagePair,
} from '../api/message-pair.ts';
import {
    documentFamilyWiring,
    documentGetHandler,
} from '../api/document-family.ts';

// Phase 10 Task 4 (twelfth registered family, joining
// MEMBERS_WIRING's shared-log-with-genesis 'stateless' bucket):
// PUT /identities/:id takes the entity's OWN field only ({kind}),
// no lifecycle trio — the shared identity id already receives a
// genesis states event at create and archive/reactivate via PUT
// states/:id, so a document-address trio would FREEZE that
// lifecycle at genesis forever. Global plane
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

test('postIdentityDocumentOp writes exactly the identities row'
+ ' and the pair', async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    const body = identityFields();
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/identities/id-doc-op-1',
        routePattern: 'identities/:id',
        routeSegments: ['identities', ':id'],
        pathSegments: ['identities', 'id-doc-op-1'],
        headerFields: [], body,
        requesterIdentityId: 'current',
        requestAt: '2026-01-01T00:00:00.000000Z',
        organization: undefined,
        responseStatus: 200, responseBody: undefined,
        headPairId: undefined,
    });
    await postIdentityDocumentOp(
        db, 'id-doc-op-1', body, 'current', pair,
    );
    const row = await db.identities.getById('id-doc-op-1');
    assert.deepEqual(row, { id: 'id-doc-op-1', ...body });
    assert.equal((await db.requests.getAll()).length, 1);
    assert.equal((await db.responses.getAll()).length, 1);
});

// -- 3. byte-identical resend (the E6 fast-path sibling pin) --

test('a byte-identical PUT resend to identities/:id converges'
+ ' to one stored request/response pair', async () => {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    const body = identityFields();
    const first = await PUT(
        db, 'identities/id-resend-1', body, DEV_TOKEN,
    );
    const second = await PUT(
        db, 'identities/id-resend-1', body, DEV_TOKEN,
    );
    assert.deepEqual(first, second);
    assert.equal((await db.requests.getAll()).length, 1);
    assert.equal((await db.responses.getAll()).length, 1);
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

async function putDocumentPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
    requestAt: string,
    headPairId?: string,
): Promise<string> {
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/identities/' + id,
        routePattern: 'identities/:id',
        routeSegments: ['identities', ':id'],
        pathSegments: ['identities', id],
        headerFields: [], body,
        requesterIdentityId: 'current',
        requestAt,
        organization: undefined,
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
        pathname: '/identities/' + id,
        routePattern: 'identities/:id',
        routeSegments: ['identities', ':id'],
        pathSegments: ['identities', id],
        headerFields: [], body: {},
        requesterIdentityId: 'current',
        requestAt,
        organization: undefined,
        responseStatus: 204, responseBody: undefined,
        headPairId,
    });
    await db.transaction(
        ['requests', 'responses'],
        (view) => appendMessagePair(view, pair),
    );
}

test('a PUT chain Supersedes-chains and the head derives the'
+ ' LATEST body, through the generic document handlers'
+ ' (identities)', async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    const wiring = documentFamilyWiring('identities')!;
    const first = identityFields();
    const firstId = await putDocumentPair(
        db, 'identities-chain-1', first,
        '2026-02-01T00:00:00.000000Z',
    );
    const headAfterFirst = await documentGetHandler(wiring)(
        db, ['identities-chain-1'], 'current', 'ignored',
    );
    assert.deepEqual(headAfterFirst, {
        id: 'identities-chain-1', ...first,
    });

    const second = { kind: 'service' as const };
    const secondId = await putDocumentPair(
        db, 'identities-chain-1', second,
        '2026-02-02T00:00:00.000000Z', firstId,
    );
    const secondResponse = await db.responses.getById(secondId);
    assert.equal(secondResponse.supersedes, firstId);

    const headAfterSecond = await documentGetHandler(wiring)(
        db, ['identities-chain-1'], 'current', 'ignored',
    );
    assert.deepEqual(headAfterSecond, {
        id: 'identities-chain-1', ...second,
    });
});

test('a DELETE-head derives absent through the generic document'
+ ' handlers, carrying notFoundTable (identities)', async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    const wiring = documentFamilyWiring('identities')!;
    await putDocumentPair(
        db, 'identities-del-1', identityFields(),
        '2026-02-01T00:00:00.000000Z',
    );
    await deleteDocumentPair(
        db, 'identities-del-1', '2026-02-02T00:00:00.000000Z',
    );
    await assert.rejects(
        documentGetHandler(wiring)(
            db, ['identities-del-1'], 'current', 'ignored',
        ),
        (error: unknown) => {
            assert.ok(error instanceof EntityNotFoundError);
            assert.equal(
                (error as EntityNotFoundError).table,
                'identities',
            );
            assert.equal(
                (error as EntityNotFoundError).message,
                'Not found: identities/identities-del-1',
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
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    const body = identityFields();
    const written = await PUT<Record<string, unknown>>(
        db, 'identities/id-resp-1', body, DEV_TOKEN,
    );
    assert.deepEqual(
        Object.keys(written).sort(),
        ['id', 'kind'],
    );
    assert.equal(written['id'], 'id-resp-1');
    assert.equal(written['kind'], 'person');
});
