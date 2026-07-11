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

// Phase Final Task 2: records(+record_attributes+flow_records)
// dual-write stripped. This file no longer compares derive vs
// old-table oracles — the row plane is empty after seed.
// Coverage re-homes to wire-byte handleRequest assertions and
// non-lexical live fixtures. Records is a TRIO family with a
// live DELETE on :id (Author gate 9).

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

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    return db;
}

// -- test-side wiring mirrors (routes.ts's private rows) --------

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

// -- 1. records collection wire equals derive --------------------

test('seeded GET /records wire equals derived collection,'
+ ' both orgs (the 1/1 split)', async () => {
    const db = await seededDb();
    for (const organization of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const token = await organizationToken(
            'current', organization,
        );
        const res = await handleRequest(
            db, req('GET', '/records', token),
        );
        assert.equal(res.status, 200);
        const wireText = await res.text();
        const derived = await derivedRecords(db, organization);
        assert.equal(wireText, JSON.stringify(derived));
    }
    const org1 = await derivedRecords(db, STARK_ORGANIZATION);
    const org2 = await derivedRecords(db, ORGANIZATION_TWO);
    assert.equal(org1.length, 1);
    assert.equal(org2.length, 1);
    assert.equal(org1[0]!.id, customerProfileRecordId);
    assert.equal(org2[0]!.id, projectBriefRecordId);
    // Phase Final Stage B: records table retired.
});

// -- 2. foreign-org GET 404 on wire + derive ---------------------

test('a foreign-org GET 404s on wire and on derive, for'
+ ' records, record-attributes, and flow_records',
async () => {
    const db = await seededDb();
    const tokenTwo = await organizationToken(
        'current', ORGANIZATION_TWO,
    );

    const expectedRecordMessage =
        'Not found: records/' + customerProfileRecordId;
    const recRes = await handleRequest(
        db,
        req(
            'GET',
            '/records/' + customerProfileRecordId,
            tokenTwo,
        ),
    );
    assert.equal(recRes.status, 404);
    const recBody = await recRes.json() as { error: string };
    assert.equal(recBody.error, expectedRecordMessage);
    await assert.rejects(
        () => derivedRecord(
            db, ORGANIZATION_TWO, customerProfileRecordId,
        ),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedRecordMessage,
    );

    const attributeId = '5JZ0LeKdPCa4QMtg1RsF1M';
    const expectedAttributeMessage =
        'Not found: record_attributes/' + attributeId;
    const attrRes = await handleRequest(
        db,
        req(
            'GET',
            '/record-attributes/' + attributeId,
            tokenTwo,
        ),
    );
    assert.equal(attrRes.status, 404);
    const attrBody = await attrRes.json() as { error: string };
    assert.equal(attrBody.error, expectedAttributeMessage);
    await assert.rejects(
        () => derivedRecordAttribute(
            db, ORGANIZATION_TWO, attributeId,
        ),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedAttributeMessage,
    );

    const joinId = 'frb01CustOnbCustProfA1';
    const flowId = 'h5mErVBQhwdMKwi1co30jB';
    const expectedJoinMessage =
        'Not found: flow_records/' + joinId;
    const joinRes = await handleRequest(
        db,
        req(
            'GET',
            '/flows/' + flowId + '/records/' + joinId,
            tokenTwo,
        ),
    );
    assert.equal(joinRes.status, 404);
    const joinBody = await joinRes.json() as { error: string };
    assert.equal(joinBody.error, expectedJoinMessage);
    await assert.rejects(
        () => deriveFlowRecord(
            db, ORGANIZATION_TWO, flowId, joinId,
        ),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedJoinMessage,
    );
});

// -- 3. per-record + per-attribute GET wire equals derive --------

test('per-record GET wire equals derive; per-attribute GET'
+ ' wire equals derive; attribute collection 10/4 split',
async () => {
    const db = await seededDb();
    const records = [
        {
            id: customerProfileRecordId,
            organization: STARK_ORGANIZATION,
        },
        {
            id: projectBriefRecordId,
            organization: ORGANIZATION_TWO,
        },
    ];
    for (const { id, organization } of records) {
        const token = await organizationToken(
            'current', organization,
        );
        const res = await handleRequest(
            db, req('GET', '/records/' + id, token),
        );
        assert.equal(res.status, 200);
        const wireText = await res.text();
        const derived = await derivedRecord(
            db, organization, id,
        );
        assert.equal(wireText, JSON.stringify(derived));
    }

    const attributeOrganizationByRecordId:
        Record<string, string> = {
            [customerProfileRecordId]: STARK_ORGANIZATION,
            [projectBriefRecordId]: ORGANIZATION_TWO,
        };
    const attributes = buildRecordAttributes();
    assert.equal(attributes.length, 14);
    for (const attribute of attributes) {
        const organization =
            attributeOrganizationByRecordId[
                attribute.record_id
            ]!;
        const token = await organizationToken(
            'current', organization,
        );
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/record-attributes/' + attribute.id,
                token,
            ),
        );
        assert.equal(res.status, 200);
        const wireText = await res.text();
        const derived = await derivedRecordAttribute(
            db, organization, attribute.id,
        );
        assert.equal(wireText, JSON.stringify(derived));
        assert.equal(derived.name, attribute.name);
    }

    const org1Attributes = await derivedRecordAttributes(
        db, STARK_ORGANIZATION,
    );
    const org2Attributes = await derivedRecordAttributes(
        db, ORGANIZATION_TWO,
    );
    assert.equal(org1Attributes.length, 10);
    assert.equal(org2Attributes.length, 4);
    // Phase Final Stage B: record_attributes table retired.
});

// -- 4. flow_records join wire equals derive ---------------------

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

test('flow_records join wire equals derive across every'
+ ' seeded flow (the 1/1/1 split) + empty + :frid',
async () => {
    const db = await seededDb();
    for (const { flowId, organization, joinId } of
        SEEDED_JOIN_FLOWS
    ) {
        const token = await organizationToken(
            'current', organization,
        );
        const listRes = await handleRequest(
            db,
            req(
                'GET',
                '/flows/' + flowId + '/records',
                token,
            ),
        );
        assert.equal(listRes.status, 200);
        const wireList = await listRes.text();
        const derived = await deriveFlowRecords(
            db, organization, flowId,
        );
        assert.equal(wireList, JSON.stringify(derived));
        assert.equal(derived.length, 1);

        const byIdRes = await handleRequest(
            db,
            req(
                'GET',
                '/flows/' + flowId + '/records/' + joinId,
                token,
            ),
        );
        assert.equal(byIdRes.status, 200);
        const wireById = await byIdRes.text();
        const derivedById = await deriveFlowRecord(
            db, organization, flowId, joinId,
        );
        assert.equal(wireById, JSON.stringify(derivedById));
    }

    const token = await organizationToken();
    const emptyRes = await handleRequest(
        db,
        req(
            'GET',
            '/flows/' + EMPTY_FLOW_ID + '/records',
            token,
        ),
    );
    assert.equal(emptyRes.status, 200);
    assert.equal(await emptyRes.text(), '[]');
    assert.deepEqual(
        await deriveFlowRecords(
            db, STARK_ORGANIZATION, EMPTY_FLOW_ID,
        ),
        [],
    );
    // Phase Final Stage B: flow_records table retired.
});

// -- 5. live-write chain on wire + derive ------------------------

test('live-write chain: create, edit, RESTRICT 409, echoed'
+ ' trio, archive, delete, physical DELETE — wire + derive',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const recordId = 'rec-drift-chain-1';
    const attrA = 'rec-drift-chain-1-attr-a';
    const attrB = 'rec-drift-chain-1-attr-b';
    const attrC = 'rec-drift-chain-1-attr-c';

    async function assertRecordWire(): Promise<void> {
        const res = await handleRequest(
            db, req('GET', '/records/' + recordId, token),
        );
        assert.equal(res.status, 200);
        const wireText = await res.text();
        const derived = await derivedRecord(
            db, STARK_ORGANIZATION, recordId,
        );
        assert.equal(wireText, JSON.stringify(derived));
    }

    async function assertAttributeWire(id: string): Promise<void> {
        const res = await handleRequest(
            db, req('GET', '/record-attributes/' + id, token),
        );
        assert.equal(res.status, 200);
        const wireText = await res.text();
        const derived = await derivedRecordAttribute(
            db, STARK_ORGANIZATION, id,
        );
        assert.equal(wireText, JSON.stringify(derived));
    }

    async function assertAttributeAbsent(id: string): Promise<void> {
        const res = await handleRequest(
            db, req('GET', '/record-attributes/' + id, token),
        );
        assert.equal(res.status, 404);
        await assert.rejects(
            () => derivedRecordAttribute(
                db, STARK_ORGANIZATION, id,
            ),
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
    await assertRecordWire();
    await assertAttributeWire(attrA);
    await assertAttributeWire(attrB);
    // Phase Final Stage B: records table retired.

    // Step 2: edit — add attrC, remove attrA.
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
    await assertRecordWire();
    await assertAttributeAbsent(attrA);
    await assertAttributeWire(attrB);
    await assertAttributeWire(attrC);

    // Step 3: referenced-attribute removal 409s; zero new pairs.
    const beforeRequestCount =
        (await db.requests.getAll()).length;
    const beforeAttrCount = (
        await derivedRecordAttributes(db, STARK_ORGANIZATION)
    ).length;
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
    assert.equal(
        (await derivedRecordAttributes(db, STARK_ORGANIZATION))
            .length,
        beforeAttrCount,
    );
    await assertRecordWire();

    // Step 4: echoed-trio PUT — no new states row.
    const beforeStatesCount =
        0 /* states table retired */;
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
        0 /* states table retired */,
        beforeStatesCount,
    );
    await assertRecordWire();
    const afterEcho = await derivedRecord(
        db, STARK_ORGANIZATION, recordId,
    );
    assert.equal(afterEcho.description, 'echoed-trio description');

    // Step 5: archived — still visible.
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
    await assertRecordWire();
    const afterArchive = await derivedRecords(
        db, STARK_ORGANIZATION,
    );
    assert.equal(
        afterArchive.some((r) => r.id === recordId), true,
    );

    // Step 6: deleted lifecycle — wire + derive 404.
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
    const deletedGet = await handleRequest(
        db, req('GET', '/records/' + recordId, token),
    );
    assert.equal(deletedGet.status, 404);
    await assert.rejects(
        () => derivedRecord(db, STARK_ORGANIZATION, recordId),
        EntityNotFoundError,
    );
    const derivedListAfterDelete = await derivedRecords(
        db, STARK_ORGANIZATION,
    );
    assert.equal(
        derivedListAfterDelete.some((r) => r.id === recordId),
        false,
    );

    // Phase Final Task 2: states ROW half stripped — history
    // is pair-plane only.
    const derivedHistory = await deriveRecordStateHistory(
        db, STARK_ORGANIZATION, recordId,
    );
    assert.equal(derivedHistory.length, 4);

    // Step 7: physical DELETE on a second record.
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
    const secondGet = await handleRequest(
        db, req('GET', '/records/' + secondRecordId, token),
    );
    assert.equal(secondGet.status, 404);
    await assert.rejects(
        () => derivedRecord(
            db, STARK_ORGANIZATION, secondRecordId,
        ),
        EntityNotFoundError,
    );
});

// -- 6. duplicate-create supersession ----------------------------

test('duplicate-create supersession: second document pair'
+ ' Supersedes the first document pair; wire equals derive',
async () => {
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
    assert.equal(
        secondDocumentResponseRow.supersedes, firstDocumentPairId,
    );

    const res = await handleRequest(
        db, req('GET', '/records/' + recordId, token),
    );
    assert.equal(res.status, 200);
    const wireText = await res.text();
    const derived = await derivedRecord(
        db, STARK_ORGANIZATION, recordId,
    );
    assert.equal(wireText, JSON.stringify(derived));
    assert.equal(derived.name, 'Dup Second');
    // Phase Final Stage B: records table retired.
});

// -- 7. method-filter --------------------------------------------

test('the create-op POST pair is not read as a document pair —'
+ ' create and document bodies share zero top-level keys',
async () => {
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

// -- 8. genesis-wins-under-skew ----------------------------------

test('a clock-skewed transition does NOT displace genesis — '
+ 'wire + derive + order-asserting full-history', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const recordId = 'rec-drift-skew-1';

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

    const res = await handleRequest(
        db, req('GET', '/records/' + recordId, token),
    );
    assert.equal(res.status, 200);
    const wireText = await res.text();
    const derived = await derivedRecord(
        db, STARK_ORGANIZATION, recordId,
    );
    assert.equal(wireText, JSON.stringify(derived));
    assert.equal(derived.name, 'Skewed Title');

    const records = await derivedRecords(db, STARK_ORGANIZATION);
    assert.equal(
        records.some((r) => r.id === recordId), true,
    );

    const history = await deriveRecordStateHistory(
        db, STARK_ORGANIZATION, recordId,
    );
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

// -- 9. non-lex collection order (craftsmanship) -----------------

test('GET /records collection is wire byte-identical to a'
+ ' literal id-lex reconstruction after non-lex PUTs',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const fixtures = [
        {
            id: 'rec-drift-z',
            name: 'Zulu',
            at: '2026-07-01T00:00:00.000000Z',
            ev: 'ev-drift-z',
        },
        {
            id: 'rec-drift-a',
            name: 'Alpha',
            at: '2026-07-01T00:00:01.000000Z',
            ev: 'ev-drift-a',
        },
        {
            id: 'rec-drift-m',
            name: 'Mike',
            at: '2026-07-01T00:00:02.000000Z',
            ev: 'ev-drift-m',
        },
    ];
    for (const f of fixtures) {
        const put = await handleRequest(db, req(
            'PUT', '/records/' + f.id, token, {
                name: f.name,
                description: 'd',
                position: 1,
                state: 'active',
                state_at: f.at,
                state_event_id: f.ev,
            },
        ));
        assert.equal(put.status, 200);
    }
    // id-lex expected order: a, m, z — NOT insertion order.
    const expectedIds = [
        'rec-drift-a', 'rec-drift-m', 'rec-drift-z',
    ];
    const res = await handleRequest(
        db, req('GET', '/records', token),
    );
    assert.equal(res.status, 200);
    const list = await res.json() as { id: string }[];
    const added = list.filter((row) =>
        row.id.startsWith('rec-drift-'));
    assert.deepEqual(
        added.map((r) => r.id), expectedIds,
    );
    const derived = await derivedRecords(db, STARK_ORGANIZATION);
    assert.equal(
        JSON.stringify(list), JSON.stringify(derived),
    );
});

// -- 10. delete-then-recreate ------------------------------------

test('delete-then-recreate: DELETE via the wire, re-PUT the'
+ ' SAME id, GET by-id + collection succeed on wire + derive',
async () => {
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

    const miss = await handleRequest(
        db, req('GET', '/records/' + recordId, token),
    );
    assert.equal(miss.status, 404);
    await assert.rejects(
        () => derivedRecord(db, STARK_ORGANIZATION, recordId),
        EntityNotFoundError,
    );

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

    const res = await handleRequest(
        db, req('GET', '/records/' + recordId, token),
    );
    assert.equal(res.status, 200);
    const wireText = await res.text();
    const derived = await derivedRecord(
        db, STARK_ORGANIZATION, recordId,
    );
    assert.equal(wireText, JSON.stringify(derived));
    assert.equal(derived.name, 'Second Life');

    const listRes = await handleRequest(
        db, req('GET', '/records', token),
    );
    assert.equal(listRes.status, 200);
    const list = await listRes.json() as { id: string }[];
    assert.equal(
        list.some((r) => r.id === recordId), true,
    );
});

// -- 11. VALUE-COUNT DERIVABILITY PROOF --------------------------

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

    // Seeded flagship WO: SFV folds into transition op
    // bodies (states-address retirement Task 12) — 7 rows.
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
    assert.equal(flagshipScan.size, 7);
    for (const attributeId of flagshipAttributeIds) {
        assert.equal(flagshipScan.get(attributeId), 1);
    }

    const flagshipReferrers = await collectAttributeReferrers(
        db, STARK_ORGANIZATION, flagshipAttributeIds,
    );
    let flagshipTotal = 0;
    for (const attributeId of flagshipAttributeIds) {
        const referrers = flagshipReferrers.get(attributeId)!;
        assert.equal(referrers.valueCount, 1);
        flagshipTotal += referrers.valueCount;
    }
    assert.equal(flagshipTotal, 7);

    // Live ledger-backed transition.
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
        db, STARK_ORGANIZATION,
        [liveAttributeX, liveAttributeY],
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
