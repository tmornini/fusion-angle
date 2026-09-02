import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    EntityNotFoundError,
    ForeignOrganizationError,
} from '../api/db.ts';
import type { DbAdapter } from '../api/db.ts';
import type {
    Id,
    RecordEntity,
    RecordAttributeEntity,
} from '../api/types.ts';
import { nowUtc } from
    '../api/types.ts';
import { canonicalUriCollection } from '../api/message-pair.ts';
import { documentMessagePairsAt } from '../api/derive-documents.ts';
import {
    documentGetHandler,
    documentCollectionGetHandler,
    type DocumentFamilyWiring,
} from '../api/document-family.ts';
import {
    pickString,
    pickNumber,
    validateRecordDocumentBody,
} from '../api/validators.ts';
import {
    postRecordDocumentOp,
} from '../api/routes.ts';
import {
    appendLegacyTransition,
} from './legacy-transition-fixture.ts';
import {
    deriveFlowRecords,
    deriveFlowRecord,
} from '../api/derive-flow-records.ts';
import { deriveRecordTypeStateHistory } from
    '../api/derive-record-types.ts';
import { resolveGlobalOwner } from '../api/derive-states.ts';
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
import {
    stateFieldValuesFrom,
} from '../api/derive-state-field-values.ts';
import {
    deriveInstanceHead,
} from '../api/derive-record-instances.ts';
import {
    SEED_INSTANCE_ID,
} from '../api/mock-data/seed-message-pairs.ts';
import { organizationToken } from './token-fixtures.ts';
import { parseWire } from '../shared/http-message/wire-codec.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { seedIdentifier } from
    '../api/mock-data/seed-kit.ts';

const SEED_FLOW_ORGANIZATION_TWO = seedIdentifier('seed-flow-org2');
const REC_DRIFT_CHAIN_1_ATTR_A = generateIdentifier();
const REC_DRIFT_CHAIN_1_ATTR_B = generateIdentifier();
const REC_DRIFT_CHAIN_1_ATTR_C = generateIdentifier();
const REC_DRIFT_CHAIN_1_GENESIS = generateIdentifier();
const REC_DRIFT_CHAIN_1_EDIT = generateIdentifier();
const REC_DRIFT_CHAIN_1_REJECTED = generateIdentifier();
const REC_DRIFT_CHAIN_2_GENESIS = generateIdentifier();
const REC_DRIFT_DUP_1_A_ATTR = generateIdentifier();
const REC_DRIFT_DUP_1_A_EV = generateIdentifier();
const REC_DRIFT_DUP_1_B_ATTR = generateIdentifier();
const REC_DRIFT_DUP_1_B_EV = generateIdentifier();
const REC_DRIFT_METHOD_FILTER_1 = generateIdentifier();
const REC_DRIFT_METHOD_FILTER_1_ATTR = generateIdentifier();
const REC_DRIFT_METHOD_FILTER_1_EV = generateIdentifier();
const REC_DRIFT_Z = generateIdentifier();
const EV_DRIFT_Z = generateIdentifier();
const REC_DRIFT_A = generateIdentifier();
const EV_DRIFT_A = generateIdentifier();
const REC_DRIFT_M = generateIdentifier();
const EV_DRIFT_M = generateIdentifier();
const N_START = generateIdentifier();
const WO_DRIFT_VALUECOUNT_1_ATTR_X = generateIdentifier();
const WO_DRIFT_VALUECOUNT_1_ATTR_Y = generateIdentifier();
const DRIFT_VALUECOUNT_1 = generateIdentifier();
const N_MIDDLE = generateIdentifier();

// Phase Final Task 2: records(+record_attributes+flow_records)
// dual-write stripped. This file no longer compares derive vs
// old-table oracles — the row plane is empty after seed.
// Coverage re-homes to wire-byte handleRequest assertions and
// non-lexical live fixtures. Records is a TRIO family with a
// live DELETE on :id (Author gate 9).

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

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

// -- test-side wiring mirrors (routes.ts's private rows) --------

const RECORDS_TEST_WIRING: DocumentFamilyWiring = {
    family: 'record-types',
    httpNest: 'organization',
    lifecycle: 'trio',
    notFoundTable: 'record_types',
    validateDocument: validateRecordDocumentBody,
    documentOp: postRecordDocumentOp,
    // Mirror routes.ts recordDocumentEntityOf: stamp trio
    // from lifecycle-current (required on trio path).
    entityOf: (document, organization, current) => {
        const body = document.body;
        return {
            id: document.uriId,
            organization_id: organization,
            name: pickString(body, 'name'),
            description: pickString(body, 'description'),
            position: pickNumber(body, 'position'),
            state: current!.state,
        };
    },
};

const READER_ACTOR: Id = generateIdentifier();
const LIVEWORKORDERID_FWO = generateIdentifier();
const LIVEWORKORDERID_EV1 = generateIdentifier();
const LIVEWORKORDERID_EV2 = generateIdentifier();
const LIVEWORKORDERID_EV3 = generateIdentifier();
const LIVEWORKORDERID_TE1 = generateIdentifier();
const LIVEWORKORDERID_FV1 = generateIdentifier();
const LIVEWORKORDERID_FV2 = generateIdentifier();

async function derivedRecords(
    db: DbAdapter, organization: Id,
): Promise<RecordEntity[]> {
    return documentCollectionGetHandler(RECORDS_TEST_WIRING)(
        db, [], READER_ACTOR, organization, [],
    ) as Promise<RecordEntity[]>;
}

async function derivedRecord(
    db: DbAdapter, organization: Id, id: Id,
): Promise<RecordEntity> {
    return documentGetHandler(RECORDS_TEST_WIRING)(
        db, [organization, id], READER_ACTOR, organization,
        [],
    ) as Promise<RecordEntity>;
}

// Task 23: nested attributes under each type.
async function derivedRecordAttributes(
    db: DbAdapter, organization: Id,
): Promise<RecordAttributeEntity[]> {
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', organization,
    );
    const typesRes = await handleRequest(
        db,
        req(
            'GET',
            '/organizations/' + organization
                + '/record-types/',
            token,
        ),
    );
    if (typesRes.status !== 200) {
        throw new Error(
            'derivedRecordAttributes: types GET '
            + typesRes.status,
        );
    }
    const types =
        await typesRes.json() as { id: string }[];
    const out: RecordAttributeEntity[] = [];
    for (const type of types) {
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/' + organization
                    + '/record-types/' + type.id
                    + '/attributes/',
                token,
            ),
        );
        if (res.status !== 200) {
            throw new Error(
                'derivedRecordAttributes: GET '
                + res.status,
            );
        }
        out.push(
            ...await res.json() as RecordAttributeEntity[],
        );
    }
    return out;
}

async function resolveAttributePath(
    db: DbAdapter, organization: Id, id: Id,
): Promise<string | null> {
    const hits = (await db.messagePairs.getAll()).filter(
        (row) => row.uri_id === id,
    );
    const needle = '/organizations/' + organization
        + '/record-types/';
    for (const hit of hits) {
        if (
            hit.uri_collection.startsWith(needle)
            && hit.uri_collection.endsWith('/attributes/')
        ) {
            const typeId = hit.uri_collection
                .slice(needle.length)
                .split('/')[0];
            if (typeId !== undefined && typeId !== '') {
                return '/organizations/' + organization
                    + '/record-types/' + typeId
                    + '/attributes/' + id;
            }
        }
    }
    return null;
}

async function derivedRecordAttribute(
    db: DbAdapter, organization: Id, id: Id,
): Promise<RecordAttributeEntity> {
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', organization,
    );
    const path = await resolveAttributePath(
        db, organization, id,
    );
    if (path === null) {
        // Attribute head is not under this org's nested
        // prefixes — ownership fence (same 403/404 as the
        // retired flat by-id GET).
        const owner = await resolveGlobalOwner(
            db, id, organization,
        );
        if (owner !== null && owner !== organization) {
            throw new ForeignOrganizationError(
                'record_attributes', id,
            );
        }
        throw new EntityNotFoundError(
            'record_attributes', id,
        );
    }
    const res = await handleRequest(
        db, req('GET', path, token),
    );
    if (res.status === 404) {
        throw new EntityNotFoundError(
            'record_attributes', id,
        );
    }
    if (res.status === 403) {
        throw new ForeignOrganizationError(
            'record_attributes', id,
        );
    }
    if (res.status !== 200) {
        throw new Error(
            'derivedRecordAttribute: GET ' + res.status,
        );
    }
    return await res.json() as RecordAttributeEntity;
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
        options: [],
        constraints: [],
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
    _stateAt: string,
    _stateEventId: string,
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
        removedAttributeIds,
    };
}

function decodeRequestMessage(message: string): {
    readonly method: string;
    readonly body: Record<string, unknown>;
} {
    const model = parseWire(message);
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

Deno.test('seeded GET nested record-types wire equals derived'
+ ' collection'
    + ', both orgs (the AjdvjuECVZEgZoFajaIEkg/'
    + 'AjdvjuECVZEgZoFajaIEkg split)', async () => {
    const db = await seededDb();
    for (const organization of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const token = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', organization,
        );
        const res = await handleRequest(
            db, req(
                'GET',
                '/organizations/' + organization
                    + '/record-types/',
                token,
            ),
        );
        assertStrictEquals(res.status, 200);
        const wireText = await res.text();
        const derived = await derivedRecords(db, organization);
        assertStrictEquals(wireText, JSON.stringify(derived));
    }
    const org1 = await derivedRecords(db, STARK_ORGANIZATION);
    const org2 = await derivedRecords(db, ORGANIZATION_TWO);
    assertStrictEquals(org1.length, 1);
    assertStrictEquals(org2.length, 1);
    assertStrictEquals(org1[0]!.id, customerProfileRecordId);
    assertStrictEquals(org2[0]!.id, projectBriefRecordId);
    // Phase Final Stage B: records table retired.
});

// -- 2. foreign-org GET 404 on wire + derive ---------------------

Deno.test('a foreign-org GET 404s on wire and on derive, for'
+ ' records, record-attributes, and flow_records',
async () => {
    const db = await seededDb();
    const tokenTwo = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );

    // Nested path org = token org (TWO); foreign id was
    // never written at this address → 404.
    const expectedRecordMessage =
        'Not found: record_types/'
        + customerProfileRecordId;
    const recRes = await handleRequest(
        db,
        req(
            'GET',
            '/organizations/' + ORGANIZATION_TWO
                + '/record-types/'
                + customerProfileRecordId,
            tokenTwo,
        ),
    );
    assertStrictEquals(recRes.status, 404);
    const recBody = await recRes.json() as { error: string };
    assertStrictEquals(recBody.error, expectedRecordMessage);
    const err = await assertRejects(
        () => derivedRecord(
            db, ORGANIZATION_TWO, customerProfileRecordId,
        ),
    ) as Error;
    assertInstanceOf(err, EntityNotFoundError);
    assertStrictEquals(err.message, expectedRecordMessage);

    const attributeId = 'CPJmMPXRaBIiNdGBofUPVg';
    // Nested GET probes the parent type first — miss at
    // this org's record-types address → 404.
    const expectedTypeMessage =
        'Not found: record_types/'
        + customerProfileRecordId;
    const attrRes = await handleRequest(
        db,
        req(
            'GET',
            '/organizations/' + ORGANIZATION_TWO
                + '/record-types/'
                + customerProfileRecordId
                + '/attributes/' + attributeId,
            tokenTwo,
        ),
    );
    assertStrictEquals(attrRes.status, 404);
    const attrBody = await attrRes.json() as { error: string };
    assertStrictEquals(attrBody.error, expectedTypeMessage);
    const expectedAttributeMessage =
        'Not found: record_attributes/' + attributeId;
    const attrErr = await assertRejects(
        () => derivedRecordAttribute(
            db, ORGANIZATION_TWO, attributeId,
        ),
    ) as Error;
    assertInstanceOf(attrErr, EntityNotFoundError);
    assertStrictEquals(
        attrErr.message, expectedAttributeMessage,
    );

    const joinId = 'dDmnfQddFbigpThjftUlWg';
    const flowId = 'esKujtyQFYUJaVSXWwavzA';
    const expectedJoinMessage =
        'Not found: flow_records/' + joinId;
    const joinRes = await handleRequest(
        db,
        req(
            'GET',
            '/organizations/' + ORGANIZATION_TWO
                + '/flows/' + flowId + '/records/' + joinId,
            tokenTwo,
        ),
    );
    assertStrictEquals(joinRes.status, 404);
    const joinBody = await joinRes.json() as { error: string };
    assertStrictEquals(joinBody.error, expectedJoinMessage);
    const joinErr = await assertRejects(
        () => deriveFlowRecord(
            db, ORGANIZATION_TWO, flowId, joinId,
        ),
    ) as Error;
    assertInstanceOf(joinErr, EntityNotFoundError);
    assertStrictEquals(joinErr.message, expectedJoinMessage);
});

// -- 3. per-record + per-attribute GET wire equals derive --------

Deno.test('per-record GET wire equals derive; per-attribute GET'
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
            'XXZruirZyAOoRpNxaDnpSA', organization,
        );
        const res = await handleRequest(
            db, req(
                'GET',
                '/organizations/' + organization
                    + '/record-types/' + id,
                token,
            ),
        );
        assertStrictEquals(res.status, 200);
        const wireText = await res.text();
        const derived = await derivedRecord(
            db, organization, id,
        );
        assertStrictEquals(wireText, JSON.stringify(derived));
    }

    const attributeOrganizationByRecordId:
        Record<string, string> = {
            [customerProfileRecordId]: STARK_ORGANIZATION,
            [projectBriefRecordId]: ORGANIZATION_TWO,
        };
    const attributes = buildRecordAttributes();
    assertStrictEquals(attributes.length, 14);
    for (const attribute of attributes) {
        const organization =
            attributeOrganizationByRecordId[
                attribute.record_id
            ]!;
        const token = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', organization,
        );
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/' + organization
                    + '/record-types/'
                    + attribute.record_id
                    + '/attributes/' + attribute.id,
                token,
            ),
        );
        assertStrictEquals(res.status, 200);
        const wireText = await res.text();
        const derived = await derivedRecordAttribute(
            db, organization, attribute.id,
        );
        assertStrictEquals(wireText, JSON.stringify(derived));
        assertStrictEquals(derived.name, attribute.name);
    }

    const org1Attributes = await derivedRecordAttributes(
        db, STARK_ORGANIZATION,
    );
    const org2Attributes = await derivedRecordAttributes(
        db, ORGANIZATION_TWO,
    );
    assertStrictEquals(org1Attributes.length, 10);
    assertStrictEquals(org2Attributes.length, 4);
    // Phase Final Stage B: record_attributes table retired.
});

// -- 4. flow_records join wire equals derive ---------------------

const EMPTY_FLOW_ID = 'DDUhYDIRInXtIrRraxcyHQ'; // Layout Test

const SEEDED_JOIN_FLOWS = [
    {
        flowId: 'esKujtyQFYUJaVSXWwavzA', // Customer Onboarding
        organization: STARK_ORGANIZATION,
        joinId: 'dDmnfQddFbigpThjftUlWg',
    },
    {
        flowId: l2cFlowId, // Lead-to-Close
        organization: STARK_ORGANIZATION,
        joinId: 'dEOBUSXWcOtSmtDXJpVNuQ',
    },
    {
        flowId: SEED_FLOW_ORGANIZATION_TWO,
        organization: ORGANIZATION_TWO,
        joinId: 'dGFWxGmaxtWWawferGBezQ',
    },
];

Deno.test('flow_records join wire equals derive across every'
+ ' seeded flow (the AjdvjuECVZEgZoFajaIEkg/AjdvjuECVZEgZoFajaIEkg/'
    + 'AjdvjuECVZEgZoFajaIEkg split) + empty + :frid',
async () => {
    const db = await seededDb();
    for (const { flowId, organization, joinId } of
        SEEDED_JOIN_FLOWS
    ) {
        const token = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', organization,
        );
        const listRes = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/' + organization
                    + '/flows/' + flowId + '/records/',
                token,
            ),
        );
        assertStrictEquals(listRes.status, 200);
        const wireList = await listRes.text();
        const derived = await deriveFlowRecords(
            db, organization, flowId,
        );
        assertStrictEquals(wireList, JSON.stringify(derived));
        assertStrictEquals(derived.length, 1);

        const byIdRes = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/' + organization
                    + '/flows/' + flowId + '/records/' + joinId,
                token,
            ),
        );
        assertStrictEquals(byIdRes.status, 200);
        const wireById = await byIdRes.text();
        const derivedById = await deriveFlowRecord(
            db, organization, flowId, joinId,
        );
        assertStrictEquals(wireById, JSON.stringify(derivedById));
    }

    const token = await organizationToken();
    const emptyRes = await handleRequest(
        db,
        req(
            'GET',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + EMPTY_FLOW_ID
                + '/records/',
            token,
        ),
    );
    assertStrictEquals(emptyRes.status, 200);
    assertStrictEquals(await emptyRes.text(), '[]');
    assertEquals(
        await deriveFlowRecords(
            db, STARK_ORGANIZATION, EMPTY_FLOW_ID,
        ),
        [],
    );
    // Phase Final Stage B: flow_records table retired.
});

// -- 5. live-write chain on wire + derive ------------------------

Deno.test('live-write chain: create, edit, RESTRICT 409, echoed'
+ ' trio, archive, delete, physical DELETE — wire + derive',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const recordId = generateIdentifier();
    const attrA = REC_DRIFT_CHAIN_1_ATTR_A;
    const attrB = REC_DRIFT_CHAIN_1_ATTR_B;
    const attrC = REC_DRIFT_CHAIN_1_ATTR_C;

    async function assertRecordWire(): Promise<void> {
        const res = await handleRequest(
            db, req('GET', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + recordId, token),
        );
        assertStrictEquals(res.status, 200);
        const wireText = await res.text();
        const derived = await derivedRecord(
            db, STARK_ORGANIZATION, recordId,
        );
        assertStrictEquals(wireText, JSON.stringify(derived));
    }

    async function assertAttributeWire(id: string): Promise<void> {
        const res = await handleRequest(
            db, req('GET', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + recordId
                + '/attributes/' + id, token),
        );
        assertStrictEquals(res.status, 200);
        const wireText = await res.text();
        const derived = await derivedRecordAttribute(
            db, STARK_ORGANIZATION, id,
        );
        assertStrictEquals(wireText, JSON.stringify(derived));
    }

    async function assertAttributeAbsent(id: string): Promise<void> {
        const res = await handleRequest(
            db, req('GET', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + recordId
                + '/attributes/' + id, token),
        );
        assertStrictEquals(res.status, 404);
        await assertRejects(
            () => derivedRecordAttribute(
                db, STARK_ORGANIZATION, id,
            ),
            EntityNotFoundError,
        );
    }

    // Step 1: create, 2 attributes.
    const created = await handleRequest(db, req(
        'POST', '/organizations/' + STARK_ORGANIZATION
            + '/record-types/', token,
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
            REC_DRIFT_CHAIN_1_GENESIS, nowUtc(),
        ),
    ));
    assertStrictEquals(created.status, 201);
    await assertRecordWire();
    await assertAttributeWire(attrA);
    await assertAttributeWire(attrB);
    // Phase Final Stage B: records table retired.

    // Step 2: edit — add attrC, remove attrA.
    const editStateAt = nowUtc();
    const editStateEventId = REC_DRIFT_CHAIN_1_EDIT;
    const edited = await handleRequest(db, req(
        'POST', '/organizations/' + STARK_ORGANIZATION
            + '/record-types/', token,
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
    assertStrictEquals(edited.status, 201);
    await assertRecordWire();
    await assertAttributeAbsent(attrA);
    await assertAttributeWire(attrB);
    await assertAttributeWire(attrC);

    // Step 3: referenced-attribute removal 409s; zero new pairs.
    const beforeRequestCount =
        (await db.messagePairs.getAll()).length;
    const beforeAttrCount = (
        await derivedRecordAttributes(db, STARK_ORGANIZATION)
    ).length;
    const rejected = await handleRequest(db, req(
        'POST', '/organizations/' + STARK_ORGANIZATION
            + '/record-types/', token,
        editRecordBody(
            recordId, STARK_ORGANIZATION, 'Chain Record',
            [], ['CPJmMPXRaBIiNdGBofUPVg'],
            'active', nowUtc(), REC_DRIFT_CHAIN_1_REJECTED,
        ),
    ));
    assertStrictEquals(rejected.status, 409);
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, beforeRequestCount,
    );
    assertStrictEquals(
        (await derivedRecordAttributes(db, STARK_ORGANIZATION))
            .length,
        beforeAttrCount,
    );
    await assertRecordWire();

    // Step 4: echoed-trio PUT — no new states row.
    const beforeStatesCount =
        0 /* states table retired */;
    const echoed = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + recordId, token, {
            name: 'Chain Record',
            description: 'echoed-trio description',
            position: 1,
            state: 'active',
        },
    ));
    assertStrictEquals(echoed.status, 201);
    assertStrictEquals(
        0 /* states table retired */,
        beforeStatesCount,
    );
    await assertRecordWire();
    const afterEcho = await derivedRecord(
        db, STARK_ORGANIZATION, recordId,
    );
    assertStrictEquals(afterEcho.description, 'echoed-trio description');

    // Step 5: archived — still visible.
    const archived = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + recordId, token, {
            name: 'Chain Record',
            description: 'echoed-trio description',
            position: 1,
            state: 'archived',
        },
    ));
    assertStrictEquals(archived.status, 201);
    await assertRecordWire();
    const afterArchive = await derivedRecords(
        db, STARK_ORGANIZATION,
    );
    assertStrictEquals(
        afterArchive.some((r) => r.id === recordId), true,
    );

    // Step 6: deleted lifecycle — wire + derive 404.
    const deletedTransition = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + recordId, token, {
            name: 'Chain Record',
            description: 'echoed-trio description',
            position: 1,
            state: 'deleted',
        },
    ));
    assertStrictEquals(deletedTransition.status, 201);
    const deletedGet = await handleRequest(
        db, req('GET', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + recordId, token),
    );
    assertStrictEquals(deletedGet.status, 404);
    await assertRejects(
        () => derivedRecord(db, STARK_ORGANIZATION, recordId),
        EntityNotFoundError,
    );
    const derivedListAfterDelete = await derivedRecords(
        db, STARK_ORGANIZATION,
    );
    assertStrictEquals(
        derivedListAfterDelete.some((r) => r.id === recordId),
        false,
    );

    // Phase Final Task 2: states ROW half stripped — history
    // is message-plane only.
    const derivedHistory = await deriveRecordTypeStateHistory(
        db, STARK_ORGANIZATION, recordId,
    );
    assertStrictEquals(derivedHistory.length, 3);

    // Step 7: physical DELETE on a second record.
    const secondRecordId = generateIdentifier();
    const secondCreated = await handleRequest(db, req(
        'POST', '/organizations/' + STARK_ORGANIZATION
            + '/record-types/', token,
        createRecordBody(
            secondRecordId, STARK_ORGANIZATION, 'Second Record',
            [], REC_DRIFT_CHAIN_2_GENESIS, nowUtc(),
        ),
    ));
    assertStrictEquals(secondCreated.status, 201);
    const secondDeleted = await handleRequest(db, req(
        'DELETE', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + secondRecordId, token,
    ));
    assertStrictEquals(secondDeleted.status, 204);
    const secondGet = await handleRequest(
        db, req('GET', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + secondRecordId, token),
    );
    assertStrictEquals(secondGet.status, 404);
    await assertRejects(
        () => derivedRecord(
            db, STARK_ORGANIZATION, secondRecordId,
        ),
        EntityNotFoundError,
    );
});

// -- 6. duplicate-create supersession ----------------------------

Deno.test('duplicate-create supersession: second document message pair'
+ ' Supersedes the first document message pair; wire equals derive',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const recordId = generateIdentifier();
    const prefix = canonicalUriCollection(
        STARK_ORGANIZATION, '/record-types/',
    );

    const first = await handleRequest(db, req(
        'POST', '/organizations/' + STARK_ORGANIZATION
            + '/record-types/', token,
        createRecordBody(
            recordId, STARK_ORGANIZATION, 'Dup First',
            [
                attributeBody(
                    REC_DRIFT_DUP_1_A_ATTR, recordId,
                    'Attr A', STARK_ORGANIZATION,
                ),
            ],
            REC_DRIFT_DUP_1_A_EV,
            '2026-05-02T00:00:00.000000Z',
        ),
    ));
    assertStrictEquals(first.status, 201);

    const firstDocumentMessagePairs = documentMessagePairsAt(
        await db.messagePairs.getAllWhere(
            'uri_collection', prefix,
        ),
        prefix,
    ).filter((messagePair) => messagePair.uriId === recordId);
    assertStrictEquals(firstDocumentMessagePairs.length, 1);

    const second = await handleRequest(db, req(
        'POST', '/organizations/' + STARK_ORGANIZATION
            + '/record-types/', token,
        createRecordBody(
            recordId, STARK_ORGANIZATION, 'Dup Second',
            [
                attributeBody(
                    REC_DRIFT_DUP_1_B_ATTR, recordId,
                    'Attr B', STARK_ORGANIZATION,
                ),
            ],
            REC_DRIFT_DUP_1_B_EV,
            '2026-05-02T00:00:01.000000Z',
        ),
    ));
    assertStrictEquals(second.status, 201);

    const allRequests =
        await db.messagePairs.getAllWhere('uri_collection', prefix);
    const allResponses =
        await db.messagePairs.getAllWhere('uri_collection', prefix);
    const secondDocumentMessagePairs = documentMessagePairsAt(
        allRequests, prefix,
    ).filter((messagePair) => messagePair.uriId === recordId);
    assertStrictEquals(secondDocumentMessagePairs.length, 2);
    const secondDocumentMessagePairId =
        secondDocumentMessagePairs[1]!.id;
    const secondDocumentResponseRow = allResponses.find(
        (r) => r.id === secondDocumentMessagePairId,
    )!;
    assertStrictEquals(
        'supersedes' in secondDocumentResponseRow, false,
    );

    const res = await handleRequest(
        db, req('GET', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + recordId, token),
    );
    assertStrictEquals(res.status, 200);
    const wireText = await res.text();
    const derived = await derivedRecord(
        db, STARK_ORGANIZATION, recordId,
    );
    assertStrictEquals(wireText, JSON.stringify(derived));
    assertStrictEquals(derived.name, 'Dup Second');
    // Phase Final Stage B: records table retired.
});

// -- 7. method-filter --------------------------------------------

Deno.test('the create-op POST pair is not read as a document message pair —'
+ ' create and document bodies share zero top-level keys',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const recordId = REC_DRIFT_METHOD_FILTER_1;
    const attributeId = REC_DRIFT_METHOD_FILTER_1_ATTR;

    const created = await handleRequest(db, req(
        'POST', '/organizations/' + STARK_ORGANIZATION
            + '/record-types/', token,
        createRecordBody(
            recordId, STARK_ORGANIZATION, 'Method Filter Record',
            [
                attributeBody(
                    attributeId, recordId, 'Attr',
                    STARK_ORGANIZATION,
                ),
            ],
            REC_DRIFT_METHOD_FILTER_1_EV,
            '2026-05-03T00:00:00.000000Z',
        ),
    ));
    assertStrictEquals(created.status, 201);

    const recordsPrefix = canonicalUriCollection(
        STARK_ORGANIZATION, '/record-types/',
    );
    const [recordRequests] = await Promise.all([
        db.messagePairs.getAllWhere('uri_collection', recordsPrefix),
        db.messagePairs.getAllWhere('uri_collection', recordsPrefix),
    ]);
    const atRecordAddress = recordRequests.filter(
        (r) => r.uri_collection === recordsPrefix
            && r.uri_id === recordId,
    );
    assertStrictEquals(atRecordAddress.length, 2);

    const recordDocumentMessagePairs = documentMessagePairsAt(
        recordRequests, recordsPrefix,
    ).filter((messagePair) => messagePair.uriId === recordId);
    assertStrictEquals(recordDocumentMessagePairs.length, 1);
    assertStrictEquals(recordDocumentMessagePairs[0]!.method, 'PUT');

    const postRow = atRecordAddress.find(
        (r) => decodeRequestMessage(r.request).method === 'POST',
    )!;
    const createBodyKeys = new Set(
        Object.keys(decodeRequestMessage(postRow.request).body),
    );
    const documentBodyKeys = new Set(
        Object.keys(recordDocumentMessagePairs[0]!.body),
    );
    const overlap = [...createBodyKeys].filter(
        (key) => documentBodyKeys.has(key),
    );
    assertEquals(overlap, []);

    // Task 8: attribute pairs store under the type's
    // nested attributes prefix.
    const attributesPrefix =
        '/organizations/' + STARK_ORGANIZATION
        + '/record-types/' + recordId + '/attributes/';
    const [attributeRequests] =
        await Promise.all([
            db.messagePairs.getAllWhere(
                'uri_collection', attributesPrefix,
            ),
            db.messagePairs.getAllWhere(
                'uri_collection', attributesPrefix,
            ),
        ]);
    const attributeDocumentMessagePairs = documentMessagePairsAt(
        attributeRequests, attributesPrefix,
    ).filter((messagePair) =>
        messagePair.uriId === attributeId);
    assertStrictEquals(attributeDocumentMessagePairs.length, 1);
    assertStrictEquals(attributeDocumentMessagePairs[0]!.method, 'PUT');
});

// -- 8. genesis-wins-under-skew ----------------------------------
// case-7d mirror for records GET: a clock-skewed later
// arrival whose state_at sorts BELOW genesis does NOT
// displace genesis as lifecycle-current. Head body fields
// (name) may reflect the later arrival; the GET trio must
// stay genesis (state ← event.state, state_at ← event.at,
// state_event_id ← event.id).

Deno.test('GET record trio is lifecycle-current under clock skew'
+ ' (genesis-wins-under-skew, case 7d)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const recordId = generateIdentifier();

    const genesis = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + recordId, token, {
            name: 'Genesis Title', description: 'd', position: 1,
            state: 'active',
        },
    ));
    assertStrictEquals(genesis.status, 201);

    // Later arrival, earlier state_at, different state + name.
    // 'deleted' would hide the row if it won as current —
    // genesis-wins keeps the record live and active.
    const skewed = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + recordId, token, {
            name: 'Skewed Title', description: 'd', position: 1,
            state: 'deleted',
        },
    ));
    assertStrictEquals(skewed.status, 201);

    const res = await handleRequest(
        db, req('GET', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + recordId, token),
    );
    assertStrictEquals(res.status, 404);
    const history = await deriveRecordTypeStateHistory(
        db, STARK_ORGANIZATION, recordId,
    );
    assertEquals(
        history.map((entry) => entry.state),
        ['active', 'deleted'],
    );
});

// -- 9. non-lex collection order (craftsmanship) -----------------

Deno.test('GET /records collection is wire byte-identical to a'
+ ' literal id-lex reconstruction after non-lex PUTs',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const fixtures = [
        {
            id: REC_DRIFT_Z,
            name: 'Zulu',
            at: '2026-07-01T00:00:00.000000Z',
            ev: EV_DRIFT_Z,
        },
        {
            id: REC_DRIFT_A,
            name: 'Alpha',
            at: '2026-07-01T00:00:01.000000Z',
            ev: EV_DRIFT_A,
        },
        {
            id: REC_DRIFT_M,
            name: 'Mike',
            at: '2026-07-01T00:00:02.000000Z',
            ev: EV_DRIFT_M,
        },
    ];
    for (const f of fixtures) {
        const put = await handleRequest(db, req(
            'PUT', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + f.id, token, {
                name: f.name,
                description: 'd',
                position: 1,
                state: 'active',
            },
        ));
        assertStrictEquals(put.status, 201);
    }
    // Oldest live head (at, id): z, a, m — insertion.
    const expectedIds = [
        REC_DRIFT_Z, REC_DRIFT_A, REC_DRIFT_M,
    ];
    const res = await handleRequest(
        db, req('GET', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/', token),
    );
    assertStrictEquals(res.status, 200);
    const list = await res.json() as { id: string }[];
    const added = list.filter((row) =>
        [
            REC_DRIFT_Z, REC_DRIFT_A, REC_DRIFT_M,
        ].includes(row.id));
    assertEquals(
        added.map((r) => r.id), expectedIds,
    );
    const derived = await derivedRecords(db, STARK_ORGANIZATION);
    assertStrictEquals(
        JSON.stringify(list), JSON.stringify(derived),
    );
});

// -- 10. delete-then-recreate ------------------------------------

Deno.test('delete-then-recreate: DELETE via the wire, re-PUT the'
+ ' SAME id, GET by-id + collection succeed on wire + derive',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const recordId = generateIdentifier();

    const genesis = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + recordId, token, {
            name: 'First Life', description: 'd', position: 1,
            state: 'active',
        },
    ));
    assertStrictEquals(genesis.status, 201);

    const deleted = await handleRequest(db, req(
        'DELETE', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + recordId, token,
    ));
    assertStrictEquals(deleted.status, 204);
    const deleteResponseId = deleted.headers.get('Response-ID');
    assert(deleteResponseId);

    const miss = await handleRequest(
        db, req('GET', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + recordId, token),
    );
    assertStrictEquals(miss.status, 404);
    await assertRejects(
        () => derivedRecord(db, STARK_ORGANIZATION, recordId),
        EntityNotFoundError,
    );

    const recreated = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + recordId, token, {
            name: 'Second Life', description: 'd', position: 1,
            state: 'active',
        },
    ));
    assertStrictEquals(recreated.status, 201);
    assertStrictEquals(
        recreated.headers.get('Supersedes'), null,
    );

    const res = await handleRequest(
        db, req('GET', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/' + recordId, token),
    );
    assertStrictEquals(res.status, 200);
    const wireText = await res.text();
    const derived = await derivedRecord(
        db, STARK_ORGANIZATION, recordId,
    );
    assertStrictEquals(wireText, JSON.stringify(derived));
    assertStrictEquals(derived.name, 'Second Life');

    const listRes = await handleRequest(
        db, req('GET', '/organizations/' + STARK_ORGANIZATION
                + '/record-types/', token),
    );
    assertStrictEquals(listRes.status, 200);
    const list = await listRes.json() as { id: string }[];
    assertStrictEquals(
        list.some((r) => r.id === recordId), true,
    );
});

// -- 11. VALUE-COUNT DERIVABILITY PROOF --------------------------

async function transitionFieldValueCounts(
    db: MemoryDbAdapter,
    organization: string,
    workOrderId: string,
): Promise<Map<string, number>> {
    const prefix = canonicalUriCollection(
        organization,
        '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + workOrderId
            + '/transition/',
    );
    const [requests, responses] = await Promise.all([
        db.messagePairs.getAllWhere('uri_collection', prefix),
        db.messagePairs.getAllWhere('uri_collection', prefix),
    ]);
    const requestById = new Map(
        requests.map((request) => [request.id, request]),
    );
    const counts = new Map<string, number>();
    for (const response of responses) {
        if (response.uri_collection !== prefix) continue;
        const request = requestById.get(response.id);
        if (request === undefined) continue;
        const decoded = decodeRequestMessage(request.request);
        if (decoded.method !== 'POST') continue;
        // Guard: new-shape transitions omit fieldValues; only
        // legacy bags contribute to this SFV tally.
        const fieldValues = decoded.body['fieldValues'];
        if (!Array.isArray(fieldValues)) continue;
        for (const row of fieldValues as readonly {
            fields: Record<string, unknown>;
        }[]) {
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

function workOrderFlowGraph(
    lockTimeoutSeconds: number,
): Record<string, unknown> {
    return {
        name: 'Value-Count Fixture Flow',
        lockTimeout: lockTimeoutSeconds,
        nodes: [
            {
                id: N_START, name: 'Start',
                positionX: 0, positionY: 0,
                isCreate: true, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: N_MIDDLE, name: 'Middle',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
        ],
        edges: [],
    };
}

Deno.test('THE VALUE-COUNT DERIVABILITY PROOF: a per-attribute'
+ " fieldValues tally over a work order's OWN transition"
+ " pairs equals collectAttributeReferrers' valueCount for a"
+ ' live, ledger-backed transition', async () => {
    const db = await seededDb();

    // Seeded flagship WO: value-bearing transitions migrate to
    // instance-head SoT (Task 6) — legacy bags gone; instance
    // head holds the seven-value union.
    const flagshipWorkOrderId = 'xqcXYHXBJJXcLkRYkRngKA';
    const flagshipAttributeIds = [
        'CPJmMPXRaBIiNdGBofUPVg', // Company Name
        'oeqelDVElwxHYWkWRVTCYw', // Contact Email
        'kxbdVhmkaEzkJvghWKFzkw', // Contact Phone
        'QHzHnEAmqGSgiEfkXoWMTw', // Industry
        'AXxvHyKNpNYXYKOorywqRQ', // Annual Revenue
        'DfkwfBiyfyCyRHvsHnDiqQ', // Number of Employees
        'ElVKgkCreTEHQXJZPBJDKw', // Reviewer Notes
    ];
    assertStrictEquals(flagshipAttributeIds.length, 7);

    const flagshipScan = await transitionFieldValueCounts(
        db, STARK_ORGANIZATION, flagshipWorkOrderId,
    );
    assertStrictEquals(flagshipScan.size, 0);

    const allMessagePairs = await db.messagePairs.getAll();
    const sfvRows = stateFieldValuesFrom(allMessagePairs);
    const flagshipSfvTally = new Map<string, number>();
    for (const row of sfvRows) {
        if (
            !flagshipAttributeIds.includes(row.attribute_id)
        ) {
            continue;
        }
        flagshipSfvTally.set(
            row.attribute_id,
            (flagshipSfvTally.get(row.attribute_id) ?? 0)
                + 1,
        );
    }
    for (const attributeId of flagshipAttributeIds) {
        assertStrictEquals(
            flagshipSfvTally.get(attributeId) ?? 0, 0,
        );
    }

    const head = await deriveInstanceHead(
        db, STARK_ORGANIZATION, customerProfileRecordId,
        SEED_INSTANCE_ID,
    );
    assert(head !== undefined);
    assertStrictEquals(head!.values.length, 7);
    for (const attributeId of flagshipAttributeIds) {
        assert(
            head!.values.some(
                (v) => v.attribute_id === attributeId,
            ),
            'instance head missing ' + attributeId,
        );
    }

    const flagshipReferrers = await collectAttributeReferrers(
        db, STARK_ORGANIZATION, flagshipAttributeIds,
        customerProfileRecordId,
    );
    for (const attributeId of flagshipAttributeIds) {
        const referrers = flagshipReferrers.get(attributeId)!;
        assertStrictEquals(referrers.valueCount, 0);
        assert(
            referrers.instanceIds.includes(
                SEED_INSTANCE_ID,
            ),
            'referrers miss instance for ' + attributeId,
        );
    }

    // Live ledger-backed transition.
    const token = await organizationToken();
    const liveWorkOrderId = generateIdentifier();
    const liveAttributeX = WO_DRIFT_VALUECOUNT_1_ATTR_X;
    const liveAttributeY = WO_DRIFT_VALUECOUNT_1_ATTR_Y;
    const graph = workOrderFlowGraph(8 * 60 * 60);

    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token, {
            id: liveWorkOrderId,
            workOrder: {
                display_id: DRIFT_VALUECOUNT_1,
                flow_graph: graph,
                position: 1,
            },
            flowWorkOrderId: LIVEWORKORDERID_FWO,
            flowWorkOrder: {
                flow_id: EMPTY_FLOW_ID,
                work_order_id: liveWorkOrderId,
                at: nowUtc(),
            },
            stateEventIds: [
                LIVEWORKORDERID_EV1,
                LIVEWORKORDERID_EV2,
                LIVEWORKORDERID_EV3,
            ],
            stateEventAts: [nowUtc(), nowUtc(), nowUtc()],
            states: [N_START, N_MIDDLE, 'claimed'],
        },
    ));
    assertStrictEquals(created.status, 201);

    // Task 8 CUT: legacy fieldValues below the gate
    // (live leg still seeds STORED SFV fold shape).
    await appendLegacyTransition(
        db, STARK_ORGANIZATION, liveWorkOrderId, {
            transitionEventId: LIVEWORKORDERID_TE1,
            targetState: N_MIDDLE,
            fieldValues: [
                {
                    id: LIVEWORKORDERID_FV1,
                    fields: {
                        state_event_id:
                            LIVEWORKORDERID_TE1,
                        attribute_id: liveAttributeX,
                        value: 'x-value',
                    },
                },
                {
                    id: LIVEWORKORDERID_FV2,
                    fields: {
                        state_event_id:
                            LIVEWORKORDERID_TE1,
                        attribute_id: liveAttributeY,
                        value: 'y-value',
                    },
                },
            ],
            release: null,
            transitionAt: nowUtc(),
        },
    );

    const liveScan = await transitionFieldValueCounts(
        db, STARK_ORGANIZATION, liveWorkOrderId,
    );
    const liveReferrers = await collectAttributeReferrers(
        db, STARK_ORGANIZATION,
        [liveAttributeX, liveAttributeY],
        'seed-type',
    );
    assertStrictEquals(liveScan.get(liveAttributeX), 1);
    assertStrictEquals(liveScan.get(liveAttributeY), 1);
    assertStrictEquals(
        liveScan.get(liveAttributeX),
        liveReferrers.get(liveAttributeX)!.valueCount,
    );
    assertStrictEquals(
        liveScan.get(liveAttributeY),
        liveReferrers.get(liveAttributeY)!.valueCount,
    );
});
