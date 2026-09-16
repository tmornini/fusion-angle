import {
    assert,
    assertEquals,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { postRecordDocumentOp } from '../api/routes.ts';
import { validateRecordDocumentBody } from '../api/validators.ts';
import { ValidationError } from '../api/types.ts';
import { formWriteMessagePair } from '../api/message-pair.ts';
import {
    RECORD_TYPE_DETAIL_PATTERN,
} from '../api/family-registry.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Task 2 (Decision 7's trio fold, the fifth family): PUT
// records/:id becomes a document PUT — the entity's own fields
// plus the lifecycle trio (state, state_at, state_event_id),
// decomposed at postRecordDocumentOp exactly as
// postIdeaDocumentOp already decomposes ideas'. Cases 1, 2, and
// 4 exercise postRecordDocumentOp/the validator/the shared
// derive-documents.ts walk directly, below-gate, ahead of the
// fold commit that wires records/:id onto this op (mirroring
// tests/api-flow-document.test.ts's own below-gate convention
// for its Task-2-era commit); case 3 rides the live gate now
// that the fold commit has landed.

const AT = '2026-01-01T00:00:00.000000Z';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    operationId?: string,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(operationId !== undefined ? { operationId } : {}),
    });
}

function recordFields(name: string) {
    return {
        name,
        description: 'd',
        position: 1,
    };
}

function recordDocument(
    name: string,
    state: string,
    _stateAt: string,
    _stateEventId: string,
) {
    return {
        ...recordFields(name),
        state,
    };
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

async function versionsOf(
    db: MemoryDbAdapter, token: string,
    family: string, id: string,
): Promise<{ state: string; member_id: string }[]> {
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/' + family
            + '/' + id + '/versions/',
        token,
    ));
    assertStrictEquals(res.status, 200);
    return await res.json() as {
        state: string; member_id: string;
    }[];
}

// -- 1. validateRecordDocumentBody --------------------------

Deno.test('validateRecordDocumentBody accepts entity fields plus'
+ ' the trio, organization_id omitted', () => {
    const doc = validateRecordDocumentBody(
        recordDocument('Fresh', 'active', AT, 'ev-1'),
    );
    assertEquals(doc.entity, {
        name: 'Fresh', description: 'd', position: 1,
    });
    assertStrictEquals(doc.state, 'active');
    assertStrictEquals(doc.state, 'active');
    assertStrictEquals('state_at' in doc, false);
});

Deno.test('validateRecordDocumentBody tolerates a caller-forged'
+ ' organization_id', () => {
    const doc = validateRecordDocumentBody({
        ...recordDocument('Fresh', 'active', AT, 'ev-1'),
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    });
    assertStrictEquals(doc.entity.name, 'Fresh');
});

Deno.test('validateRecordDocumentBody rejects a stray key',
() => {
    assertThrows(
        () => validateRecordDocumentBody({
            ...recordDocument(
                'Fresh', 'active', AT, 'ev-1',
            ),
            bogus: 'x',
        }),
        ValidationError,
    );
});

Deno.test('validateRecordDocumentBody rejects a trio-less body',
() => {
    assertThrows(
        () => validateRecordDocumentBody(
            recordFields('Fresh'),
        ),
        ValidationError,
    );
});

// -- 2. postRecordDocumentOp decomposes the document ---------

// Phase Final Task 2: records ROW half stripped — op return
// + the versions list are the oracles (row plane empty).
Deno.test('postRecordDocumentOp genesis (head-absent) returns the'
+ ' entity and posts exactly one version authored by the actor',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    // Phase Final Task 2: states ROW half stripped — pair
    // required for the versions list to see genesis.
    const body = {
        ...recordDocument('Fresh', 'active', AT, 'ev-1'),
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    };
    const messagePair = await formWriteMessagePair({
        method: 'PUT'
            , pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rbfHGatkwQzGZJVXKJEeyw',
        routePattern: RECORD_TYPE_DETAIL_PATTERN,
        routeSegments: RECORD_TYPE_DETAIL_PATTERN.split('/'),
        pathSegments: ['organizations', 'AjdvjuECVZEgZoFajaIEkg'
            , 'record-types', 'rbfHGatkwQzGZJVXKJEeyw'],
        headerFields: [], body,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: AT, organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseStatus: 200, responseBody: undefined,
        operationId: generateIdentifier(),
    });
    const written = await postRecordDocumentOp(
        db, 'rbfHGatkwQzGZJVXKJEeyw', body,
        'XXZruirZyAOoRpNxaDnpSA', messagePair,
    );
    assertStrictEquals(written.name, 'Fresh');
    assertStrictEquals(written.organization_id, 'AjdvjuECVZEgZoFajaIEkg');
    // Phase Final Stage B: records table retired.
    const versions = await versionsOf(
        db, token, 'record-types', 'rbfHGatkwQzGZJVXKJEeyw',
    );
    assertStrictEquals(versions.length, 1);
    assertStrictEquals(versions[0]!.state, 'active');
    assertStrictEquals(
        versions[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA',
    );
});

Deno.test('postRecordDocumentOp with a new state writes a'
+ ' second version authored by the actor', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    // Phase Final Task 2: both writes carry pairs so the
    // document lifecycle is message-plane visible.
    const firstBody = {
        ...recordDocument(
            'First', 'active', AT, 'ev-3a',
        ),
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    };
    const firstMessagePair = await formWriteMessagePair({
        method: 'PUT'
            , pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rlBnfIvzDVVZeVSjBECxGg',
        routePattern: RECORD_TYPE_DETAIL_PATTERN,
        routeSegments: RECORD_TYPE_DETAIL_PATTERN.split('/'),
        pathSegments: ['organizations', 'AjdvjuECVZEgZoFajaIEkg'
            , 'record-types', 'rlBnfIvzDVVZeVSjBECxGg'],
        headerFields: [], body: firstBody,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: AT, organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseStatus: 200, responseBody: undefined,
        operationId: generateIdentifier(),
    });
    await postRecordDocumentOp(
        db, 'rlBnfIvzDVVZeVSjBECxGg', firstBody, 'XXZruirZyAOoRpNxaDnpSA'
            , firstMessagePair,
    );
    const secondBody = {
        ...recordDocument(
            'First', 'archived',
            '2026-01-02T00:00:00.000000Z', 'ev-3b',
        ),
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    };
    const secondMessagePair = await formWriteMessagePair({
        method: 'PUT'
            , pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rlBnfIvzDVVZeVSjBECxGg',
        routePattern: RECORD_TYPE_DETAIL_PATTERN,
        routeSegments: RECORD_TYPE_DETAIL_PATTERN.split('/'),
        pathSegments: ['organizations', 'AjdvjuECVZEgZoFajaIEkg'
            , 'record-types', 'rlBnfIvzDVVZeVSjBECxGg'],
        headerFields: [], body: secondBody,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: '2026-01-02T00:00:00.000000Z',
        organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseStatus: 200, responseBody: undefined,
        operationId: generateIdentifier(),
    });
    await postRecordDocumentOp(
        db, 'rlBnfIvzDVVZeVSjBECxGg', secondBody, 'XXZruirZyAOoRpNxaDnpSA'
            , secondMessagePair,
    );
    const versions = await versionsOf(
        db, token, 'record-types', 'rlBnfIvzDVVZeVSjBECxGg',
    );
    assertEquals(
        versions.map(v => v.state),
        ['archived', 'active'],
    );
    assert(
        versions.every(
            v => v.member_id === 'XXZruirZyAOoRpNxaDnpSA',
        ),
    );
});

// -- 3. the fast-path sibling pin (added at the fold commit,
// now that RECORDS_WIRING wires records/:id onto this op) ---
//
// The gate's pre-tx idempotency fast path (api.ts) replays a
// byte-identical resend's STORED response without re-dispatching
// to the op — sibling of api-idea-document.test.ts's own "a
// byte-identical resend converges: one pair".

Deno.test('a byte-identical resend replays the stored response:'
+ ' one pair', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = recordDocument(
        'Idempotent', 'active', AT, 'ev-resend',
    );
    const operationId = generateIdentifier();
    await handleRequest(
        db, req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'sBdXBQtlujsRkbzspdvfFg',
            token, body, operationId,
        ),
    );
    await handleRequest(
        db, req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'sBdXBQtlujsRkbzspdvfFg',
            token, body, operationId,
        ),
    );
    assertStrictEquals((await db.messagePairs.getAll()).length, 3);
    assertStrictEquals((await db.messagePairs.getAll()).length, 3);
});
