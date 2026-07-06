import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { sha256Hex } from '../shared/digest.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { jsonArrayField } from '../api/types.ts';

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
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

function createRecordBody(
    id: string,
    eventId: string,
    attributes: Record<string, unknown>[] = [],
) {
    return {
        kind: 'create',
        id,
        record: {
            organization_id: '1',
            name: 'Fresh Record',
            description: 'd',
            position: 1,
        },
        attributes,
        initialState: 'active',
        initialStateEventId: eventId,
        initialStateAt: AT,
    };
}

// Echoes the SAME trio the create above minted for `eventId` —
// never a fresh mint, so the sameEvent decompose no-ops.
function editRecordBody(id: string, eventId: string) {
    return {
        kind: 'edit',
        id,
        record: {
            organization_id: '1',
            name: 'Edited Record',
            description: 'd2',
            position: 1,
        },
        attributes: [],
        state: 'active',
        state_at: AT,
        state_event_id: eventId,
        removedAttributeIds: [],
    };
}

function recordAttribute(
    id: string, recordId: string, name: string,
) {
    return {
        id,
        organization_id: '1',
        record_id: recordId,
        name,
        attribute_type: 'text',
        sort_order: 0,
        options: jsonArrayField([]),
        constraints: jsonArrayField([]),
    };
}

function recordFields(name: string) {
    return {
        organization_id: '1',
        name,
        description: 'd',
        position: 1,
    };
}

// PUT /records/:id now takes the FULL document (Decision 7):
// the entity fields plus the state trio. One fixed trio per
// record id keeps every PUT below a same-state edit — none of
// these exercise a genuine transition.
function recordPutBody(recordId: string, name: string) {
    return {
        ...recordFields(name),
        state: 'active',
        state_at: '2026-01-01T00:00:00.000000Z',
        state_event_id: 'ev-' + recordId,
    };
}

function recordAttributeFields(recordId: string, name: string) {
    return {
        organization_id: '1',
        record_id: recordId,
        name,
        attribute_type: 'text',
        sort_order: 0,
        options: jsonArrayField([]),
        constraints: jsonArrayField([]),
    };
}

test('a record create appends its pair at the entity'
+ ' address', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/records', token,
        createRecordBody('rec-1', 'ev-1'),
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    // Create balance: operation + document (2+N; zero
    // attributes here) — the H7/arrival-order hazard class
    // means a positional requests[0] read is unsafe once TWO
    // pairs share this address, so filter/count instead.
    assert.equal(requests.length, 2);
    const atAddress = requests.filter(
        r => r.uri_prefix === '/organizations/1/records/'
            && r.uri_id === 'rec-1',
    );
    assert.equal(atAddress.length, 2);
});

test('a failed record create appends nothing, the whole'
+ ' bundle (operation + document + attribute)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await db.states.put('ev-x', {
        entity_id: 'other',
        state: 'active',
        member_id: 'current',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const res = await handleRequest(db, req(
        'POST', '/records', token,
        createRecordBody('rec-doomed', 'ev-x', [
            recordAttribute('attr-doomed', 'rec-doomed', 'X'),
        ]),
    ));
    assert.equal(res.status, 409);
    assert.equal((await db.requests.getAll()).length, 0);
    assert.equal((await db.responses.getAll()).length, 0);
});

test('an edit POST shares the SAME address as create and'
+ ' supersedes the create\'s true head', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const created = await handleRequest(db, req(
        'POST', '/records', token,
        createRecordBody('rec-2', 'ev-2'),
    ));
    assert.equal(created.status, 204);
    // The create's OWN document pair — appended strictly after
    // the operation pair within the same tx — becomes the
    // shared address's true head (nowUtc monotonicity). Read it
    // BELOW-WIRE rather than trusting the create response's own
    // Response-ID header: that header names the OPERATION pair,
    // not the head the edit will supersede. The flows fresh-GET
    // fix (headResponseId) is unavailable here — Response-ID
    // attaches on GET only for 'locked' families, and records
    // is 'simple'.
    const prefix = '/organizations/1/records/';
    const atAddress = (await db.responses.getAll()).filter(
        r => r.uri_prefix === prefix && r.uri_id === 'rec-2',
    );
    const trueHead = latestByKey(
        atAddress, () => 'head',
    ).get('head');
    assert.ok(trueHead, 'no stored response at the address');
    const edited = await handleRequest(db, req(
        'POST', '/records', token,
        editRecordBody('rec-2', 'ev-2'),
    ));
    assert.equal(edited.status, 204);
    assert.equal(
        edited.headers.get('Supersedes'), trueHead!.id,
    );
    // The edit's OWN operation pair — read BELOW-WIRE via the
    // SAME idiom, filtered to the operation shape (status 204,
    // never the document pair's 200) — also supersedes
    // trueHead's id: the gate's headPairIdAt read, at this
    // shared address, resolves to the SAME create's document
    // pair the wire Supersedes header above already names. Pins
    // the below-wire parity the wire header alone cannot prove.
    const editOperationPair = latestByKey(
        (await db.responses.getAll()).filter(
            r => r.uri_prefix === prefix && r.uri_id === 'rec-2'
                && r.status !== 200,
        ),
        () => 'head',
    ).get('head');
    assert.ok(
        editOperationPair, 'no stored operation-pair response',
    );
    assert.equal(editOperationPair!.supersedes, trueHead!.id);
});

test('a record create with attributes appends the'
+ ' document pair and one attribute pair per attribute',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/records', token,
        createRecordBody('rec-11', 'ev-11', [
            recordAttribute('attr-11a', 'rec-11', 'A'),
            recordAttribute('attr-11b', 'rec-11', 'B'),
        ]),
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    // 2 (operation + document) + 2 attributes = 4.
    assert.equal(requests.length, 4);
    const recordsPrefix = '/organizations/1/records/';
    const atRecordAddress = requests.filter(
        r => r.uri_prefix === recordsPrefix
            && r.uri_id === 'rec-11',
    );
    assert.equal(atRecordAddress.length, 2);
    const attributesPrefix =
        '/organizations/1/record-attributes/';
    assert.equal(
        requests.filter(
            r => r.uri_prefix === attributesPrefix
                && r.uri_id === 'attr-11a',
        ).length,
        1,
    );
    assert.equal(
        requests.filter(
            r => r.uri_prefix === attributesPrefix
                && r.uri_id === 'attr-11b',
        ).length,
        1,
    );
    // The synthesized document pair is byte-indistinguishable
    // from a live PUT records/:id genesis pair: 200, entity
    // fields plus the trio, no id/organization_id key.
    const responses = await db.responses.getAll();
    const documentResponse = responses.find(
        r => r.uri_prefix === recordsPrefix
            && r.uri_id === 'rec-11'
            && r.status === 200,
    );
    assert.ok(documentResponse, 'no document pair response');
    const documentRequest = requests.find(
        r => r.id === documentResponse!.id,
    );
    const embeddedDocument = JSON.parse(
        documentRequest!.message,
    ) as { body: Record<string, unknown> };
    assert.deepEqual(
        Object.keys(embeddedDocument.body).sort(),
        [
            'description', 'name', 'position',
            'state', 'state_at', 'state_event_id',
        ],
    );
    // Same check for one attribute pair: byte-indistinguishable
    // from a live PUT record-attributes/:id pair (the id-strip
    // covenant).
    const attributeRequest = requests.find(
        r => r.uri_prefix === attributesPrefix
            && r.uri_id === 'attr-11a',
    );
    const embeddedAttribute = JSON.parse(
        attributeRequest!.message,
    ) as { body: Record<string, unknown> };
    assert.deepEqual(
        Object.keys(embeddedAttribute.body).sort(),
        [
            'attribute_type', 'constraints', 'name',
            'options', 'record_id', 'sort_order',
        ],
    );
});

test('a record edit removing an attribute appends a'
+ ' DELETE-shaped pair at the attribute\'s own address',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'POST', '/records', token,
        createRecordBody('rec-12', 'ev-12', [
            recordAttribute('attr-12', 'rec-12', 'Gone'),
        ]),
    ));
    const edited = await handleRequest(db, req(
        'POST', '/records', token, {
            kind: 'edit',
            id: 'rec-12',
            record: {
                organization_id: '1',
                name: 'Edited Record',
                description: 'd2',
                position: 1,
            },
            attributes: [],
            state: 'active',
            state_at: AT,
            state_event_id: 'ev-12',
            removedAttributeIds: ['attr-12'],
        },
    ));
    assert.equal(edited.status, 204);
    const attributesPrefix =
        '/organizations/1/record-attributes/';
    const responses = (await db.responses.getAll()).filter(
        r => r.uri_prefix === attributesPrefix
            && r.uri_id === 'attr-12',
    );
    // one PUT-shaped (the create's own attribute pair, 200)
    // plus one DELETE-shaped (the edit's removal, 204) at the
    // SAME address.
    assert.equal(responses.length, 2);
    assert.equal(
        responses.filter(r => r.status === 200).length, 1,
    );
    assert.equal(
        responses.filter(r => r.status === 204).length, 1,
    );
});

test('a PUT to a fresh record appends its pair, and a'
+ ' second PUT supersedes it', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const first = await handleRequest(db, req(
        'PUT', '/records/rec-3', token,
        recordPutBody('rec-3', 'First'),
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);
    const second = await handleRequest(db, req(
        'PUT', '/records/rec-3', token,
        recordPutBody('rec-3', 'Second'),
    ));
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('Supersedes'), firstId);
});

test('DELETE records/:id appends its tombstone pair,'
+ ' superseding the PUT', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const put = await handleRequest(db, req(
        'PUT', '/records/rec-4', token,
        recordPutBody('rec-4', 'Doomed'),
    ));
    const putId = put.headers.get('Response-ID');
    const del = await handleRequest(db, req(
        'DELETE', '/records/rec-4', token,
    ));
    assert.equal(del.status, 204);
    assert.equal(del.headers.get('Supersedes'), putId);
    await assert.rejects(() => db.records.getById('rec-4'));
});

test('each 200 route\'s wire body matches a direct domain '
+ 'read', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const record = await handleRequest(db, req(
        'PUT', '/records/rec-5', token,
        recordPutBody('rec-5', 'Wired'),
    ));
    assert.equal(record.status, 200);
    const recordRow = await db.records.getById('rec-5');
    assert.deepEqual(await record.json(), recordRow);

    const attr = await handleRequest(db, req(
        'PUT', '/record-attributes/attr-1', token,
        recordAttributeFields('rec-5', 'Priority'),
    ));
    assert.equal(attr.status, 200);
    const attrRow =
        await db.recordAttributes.getById('attr-1');
    assert.deepEqual(await attr.json(), attrRow);

    const link = await handleRequest(db, req(
        'PUT', '/flows/flow-1/records/frid-1', token,
        { flow_id: 'flow-1', record_id: 'rec-5', at: AT },
    ));
    assert.equal(link.status, 200);
    const linkRow = await db.flowRecords.getById('frid-1');
    assert.deepEqual(await link.json(), linkRow);
});

test('DELETE record-attributes/:id appends its tombstone'
+ ' pair when unreferenced', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const put = await handleRequest(db, req(
        'PUT', '/record-attributes/attr-2', token,
        recordAttributeFields('rec-6', 'Loose'),
    ));
    const putId = put.headers.get('Response-ID');
    const del = await handleRequest(db, req(
        'DELETE', '/record-attributes/attr-2', token,
    ));
    assert.equal(del.status, 204);
    assert.equal(del.headers.get('Supersedes'), putId);
});

test('a RESTRICTed DELETE record-attributes/:id 409s and'
+ ' appends nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', '/record-attributes/attr-3', token,
        recordAttributeFields('rec-7', 'Bound'),
    ));
    await db.stateFieldValues.put('sfv-1', {
        state_event_id: 'ev-x',
        attribute_id: 'attr-3',
        value: 'v',
    });
    const countBefore = (await db.requests.getAll()).length;
    const del = await handleRequest(db, req(
        'DELETE', '/record-attributes/attr-3', token,
    ));
    assert.equal(del.status, 409);
    assert.equal(
        (await db.requests.getAll()).length, countBefore,
    );
});

test('DELETE flows/:id/records/:frid appends its tombstone'
+ ' pair', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const put = await handleRequest(db, req(
        'PUT', '/flows/flow-2/records/frid-2', token,
        { flow_id: 'flow-2', record_id: 'rec-8', at: AT },
    ));
    const putId = put.headers.get('Response-ID');
    const del = await handleRequest(db, req(
        'DELETE', '/flows/flow-2/records/frid-2', token,
    ));
    assert.equal(del.status, 204);
    assert.equal(del.headers.get('Supersedes'), putId);
    await assert.rejects(
        () => db.flowRecords.getById('frid-2'),
    );
});

test('stored messages verify against their hashes',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'POST', '/records', token,
        createRecordBody('rec-9', 'ev-9'),
    ));
    await handleRequest(db, req(
        'PUT', '/record-attributes/attr-9', token,
        recordAttributeFields('rec-9', 'Verify'),
    ));
    for (const row of await db.requests.getAll()) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
    for (const row of await db.responses.getAll()) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
});

test('request and response counts stay equal across a mix'
+ ' including one failure', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'POST', '/records', token,
        createRecordBody('rec-10', 'ev-10'),
    ));
    await handleRequest(db, req(
        'PUT', '/record-attributes/attr-10', token,
        recordAttributeFields('rec-10', 'Mixed'),
    ));
    await handleRequest(db, req(
        'PUT', '/flows/flow-3/records/frid-3', token,
        { flow_id: 'flow-3', record_id: 'rec-10', at: AT },
    ));
    await handleRequest(db, req(
        'DELETE', '/flows/flow-3/records/frid-3', token,
    ));
    await db.states.put('ev-conflict', {
        entity_id: 'other',
        state: 'active',
        member_id: 'current',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const failed = await handleRequest(db, req(
        'POST', '/records', token,
        createRecordBody('rec-fail', 'ev-conflict'),
    ));
    assert.equal(failed.status, 409);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});
