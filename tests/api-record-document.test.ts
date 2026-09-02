import {
    assert,
    assertEquals,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import { deriveRecordTypeStateHistory } from
    '../api/derive-record-types.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { postRecordDocumentOp } from '../api/routes.ts';
import { validateRecordDocumentBody } from '../api/validators.ts';
import { ValidationError } from '../api/types.ts';
import type { MessagePairEntity } from '../api/types.ts';
import {
    documentMessagePairsAt,
    documentLifecycleEvents,
} from '../api/derive-documents.ts';
import { formWriteMessagePair } from '../api/message-pair.ts';
import {
    RECORD_TYPE_DETAIL_PATTERN,
} from '../api/family-registry.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

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
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
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
// + states event are the oracles (row plane empty).
Deno.test('postRecordDocumentOp genesis (head-absent) returns the'
+ ' entity and posts exactly one event authored by the actor',
async () => {
    const db = await freshDb();
    // Phase Final Task 2: states ROW half stripped — pair
    // required for deriveRecordTypeStateHistory to see genesis.
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
        operationId: TEST_OPERATION_ID,
    });
    const written = await postRecordDocumentOp(
        db, 'rbfHGatkwQzGZJVXKJEeyw', body,
        'XXZruirZyAOoRpNxaDnpSA', messagePair,
    );
    assertStrictEquals(written.name, 'Fresh');
    assertStrictEquals(written.organization_id, 'AjdvjuECVZEgZoFajaIEkg');
    // Phase Final Stage B: records table retired.
    const events = await deriveRecordTypeStateHistory(db
        , 'AjdvjuECVZEgZoFajaIEkg', 'rbfHGatkwQzGZJVXKJEeyw');
    assertStrictEquals(events.length, 1);
    assertStrictEquals(events[0]!.state, 'active');
    assertStrictEquals(events[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
});

// The MEMBER_ID CAVEAT: the head event is authored by
// 'XXZruirZyAOoRpNxaDnpSA'; a DIFFERENT member ('member-b') then edits an
// entity field while echoing the SAME trio verbatim. sameEvent
// (store-state.ts) compares member_id too, so replaying
// 'member-b' as author would 409 against the already-stored
// (current-authored) row — this proves the op replays the
// STORED head's member_id rather than the editing actor's.
// Phase 14 Task 5: the head read is now message-plane-anchored
// (documentStateHeadFor), so the FIRST (genesis) call must form
// a real document message pair for the second call's head-read
// to find it — the below-gate convention this file otherwise
// follows (its own header comment) omits pairs entirely, which
// the row-plane read tolerated but the message-plane one
// cannot; the pair is formed via formWriteMessagePair, the
// SAME helper document-family.test.ts's below-facade
// convention test uses.
Deno.test('postRecordDocumentOp with an echoed trio writes NO new'
+ ' event, replaying the stored head\'s member_id',
async () => {
    const db = await freshDb();
    const firstBody = {
        ...recordDocument('First', 'active', AT, 'ev-2'),
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    };
    const firstMessagePair = await formWriteMessagePair({
        method: 'PUT'
            , pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rcaSzEaORBkezCxyhLhecA',
        routePattern: RECORD_TYPE_DETAIL_PATTERN,
        routeSegments: RECORD_TYPE_DETAIL_PATTERN.split('/'),
        pathSegments: ['organizations', 'AjdvjuECVZEgZoFajaIEkg'
            , 'record-types', 'rcaSzEaORBkezCxyhLhecA'],
        headerFields: [], body: firstBody,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: AT, organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseStatus: 200, responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await postRecordDocumentOp(
        db, 'rcaSzEaORBkezCxyhLhecA', firstBody, 'XXZruirZyAOoRpNxaDnpSA'
            , firstMessagePair,
    );
    const second = await postRecordDocumentOp(
        db, 'rcaSzEaORBkezCxyhLhecA',
        {
            ...recordDocument('Second', 'active', AT, 'ev-2'),
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        },
        'member-b',
    );
    const events = await deriveRecordTypeStateHistory(db
        , 'AjdvjuECVZEgZoFajaIEkg', 'rcaSzEaORBkezCxyhLhecA');
    assertStrictEquals(events.length, 1);
    assertStrictEquals(events[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
    assertStrictEquals(second.name, 'Second');
    // Phase Final Stage B: records table retired.
});

Deno.test('postRecordDocumentOp with a fresh trio posts a'
+ ' transition authored by the actor', async () => {
    const db = await freshDb();
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
        operationId: TEST_OPERATION_ID,
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
        operationId: TEST_OPERATION_ID,
    });
    await postRecordDocumentOp(
        db, 'rlBnfIvzDVVZeVSjBECxGg', secondBody, 'XXZruirZyAOoRpNxaDnpSA'
            , secondMessagePair,
    );
    const events = await deriveRecordTypeStateHistory(db
        , 'AjdvjuECVZEgZoFajaIEkg', 'rlBnfIvzDVVZeVSjBECxGg');
    assertEquals(
        events.map(e => e.state).toSorted(),
        ['active', 'archived'],
    );
    assert(events.every(e => e.member_id === 'XXZruirZyAOoRpNxaDnpSA'));
});

// -- 3. the fast-path sibling pin (added at the fold commit,
// now that RECORDS_WIRING wires records/:id onto this op) ---
//
// The gate's pre-tx idempotency fast path (api.ts) replays a
// byte-identical resend's STORED response without re-dispatching
// to the op — sibling of api-idea-document.test.ts's own "a
// byte-identical resend converges: one event, one pair".

Deno.test('a byte-identical resend replays the stored response:'
+ ' one event, one pair', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = recordDocument(
        'Idempotent', 'active', AT, 'ev-resend',
    );
    await handleRequest(
        db, req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'sBdXBQtlujsRkbzspdvfFg',
            token, body,
        ),
    );
    await handleRequest(
        db, req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'sBdXBQtlujsRkbzspdvfFg',
            token, body,
        ),
    );
    const events = await deriveRecordTypeStateHistory(db
        , 'AjdvjuECVZEgZoFajaIEkg', 'sBdXBQtlujsRkbzspdvfFg');
    assertStrictEquals(events.length, 1);
    assertStrictEquals((await db.messagePairs.getAll()).length, 3);
    assertStrictEquals((await db.messagePairs.getAll()).length, 3);
});

// -- 4. the DELETE-pair walk filter (Author gate 9) ----------
//
// documentLifecycleEvents walks every 2xx PUT/DELETE pair at a
// document address; a DELETE pair's stored body is empty
// (design decision 6), so before the fix it threw inside
// pickString the moment it reached the DELETE pair. records is
// the first trio family with a live DELETE at its :id address,
// so a delete-then-recreate history is the first live
// reproduction of the throw. No route dispatches records/:id
// through this walk yet (GET stays hand-written until Task 7),
// so this pins the shared derive-documents.ts fix directly
// against fabricated pairs — below-gate, family-agnostic.

async function storedMessagePairAt(
    method: string,
    uriId: string,
    at: string,
    body: Record<string, unknown> | undefined,
): Promise<MessagePairEntity> {
    const messagePair = await formWriteMessagePair({
        method,
        pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + uriId,
        routePattern: RECORD_TYPE_DETAIL_PATTERN,
        routeSegments: RECORD_TYPE_DETAIL_PATTERN.split('/'),
        pathSegments: ['organizations', 'AjdvjuECVZEgZoFajaIEkg'
            , 'record-types', uriId],
        headerFields: [],
        body,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: at,
        organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseStatus: method === 'DELETE' ? 204 : 200,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    return {
        id: messagePair.id,
        uri_collection: messagePair.uriCollection,
        uri_id: messagePair.uriId,
        requester_identity_id: messagePair.requesterIdentityId,
        method: messagePair.method,
        request_at: at,
        request_hash: messagePair.requestHash,
        request: messagePair.requestMessage,
        response_at: at,
        response: messagePair.responseMessage,
        operation_id: messagePair.operationId,
    };
}

Deno.test('documentLifecycleEvents skips a DELETE-method pair,'
+ ' yielding the two PUT trios across a delete-then-recreate'
+ ' history', async () => {
    const prefix = '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/';
    const first = await storedMessagePairAt(
        'PUT', 'rec-x', '2026-01-01T00:00:00.000000Z',
        recordDocument('First', 'active', AT, 'ev-x1'),
    );
    const deleted = await storedMessagePairAt(
        'DELETE', 'rec-x', '2026-01-02T00:00:00.000000Z',
        undefined,
    );
    const second = await storedMessagePairAt(
        'PUT', 'rec-x', '2026-01-03T00:00:00.000000Z',
        recordDocument(
            'Second', 'active',
            '2026-01-03T00:00:00.000000Z', 'ev-x2',
        ),
    );
    const messagePairs = documentMessagePairsAt(
        [first, deleted, second], prefix,
    )
        .filter(messagePair => messagePair.uriId === 'rec-x');
    assertStrictEquals(messagePairs.length, 3);
    const events = documentLifecycleEvents(messagePairs);
    assertEquals(
        events.map(e => e.state),
        ['active', 'active'],
    );
});
