import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PUT, handleRequest } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { ValidationError } from '../api/types.ts';
import {
    validateMembershipDocumentBody,
    validateMembershipEntity,
} from '../api/validators.ts';
import {
    postMembershipDocumentOp,
} from '../api/routes.ts';

import {
    TEST_OPERATION_ID,
    apiRequest,
    storedPutBodyText,
} from './http-fixtures.ts';
import {
    seatDocumentPair,
} from './root-admin-fixture.ts';

// Seat document body is type + at. Privilege type (admin|
// member) bakes into claims at mint. Leftover /memberships
// validators still gate the leftover join shape.

function documentFields() {
    return {
        organization_id: '1',
        identity_id: 'sarah',
        type: 'member',
        at: '2026-01-01T00:00:00.000000Z',
    };
}

// -- 1. validateMembershipDocumentBody -----------------------

test('validateMembershipDocumentBody accepts the exact'
+ ' four-key body', () => {
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
    for (const key of [
        'organization_id', 'identity_id', 'type', 'at',
    ]) {
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

test('postMembershipDocumentOp writes a seat pair',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const body = { type: 'member', at: documentFields().at };
    const pair = await seatDocumentPair(
        '1', 'sarah', body,
        '2026-01-01T00:00:00.000000Z',
    );
    const written = await postMembershipDocumentOp(
        db, 'sarah', body, 'current', pair,
    );
    assert.deepEqual(written, body);
    assert.equal((await db.pairs.getAll()).length, 1);
    assert.equal((await db.pairs.getAll()).length, 1);
});

// -- 3. byte-identical resend (the E6 fast-path sibling pin) --

test('a byte-identical PUT resend to a seat converges'
+ ' to one stored request/response pair', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const body = { type: 'member', at: documentFields().at };
    const first = await PUT(
        db, 'organizations/1/members/sarah', body, DEV_TOKEN,
    );
    const second = await PUT(
        db, 'organizations/1/members/sarah', body, DEV_TOKEN,
    );
    assert.deepEqual(first, second);
    // seedAdminSchema: org + current seat; one unique
    // sarah seat PUT. Byte-identical resend dedups.
    assert.equal((await db.pairs.getAll()).length, 4);
    assert.equal((await db.pairs.getAll()).length, 4);
});

test('a seat PUT chain derives the latest body',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const first = { type: 'member', at: documentFields().at };
    const firstPut = await handleRequest(
        db,
        apiRequest({
            method: 'PUT',
            path: '/organizations/1/members/sarah',
            token: DEV_TOKEN,
            body: first,
            operationId: TEST_OPERATION_ID,
        }),
    );
    assert.equal(firstPut.status, 201);
    const firstGet = await handleRequest(
        db,
        apiRequest({
            method: 'GET',
            path: '/organizations/1/members/sarah',
            token: DEV_TOKEN,
        }),
    );
    assert.equal(firstGet.status, 200);
    const firstBody = await firstGet.json() as {
        type: string;
        at: string;
    };
    assert.equal(firstBody.type, 'member');
    const second = {
        type: 'admin',
        at: '2026-02-02T00:00:00.000000Z',
    };
    const secondPut = await handleRequest(
        db,
        apiRequest({
            method: 'PUT',
            path: '/organizations/1/members/sarah',
            token: DEV_TOKEN,
            body: second,
            operationId: TEST_OPERATION_ID,
        }),
    );
    assert.equal(secondPut.status, 201);
    const secondGet = await handleRequest(
        db,
        apiRequest({
            method: 'GET',
            path: '/organizations/1/members/sarah',
            token: DEV_TOKEN,
        }),
    );
    const secondBody = await secondGet.json() as {
        type: string;
        at: string;
    };
    assert.equal(secondBody.type, 'admin');
    assert.equal(secondBody.at, second.at);
});

test('a seat DELETE-head is absent', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await handleRequest(
        db,
        apiRequest({
            method: 'PUT',
            path: '/organizations/1/members/sarah',
            token: DEV_TOKEN,
            body: {
                type: 'member',
                at: documentFields().at,
            },
            operationId: TEST_OPERATION_ID,
        }),
    );
    const del = await handleRequest(
        db,
        apiRequest({
            method: 'DELETE',
            path: '/organizations/1/members/sarah',
            token: DEV_TOKEN,
            operationId: TEST_OPERATION_ID,
        }),
    );
    assert.equal(del.status, 204);
    const missing = await handleRequest(
        db,
        apiRequest({
            method: 'GET',
            path: '/organizations/1/members/sarah',
            token: DEV_TOKEN,
        }),
    );
    assert.equal(missing.status, 404);
});

test('stored PUT body equals the seat wire entity',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const id = 'sarah';
    const body = {
        type: 'member',
        at: documentFields().at,
    };
    const put = await handleRequest(
        db,
        apiRequest({
            method: 'PUT',
            path: '/organizations/1/members/' + id,
            token: DEV_TOKEN,
            body,
            operationId: TEST_OPERATION_ID,
        }),
    );
    assert.equal(put.status, 201);
    const stored = JSON.parse(
        await storedPutBodyText(
            db, '/organizations/1/members/', id,
        ),
    );
    assert.deepEqual(stored, {
        id,
        organization_id: '1',
        identity_id: id,
        type: 'member',
        at: documentFields().at,
    });
});
