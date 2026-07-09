import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { postRecordDocumentOp } from '../api/routes.ts';
import { validateRecordDocumentBody } from '../api/validators.ts';
import { ValidationError } from '../api/types.ts';
import type { RequestEntity, ResponseEntity } from '../api/types.ts';
import {
    documentPairsAt,
    documentLifecycleEvents,
} from '../api/derive-documents.ts';
import { formWritePair } from '../api/message-pair.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

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
    stateAt: string,
    stateEventId: string,
) {
    return {
        ...recordFields(name),
        state,
        state_at: stateAt,
        state_event_id: stateEventId,
    };
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// -- 1. validateRecordDocumentBody --------------------------

test('validateRecordDocumentBody accepts entity fields plus'
+ ' the trio, organization_id omitted', () => {
    const doc = validateRecordDocumentBody(
        recordDocument('Fresh', 'active', AT, 'ev-1'),
    );
    assert.deepEqual(doc.entity, {
        name: 'Fresh', description: 'd', position: 1,
    });
    assert.equal(doc.state, 'active');
    assert.equal(doc.state_at, AT);
    assert.equal(doc.state_event_id, 'ev-1');
});

test('validateRecordDocumentBody tolerates a caller-forged'
+ ' organization_id', () => {
    const doc = validateRecordDocumentBody({
        ...recordDocument('Fresh', 'active', AT, 'ev-1'),
        organization_id: '1',
    });
    assert.equal(doc.entity.name, 'Fresh');
});

test('validateRecordDocumentBody rejects a stray key',
() => {
    assert.throws(
        () => validateRecordDocumentBody({
            ...recordDocument(
                'Fresh', 'active', AT, 'ev-1',
            ),
            bogus: 'x',
        }),
        ValidationError,
    );
});

test('validateRecordDocumentBody rejects a trio-less body',
() => {
    assert.throws(
        () => validateRecordDocumentBody(
            recordFields('Fresh'),
        ),
        ValidationError,
    );
});

// -- 2. postRecordDocumentOp decomposes the document ---------

test('postRecordDocumentOp genesis (head-absent) writes the'
+ ' row and exactly one event authored by the actor',
async () => {
    const db = await freshDb();
    const written = await postRecordDocumentOp(
        db, 'rec-1',
        {
            ...recordDocument('Fresh', 'active', AT, 'ev-1'),
            organization_id: '1',
        },
        'current',
    );
    assert.equal(written.name, 'Fresh');
    const row = await db.records.getById('rec-1');
    assert.equal(row.name, 'Fresh');
    const events = await db.states.getAllFor('rec-1');
    assert.equal(events.length, 1);
    assert.equal(events[0]!.state, 'active');
    assert.equal(events[0]!.member_id, 'current');
});

// The MEMBER_ID CAVEAT: the head event is authored by
// 'current'; a DIFFERENT member ('member-b') then edits an
// entity field while echoing the SAME trio verbatim. sameEvent
// (store-state.ts) compares member_id too, so replaying
// 'member-b' as author would 409 against the already-stored
// (current-authored) row — this proves the op replays the
// STORED head's member_id rather than the editing actor's.
test('postRecordDocumentOp with an echoed trio writes the row'
+ ' and NO new event, replaying the stored head\'s member_id',
async () => {
    const db = await freshDb();
    await postRecordDocumentOp(
        db, 'rec-2',
        {
            ...recordDocument('First', 'active', AT, 'ev-2'),
            organization_id: '1',
        },
        'current',
    );
    await postRecordDocumentOp(
        db, 'rec-2',
        {
            ...recordDocument('Second', 'active', AT, 'ev-2'),
            organization_id: '1',
        },
        'member-b',
    );
    const events = await db.states.getAllFor('rec-2');
    assert.equal(events.length, 1);
    assert.equal(events[0]!.member_id, 'current');
    const row = await db.records.getById('rec-2');
    assert.equal(row.name, 'Second');
});

test('postRecordDocumentOp with a fresh trio posts a'
+ ' transition authored by the actor', async () => {
    const db = await freshDb();
    await postRecordDocumentOp(
        db, 'rec-3',
        {
            ...recordDocument(
                'First', 'active', AT, 'ev-3a',
            ),
            organization_id: '1',
        },
        'current',
    );
    await postRecordDocumentOp(
        db, 'rec-3',
        {
            ...recordDocument(
                'First', 'archived',
                '2026-01-02T00:00:00.000000Z', 'ev-3b',
            ),
            organization_id: '1',
        },
        'current',
    );
    const events = await db.states.getAllFor('rec-3');
    assert.deepEqual(
        events.map(e => e.state).toSorted(),
        ['active', 'archived'],
    );
    assert.ok(events.every(e => e.member_id === 'current'));
});

// -- 3. the fast-path sibling pin (added at the fold commit,
// now that RECORDS_WIRING wires records/:id onto this op) ---
//
// The gate's pre-tx idempotency fast path (api.ts) replays a
// byte-identical resend's STORED response without re-dispatching
// to the op — sibling of api-idea-document.test.ts's own "a
// byte-identical resend converges: one event, one pair".

test('a byte-identical resend replays the stored response:'
+ ' one event, one pair', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = recordDocument(
        'Idempotent', 'active', AT, 'ev-resend',
    );
    await handleRequest(
        db, req('PUT', '/records/rec-resend', token, body),
    );
    await handleRequest(
        db, req('PUT', '/records/rec-resend', token, body),
    );
    const events = await db.states.getAllFor('rec-resend');
    assert.equal(events.length, 1);
    assert.equal((await db.requests.getAll()).length, 4);
    assert.equal((await db.responses.getAll()).length, 4);
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

async function storedPairAt(
    method: string,
    uriId: string,
    at: string,
    body: Record<string, unknown> | undefined,
): Promise<{
    readonly request: RequestEntity;
    readonly response: ResponseEntity;
}> {
    const pair = await formWritePair({
        method,
        pathname: '/records/' + uriId,
        routePattern: 'records/:id',
        routeSegments: ['records', ':id'],
        pathSegments: ['records', uriId],
        headerFields: [],
        body,
        requesterIdentityId: 'current',
        requestAt: at,
        organization: '1',
        responseStatus: method === 'DELETE' ? 204 : 200,
        responseBody: undefined,
        headPairId: undefined,
    });
    return {
        request: {
            id: pair.id,
            uri_prefix: pair.uriPrefix,
            uri_id: pair.uriId,
            at,
            requester_identity_id: pair.requesterIdentityId,
            message_hash: pair.requestHash,
            message: pair.requestMessage,
        },
        response: {
            id: pair.id,
            uri_prefix: pair.uriPrefix,
            uri_id: pair.uriId,
            at,
            status: pair.responseStatus,
            etag: pair.responseEtag,
            message_hash: pair.responseHash,
            message: pair.responseMessage,
        },
    };
}

test('documentLifecycleEvents skips a DELETE-method pair,'
+ ' yielding the two PUT trios across a delete-then-recreate'
+ ' history', async () => {
    const prefix = '/organizations/1/records/';
    const first = await storedPairAt(
        'PUT', 'rec-x', '2026-01-01T00:00:00.000000Z',
        recordDocument('First', 'active', AT, 'ev-x1'),
    );
    const deleted = await storedPairAt(
        'DELETE', 'rec-x', '2026-01-02T00:00:00.000000Z',
        undefined,
    );
    const second = await storedPairAt(
        'PUT', 'rec-x', '2026-01-03T00:00:00.000000Z',
        recordDocument(
            'Second', 'active',
            '2026-01-03T00:00:00.000000Z', 'ev-x2',
        ),
    );
    const requests = [
        first.request, deleted.request, second.request,
    ];
    const responses = [
        first.response, deleted.response, second.response,
    ];
    const pairs = documentPairsAt(requests, responses, prefix)
        .filter(pair => pair.uriId === 'rec-x');
    assert.equal(pairs.length, 3);
    const events = documentLifecycleEvents(pairs);
    assert.deepEqual(
        events.map(e => e.stateEventId),
        ['ev-x1', 'ev-x2'],
    );
});
