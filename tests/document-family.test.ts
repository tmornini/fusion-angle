import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    EntityNotFoundError,
    MESSAGE_TABLES,
} from '../api/db.ts';
import type { DbAdapter } from '../api/db.ts';
import type { Id } from '../api/types.ts';
import { handleRequest } from '../api/api.ts';
import {
    formWriteMessagePair,
    appendMessagePair,
    headMessagePairIdAt,
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
    MESSAGE_PAIR_WIRED_ROUTE_PATTERNS,
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
import { ApiError, HTTP_PRECONDITION_FAILED } from
    '../api/http-errors.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import {
    generateIdentifier,
    isIdentifier,
} from '../shared/identifier.ts';

const PROJECT_1 = generateIdentifier();
const ID_1 = generateIdentifier();
const AG_1 = generateIdentifier();
const DOC_CHILD = generateIdentifier();
const SL_1 = generateIdentifier();
const SL_2 = generateIdentifier();
const SL_3 = generateIdentifier();
const SL_4 = generateIdentifier();

const AT = '2026-01-01T00:00:00.000000Z';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    headers?: Record<string, string>,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(headers !== undefined
            ? { headers } : {}),
        operationId: TEST_OPERATION_ID,
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// -- (a) documentWriteResponseSpec's successBody, pinned
// against FIXED expected literals. G1 trio families emit
// wiring.entityOf (id first, trio last). Pinned to literals —
// the shape of a document PUT's successBody. -------

Deno.test('documentWriteResponseSpec produces the ideas'
+ ' successBody', () => {
    const wiring = documentFamilyWiring('ideas')!;
    const body = {
        title: 'T', position: 1, problem_statement: 'p',
        target_users: 't', proposed_solution: 's',
        expected_outcome: 'o', success_metrics: 'm',
        state: 'active',
    };
    const actual = documentWriteResponseSpec(wiring)
        .successBody!(['AjdvjuECVZEgZoFajaIEkg', 'gVvtDIaqhnkXZQcxZeSuiw']
            , body, 'XXZruirZyAOoRpNxaDnpSA', 'AjdvjuECVZEgZoFajaIEkg');
    assertEquals(actual, {
        id: 'gVvtDIaqhnkXZQcxZeSuiw'
            , organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        title: 'T', position: 1, problem_statement: 'p',
        target_users: 't', proposed_solution: 's',
        expected_outcome: 'o', success_metrics: 'm',
        state: 'active',
    });
});

Deno.test('documentWriteResponseSpec produces the projects'
+ ' successBody', () => {
    const wiring = documentFamilyWiring('projects')!;
    const body = {
        title: 'T', description: 'd', progress: 5,
        start_date: '2026-01-01', target_end_date: '2026-02-01',
        estimated_cost: 100, actual_cost: 50, position: 1,
        state: 'submitted',
    };
    const actual = documentWriteResponseSpec(wiring)
        .successBody!(
            ['AjdvjuECVZEgZoFajaIEkg', PROJECT_1], body
                , 'XXZruirZyAOoRpNxaDnpSA', 'AjdvjuECVZEgZoFajaIEkg',
        );
    assertEquals(actual, {
        id: PROJECT_1, organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        title: 'T', description: 'd', progress: 5,
        start_date: '2026-01-01', target_end_date: '2026-02-01',
        estimated_cost: 100, actual_cost: 50, position: 1,
        state: 'submitted',
    });
});

Deno.test('documentWriteResponseSpec produces the identities'
+ ' successBody (G3 entityOf)', () => {
    const wiring = documentFamilyWiring('identities')!;
    const body = { kind: 'person' };
    const actual = documentWriteResponseSpec(wiring)
        .successBody!([ID_1], body, 'XXZruirZyAOoRpNxaDnpSA'
            , 'AjdvjuECVZEgZoFajaIEkg');
    assertEquals(actual, { id: ID_1, kind: 'person' });
});

Deno.test('leftover roster families have no document wiring',
() => {
    for (const family of [
        'memberships', 'members',
        'ai-members', 'human-members',
    ]) {
        assertStrictEquals(
            documentFamilyWiring(family), undefined,
            family,
        );
    }
});

Deno.test('documentWriteResponseSpec produces the ai-agents'
+ ' successBody (G3 entityOf, request-body key order)',
() => {
    const wiring = documentFamilyWiring('ai-agents')!;
    const body = {
        name: 'A', description: 'd',
        model: 'nqNVXnBkUBLoKlenbyPIZQ',
        skill_focus: 's',
    };
    const actual = documentWriteResponseSpec(wiring)
        .successBody!([AG_1], body, 'XXZruirZyAOoRpNxaDnpSA'
            , 'AjdvjuECVZEgZoFajaIEkg');
    assertEquals(actual, { id: AG_1, ...body });
});

// -- (b) documentEntityRoute('simple') dispatches PUT to the
// wiring's documentOp and GET to the derived entity. --------

Deno.test('documentEntityRoute (simple arm) PUTs through the'
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
        state: 'active',
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    };
    const messagePair = await formWriteMessagePair({
        method: 'PUT'
            , pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'gZsGVjTnvrgHQLzbKnQckg',
        routePattern: 'organizations/:id/ideas/:id',
        routeSegments: ['ideas', ':id'],
        pathSegments: ['ideas', 'gZsGVjTnvrgHQLzbKnQckg'],
        headerFields: [], body, requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: AT, organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseStatus: 200, responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    const written = await route.put!(
        db, ['AjdvjuECVZEgZoFajaIEkg', 'gZsGVjTnvrgHQLzbKnQckg'], body
            , 'XXZruirZyAOoRpNxaDnpSA', messagePair,
        'AjdvjuECVZEgZoFajaIEkg', [], AT, TEST_OPERATION_ID,
    );
    assertStrictEquals(
        (written as { title: string }).title, 'Generic',
    );
    const got = await route.get!(
        db, ['AjdvjuECVZEgZoFajaIEkg', 'gZsGVjTnvrgHQLzbKnQckg']
            , 'XXZruirZyAOoRpNxaDnpSA', 'AjdvjuECVZEgZoFajaIEkg',
        [],
    );
    assertEquals(got, await deriveIdea(db, 'AjdvjuECVZEgZoFajaIEkg'
        , 'gZsGVjTnvrgHQLzbKnQckg'));
});

// -- (c) the locked arm, against a SYNTHETIC registration. ---

const TEST_FAMILY = 'locked-test-docs';
const TEST_PATTERN = TEST_FAMILY + '/:id';
// A SIBLING document-class route under the SAME family prefix —
// never served via documentPutHandler, mirroring a real family's
// own hand-written sub-resource (e.g.
// organizations/:id/flows/:id/versions/:etag
// beside the locked organizations/:id/flows/:id). Proves the gate keys the
// locked
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
    messagePair?: MessagePair,
): Promise<unknown> {
    return db.transaction(
        MESSAGE_TABLES,
        async (view) => {
            if (messagePair !== undefined) {
                const latchedId = messagePair.latchedHeadMessagePairId;
                const latest = await headMessagePairIdAt(
                    view, messagePair.uriCollection, messagePair.uriId,
                );
                if (
                    latchedId !== undefined
                    && latest !== latchedId
                ) {
                    throw new ApiError(
                        'If-Match does not match the current'
                        + ' document at /'
                        + TEST_FAMILY + '/' + id,
                        HTTP_PRECONDITION_FAILED,
                    );
                }
                await appendMessagePair(view, messagePair);
            }
            return { id, ...body };
        },
    );
}

function testEntityOf(
    document: { uriId: string; body: Record<string, unknown> },
    organization: Id,
): object {
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
        httpNest: 'global',
        // Inert for these PUT-dispatch tests (the locked arm
        // never exercises GET), but REQUIRED fields on the
        // interface — this is the fourth DocumentFamilyWiring
        // construction site (the other three are
        // routes.ts's ideas/projects/flows rows).
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
        put: (db, p, body, _actor, messagePair) =>
            testDocumentOp(
                db, param(p, 0), body, _actor, messagePair,
            ),
    };
    routes.push(routeEntry, childRouteEntry);
    MESSAGE_PAIR_WIRED_ROUTE_PATTERNS.add(TEST_PATTERN);
    MESSAGE_PAIR_WIRED_ROUTE_PATTERNS.add(CHILD_PATTERN);
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
        MESSAGE_PAIR_WIRED_ROUTE_PATTERNS.delete(TEST_PATTERN);
        MESSAGE_PAIR_WIRED_ROUTE_PATTERNS.delete(CHILD_PATTERN);
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

Deno.test('locked arm: genesis with neither header passes',
async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const res = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/XufQcWIKhZshfJYOVNeUSw', token,
            { v: 'first' },
        ));
        assertStrictEquals(res.status, 201);
        assertStrictEquals(res.headers.get('Follows'), null);
        assertStrictEquals(res.headers.get('Supersedes'), null);
        const responseId = res.headers.get('Response-ID');
        assert(
            responseId !== null && isIdentifier(responseId),
        );
        assertStrictEquals(
            res.headers.get('ETag'),
            strongEtagOf(responseId),
        );
    });
});

Deno.test('locked arm: GET ETag equals Response-ID',
async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const path = '/' + TEST_FAMILY + '/'
            + generateIdentifier();
        const put = await handleRequest(db, req(
            'PUT', path, token, { v: 'first' },
        ));
        assertStrictEquals(put.status, 201);
        const got = await handleRequest(db, req(
            'GET', path, token,
        ));
        assertStrictEquals(got.status, 200);
        const responseId = got.headers.get('Response-ID');
        assert(
            responseId !== null && isIdentifier(responseId),
        );
        assertStrictEquals(
            got.headers.get('ETag'),
            strongEtagOf(responseId),
        );
        assertStrictEquals(
            got.headers.get('ETag'),
            put.headers.get('ETag'),
        );
    });
});

Deno.test('locked arm: If-Match with the pair id succeeds; a'
+ ' stale token 412s; live head with no pin 428s',
async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const path = '/' + TEST_FAMILY + '/'
            + generateIdentifier();
        const genesis = await handleRequest(db, req(
            'PUT', path, token, { v: 'first' },
        ));
        assertStrictEquals(genesis.status, 201);
        const pairId = genesis.headers.get('Response-ID');
        assert(pairId !== null);
        assertStrictEquals(
            genesis.headers.get('ETag'),
            strongEtagOf(pairId),
        );
        const matched = await handleRequest(db, req(
            'PUT', path, token, { v: 'second' },
            { [IF_MATCH_HEADER]: strongEtagOf(pairId) },
        ));
        assertStrictEquals(matched.status, 201);
        const stale = await handleRequest(db, req(
            'PUT', path, token, { v: 'third' },
            { [IF_MATCH_HEADER]: strongEtagOf(pairId) },
        ));
        assertStrictEquals(stale.status, 412);
        const unpinned = await handleRequest(db, req(
            'PUT', path, token, { v: 'fourth' },
        ));
        assertStrictEquals(unpinned.status, 428);
    });
});

Deno.test('locked arm: A then B then A yields three distinct'
+ ' ETags',
async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const path = '/' + TEST_FAMILY + '/'
            + generateIdentifier();
        const first = await handleRequest(db, req(
            'PUT', path, token, { v: 'A' },
        ));
        assertStrictEquals(first.status, 201);
        const tagA = first.headers.get('ETag')!;
        const second = await handleRequest(db, req(
            'PUT', path, token, { v: 'B' },
            { [IF_MATCH_HEADER]: tagA },
        ));
        assertStrictEquals(second.status, 201);
        const tagB = second.headers.get('ETag')!;
        const third = await handleRequest(db, req(
            'PUT', path, token, { v: 'A' },
            { [IF_MATCH_HEADER]: tagB },
        ));
        assertStrictEquals(third.status, 201);
        const tagA2 = third.headers.get('ETag')!;
        assertNotStrictEquals(tagA, tagB);
        assertNotStrictEquals(tagB, tagA2);
        assertNotStrictEquals(tagA, tagA2);
        assertStrictEquals(
            tagA, strongEtagOf(first.headers.get(
                'Response-ID',
            )!),
        );
        assertStrictEquals(
            tagB, strongEtagOf(second.headers.get(
                'Response-ID',
            )!),
        );
        assertStrictEquals(
            tagA2, strongEtagOf(third.headers.get(
                'Response-ID',
            )!),
        );
    });
});

Deno.test('locked arm: a sibling route under the SAME family'
+ ' prefix stays simple (keyed by routePattern, never the'
+ ' bare first segment)', async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const path = '/' + CHILD_PATTERN
            .replace(':id', DOC_CHILD);
        const first = await handleRequest(db, req(
            'PUT', path, token, { v: 'first' },
        ));
        assertStrictEquals(first.status, 201);
        // A second PUT, still with NO If-Match — if the
        // gate mistakenly keyed the locked arm off TEST_FAMILY
        // alone, this would 428 (head present, echo absent).
        const second = await handleRequest(db, req(
            'PUT', path, token, { v: 'second' },
        ));
        assertStrictEquals(second.status, 201);
    });
});

Deno.test('locked arm: head present, If-Match absent, 428s',
async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/YHvbnJSZHECuziaHXcsKpw', token,
            { v: 'first' },
        ));
        const res = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/YHvbnJSZHECuziaHXcsKpw', token,
            { v: 'second' },
        ));
        assertStrictEquals(res.status, 428);
        assertStrictEquals(
            (await res.json()).error,
            'If-Match is required to PUT /'
            + TEST_FAMILY + '/YHvbnJSZHECuziaHXcsKpw',
        );
    });
});

Deno.test('locked arm: a stale If-Match echo 412s', async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/YIuEjXvCwXAgrpyvcvLJjg', token,
            { v: 'first' },
        ));
        const res = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/YIuEjXvCwXAgrpyvcvLJjg', token,
            { v: 'second' },
            { [IF_MATCH_HEADER]: strongEtagOf(
                generateIdentifier(),
            ) },
        ));
        assertStrictEquals(res.status, 412);
        assertStrictEquals(
            (await res.json()).error,
            'If-Match does not match the current document at '
            + '/' + TEST_FAMILY + '/YIuEjXvCwXAgrpyvcvLJjg',
        );
    });
});

Deno.test('locked arm: a matching echo stores no predecessor'
+ ' columns or headers', async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const first = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/YKtyCizelcaUAaHGwetojA', token,
            { v: 'first' },
        ));
        const firstEtag = first.headers.get('ETag')!;
        const second = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/YKtyCizelcaUAaHGwetojA', token,
            { v: 'second' },
            { [IF_MATCH_HEADER]: firstEtag },
        ));
        assertStrictEquals(second.status, 201);
        assertStrictEquals(second.headers.get('Follows'), null);
        assertStrictEquals(second.headers.get('Supersedes'), null);
        const secondId = second.headers.get('Response-ID')!;
        const stored = (await db.messagePairs.getAll())
            .find((row) => row.id === secondId);
        assertStrictEquals(
            stored !== undefined
                && !('follows' in stored)
                && !('supersedes' in stored),
            true,
        );
    });
});

Deno.test('locked arm: byte-identical resend replays the stored'
+ ' response, headers un-re-minted (fast-path-first ordering)',
async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const first = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/YLbPBVpBLImxPQRqLKPKLw', token,
            { v: 'first' },
        ));
        const firstEtag = first.headers.get('ETag')!;
        const editRequest = req(
            'PUT', '/' + TEST_FAMILY + '/YLbPBVpBLImxPQRqLKPKLw', token,
            { v: 'second' },
            { [IF_MATCH_HEADER]: firstEtag },
        );
        const edit = await handleRequest(db, editRequest.clone());
        assertStrictEquals(edit.status, 201);
        const editDate = edit.headers.get('Date');
        // A byte-identical resend of the edit: its echo (firstId)
        // is now STALE against the new head (the edit's own id),
        // yet it must replay — never 412 — because the fast path
        // runs BEFORE the four-outcome table.
        const resend = await handleRequest(db, editRequest.clone());
        assertStrictEquals(resend.status, 201);
        assertStrictEquals(resend.headers.get('Date'), editDate);
        assertStrictEquals(
            resend.headers.get('Response-ID'),
            edit.headers.get('Response-ID'),
        );
        assertStrictEquals((await db.messagePairs.getAll()).length, 4);
    });
});

Deno.test('locked arm: a fresh-keyed replay echoing a superseded'
+ ' head 412s', async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const genesis = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/YMhCOBWvbUQVTDYjSloGqw', token,
            { v: 'first' },
        ));
        const genesisEtag = genesis.headers.get('ETag')!;
        await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/YMhCOBWvbUQVTDYjSloGqw', token,
            { v: 'second' },
            { [IF_MATCH_HEADER]: genesisEtag },
        ));
        // A DIFFERENT (fresh) address has no head of its own;
        // echoing YMhCOBWvbUQVTDYjSloGqw's now-superseded genesis tag is
        // neither
        // "absent" nor "matches MY head" — 412.
        const res = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/YRIdjCmJlkfhIuSkvoTcnQ', token,
            { v: 'first' },
            { [IF_MATCH_HEADER]: genesisEtag },
        ));
        assertStrictEquals(res.status, 412);
    });
});

Deno.test('locked arm: two writers racing the SAME echo — the'
+ ' second aborts via the in-tx head re-read', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const genesis = await formWriteMessagePair({
        method: 'PUT', pathname: '/' + TEST_PATTERN,
        routePattern: TEST_PATTERN,
        routeSegments: [TEST_FAMILY, ':id'],
        pathSegments: [TEST_FAMILY, 'race'],
        headerFields: [], body: { v: 'genesis' },
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA', requestAt: AT,
        organization: 'AjdvjuECVZEgZoFajaIEkg', responseStatus: 200,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        MESSAGE_TABLES,
        (view) => appendMessagePair(view, genesis),
    );
    // Two writers both observed the SAME head (genesis.id)
    // before either committed — the race the pre-check alone
    // cannot close; the in-tx head re-read closes it.
    const echo = {
        name: IF_MATCH_HEADER,
        value: strongEtagOf(genesis.id),
    };
    const writerA = await formWriteMessagePair({
        method: 'PUT', pathname: '/' + TEST_PATTERN,
        routePattern: TEST_PATTERN,
        routeSegments: [TEST_FAMILY, ':id'],
        pathSegments: [TEST_FAMILY, 'race'],
        headerFields: [echo], body: { v: 'a' },
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA', requestAt: AT,
        organization: 'AjdvjuECVZEgZoFajaIEkg', responseStatus: 200,
        responseBody: undefined,
        latchedHeadMessagePairId: genesis.id,
        operationId: TEST_OPERATION_ID,
    });
    const writerB = await formWriteMessagePair({
        method: 'PUT', pathname: '/' + TEST_PATTERN,
        routePattern: TEST_PATTERN,
        routeSegments: [TEST_FAMILY, ':id'],
        pathSegments: [TEST_FAMILY, 'race'],
        headerFields: [echo], body: { v: 'b' },
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA', requestAt: AT,
        organization: 'AjdvjuECVZEgZoFajaIEkg', responseStatus: 200,
        responseBody: undefined,
        latchedHeadMessagePairId: genesis.id,
        operationId: TEST_OPERATION_ID,
    });
    await testDocumentOp(
        db, 'race', { v: 'a' }, 'XXZruirZyAOoRpNxaDnpSA', writerA,
    );
    const err = await assertRejects(
        () => testDocumentOp(
            db, 'race', { v: 'b' }, 'XXZruirZyAOoRpNxaDnpSA', writerB,
        ),
    ) as ApiError;
    assertInstanceOf(err, ApiError);
    assertStrictEquals(err.status, HTTP_PRECONDITION_FAILED);
});

// The e2e sibling of the storage-level race above: TWO PUTs
// echoing the SAME valid head, launched together through
// handleRequest itself — never formWriteMessagePair/appendMessagePair
// directly — so the in-tx head re-read's 412 is what's under
// test. On the memory backend, the global transaction
// serializer (store-serializer.ts) processes each racer's
// headMessagePairIdAt read and dispatch as separate queued steps, so
// BOTH racers observe genesis as their head and pass the
// pre-dispatch echo check before either's write commits — the
// SECOND-dispatched racer's in-tx re-read then 412s.
Deno.test('locked arm: two concurrent PUTs echoing the same head —'
+ ' the loser 412s via the in-tx head re-read',
async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const path = '/' + TEST_FAMILY + '/YRLOudHOEHboXTwRDwLUTg';
        const genesis = await handleRequest(db, req(
            'PUT', path, token, { v: 'genesis' },
        ));
        const head = genesis.headers.get('ETag')!;
        const [first, second] = await Promise.all([
            handleRequest(db, req(
                'PUT', path, token, { v: 'a' },
                { [IF_MATCH_HEADER]: head },
            )),
            handleRequest(db, req(
                'PUT', path, token, { v: 'b' },
                { [IF_MATCH_HEADER]: head },
            )),
        ]);
        const statuses =
            [first.status, second.status].sort();
        assertEquals(statuses, [201, 412]);
        const loser = first.status === 412 ? first : second;
        const loserBody =
            await loser.json() as { error: string };
        assertStrictEquals(
            loserBody.error,
            'If-Match does not match the current document at '
            + path,
        );
        const messagePairs = await db.messagePairs.getAll();
        const atPath = messagePairs.filter(
            (row) =>
                row.uri_collection
                    === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
                    + TEST_FAMILY + '/'
                && row.uri_id === 'YRLOudHOEHboXTwRDwLUTg',
        );
        assertStrictEquals(atPath.length, 2);
        // Genesis + exactly one winner write landed; the
        // loser stored NOTHING — no partial write survives.
        assertStrictEquals(messagePairs.length, 4);
    });
});

Deno.test('withSyntheticLockedFamily leaves no residue behind',
() => {
    assertStrictEquals(documentFamilyWiring(TEST_FAMILY), undefined);
    assertStrictEquals(
        MESSAGE_PAIR_WIRED_ROUTE_PATTERNS.has(TEST_PATTERN), false,
    );
    assertStrictEquals(
        DOCUMENT_CLASS_ROUTE_PATTERNS.has(TEST_PATTERN), false,
    );
    assertStrictEquals(WRITE_RESPONSE_SPECS[TEST_PATTERN], undefined);
    assertStrictEquals(
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
): object {
    return {
        id: document.uriId,
        organization_id: organization,
        ...document.body,
    };
}

const statelessWiring: DocumentFamilyWiring = {
    family: STATELESS_FAMILY,
    httpNest: 'organization',
    lifecycle: 'stateless',
    notFoundTable: STATELESS_TABLE,
    validateDocument: (body) => body,
    documentOp: testDocumentOp,
    entityOf: statelessEntityOf,
};

async function putStatelessDocumentMessagePair(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
): Promise<void> {
    const messagePair = await formWriteMessagePair({
        method: 'PUT',
        pathname: '/' + STATELESS_FAMILY + '/' + id,
        routePattern: STATELESS_FAMILY + '/:id',
        routeSegments: [STATELESS_FAMILY, ':id'],
        pathSegments: [STATELESS_FAMILY, id],
        headerFields: [], body, requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: AT, organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseStatus: 200,
        responseBody: { id, ...body },
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        MESSAGE_TABLES,
        (view) => appendMessagePair(view, messagePair),
    );
}

async function deleteStatelessDocumentMessagePair(
    db: DbAdapter,
    id: Id,
): Promise<void> {
    const messagePair = await formWriteMessagePair({
        method: 'DELETE',
        pathname: '/' + STATELESS_FAMILY + '/' + id,
        routePattern: STATELESS_FAMILY + '/:id',
        routeSegments: [STATELESS_FAMILY, ':id'],
        pathSegments: [STATELESS_FAMILY, id],
        headerFields: [], body: {},
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: AT, organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseStatus: 200, responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        MESSAGE_TABLES,
        (view) => appendMessagePair(view, messagePair),
    );
}

Deno.test('stateless lifecycle: a trio-less document PUT derives'
+ ' through documentGetHandler with no throw', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await putStatelessDocumentMessagePair(db, SL_1, { v: 'first' });
    const got = await documentGetHandler(statelessWiring)(
        db, ['AjdvjuECVZEgZoFajaIEkg', SL_1], 'XXZruirZyAOoRpNxaDnpSA'
            , 'AjdvjuECVZEgZoFajaIEkg', [],
    );
    assertEquals(got, {
        id: SL_1, organization_id: 'AjdvjuECVZEgZoFajaIEkg', v: 'first',
    });
});

Deno.test('stateless lifecycle: documentCollectionGetHandler skips'
+ ' the per-document history walk too', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await putStatelessDocumentMessagePair(db, SL_2, { v: 'listed' });
    const rows = await documentCollectionGetHandler(
        statelessWiring,
    )(db, [], 'XXZruirZyAOoRpNxaDnpSA', 'AjdvjuECVZEgZoFajaIEkg', []);
    assertEquals(rows, [
        { id: SL_2, organization_id: 'AjdvjuECVZEgZoFajaIEkg'
            , v: 'listed' },
    ]);
});

Deno.test('stateless lifecycle: a DELETE head 404s carrying'
+ ' notFoundTable, never the family', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await putStatelessDocumentMessagePair(db, SL_3, { v: 'first' });
    await deleteStatelessDocumentMessagePair(db, SL_3);
    const error = await assertRejects(
        () => documentGetHandler(statelessWiring)(
            db, ['AjdvjuECVZEgZoFajaIEkg', SL_3], 'XXZruirZyAOoRpNxaDnpSA'
                , 'AjdvjuECVZEgZoFajaIEkg', [],
        ),
    ) as EntityNotFoundError;
    assertInstanceOf(error, EntityNotFoundError);
    assertStrictEquals(error.table, STATELESS_TABLE);
});

Deno.test('stateless lifecycle: a DELETE head is absent from the'
+ ' collection too', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await putStatelessDocumentMessagePair(db, SL_4, { v: 'first' });
    await deleteStatelessDocumentMessagePair(db, SL_4);
    const rows = await documentCollectionGetHandler(
        statelessWiring,
    )(db, [], 'XXZruirZyAOoRpNxaDnpSA', 'AjdvjuECVZEgZoFajaIEkg', []);
    assertEquals(rows, []);
});
