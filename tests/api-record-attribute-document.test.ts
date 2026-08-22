import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PUT } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { MESSAGE_TABLES } from '../api/db.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { ValidationError } from '../api/types.ts';
import {
    validateRecordAttributeDocumentBody,
} from '../api/validators.ts';
import { postRecordAttributeDocumentOp } from '../api/routes.ts';
import {
    formWritePair,
    appendMessagePair,
} from '../api/message-pair.ts';
import {
    ATTRIBUTE_DETAIL_PATTERN,
    RECORD_TYPE_DETAIL_PATTERN,
} from '../api/family-registry.ts';
import {
    deriveDocumentsAt,
} from '../api/derive-documents.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const RECORD_ID = generateIdentifier();
const ATTRIBUTE_ID = generateIdentifier();

// Phase 6 Task 3 (sixth family, 'stateless' evidence #2): PUT
// /record-attributes/:id takes the entity's OWN fields only —
// no lifecycle trio, mirroring work-orders' own evidence (Phase
// 5 Task 2) but STRONGER: no RecordAttributeState alphabet
// exists anywhere in types.ts, and no call site posts a states
// event keyed to an attribute id (grep-proven at research) —
// record attributes carry ZERO lifecycle events BY
// CONSTRUCTION, not merely in practice.

function documentFields() {
    return {
        record_id: RECORD_ID,
        name: 'Priority',
        attribute_type: 'text',
        sort_order: 1,
        options: [],
        constraints: [],
    };
}

// -- 1. validateRecordAttributeDocumentBody -----------------

test('validateRecordAttributeDocumentBody accepts the entity'
+ ' fields plus an optional organization_id and stamps ACL'
+ ' defaults', () => {
    const doc = validateRecordAttributeDocumentBody({
        ...documentFields(),
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    });
    assert.deepEqual(doc.entity, {
        ...documentFields(),
        read_roles: ['member', 'admin'],
        write_roles: ['member', 'admin'],
    });
});

test('validateRecordAttributeDocumentBody accepts the entity'
+ ' fields with organization_id absent and stamps ACL'
+ ' defaults', () => {
    const doc = validateRecordAttributeDocumentBody(
        documentFields(),
    );
    assert.deepEqual(doc.entity, {
        ...documentFields(),
        read_roles: ['member', 'admin'],
        write_roles: ['member', 'admin'],
    });
});

test('validateRecordAttributeDocumentBody rejects a trio key'
+ ' at the gate (no lifecycle concept exists to admit one)',
() => {
    assert.throws(
        () => validateRecordAttributeDocumentBody({
            ...documentFields(),
            state: 'active',
        }),
        ValidationError,
    );
    assert.throws(
        () => validateRecordAttributeDocumentBody({
            ...documentFields(),
            state_at: '2026-01-01T00:00:00.000000Z',
        }),
        ValidationError,
    );
    assert.throws(
        () => validateRecordAttributeDocumentBody({
            ...documentFields(),
            state_event_id: 'ev-1',
        }),
        ValidationError,
    );
});

test('validateRecordAttributeDocumentBody rejects an'
+ ' options-less select attribute (the shared'
+ ' constraint/options rule carries over intact)', () => {
    assert.throws(
        () => validateRecordAttributeDocumentBody({
            ...documentFields(),
            attribute_type: 'select',
            options: [],
        }),
        ValidationError,
    );
});

// -- 2. postRecordAttributeDocumentOp (below-gate,
// MemoryDbAdapter) -------------------------------------------

test('postRecordAttributeDocumentOp writes exactly the'
+ ' record_attributes row and the pair', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const body = {
        ...documentFields(),
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    };
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + RECORD_ID + '/attributes/' + ATTRIBUTE_ID,
        routePattern: ATTRIBUTE_DETAIL_PATTERN,
        routeSegments: ATTRIBUTE_DETAIL_PATTERN.split('/'),
        pathSegments: [
            'organizations', 'AjdvjuECVZEgZoFajaIEkg',
            'record-types', RECORD_ID, 'attributes',
            ATTRIBUTE_ID,
        ],
        headerFields: [], body,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: '2026-01-01T00:00:00.000000Z',
        organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseStatus: 200, responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    // Phase Final Task 2: record_attributes ROW half stripped
    // — pair plane + op return are the oracles.
    const written = await postRecordAttributeDocumentOp(
        db, ATTRIBUTE_ID, body, 'XXZruirZyAOoRpNxaDnpSA',
        pair,
    );
    assert.deepEqual(written, {
        id: ATTRIBUTE_ID,
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        ...documentFields(),
        read_roles: ['member', 'admin'],
        write_roles: ['member', 'admin'],
    });
    // Phase Final Stage B: record_attributes table retired.
    assert.equal((await db.pairs.getAll()).length, 1);
    assert.equal((await db.pairs.getAll()).length, 1);
});

// -- 3. byte-identical resend (the shadow-ledger pin's sibling
// at the op level — see tests/api-work-order-document.test.ts's
// own resend case: the fast path lives at the gate (api.ts),
// agnostic to which op serves the route, so this pin holds
// unchanged straight through the absorption). ------------------

test('a byte-identical PUT resend to nested attributes/:id'
+ ' converges to one stored request/response pair',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    // Parent type must exist for nested attribute PUT.
    await PUT(db
        , 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + RECORD_ID, {
        name: 'Fixture', description: '', position: 1,
        state: 'active',
    }, DEV_TOKEN);
    const body = {
        name: 'Priority',
        attribute_type: 'text',
        sort_order: 1,
        options: [],
        constraints: [],
    };
    const opHeaders: readonly (readonly [string, string])[] =
        [['operation-id', TEST_OPERATION_ID]];
    const first = await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + RECORD_ID + '/attributes/rTiMgnMtYSIDYKegGxixMA',
        body, DEV_TOKEN,
        opHeaders,
    );
    const second = await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + RECORD_ID + '/attributes/rTiMgnMtYSIDYKegGxixMA',
        body, DEV_TOKEN,
        opHeaders,
    );
    assert.deepEqual(first, second);
    // seedAdminSchema + parent type + 2 attribute PUTs
    assert.equal((await db.pairs.getAll()).length, 4);
    assert.equal((await db.pairs.getAll()).length, 4);
});

// -- 4. the DELETE-head derives absent — below-route via the
// generic handlers (document-family.test.ts's own "stateless
// lifecycle" pattern, against the REAL registered wiring row
// rather than a synthetic stand-in: documentFamilyWiring
// returns undefined until RECORD_ATTRIBUTES_WIRING registers,
// so this case stays red until that commit lands). ------------

async function putDocumentPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    // Nested storage under type (Task 8); type id from
    // body.record_id.
    const typeId = body['record_id'] as string;
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + typeId + '/attributes/' + id,
        routePattern:
            'organizations/:organization-id/record-types/'
            + ':record-type-id/attributes/:attribute-id',
        routeSegments: [
            'organizations', ':organization-id',
            'record-types', ':record-type-id',
            'attributes', ':attribute-id',
        ],
        pathSegments: [
            'organizations', 'AjdvjuECVZEgZoFajaIEkg',
            'record-types', typeId,
            'attributes', id,
        ],
        headerFields: [], body,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: '2026-01-01T00:00:00.000000Z',
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
    typeId: string,
): Promise<void> {
    const pair = await formWritePair({
        method: 'DELETE',
        pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + typeId + '/attributes/' + id,
        routePattern:
            'organizations/:organization-id/record-types/'
            + ':record-type-id/attributes/:attribute-id',
        routeSegments: [
            'organizations', ':organization-id',
            'record-types', ':record-type-id',
            'attributes', ':attribute-id',
        ],
        pathSegments: [
            'organizations', 'AjdvjuECVZEgZoFajaIEkg',
            'record-types', typeId,
            'attributes', id,
        ],
        headerFields: [], body: {},
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: '2026-01-02T00:00:00.000000Z',
        organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseStatus: 200, responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        MESSAGE_TABLES,
        (view) => appendMessagePair(view, pair),
    );
}

test('a DELETE-head derives absent on the nested attributes'
+ ' prefix (Task 8 storage)', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const typeId = documentFields().record_id;
    const deletedId = generateIdentifier();
    await putDocumentPair(db, deletedId, documentFields());
    await deleteDocumentPair(db, deletedId, typeId);
    const prefix = '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
        + typeId + '/attributes/';
    const [requests, responses] = await Promise.all([
        db.pairs.getAllWhere('uri_collection', prefix),
        db.pairs.getAllWhere('uri_collection', prefix),
    ]);
    const head = deriveDocumentsAt(requests, prefix).get(
        deletedId,
    );
    assert.equal(
        head, undefined,
        'DELETE head must exclude the attribute',
    );
});
