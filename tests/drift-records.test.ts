import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { EntityNotFoundError } from '../api/db.ts';
import type { DbAdapter } from '../api/db.ts';
import type {
    Id,
    RecordEntity,
    RecordAttributeEntity,
} from '../api/types.ts';
import { jsonArrayField, jsonObjectField, nowUtc } from
    '../api/types.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { organizationScopedAdapter } from
    '../api/db-organization-scoped.ts';
import { canonicalUriPrefix } from '../api/message-pair.ts';
import { documentPairsAt } from '../api/derive-documents.ts';
import {
    documentGetHandler,
    documentCollectionGetHandler,
    type DocumentFamilyWiring,
} from '../api/document-family.ts';
import {
    pickString,
    pickNumber,
    validateRecordDocumentBody,
    validateRecordAttributeDocumentBody,
} from '../api/validators.ts';
import {
    postRecordDocumentOp,
    postRecordAttributeDocumentOp,
} from '../api/routes.ts';
import {
    deriveFlowRecords,
    deriveFlowRecord,
} from '../api/derive-flow-records.ts';
import { deriveRecordStateHistory } from '../api/derive-records.ts';
import {
    customerProfileRecordId,
    projectBriefRecordId,
    buildRecordAttributes,
} from '../api/mock-data/records.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { l2cFlowId } from '../api/mock-data/lead-to-close-flow.ts';
import { collectAttributeReferrers } from
    '../api/record-attribute-refs.ts';
import { organizationToken } from './token-fixtures.ts';
import { parseJson } from '../shared/http-message/json-codec.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import {
    defaultBodyRegistry,
} from '../shared/http-message/media-registry.ts';

// The E10 drift check (Phase 6 Task 6): message-derived reads
// proven equal to the old-table-derived reads Task 7 flips onto
// them. NOTHING reads the pairs in production yet — this file
// alone gates that flip; it stays as a regression guard through
// Phase Final.
//
// Records is the FIRST 'trio' family whose own :id address also
// carries a live DELETE route (Author gate 9: documentLifecycle
// Events now skips a DELETE-method pair so a delete-then-
// recreate history never throws — case 10 below). The records
// deleted-filter parity therefore rides the FULL trio walk (the
// states/:id escape-hatch acceptance already recorded for ideas/
// projects/flows/work-orders applies here too, unchanged).
//
// H7: id-lex explicit sorts are IndexedDB-invisible (a native
// index scan already returns primary-key order) and memory-tier
// load-bearing (the memory/localStorage backends are arrival-
// ordered) — every list comparison below normalizes the OLD side
// to id-lex; the derived side is already id-lex by construction
// (byIdAscending, shared by every generic read path and the two
// modules this file drift-proves). The nextPosition watch-point
// named in the brief does not apply here: records carry no
// nextPosition-style gap-filling allocator.

const BASE = 'http://localhost';

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
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

function sortById<T extends { id: string }>(
    rows: readonly T[],
): T[] {
    return [...rows].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    return db;
}

// -- test-side wiring mirrors (routes.ts's private rows, by ----
// -- content — every family's wiring row is module-private) -----

const RECORDS_TEST_WIRING: DocumentFamilyWiring = {
    family: 'records',
    lifecycle: 'trio',
    notFoundTable: 'records',
    validateDocument: validateRecordDocumentBody,
    documentOp: postRecordDocumentOp,
    entityOf: (document, organization) => {
        const body = document.body;
        return {
            id: document.uriId,
            organization_id: organization,
            name: pickString(body, 'name'),
            description: pickString(body, 'description'),
            position: pickNumber(body, 'position'),
        };
    },
};

const RECORD_ATTRIBUTES_TEST_WIRING: DocumentFamilyWiring = {
    family: 'record-attributes',
    lifecycle: 'stateless',
    notFoundTable: 'record_attributes',
    validateDocument: validateRecordAttributeDocumentBody,
    documentOp: postRecordAttributeDocumentOp,
    entityOf: (document, organization) => ({
        id: document.uriId,
        organization_id: organization,
        ...document.body,
    }),
};

// Any Id works here — both generic read paths ignore their
// `actor` argument entirely.
const READER_ACTOR: Id = 'drift-reader';

async function derivedRecords(
    db: DbAdapter, organization: Id,
): Promise<RecordEntity[]> {
    return documentCollectionGetHandler(RECORDS_TEST_WIRING)(
        db, [], READER_ACTOR, organization,
    ) as Promise<RecordEntity[]>;
}

async function derivedRecord(
    db: DbAdapter, organization: Id, id: Id,
): Promise<RecordEntity> {
    return documentGetHandler(RECORDS_TEST_WIRING)(
        db, [id], READER_ACTOR, organization,
    ) as Promise<RecordEntity>;
}

async function derivedRecordAttributes(
    db: DbAdapter, organization: Id,
): Promise<RecordAttributeEntity[]> {
    return documentCollectionGetHandler(
        RECORD_ATTRIBUTES_TEST_WIRING,
    )(
        db, [], READER_ACTOR, organization,
    ) as Promise<RecordAttributeEntity[]>;
}

async function derivedRecordAttribute(
    db: DbAdapter, organization: Id, id: Id,
): Promise<RecordAttributeEntity> {
    return documentGetHandler(RECORD_ATTRIBUTES_TEST_WIRING)(
        db, [id], READER_ACTOR, organization,
    ) as Promise<RecordAttributeEntity>;
}

// -- shared live-write body builders -----------------------------

function attributeBody(
    id: string,
    recordId: string,
    name: string,
    organization: string,
): Record<string, unknown> {
    return {
        id,
        record_id: recordId,
        organization_id: organization,
        name,
        attribute_type: 'text',
        sort_order: 1,
        options: jsonArrayField([]),
        constraints: jsonArrayField([]),
    };
}

function createRecordBody(
    id: string,
    organization: string,
    name: string,
    attributes: readonly Record<string, unknown>[],
    stateEventId: string,
    stateAt: string,
): Record<string, unknown> {
    return {
        kind: 'create',
        id,
        record: {
            organization_id: organization,
            name,
            description: 'd',
            position: 1,
        },
        attributes,
        initialState: 'active',
        initialStateEventId: stateEventId,
        initialStateAt: stateAt,
    };
}

function editRecordBody(
    id: string,
    organization: string,
    name: string,
    attributes: readonly Record<string, unknown>[],
    removedAttributeIds: readonly string[],
    state: string,
    stateAt: string,
    stateEventId: string,
): Record<string, unknown> {
    return {
        kind: 'edit',
        id,
        record: {
            organization_id: organization,
            name,
            description: 'd',
            position: 1,
        },
        attributes,
        state,
        state_at: stateAt,
        state_event_id: stateEventId,
        removedAttributeIds,
    };
}

// -- decode helper (mirrors tests/drift-work-orders.test.ts's ---
// -- own decodeRequestMessage) ------------------------------------

function decodeRequestMessage(message: string): {
    readonly method: string;
    readonly body: Record<string, unknown>;
} {
    const model = parseJson(message, defaultBodyRegistry());
    if (model.startLine.kind !== 'request') {
        throw new Error(
            'stored message carries no request line',
        );
    }
    const body = HttpMessage.fromModel(model).body();
    return {
        method: model.startLine.method,
        body: body.exists()
            ? JSON.parse(body.toText()) as
                Record<string, unknown>
            : {},
    };
}

// -- 1. records collection parity, both orgs (the 1/1 split) --

test('records collection: message-derived equals old-table-'
+ 'derived, both orgs (the 1/1 split)', async () => {
    const db = await seededDb();
    for (const organization of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const derived = sortById(
            await derivedRecords(db, organization),
        );
        const old = sortById(
            await organizationScopedAdapter(db, organization)
                .records.getAll(),
        );
        assert.deepEqual(derived, old);
    }
    const org1 = await derivedRecords(db, STARK_ORGANIZATION);
    const org2 = await derivedRecords(db, ORGANIZATION_TWO);
    assert.equal(org1.length, 1);
    assert.equal(org2.length, 1);
    assert.equal(org1[0]!.id, customerProfileRecordId);
    assert.equal(org2[0]!.id, projectBriefRecordId);
});

// -- 2. foreign-org getById 404 parity, byte-equal bodies ------

test('a foreign-org getById 404s identically on both planes,'
+ ' for records, record-attributes, and flow_records (the'
+ ' notFoundTable proof at drift altitude)', async () => {
    const db = await seededDb();

    const expectedRecordMessage =
        'Not found: records/' + customerProfileRecordId;
    await assert.rejects(
        () => derivedRecord(
            db, ORGANIZATION_TWO, customerProfileRecordId,
        ),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedRecordMessage,
    );
    await assert.rejects(
        () => organizationScopedAdapter(db, ORGANIZATION_TWO)
            .records.getById(customerProfileRecordId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedRecordMessage,
    );

    // fCompanyName: Customer Profile's own attribute (org 1).
    const attributeId = '5JZ0LeKdPCa4QMtg1RsF1M';
    const expectedAttributeMessage =
        'Not found: record_attributes/' + attributeId;
    await assert.rejects(
        () => derivedRecordAttribute(
            db, ORGANIZATION_TWO, attributeId,
        ),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedAttributeMessage,
    );
    await assert.rejects(
        () => organizationScopedAdapter(db, ORGANIZATION_TWO)
            .recordAttributes.getById(attributeId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedAttributeMessage,
    );

    // frb01: Customer Onboarding <- Customer Profile (org 1).
    const joinId = 'frb01CustOnbCustProfA1';
    const flowId = 'h5mErVBQhwdMKwi1co30jB';
    const expectedJoinMessage =
        'Not found: flow_records/' + joinId;
    await assert.rejects(
        () => deriveFlowRecord(
            db, ORGANIZATION_TWO, flowId, joinId,
        ),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedJoinMessage,
    );
    await assert.rejects(
        () => organizationScopedAdapter(db, ORGANIZATION_TWO)
            .flowRecords.getById(joinId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedJoinMessage,
    );
});

// -- 3. per-record + per-attribute getById parity; the ---------
// -- record-attributes collection parity per org (10/4 split) --

test('per-record getById parity (both records); per-attribute'
+ ' getById parity (all 14); record-attributes collection'
+ ' parity per org (the 10/4 split)', async () => {
    const db = await seededDb();
    const records = [
        { id: customerProfileRecordId, organization: STARK_ORGANIZATION },
        { id: projectBriefRecordId, organization: ORGANIZATION_TWO },
    ];
    for (const { id, organization } of records) {
        const derived = await derivedRecord(db, organization, id);
        const old = await organizationScopedAdapter(
            db, organization,
        ).records.getById(id);
        assert.deepEqual(derived, old);
    }

    const attributeOrganizationByRecordId: Record<string, string> = {
        [customerProfileRecordId]: STARK_ORGANIZATION,
        [projectBriefRecordId]: ORGANIZATION_TWO,
    };
    const attributes = buildRecordAttributes();
    assert.equal(attributes.length, 14);
    for (const attribute of attributes) {
        const organization =
            attributeOrganizationByRecordId[attribute.record_id]!;
        const derived = await derivedRecordAttribute(
            db, organization, attribute.id,
        );
        const old = await organizationScopedAdapter(
            db, organization,
        ).recordAttributes.getById(attribute.id);
        assert.deepEqual(derived, old);
    }

    const org1Attributes = sortById(
        await derivedRecordAttributes(db, STARK_ORGANIZATION),
    );
    const org1Old = sortById(
        await organizationScopedAdapter(db, STARK_ORGANIZATION)
            .recordAttributes.getAll(),
    );
    assert.equal(org1Attributes.length, 10);
    assert.deepEqual(org1Attributes, org1Old);

    const org2Attributes = sortById(
        await derivedRecordAttributes(db, ORGANIZATION_TWO),
    );
    const org2Old = sortById(
        await organizationScopedAdapter(db, ORGANIZATION_TWO)
            .recordAttributes.getAll(),
    );
    assert.equal(org2Attributes.length, 4);
    assert.deepEqual(org2Attributes, org2Old);
});

// -- 4. flow_records join parity per flow (1/1/1) + the empty ---
// -- case (the unbound Layout Test flow) + :frid by-id parity ---

const EMPTY_FLOW_ID = '7COt7Kf4OaOBg6AjaNO04s'; // Layout Test

const SEEDED_JOIN_FLOWS = [
    {
        flowId: 'h5mErVBQhwdMKwi1co30jB', // Customer Onboarding
        organization: STARK_ORGANIZATION,
        joinId: 'frb01CustOnbCustProfA1',
    },
    {
        flowId: l2cFlowId, // Lead-to-Close
        organization: STARK_ORGANIZATION,
        joinId: 'frb02L3adt0ClCustProf2',
    },
    {
        flowId: 'seed-flow-org2',
        organization: ORGANIZATION_TWO,
        joinId: 'frb03Fus10nPr0jBri3f03',
    },
];

test('flow_records join parity across every seeded flow (the'
+ ' 1/1/1 split), the empty unbound-flow case, and :frid'
+ ' by-id parity', async () => {
    const db = await seededDb();
    for (const { flowId, organization, joinId } of
        SEEDED_JOIN_FLOWS
    ) {
        const derived = await deriveFlowRecords(
            db, organization, flowId,
        );
        const old = sortById(
            await organizationScopedAdapter(db, organization)
                .flowRecords.getAllWhere('flow_id', flowId),
        );
        assert.equal(derived.length, 1);
        assert.equal(old.length, 1);
        assert.deepEqual(derived, old);

        const derivedById = await deriveFlowRecord(
            db, organization, flowId, joinId,
        );
        const oldById = await organizationScopedAdapter(
            db, organization,
        ).flowRecords.getById(joinId);
        assert.deepEqual(derivedById, oldById);
    }

    const derivedEmpty = await deriveFlowRecords(
        db, STARK_ORGANIZATION, EMPTY_FLOW_ID,
    );
    const oldEmpty = await organizationScopedAdapter(
        db, STARK_ORGANIZATION,
    ).flowRecords.getAllWhere('flow_id', EMPTY_FLOW_ID);
    assert.deepEqual(derivedEmpty, []);
    assert.deepEqual(oldEmpty, []);
});

// -- 5. live-write chain, re-compared on both planes at every ---
// -- step (case 9's state-history parity rides the same chain) --

test('live-write chain: create with 2 attributes, an edit'
+ ' adding 1 + removing 1, a referenced-attribute-removal 409,'
+ ' a putRecord echoed-trio entity edit, an archived transition,'
+ ' a deleted transition, and a second record\'s DELETE — '
+ 're-compared on both planes at every step', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const recordId = 'rec-drift-chain-1';
    const attrA = 'rec-drift-chain-1-attr-a';
    const attrB = 'rec-drift-chain-1-attr-b';
    const attrC = 'rec-drift-chain-1-attr-c';

    async function assertRecordParity(): Promise<void> {
        const derived = await derivedRecord(
            db, STARK_ORGANIZATION, recordId,
        );
        const old = await organizationScopedAdapter(
            db, STARK_ORGANIZATION,
        ).records.getById(recordId);
        assert.deepEqual(derived, old);
    }

    async function assertAttributeParity(id: string): Promise<void> {
        const derived = await derivedRecordAttribute(
            db, STARK_ORGANIZATION, id,
        );
        const old = await organizationScopedAdapter(
            db, STARK_ORGANIZATION,
        ).recordAttributes.getById(id);
        assert.deepEqual(derived, old);
    }

    async function assertAttributeAbsent(id: string): Promise<void> {
        await assert.rejects(
            () => derivedRecordAttribute(
                db, STARK_ORGANIZATION, id,
            ),
            EntityNotFoundError,
        );
        await assert.rejects(
            () => organizationScopedAdapter(
                db, STARK_ORGANIZATION,
            ).recordAttributes.getById(id),
            EntityNotFoundError,
        );
    }

    // Step 1: create, 2 attributes.
    const created = await handleRequest(db, req(
        'POST', '/records', token,
        createRecordBody(
            recordId, STARK_ORGANIZATION, 'Chain Record',
            [
                attributeBody(
                    attrA, recordId, 'Attr A', STARK_ORGANIZATION,
                ),
                attributeBody(
                    attrB, recordId, 'Attr B', STARK_ORGANIZATION,
                ),
            ],
            'rec-drift-chain-1-genesis', nowUtc(),
        ),
    ));
    assert.equal(created.status, 204);
    await assertRecordParity();
    await assertAttributeParity(attrA);
    await assertAttributeParity(attrB);

    // Step 2: edit — add attrC, remove attrA. A fresh trio (a
    // genuine second lifecycle event — case 9 needs this to be
    // actor-authored, not an echo).
    const editStateAt = nowUtc();
    const editStateEventId = 'rec-drift-chain-1-edit';
    const edited = await handleRequest(db, req(
        'POST', '/records', token,
        editRecordBody(
            recordId, STARK_ORGANIZATION, 'Chain Record',
            [
                attributeBody(
                    attrC, recordId, 'Attr C', STARK_ORGANIZATION,
                ),
            ],
            [attrA],
            'active', editStateAt, editStateEventId,
        ),
    ));
    assert.equal(edited.status, 204);
    await assertRecordParity();
    await assertAttributeAbsent(attrA);
    await assertAttributeParity(attrB);
    await assertAttributeParity(attrC);

    // Step 3: a REFERENCED-attribute removal 409s — both planes
    // AND the ledger stay untouched (zero new pairs). fCompanyName
    // is a seeded Customer Profile attribute already referenced
    // by a state_field_values row and by live flow-node bindings.
    const beforeRequestCount = (await db.requests.getAll()).length;
    const beforeAttributes = sortById(
        await organizationScopedAdapter(db, STARK_ORGANIZATION)
            .recordAttributes.getAll(),
    );
    const rejected = await handleRequest(db, req(
        'POST', '/records', token,
        editRecordBody(
            recordId, STARK_ORGANIZATION, 'Chain Record',
            [], ['5JZ0LeKdPCa4QMtg1RsF1M'],
            'active', nowUtc(), 'rec-drift-chain-1-rejected',
        ),
    ));
    assert.equal(rejected.status, 409);
    assert.equal(
        (await db.requests.getAll()).length, beforeRequestCount,
    );
    assert.deepEqual(
        sortById(
            await organizationScopedAdapter(db, STARK_ORGANIZATION)
                .recordAttributes.getAll(),
        ),
        beforeAttributes,
    );
    await assertRecordParity();

    // Step 4: a putRecord (bare PUT records/:id) entity edit
    // ECHOING the current head's trio verbatim — the sameEvent
    // no-op proven at drift altitude: NO new states row, even
    // though the record's OTHER fields (description) do update
    // via arrival order.
    const beforeStatesCount =
        (await db.states.getAllFor(recordId)).length;
    const echoed = await handleRequest(db, req(
        'PUT', '/records/' + recordId, token, {
            name: 'Chain Record',
            description: 'echoed-trio description',
            position: 1,
            state: 'active',
            state_at: editStateAt,
            state_event_id: editStateEventId,
        },
    ));
    assert.equal(echoed.status, 200);
    assert.equal(
        (await db.states.getAllFor(recordId)).length,
        beforeStatesCount,
    );
    await assertRecordParity();
    const afterEcho = await derivedRecord(
        db, STARK_ORGANIZATION, recordId,
    );
    assert.equal(afterEcho.description, 'echoed-trio description');

    // Step 5: archived — a fresh trio; both planes still show
    // the record (archived does not exclude).
    const archived = await handleRequest(db, req(
        'PUT', '/records/' + recordId, token, {
            name: 'Chain Record',
            description: 'echoed-trio description',
            position: 1,
            state: 'archived',
            state_at: nowUtc(),
            state_event_id: 'rec-drift-chain-1-archived',
        },
    ));
    assert.equal(archived.status, 200);
    await assertRecordParity();
    const afterArchive = await derivedRecords(
        db, STARK_ORGANIZATION,
    );
    assert.equal(
        afterArchive.some((r) => r.id === recordId), true,
    );

    // Step 6: deleted — derived excludes from collection AND
    // 404s by-id; old plane identical (the finding-6 assertion
    // reproduced at drift altitude).
    const deletedTransition = await handleRequest(db, req(
        'PUT', '/records/' + recordId, token, {
            name: 'Chain Record',
            description: 'echoed-trio description',
            position: 1,
            state: 'deleted',
            state_at: nowUtc(),
            state_event_id: 'rec-drift-chain-1-deleted',
        },
    ));
    assert.equal(deletedTransition.status, 200);
    await assert.rejects(
        () => derivedRecord(db, STARK_ORGANIZATION, recordId),
        EntityNotFoundError,
    );
    await assert.rejects(
        () => organizationScopedAdapter(db, STARK_ORGANIZATION)
            .records.getById(recordId),
        EntityNotFoundError,
    );
    const derivedListAfterDelete = await derivedRecords(
        db, STARK_ORGANIZATION,
    );
    const oldListAfterDelete = await organizationScopedAdapter(
        db, STARK_ORGANIZATION,
    ).records.getAll();
    assert.equal(
        derivedListAfterDelete.some((r) => r.id === recordId),
        false,
    );
    assert.equal(
        oldListAfterDelete.some((r) => r.id === recordId), false,
    );

    // case 9: state-history parity — deriveRecordStateHistory
    // deepEquals old-plane states.getAllFor, member_id included.
    // The echo (step 4) contributed NO row; genesis/edit/archived/
    // deleted (all actor-authored) contributed one row apiece —
    // both mechanisms exercised on the SAME record.
    const derivedHistory = await deriveRecordStateHistory(
        db, STARK_ORGANIZATION, recordId,
    );
    const oldHistory = await db.states.getAllFor(recordId);
    assert.deepEqual(derivedHistory, oldHistory);
    assert.equal(derivedHistory.length, 4);

    // Step 7: DELETE records/:id on a SECOND record — physical
    // splice + DELETE-head; both planes 404.
    const secondRecordId = 'rec-drift-chain-2';
    const secondCreated = await handleRequest(db, req(
        'POST', '/records', token,
        createRecordBody(
            secondRecordId, STARK_ORGANIZATION, 'Second Record',
            [], 'rec-drift-chain-2-genesis', nowUtc(),
        ),
    ));
    assert.equal(secondCreated.status, 204);
    const secondDeleted = await handleRequest(db, req(
        'DELETE', '/records/' + secondRecordId, token,
    ));
    assert.equal(secondDeleted.status, 204);
    await assert.rejects(
        () => derivedRecord(
            db, STARK_ORGANIZATION, secondRecordId,
        ),
        EntityNotFoundError,
    );
    await assert.rejects(
        () => organizationScopedAdapter(db, STARK_ORGANIZATION)
            .records.getById(secondRecordId),
        EntityNotFoundError,
    );
});

// -- 6. duplicate-create supersession ---------------------------

test('duplicate-create supersession: two creates, same record'
+ ' id, fresh attribute/event ids on the second — ONE records'
+ ' row both planes; the second document pair Supersedes the'
+ ' FIRST DOCUMENT pair\'s id (not the operation pair\'s);'
+ ' derivation returns the second body', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const recordId = 'rec-drift-dup-1';
    const prefix = canonicalUriPrefix(
        STARK_ORGANIZATION, '/records/',
    );

    const first = await handleRequest(db, req(
        'POST', '/records', token,
        createRecordBody(
            recordId, STARK_ORGANIZATION, 'Dup First',
            [
                attributeBody(
                    'rec-drift-dup-1-a-attr', recordId,
                    'Attr A', STARK_ORGANIZATION,
                ),
            ],
            'rec-drift-dup-1-a-ev',
            '2026-05-02T00:00:00.000000Z',
        ),
    ));
    assert.equal(first.status, 204);

    const firstDocumentPairs = documentPairsAt(
        await db.requests.getAllWhere('uri_prefix', prefix),
        await db.responses.getAllWhere('uri_prefix', prefix),
        prefix,
    ).filter((pair) => pair.uriId === recordId);
    assert.equal(firstDocumentPairs.length, 1);
    const firstDocumentPairId = firstDocumentPairs[0]!.id;

    const second = await handleRequest(db, req(
        'POST', '/records', token,
        createRecordBody(
            recordId, STARK_ORGANIZATION, 'Dup Second',
            [
                attributeBody(
                    'rec-drift-dup-1-b-attr', recordId,
                    'Attr B', STARK_ORGANIZATION,
                ),
            ],
            'rec-drift-dup-1-b-ev',
            '2026-05-02T00:00:01.000000Z',
        ),
    ));
    // The create op holds no echo of its own — a duplicate
    // create succeeds outright, never 412ing.
    assert.equal(second.status, 204);

    const allRequests =
        await db.requests.getAllWhere('uri_prefix', prefix);
    const allResponses =
        await db.responses.getAllWhere('uri_prefix', prefix);
    const secondDocumentPairs = documentPairsAt(
        allRequests, allResponses, prefix,
    ).filter((pair) => pair.uriId === recordId);
    assert.equal(secondDocumentPairs.length, 2);
    const secondDocumentPairId = secondDocumentPairs[1]!.id;
    const secondDocumentResponseRow = allResponses.find(
        (r) => r.id === secondDocumentPairId,
    )!;
    // The load-bearing pin (the Task 4 review's own gap, closed
    // here): Supersedes targets the FIRST DOCUMENT pair's id,
    // never the first create's OPERATION pair's id, even though
    // both share the record's own uriId.
    assert.equal(
        secondDocumentResponseRow.supersedes, firstDocumentPairId,
    );

    const derived = await derivedRecord(
        db, STARK_ORGANIZATION, recordId,
    );
    const old = await organizationScopedAdapter(
        db, STARK_ORGANIZATION,
    ).records.getById(recordId);
    assert.deepEqual(derived, old);
    assert.equal(derived.name, 'Dup Second');
});

// -- 7. method-filter: the create's POST pair is never the ------
// -- derived head, at both the record and attribute addresses --

test('the create-op POST pair is not read as a document pair —'
+ ' the create body and the document body share zero top-level'
+ ' keys; exactly one PUT pair lands at both the record and'
+ ' attribute addresses after create', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const recordId = 'rec-drift-method-filter-1';
    const attributeId = 'rec-drift-method-filter-1-attr';

    const created = await handleRequest(db, req(
        'POST', '/records', token,
        createRecordBody(
            recordId, STARK_ORGANIZATION, 'Method Filter Record',
            [
                attributeBody(
                    attributeId, recordId, 'Attr',
                    STARK_ORGANIZATION,
                ),
            ],
            'rec-drift-method-filter-1-ev',
            '2026-05-03T00:00:00.000000Z',
        ),
    ));
    assert.equal(created.status, 204);

    const recordsPrefix = canonicalUriPrefix(
        STARK_ORGANIZATION, '/records/',
    );
    const [recordRequests, recordResponses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', recordsPrefix),
        db.responses.getAllWhere('uri_prefix', recordsPrefix),
    ]);
    const atRecordAddress = recordRequests.filter(
        (r) => r.uri_prefix === recordsPrefix
            && r.uri_id === recordId,
    );
    // Both an operation (POST, 204) pair and a document (PUT)
    // pair share the SAME uriId.
    assert.equal(atRecordAddress.length, 2);

    const recordDocumentPairs = documentPairsAt(
        recordRequests, recordResponses, recordsPrefix,
    ).filter((pair) => pair.uriId === recordId);
    assert.equal(recordDocumentPairs.length, 1);
    assert.equal(recordDocumentPairs[0]!.method, 'PUT');

    const postRow = atRecordAddress.find(
        (r) => decodeRequestMessage(r.message).method === 'POST',
    )!;
    const createBodyKeys = new Set(
        Object.keys(decodeRequestMessage(postRow.message).body),
    );
    const documentBodyKeys = new Set(
        Object.keys(recordDocumentPairs[0]!.body),
    );
    // The create body's top-level keys ({kind, id, record,
    // attributes, initialState, initialStateEventId,
    // initialStateAt}) share ZERO names with the document
    // body's ({name, description, position, state, state_at,
    // state_event_id}) — a leaked operation pair fed to
    // entityOf would throw.
    const overlap = [...createBodyKeys].filter(
        (key) => documentBodyKeys.has(key),
    );
    assert.deepEqual(overlap, []);

    const attributesPrefix = canonicalUriPrefix(
        STARK_ORGANIZATION, '/record-attributes/',
    );
    const [attributeRequests, attributeResponses] =
        await Promise.all([
            db.requests.getAllWhere('uri_prefix', attributesPrefix),
            db.responses.getAllWhere(
                'uri_prefix', attributesPrefix,
            ),
        ]);
    const attributeDocumentPairs = documentPairsAt(
        attributeRequests, attributeResponses, attributesPrefix,
    ).filter((pair) => pair.uriId === attributeId);
    assert.equal(attributeDocumentPairs.length, 1);
    assert.equal(attributeDocumentPairs[0]!.method, 'PUT');
});

// -- 8. genesis-wins-under-skew (the trio-family case, ideas/ --
// -- projects/flows precedent; the Task 0 Phase 5 strengthened --
// -- order-asserting full-history deepEqual template) -----------

test('a clock-skewed transition does NOT displace genesis — '
+ 'the order-asserting full-history parity holds on both'
+ ' planes', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const recordId = 'rec-drift-skew-1';

    // Genesis claims a LATER state_at than the skewed transition
    // below — exactly the clock-skew scenario the (state_at, id)
    // reduction must resist.
    const genesis = await handleRequest(db, req(
        'PUT', '/records/' + recordId, token, {
            name: 'Genesis Title', description: 'd', position: 1,
            state: 'active',
            state_at: '2026-06-01T00:00:00.000000Z',
            state_event_id: 'rec-drift-skew-1-genesis',
        },
    ));
    assert.equal(genesis.status, 200);

    const skewed = await handleRequest(db, req(
        'PUT', '/records/' + recordId, token, {
            name: 'Skewed Title', description: 'd', position: 1,
            state: 'deleted',
            state_at: '2020-01-01T00:00:00.000000Z',
            state_event_id: 'rec-drift-skew-1-skewed',
        },
    ));
    assert.equal(skewed.status, 200);

    // Genesis must still win the lifecycle reduction: the record
    // stays visible despite the later-arriving 'deleted'
    // transition, because that transition's OWN state_at is
    // older than genesis's.
    const derived = await derivedRecord(
        db, STARK_ORGANIZATION, recordId,
    );
    // Arrival order still governs the entity's OTHER fields —
    // the two reductions are independent.
    assert.equal(derived.name, 'Skewed Title');
    const old = await organizationScopedAdapter(
        db, STARK_ORGANIZATION,
    ).records.getById(recordId);
    assert.deepEqual(derived, old);

    const records = await derivedRecords(db, STARK_ORGANIZATION);
    assert.equal(
        records.some((r) => r.id === recordId), true,
    );
    const oldRecords = await organizationScopedAdapter(
        db, STARK_ORGANIZATION,
    ).records.getAll();
    assert.equal(
        oldRecords.some((r) => r.id === recordId), true,
    );

    const history = await deriveRecordStateHistory(
        db, STARK_ORGANIZATION, recordId,
    );
    // Order- AND content-sensitive: (state_at, id) ascending —
    // the SAME order store-state.ts's getAllForIn returns. The
    // later-ARRIVED but earlier-STAMPED 'deleted' event sorts
    // FIRST; genesis SECOND.
    assert.deepEqual(
        history.map((entry) => ({
            id: entry.id,
            entity_id: entry.entity_id,
            state: entry.state,
            at: entry.at,
        })),
        [
            {
                id: 'rec-drift-skew-1-skewed',
                entity_id: recordId,
                state: 'deleted',
                at: '2020-01-01T00:00:00.000000Z',
            },
            {
                id: 'rec-drift-skew-1-genesis',
                entity_id: recordId,
                state: 'active',
                at: '2026-06-01T00:00:00.000000Z',
            },
        ],
    );
});

// -- 10. delete-then-recreate never crashes (Author gate 9's ---
// -- walk filter at drift altitude) ------------------------------

test('delete-then-recreate: DELETE via the wire, re-PUT the'
+ ' SAME id, GET by-id + collection succeed and agree on both'
+ ' planes — the lifecycle walk never throws on the DELETE'
+ " pair's empty body", async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const recordId = 'rec-drift-recreate-1';

    const genesis = await handleRequest(db, req(
        'PUT', '/records/' + recordId, token, {
            name: 'First Life', description: 'd', position: 1,
            state: 'active',
            state_at: '2026-04-01T00:00:00.000000Z',
            state_event_id: 'rec-drift-recreate-1-genesis',
        },
    ));
    assert.equal(genesis.status, 200);

    const deleted = await handleRequest(db, req(
        'DELETE', '/records/' + recordId, token,
    ));
    assert.equal(deleted.status, 204);
    const deleteResponseId = deleted.headers.get('Response-ID');
    assert.ok(deleteResponseId);

    await assert.rejects(
        () => derivedRecord(db, STARK_ORGANIZATION, recordId),
        EntityNotFoundError,
    );
    await assert.rejects(
        () => organizationScopedAdapter(db, STARK_ORGANIZATION)
            .records.getById(recordId),
        EntityNotFoundError,
    );

    // Genesis-over-DELETE-head: a re-PUT at the SAME id forms a
    // fresh document pair that Supersedes the DELETE pair — the
    // lifecycle walk must skip that DELETE pair's empty body
    // rather than throw on its missing trio.
    const recreated = await handleRequest(db, req(
        'PUT', '/records/' + recordId, token, {
            name: 'Second Life', description: 'd', position: 1,
            state: 'active',
            state_at: '2026-04-02T00:00:00.000000Z',
            state_event_id: 'rec-drift-recreate-1-reborn',
        },
    ));
    assert.equal(recreated.status, 200);
    assert.equal(
        recreated.headers.get('Supersedes'), deleteResponseId,
    );

    const derived = await derivedRecord(
        db, STARK_ORGANIZATION, recordId,
    );
    const old = await organizationScopedAdapter(
        db, STARK_ORGANIZATION,
    ).records.getById(recordId);
    assert.deepEqual(derived, old);
    assert.equal(derived.name, 'Second Life');

    const derivedList = sortById(
        await derivedRecords(db, STARK_ORGANIZATION),
    );
    const oldList = sortById(
        await organizationScopedAdapter(
            db, STARK_ORGANIZATION,
        ).records.getAll(),
    );
    assert.deepEqual(derivedList, oldList);
    assert.equal(
        derivedList.some((r) => r.id === recordId), true,
    );
});

// -- 11. THE VALUE-COUNT DERIVABILITY PROOF (B2's evidence) -----
//
// A test-side helper (BY DESIGN — its only consumer is this
// proof; a production module with no consumer would be unbidden
// helper code). Scans a work order's OWN /work-orders/{id}/
// transition/ prefix — the replayWorkOrderStates transitionPrefix
// construction (tests/drift-work-orders.test.ts): NO org-wide
// transition prefix exists, so the address embeds the WO id —
// and tallies fieldValues[].fields.attribute_id references per
// attribute from the wire body of every POST transition pair at
// that prefix. The flow/work-order referrer legs of
// collectAttributeReferrers (its flowIds/workOrderIds fields)
// re-derive from flow/work-order document pairs only at Phase
// Final — NOT proven here; their sources retire only then.
async function transitionFieldValueCounts(
    db: MemoryDbAdapter,
    organization: string,
    workOrderId: string,
): Promise<Map<string, number>> {
    const prefix = canonicalUriPrefix(
        organization,
        '/work-orders/' + workOrderId + '/transition/',
    );
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    const requestById = new Map(
        requests.map((request) => [request.id, request]),
    );
    const counts = new Map<string, number>();
    for (const response of responses) {
        if (
            response.uri_prefix !== prefix
            || response.status < 200
            || response.status > 299
        ) continue;
        const request = requestById.get(response.id);
        if (request === undefined) continue;
        const decoded = decodeRequestMessage(request.message);
        if (decoded.method !== 'POST') continue;
        const fieldValues = decoded.body['fieldValues'] as
            readonly { fields: Record<string, unknown> }[];
        for (const row of fieldValues) {
            const attributeId = pickString(
                row.fields, 'attribute_id',
            );
            counts.set(
                attributeId,
                (counts.get(attributeId) ?? 0) + 1,
            );
        }
    }
    return counts;
}

// A frozen, minimal work-order flow-graph snapshot — sized only
// for a POST /work-orders create, mirroring tests/drift-work-
// orders.test.ts's own workOrderFlowGraph fixture.
function workOrderFlowGraph(lockTimeoutSeconds: number): string {
    return jsonObjectField({
        name: 'Value-Count Fixture Flow',
        lockTimeout: lockTimeoutSeconds,
        nodes: [
            {
                id: 'n-start', name: 'Start',
                positionX: 0, positionY: 0,
                isCreate: true, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: 'n-middle', name: 'Middle',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
        ],
        edges: [],
    });
}

test('THE VALUE-COUNT DERIVABILITY PROOF: a per-attribute'
+ " fieldValues tally over a work order's OWN transition"
+ " pairs equals collectAttributeReferrers' valueCount for a"
+ ' live, ledger-backed transition', async () => {
    const db = await seededDb();
    const scoped = organizationScopedAdapter(db, STARK_ORGANIZATION);

    // (a) The seeded flagship work order (finding 12: 7 rows —
    // 6 under state_event_id eJEybxfXaf3sjwFilZnunU + 1 under
    // C2xb2bbjyHD11WfLayh8Om, referencing 7 distinct Customer
    // Profile attributes). This history predates the message-
    // plane migration entirely: api/mock-data.ts writes every
    // seeded work order's states/state_field_values rows via
    // direct adapter.states.put / adapter.stateFieldValues.put
    // calls, never through the wire — so NO transition pair
    // exists at this work order's own address (verified: the
    // scan below returns an EMPTY map). The value-count LEG is
    // therefore, like the flow/work-order referrer legs, NOT
    // ledger-re-derivable for this PRE-EXISTING seed data — a
    // limitation this proof discloses rather than hides.
    // collectAttributeReferrers itself reads state_field_values
    // directly (never the ledger), so it still reports the real
    // counts regardless — pinning finding 12's 6+1-across-7
    // split as a regression guard.
    const flagshipWorkOrderId = 'wg25b0R2gwy5kYPIhQB6cS';
    const flagshipAttributeIds = [
        '5JZ0LeKdPCa4QMtg1RsF1M', // Company Name
        'nplTIh0qXNtAyoWSwRaBYe', // Contact Email
        'kzHpMw9f1thq79VoBYeIX3', // Contact Phone
        'QsmqiOmPtoMLGpSjHOqdHA', // Industry
        '0TyjQRcygn3DIyXTe6x1F6', // Annual Revenue
        '8Z62tcRHBpwCRH1kBffx0G', // Number of Employees
        'AdQlKf43JV6yrhQbyskDkR', // Reviewer Notes
    ];
    assert.equal(flagshipAttributeIds.length, 7);

    const flagshipScan = await transitionFieldValueCounts(
        db, STARK_ORGANIZATION, flagshipWorkOrderId,
    );
    assert.equal(flagshipScan.size, 0);

    const flagshipReferrers = await collectAttributeReferrers(
        scoped, flagshipAttributeIds,
    );
    let flagshipTotal = 0;
    for (const attributeId of flagshipAttributeIds) {
        const referrers = flagshipReferrers.get(attributeId)!;
        assert.equal(referrers.valueCount, 1);
        flagshipTotal += referrers.valueCount;
    }
    assert.equal(flagshipTotal, 7);

    // (b) A live, ledger-backed transition written DURING this
    // test: the mechanism genuinely reproduces collectAttribute
    // Referrers' valueCount from the message pairs alone.
    const token = await organizationToken();
    const liveWorkOrderId = 'wo-drift-valuecount-1';
    const liveAttributeX = 'wo-drift-valuecount-1-attr-x';
    const liveAttributeY = 'wo-drift-valuecount-1-attr-y';
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/work-orders', token, {
            id: liveWorkOrderId,
            workOrder: {
                display_id: 'drift-valuecount-1',
                flow_graph: graph,
                position: 1,
            },
            flowWorkOrderId: liveWorkOrderId + '-fwo',
            flowWorkOrder: {
                flow_id: EMPTY_FLOW_ID,
                work_order_id: liveWorkOrderId,
                at: nowUtc(),
            },
            stateEventIds: [
                liveWorkOrderId + '-ev1',
                liveWorkOrderId + '-ev2',
                liveWorkOrderId + '-ev3',
            ],
            stateEventAts: [nowUtc(), nowUtc(), nowUtc()],
            states: ['n-start', 'n-middle', 'claimed'],
        },
    ));
    assert.equal(created.status, 204);

    const transition = await handleRequest(db, req(
        'POST', '/work-orders/' + liveWorkOrderId + '/transition',
        token, {
            transitionEventId: liveWorkOrderId + '-te1',
            targetState: 'n-middle',
            fieldValues: [
                {
                    id: liveWorkOrderId + '-fv1',
                    fields: {
                        state_event_id: liveWorkOrderId + '-te1',
                        attribute_id: liveAttributeX,
                        value: 'x-value',
                    },
                },
                {
                    id: liveWorkOrderId + '-fv2',
                    fields: {
                        state_event_id: liveWorkOrderId + '-te1',
                        attribute_id: liveAttributeY,
                        value: 'y-value',
                    },
                },
            ],
            release: null,
            transitionAt: nowUtc(),
        },
    ));
    assert.equal(transition.status, 204);

    const liveScan = await transitionFieldValueCounts(
        db, STARK_ORGANIZATION, liveWorkOrderId,
    );
    const liveReferrers = await collectAttributeReferrers(
        scoped, [liveAttributeX, liveAttributeY],
    );
    assert.equal(liveScan.get(liveAttributeX), 1);
    assert.equal(liveScan.get(liveAttributeY), 1);
    assert.equal(
        liveScan.get(liveAttributeX),
        liveReferrers.get(liveAttributeX)!.valueCount,
    );
    assert.equal(
        liveScan.get(liveAttributeY),
        liveReferrers.get(liveAttributeY)!.valueCount,
    );
});
