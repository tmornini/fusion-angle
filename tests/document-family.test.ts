import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    EntityNotFoundError,
    UniqueConstraintError,
} from '../api/db.ts';
import type { DbAdapter } from '../api/db.ts';
import type { Id } from '../api/types.ts';
import { handleRequest } from '../api/api.ts';
import {
    formWritePair,
    appendMessagePair,
    IF_MATCH_HEADER,
    strongEtagOf,
} from '../api/message-pair.ts';
import type { MessagePair } from '../api/message-pair.ts';
import {
    routes,
    param,
    WRITE_RESPONSE_SPECS,
    type Route,
    type WriteResponseSpec,
} from '../api/routes.ts';
import {
    PAIR_WIRED_ROUTE_PATTERNS,
    DOCUMENT_CLASS_ROUTE_PATTERNS,
} from '../api/message-pair.ts';
import {
    FAMILY_REGISTRY,
    type FamilyRegistration,
} from '../api/family-registry.ts';
import {
    documentFamilyWiring,
    documentEntityRoute,
    documentGetHandler,
    documentCollectionGetHandler,
    documentWriteResponseSpec,
    DOCUMENT_FAMILY_WIRINGS,
    type DocumentFamilyWiring,
} from '../api/document-family.ts';
import { deriveIdea } from '../api/derive-ideas.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    headers?: Record<string, string>,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            ...headers,
        },
        ...(body === undefined
            ? {} : { body: JSON.stringify(body) }),
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// -- (a) documentWriteResponseSpec's successBody, pinned
// against FIXED expected literals. Before the wiring-collapse
// fix, this compared the generic builder's output against
// WRITE_RESPONSE_SPECS['ideas|projects/:id'] — TWO hand-
// maintained wiring copies — but that spec entry is now built
// from the SAME single registered row (routes.ts's
// registerDocumentFamilyWiring call), so a same-object
// comparison would prove nothing. Pinned to literals instead —
// a strengthening: this is the ONLY place the shape of a
// document PUT's successBody is asserted byte-for-byte. -------

test('documentWriteResponseSpec produces the ideas'
+ ' successBody', () => {
    const wiring = documentFamilyWiring('ideas')!;
    const body = {
        title: 'T', position: 1, problem_statement: 'p',
        target_users: 't', proposed_solution: 's',
        expected_outcome: 'o', success_metrics: 'm',
        state: 'active', state_at: AT, state_event_id: 'ev-1',
    };
    const actual = documentWriteResponseSpec(wiring)
        .successBody!(['idea-1'], body, 'current', '1');
    assert.deepEqual(actual, {
        id: 'idea-1', organization_id: '1',
        title: 'T', position: 1, problem_statement: 'p',
        target_users: 't', proposed_solution: 's',
        expected_outcome: 'o', success_metrics: 'm',
    });
});

test('documentWriteResponseSpec produces the projects'
+ ' successBody', () => {
    const wiring = documentFamilyWiring('projects')!;
    const body = {
        title: 'T', description: 'd', progress: 5,
        start_date: '2026-01-01', target_end_date: '2026-02-01',
        estimated_cost: 100, actual_cost: 50, position: 1,
        state: 'submitted', state_at: AT, state_event_id: 'ev-1',
    };
    const actual = documentWriteResponseSpec(wiring)
        .successBody!(['project-1'], body, 'current', '1');
    assert.deepEqual(actual, {
        id: 'project-1', organization_id: '1',
        title: 'T', description: 'd', progress: 5,
        start_date: '2026-01-01', target_end_date: '2026-02-01',
        estimated_cost: 100, actual_cost: 50, position: 1,
    });
});

// -- (b) documentEntityRoute('simple') dispatches PUT to the
// wiring's documentOp and GET to the derived entity. --------

test('documentEntityRoute (simple arm) PUTs through the'
+ ' wiring documentOp and GETs the derived entity', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const wiring = documentFamilyWiring('ideas')!;
    const route = documentEntityRoute(wiring);
    // Below-facade convention (postIdeaDocumentOp's own
    // comment): a raw, unfenced caller has no organization-
    // scoping wrapper to stamp organization_id, so it embeds it
    // in the body directly, as api/mock-data.ts's seed does.
    const body = {
        title: 'Generic', position: 1,
        problem_statement: 'p', target_users: 't',
        proposed_solution: 's', expected_outcome: 'o',
        success_metrics: 'm',
        state: 'active', state_at: AT, state_event_id: 'ev-1',
        organization_id: '1',
    };
    const pair = await formWritePair({
        method: 'PUT', pathname: '/ideas/idea-9',
        routePattern: 'ideas/:id',
        routeSegments: ['ideas', ':id'],
        pathSegments: ['ideas', 'idea-9'],
        headerFields: [], body, requesterIdentityId: 'current',
        requestAt: AT, organization: '1',
        responseStatus: 200, responseBody: undefined,
        headPairId: undefined,
    });
    const written = await route.put!(
        db, ['idea-9'], body, 'current', pair,
    );
    assert.equal(
        (written as { title: string }).title, 'Generic',
    );
    const got = await route.get!(db, ['idea-9'], 'current', '1');
    assert.deepEqual(got, await deriveIdea(db, '1', 'idea-9'));
});

// -- (c) the locked arm, against a SYNTHETIC registration. ---

const TEST_FAMILY = 'locked-test-docs';
const TEST_PATTERN = TEST_FAMILY + '/:id';
// A SIBLING document-class route under the SAME family prefix —
// never served via documentPutHandler, mirroring a real family's
// own hand-written sub-resource (e.g. flows/:id/versions/:vid
// beside the locked flows/:id). Proves the gate keys the locked
// arm off the EXACT entity-route pattern, never the family's
// first path segment alone — a sibling route must stay 'simple'
// even though its family registration says 'locked'.
const CHILD_PATTERN = TEST_FAMILY + '/:id/child';

// The synthetic family's decompose op stores NOTHING but the
// pair itself — the locked-arm gate machinery under test lives
// entirely in api.ts/message-pair.ts, upstream of this op, so
// the op only needs to prove appendMessagePair ran.
async function testDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<unknown> {
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return { id, ...body };
        },
    );
}

function testEntityOf(
    document: { uriId: string; body: Record<string, unknown> },
    organization: Id,
): unknown {
    return {
        id: document.uriId,
        organization_id: organization,
        ...document.body,
    };
}

// Registers a synthetic 'locked' family for the duration of
// `fn`, through the SAME seams a real family task would use
// (FAMILY_REGISTRY, DOCUMENT_FAMILY_WIRINGS, the live route
// table, the pair-wiring sets, WRITE_RESPONSE_SPECS) — then
// unregisters everything, even if `fn` throws, so no test
// pollutes another. No live family is registered here through
// this task; this is the ONLY place the locked arm runs.
async function withSyntheticLockedFamily<T>(
    fn: () => Promise<T>,
): Promise<T> {
    const registration: FamilyRegistration = {
        family: TEST_FAMILY,
        organizationNested: true,
        concurrency: 'locked',
        createBodyIdField: 'id',
    };
    const mutableRegistry =
        FAMILY_REGISTRY as FamilyRegistration[];
    mutableRegistry.push(registration);
    const wiring: DocumentFamilyWiring = {
        family: TEST_FAMILY,
        // Inert for these PUT-dispatch tests (the locked arm
        // never exercises GET), but REQUIRED fields on the
        // interface — this is the fourth DocumentFamilyWiring
        // construction site (the other three are routes.ts's
        // ideas/projects/flows rows).
        lifecycle: 'trio',
        notFoundTable: TEST_FAMILY,
        validateDocument: (body) => body,
        documentOp: testDocumentOp,
        entityOf: testEntityOf,
    };
    DOCUMENT_FAMILY_WIRINGS[TEST_FAMILY] = wiring;
    const routeEntry = documentEntityRoute(wiring);
    // The sibling child route: hand-written (never
    // documentPutHandler), document-class + pair-wired so it
    // gets a real head-read, always dispatching straight to its
    // own op regardless of headers — exactly the 'simple' shape
    // a hand-written sub-resource has today.
    const childRouteEntry: Route = {
        segments: [TEST_FAMILY, ':id', 'child'],
        put: (db, p, body, _actor, pair) => testDocumentOp(
            db, param(p, 0), body, _actor, pair,
        ),
    };
    routes.push(routeEntry, childRouteEntry);
    PAIR_WIRED_ROUTE_PATTERNS.add(TEST_PATTERN);
    PAIR_WIRED_ROUTE_PATTERNS.add(CHILD_PATTERN);
    DOCUMENT_CLASS_ROUTE_PATTERNS.add(TEST_PATTERN);
    DOCUMENT_CLASS_ROUTE_PATTERNS.add(CHILD_PATTERN);
    const mutableSpecs = WRITE_RESPONSE_SPECS as
        Record<string, WriteResponseSpec>;
    mutableSpecs[TEST_PATTERN] =
        documentWriteResponseSpec(wiring);
    mutableSpecs[CHILD_PATTERN] = { status: 204 };
    try {
        return await fn();
    } finally {
        for (const entry of [routeEntry, childRouteEntry]) {
            const index = routes.indexOf(entry);
            if (index >= 0) routes.splice(index, 1);
        }
        PAIR_WIRED_ROUTE_PATTERNS.delete(TEST_PATTERN);
        PAIR_WIRED_ROUTE_PATTERNS.delete(CHILD_PATTERN);
        DOCUMENT_CLASS_ROUTE_PATTERNS.delete(TEST_PATTERN);
        DOCUMENT_CLASS_ROUTE_PATTERNS.delete(CHILD_PATTERN);
        delete mutableSpecs[TEST_PATTERN];
        delete mutableSpecs[CHILD_PATTERN];
        delete DOCUMENT_FAMILY_WIRINGS[TEST_FAMILY];
        const registryIndex =
            mutableRegistry.indexOf(registration);
        if (registryIndex >= 0) {
            mutableRegistry.splice(registryIndex, 1);
        }
    }
}

test('locked arm: genesis with neither header passes',
async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const res = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/doc-1', token,
            { v: 'first' },
        ));
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('Follows'), null);
        assert.equal(res.headers.get('Supersedes'), null);
    });
});

test('locked arm: a sibling route under the SAME family'
+ ' prefix stays simple (keyed by routePattern, never the'
+ ' bare first segment)', async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const path = '/' + CHILD_PATTERN
            .replace(':id', 'doc-child');
        const first = await handleRequest(db, req(
            'PUT', path, token, { v: 'first' },
        ));
        assert.equal(first.status, 204);
        // A second PUT, still with NO If-Match — if the
        // gate mistakenly keyed the locked arm off TEST_FAMILY
        // alone, this would 428 (head present, echo absent).
        const second = await handleRequest(db, req(
            'PUT', path, token, { v: 'second' },
        ));
        assert.equal(second.status, 204);
    });
});

test('locked arm: head present, If-Match absent, 428s',
async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/doc-2', token,
            { v: 'first' },
        ));
        const res = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/doc-2', token,
            { v: 'second' },
        ));
        assert.equal(res.status, 428);
        assert.equal(
            (await res.json()).error,
            'If-Match is required to PUT /'
            + TEST_FAMILY + '/doc-2',
        );
    });
});

test('locked arm: a stale If-Match echo 412s', async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/doc-3', token,
            { v: 'first' },
        ));
        const res = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/doc-3', token,
            { v: 'second' },
            { [IF_MATCH_HEADER]: strongEtagOf('bogus') },
        ));
        assert.equal(res.status, 412);
        assert.equal(
            (await res.json()).error,
            'If-Match does not match the current document at '
            + '/' + TEST_FAMILY + '/doc-3',
        );
    });
});

test('locked arm: a matching echo populates follows, not'
+ ' supersedes', async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const first = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/doc-4', token,
            { v: 'first' },
        ));
        const firstId = first.headers.get('Response-ID')!;
        const second = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/doc-4', token,
            { v: 'second' },
            { [IF_MATCH_HEADER]: strongEtagOf(firstId) },
        ));
        assert.equal(second.status, 200);
        assert.equal(second.headers.get('Follows'), firstId);
        assert.equal(second.headers.get('Supersedes'), null);
        const secondId = second.headers.get('Response-ID')!;
        const stored = (await db.responses.getAll())
            .find((row) => row.id === secondId);
        assert.equal(stored?.follows, firstId);
        assert.equal(stored?.supersedes, undefined);
    });
});

test('locked arm: byte-identical resend replays the stored'
+ ' response, headers un-re-minted (fast-path-first ordering)',
async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const first = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/doc-5', token,
            { v: 'first' },
        ));
        const firstId = first.headers.get('Response-ID')!;
        const editRequest = req(
            'PUT', '/' + TEST_FAMILY + '/doc-5', token,
            { v: 'second' },
            { [IF_MATCH_HEADER]: strongEtagOf(firstId) },
        );
        const edit = await handleRequest(db, editRequest.clone());
        assert.equal(edit.status, 200);
        const editDate = edit.headers.get('Date');
        // A byte-identical resend of the edit: its echo (firstId)
        // is now STALE against the new head (the edit's own id),
        // yet it must replay — never 412 — because the fast path
        // runs BEFORE the four-outcome table.
        const resend = await handleRequest(db, editRequest.clone());
        assert.equal(resend.status, 200);
        assert.equal(resend.headers.get('Date'), editDate);
        assert.equal(
            resend.headers.get('Response-ID'),
            edit.headers.get('Response-ID'),
        );
        assert.equal((await db.requests.getAll()).length, 4);
    });
});

test('locked arm: a fresh-keyed replay echoing a superseded'
+ ' head 412s', async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const genesis = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/doc-6', token,
            { v: 'first' },
        ));
        const genesisId = genesis.headers.get('Response-ID')!;
        await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/doc-6', token,
            { v: 'second' },
            { [IF_MATCH_HEADER]: strongEtagOf(genesisId) },
        ));
        // A DIFFERENT (fresh) address has no head of its own;
        // echoing doc-6's now-superseded genesis id is neither
        // "absent" nor "matches MY head" — 412.
        const res = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/doc-7', token,
            { v: 'first' },
            { [IF_MATCH_HEADER]: strongEtagOf(genesisId) },
        ));
        assert.equal(res.status, 412);
    });
});

test('locked arm: two writers racing the SAME echo — the'
+ ' second aborts via the unique follows index', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const genesis = await formWritePair({
        method: 'PUT', pathname: '/' + TEST_PATTERN,
        routePattern: TEST_PATTERN,
        routeSegments: [TEST_FAMILY, ':id'],
        pathSegments: [TEST_FAMILY, 'race'],
        headerFields: [], body: { v: 'genesis' },
        requesterIdentityId: 'current', requestAt: AT,
        organization: '1', responseStatus: 200,
        responseBody: undefined, headPairId: undefined,
    });
    await db.transaction(
        ['requests', 'responses'],
        (view) => appendMessagePair(view, genesis),
    );
    // Two writers both observed the SAME head (genesis.id)
    // before either committed — the race the pre-check alone
    // cannot close; the UNIQUE index on responses.follows is
    // the platform primitive that closes it.
    const writerA = await formWritePair({
        method: 'PUT', pathname: '/' + TEST_PATTERN,
        routePattern: TEST_PATTERN,
        routeSegments: [TEST_FAMILY, ':id'],
        pathSegments: [TEST_FAMILY, 'race'],
        headerFields: [], body: { v: 'a' },
        requesterIdentityId: 'current', requestAt: AT,
        organization: '1', responseStatus: 200,
        responseBody: undefined, headPairId: undefined,
        follows: genesis.id,
    });
    const writerB = await formWritePair({
        method: 'PUT', pathname: '/' + TEST_PATTERN,
        routePattern: TEST_PATTERN,
        routeSegments: [TEST_FAMILY, ':id'],
        pathSegments: [TEST_FAMILY, 'race'],
        headerFields: [], body: { v: 'b' },
        requesterIdentityId: 'current', requestAt: AT,
        organization: '1', responseStatus: 200,
        responseBody: undefined, headPairId: undefined,
        follows: genesis.id,
    });
    await db.transaction(
        ['requests', 'responses'],
        (view) => appendMessagePair(view, writerA),
    );
    await assert.rejects(
        db.transaction(
            ['requests', 'responses'],
            (view) => appendMessagePair(view, writerB),
        ),
        UniqueConstraintError,
    );
});

// The e2e sibling of the storage-level race above: TWO PUTs
// echoing the SAME valid head, launched together through
// handleRequest itself — never formWritePair/appendMessagePair
// directly — so the gate's OWN UniqueConstraintError -> 412
// mapping (api.ts's catch block) is what's under test, not the
// storage primitive alone. On the memory backend, the global
// transaction serializer (store-serializer.ts) processes each
// racer's headPairIdAt read and dispatch as separate queued
// steps, so BOTH racers observe genesis as their head and pass
// the pre-dispatch echo check before either's write commits —
// verified empirically (ten runs, zero flakes; see the fix
// report) — so the SECOND-dispatched racer's write collides on
// the unique responses.follows index, never the pre-check's
// echo-mismatch branch (a distinct error message), pinning the
// gate's mapping rather than re-proving the storage primitive.
test('locked arm: two concurrent PUTs echoing the same head —'
+ ' the loser 412s via the gate\'s unique-index mapping',
async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const path = '/' + TEST_FAMILY + '/doc-race';
        const genesis = await handleRequest(db, req(
            'PUT', path, token, { v: 'genesis' },
        ));
        const head = genesis.headers.get('Response-ID')!;
        const [first, second] = await Promise.all([
            handleRequest(db, req(
                'PUT', path, token, { v: 'a' },
                { [IF_MATCH_HEADER]: strongEtagOf(head) },
            )),
            handleRequest(db, req(
                'PUT', path, token, { v: 'b' },
                { [IF_MATCH_HEADER]: strongEtagOf(head) },
            )),
        ]);
        const statuses =
            [first.status, second.status].sort();
        assert.deepEqual(statuses, [200, 412]);
        const loser = first.status === 412 ? first : second;
        const loserBody =
            await loser.json() as { error: string };
        // The mechanism pin: this exact message is thrown
        // only by the storage layer's unique-column scan
        // (api/db.ts's UniqueConstraintError), never by the
        // gate's pre-check branches (api.ts:532-550), which
        // read "If-Match is required..." or "...does
        // not match the current document...".
        assert.equal(
            loserBody.error,
            'Unique column responses.follows already holds'
            + ' this value',
        );
        const responses = await db.responses.getAll();
        const followingHead = responses.filter(
            (row) => row.follows === head,
        );
        assert.equal(followingHead.length, 1);
        // Genesis + exactly one winner write landed; the
        // loser stored NOTHING — no partial write survives.
        assert.equal((await db.requests.getAll()).length, 4);
        assert.equal(responses.length, 4);
    });
});

test('withSyntheticLockedFamily leaves no residue behind',
() => {
    assert.equal(documentFamilyWiring(TEST_FAMILY), undefined);
    assert.equal(
        PAIR_WIRED_ROUTE_PATTERNS.has(TEST_PATTERN), false,
    );
    assert.equal(
        DOCUMENT_CLASS_ROUTE_PATTERNS.has(TEST_PATTERN), false,
    );
    assert.equal(WRITE_RESPONSE_SPECS[TEST_PATTERN], undefined);
    assert.equal(
        FAMILY_REGISTRY.find(
            (entry) => entry.family === TEST_FAMILY,
        ),
        undefined,
    );
});

// -- (d) the fourth-family wiring growth: `lifecycle` and
// `notFoundTable` (work-orders evidence). A SYNTHETIC
// 'stateless' registration proves derivedDocumentEntity and
// documentCollectionGetHandler skip the lifecycle walk +
// DELETED-state filter entirely for 'stateless' — a trio-less
// body (no state/state_at/state_event_id) would make
// documentLifecycleEvents' pickString throw if the 'trio' walk
// ran, so a clean pass here is proof the branch is skipped, not
// merely tolerant. A DELETE head still 404s (deriveDocumentsAt's
// own head-absent semantics — the only tombstone a stateless
// family has), and that 404 carries the registration's
// notFoundTable, never its family, proving the two are
// independent facts. Handlers are called DIRECTLY (no
// registration/route-table ceremony) since GET derivation needs
// only the wiring value itself. -----------------------------

const STATELESS_FAMILY = 'stateless-test-docs';
const STATELESS_TABLE = 'stateless_storage_table';

function statelessEntityOf(
    document: { uriId: string; body: Record<string, unknown> },
    organization: Id,
): unknown {
    return {
        id: document.uriId,
        organization_id: organization,
        ...document.body,
    };
}

const statelessWiring: DocumentFamilyWiring = {
    family: STATELESS_FAMILY,
    lifecycle: 'stateless',
    notFoundTable: STATELESS_TABLE,
    validateDocument: (body) => body,
    documentOp: testDocumentOp,
    entityOf: statelessEntityOf,
};

async function putStatelessDocumentPair(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
): Promise<void> {
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/' + STATELESS_FAMILY + '/' + id,
        routePattern: STATELESS_FAMILY + '/:id',
        routeSegments: [STATELESS_FAMILY, ':id'],
        pathSegments: [STATELESS_FAMILY, id],
        headerFields: [], body, requesterIdentityId: 'current',
        requestAt: AT, organization: '1',
        responseStatus: 200, responseBody: undefined,
        headPairId: undefined,
    });
    await db.transaction(
        ['requests', 'responses'],
        (view) => appendMessagePair(view, pair),
    );
}

async function deleteStatelessDocumentPair(
    db: DbAdapter,
    id: Id,
): Promise<void> {
    const pair = await formWritePair({
        method: 'DELETE',
        pathname: '/' + STATELESS_FAMILY + '/' + id,
        routePattern: STATELESS_FAMILY + '/:id',
        routeSegments: [STATELESS_FAMILY, ':id'],
        pathSegments: [STATELESS_FAMILY, id],
        headerFields: [], body: {},
        requesterIdentityId: 'current',
        requestAt: AT, organization: '1',
        responseStatus: 200, responseBody: undefined,
        headPairId: undefined,
    });
    await db.transaction(
        ['requests', 'responses'],
        (view) => appendMessagePair(view, pair),
    );
}

test('stateless lifecycle: a trio-less document PUT derives'
+ ' through documentGetHandler with no throw', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await putStatelessDocumentPair(db, 'sl-1', { v: 'first' });
    const got = await documentGetHandler(statelessWiring)(
        db, ['sl-1'], 'current', '1',
    );
    assert.deepEqual(got, {
        id: 'sl-1', organization_id: '1', v: 'first',
    });
});

test('stateless lifecycle: documentCollectionGetHandler skips'
+ ' the per-document history walk too', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await putStatelessDocumentPair(db, 'sl-2', { v: 'listed' });
    const rows = await documentCollectionGetHandler(
        statelessWiring,
    )(db, [], 'current', '1');
    assert.deepEqual(rows, [
        { id: 'sl-2', organization_id: '1', v: 'listed' },
    ]);
});

test('stateless lifecycle: a DELETE head 404s carrying'
+ ' notFoundTable, never the family', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await putStatelessDocumentPair(db, 'sl-3', { v: 'first' });
    await deleteStatelessDocumentPair(db, 'sl-3');
    await assert.rejects(
        documentGetHandler(statelessWiring)(
            db, ['sl-3'], 'current', '1',
        ),
        (error: unknown) => {
            assert.ok(error instanceof EntityNotFoundError);
            assert.equal(
                (error as EntityNotFoundError).table,
                STATELESS_TABLE,
            );
            return true;
        },
    );
});

test('stateless lifecycle: a DELETE head is absent from the'
+ ' collection too', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await putStatelessDocumentPair(db, 'sl-4', { v: 'first' });
    await deleteStatelessDocumentPair(db, 'sl-4');
    const rows = await documentCollectionGetHandler(
        statelessWiring,
    )(db, [], 'current', '1');
    assert.deepEqual(rows, []);
});
