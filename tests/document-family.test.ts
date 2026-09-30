import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    RetiredEntityError,
} from '../api/db.ts';
import type {
    DbAdapter,
    StorageBackend,
    Tx,
} from '../api/db.ts';
import type { Id } from '../shared/types.ts';
import { handleRequest } from '../api/api.ts';
import {
    runWrite,
    attemptFor,
    formWriteMessagePair,
    IF_MATCH_HEADER,
    IF_NONE_MATCH_HEADER,
    strongEtagOf,
} from '../api/message-pair.ts';
import { messageStore } from '../api/message-store.ts';
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
} from '../api/message-pair.ts';
import {
    FAMILY_REGISTRY,
    type FamilyRegistration,
} from '../api/family-registry.ts';
import {
    documentFamilyWiring,
    documentEntityRoute,
    documentGetHandler,
    documentSelect,
    documentCollectionGetHandler,
    documentWriteResponseSpec,
    DOCUMENT_FAMILY_WIRINGS,
    type DocumentFamilyWiring,
} from '../api/document-family.ts';
import { servedSelection } from '../api/head-reads.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { ApiError, HTTP_PRECONDITION_FAILED } from
    '../shared/http-errors.ts';
import {
    apiRequest,
    pairIdOf,
    storedPutBodyText,
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
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// -- (a) documentWriteResponseSpec's successBody, pinned
// against FIXED expected literals. G1 families emit
// wiring.entityOf (id first, state last). Pinned to literals —
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
    const operationId = generateIdentifier();
    // The stored PUT response is the wire truth GET must
    // reproduce below — id plus the full document body, the
    // same shape a real route dispatch's successBody stores.
    const responseBody = {
        id: 'gZsGVjTnvrgHQLzbKnQckg', ...body,
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
        responseBody,
        operationId,
        requestId: generateIdentifier(),
    });
    const written = await route.put!(
        db, ['AjdvjuECVZEgZoFajaIEkg', 'gZsGVjTnvrgHQLzbKnQckg'], body
            , 'XXZruirZyAOoRpNxaDnpSA', messagePair,
        'AjdvjuECVZEgZoFajaIEkg', [], AT, operationId,
    );
    assertStrictEquals(
        (written as { title: string }).title, 'Generic',
    );
    const selection = await route.select!(
        db, ['AjdvjuECVZEgZoFajaIEkg', 'gZsGVjTnvrgHQLzbKnQckg']
            , 'XXZruirZyAOoRpNxaDnpSA', 'AjdvjuECVZEgZoFajaIEkg',
        [],
    );
    const served = servedSelection(selection, {
        date: 'Wed, 30 Sep 2026 12:00:00 GMT',
        requestId: 'ReqReqReqReqReqReqReqQ',
    });
    assertStrictEquals(
        served.headers.get('etag'), strongEtagOf(messagePair.id),
    );
    assertStrictEquals(
        await served.text(),
        await storedPutBodyText(
            db, '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
            'gZsGVjTnvrgHQLzbKnQckg',
        ),
    );
});

// -- (c) the required arm, against a SYNTHETIC registration. -

const TEST_FAMILY = 'locked-test-docs';
const TEST_PATTERN = TEST_FAMILY + '/:id';
// A SIBLING document-class route under the SAME family prefix —
// never served via documentPutHandler, mirroring a real family's
// own hand-written sub-resource (e.g.
// organizations/:id/flows/:id/versions/:etag
// beside organizations/:id/flows/:id). Proves the gate keys
// the conditional off the EXACT route pattern, never the
// family's first path segment alone — a sibling route takes
// its own 'optional' entry though the entity's is
// 'required'.
const CHILD_PATTERN = TEST_FAMILY + '/:id/child';

// The synthetic family's decompose op stores NOTHING but the
// pair itself — the gate machinery under test lives
// entirely in api.ts/message-pair.ts, upstream of this op, so
// the op only needs to prove appendMessagePairOnce ran.
async function testDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<unknown> {
    if (messagePair !== undefined) {
        const latchedId = messagePair.latchedHeadMessagePairId;
        // The gate's echo check and this write are separate
        // steps, so two racers can both pass the gate. The
        // re-read has to share the write's transaction or
        // the statement answers first, with the stored path.
        if (
            !('backend' in db)
            || !('clientOn' in db)
        ) {
            throw new Error(
                'a racing write requires a backed adapter',
            );
        }
        const backed = db as DbAdapter & {
            backend: StorageBackend;
            clientOn: (tx: Tx) => DbAdapter;
        };
        await backed.backend.transaction(
            'readwrite',
            async (tx) => {
                const view = backed.clientOn(tx);
                if (latchedId !== undefined) {
                    const latest = (
                        await messageStore(view)
                            .getDocumentHead(
                                messagePair.path,
                                messagePair.name,
                            )
                    )?.id;
                    if (latest !== latchedId) {
                        throw new ApiError(
                            'If-Match does not match'
                            + ' the current document'
                            + ' at /'
                            + TEST_FAMILY + '/' + id,
                            HTTP_PRECONDITION_FAILED,
                        );
                    }
                }
                await runWrite(
                    view,
                    attemptFor([messagePair]),
                    [messagePair],
                );
            },
        );
    }
    return { id, ...body };
}

function testEntityOf(
    document: { name: string; body: Record<string, unknown> },
    organization: Id,
): object {
    return {
        id: document.name,
        organization_id: organization,
        ...document.body,
    };
}

// Registers a synthetic 'required' family for the duration of
// `fn`, through the SAME seams a real family task would use
// (FAMILY_REGISTRY, DOCUMENT_FAMILY_WIRINGS, the live route
// table, the pair-wiring sets, WRITE_RESPONSE_SPECS) — then
// unregisters everything, even if `fn` throws, so no test
// pollutes another. No live family is registered here through
// this task.
async function withSyntheticLockedFamily<T>(
    fn: () => Promise<T>,
): Promise<T> {
    const registration: FamilyRegistration = {
        family: TEST_FAMILY,
        organizationNested: true,
        createBodyIdField: 'id',
    };
    const mutableRegistry =
        FAMILY_REGISTRY as FamilyRegistration[];
    mutableRegistry.push(registration);
    const wiring: DocumentFamilyWiring = {
        family: TEST_FAMILY,
        httpNest: 'global',
        // The documents this family stores carry entity
        // fields only, no `state`: the gate judges a 'state'
        // head's body, so the declaration must be true to
        // what the required arm's GET reads.
        lifecycle: 'stateless',
        notFoundTable: TEST_FAMILY,
        validateDocument: (body) => ({
            entity: body,
        }),
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
    const mutableSpecs = WRITE_RESPONSE_SPECS as
        Record<string, WriteResponseSpec>;
    mutableSpecs[TEST_PATTERN] = {
        ...documentWriteResponseSpec(wiring),
        conditional: 'required',
    };
    mutableSpecs[CHILD_PATTERN] = {
        conditional: 'optional',
        successBody: (_params, body) => body ?? {},
    };
    try {
        return await fn();
    } finally {
        for (const entry of [routeEntry, childRouteEntry]) {
            const index = routes.indexOf(entry);
            if (index >= 0) routes.splice(index, 1);
        }
        MESSAGE_PAIR_WIRED_ROUTE_PATTERNS.delete(TEST_PATTERN);
        MESSAGE_PAIR_WIRED_ROUTE_PATTERNS.delete(CHILD_PATTERN);
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

Deno.test('required arm: genesis with neither header is 428',
async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const undeclared = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/XufQcWIKhZshfJYOVNeUSw', token,
            { v: 'first' },
        ));
        assertStrictEquals(undeclared.status, 428);
        const res = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/XufQcWIKhZshfJYOVNeUSw', token,
            { v: 'first' },
            { [IF_NONE_MATCH_HEADER]: '*' },
        ));
        assertStrictEquals(res.status, 201);
        assertStrictEquals(res.headers.get('Follows'), null);
        assertStrictEquals(res.headers.get('Supersedes'), null);
        const responseId = pairIdOf(res);
        assert(
            responseId !== null && isIdentifier(responseId),
        );
    });
});

Deno.test('required arm: GET ETag names the stored pair',
async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const path = '/' + TEST_FAMILY + '/'
            + generateIdentifier();
        const put = await handleRequest(db, req(
            'PUT', path, token, { v: 'first' },
            { [IF_NONE_MATCH_HEADER]: '*' },
        ));
        assertStrictEquals(put.status, 201);
        const got = await handleRequest(db, req(
            'GET', path, token,
        ));
        assertStrictEquals(got.status, 200);
        const responseId = pairIdOf(got);
        assert(
            responseId !== null && isIdentifier(responseId),
        );
        assertStrictEquals(
            pairIdOf(got), pairIdOf(put),
        );
    });
});

Deno.test('required arm: If-Match with the pair id succeeds; a'
+ ' stale token 412s; live head with no pin 428s',
async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const path = '/' + TEST_FAMILY + '/'
            + generateIdentifier();
        const genesis = await handleRequest(db, req(
            'PUT', path, token, { v: 'first' },
            { [IF_NONE_MATCH_HEADER]: '*' },
        ));
        assertStrictEquals(genesis.status, 201);
        const pairId = pairIdOf(genesis);
        assert(pairId !== null);
        const matched = await handleRequest(db, req(
            'PUT', path, token, { v: 'second' },
            { [IF_MATCH_HEADER]: strongEtagOf(pairId) },
        ));
        assertStrictEquals(matched.status, 200);
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

Deno.test('required arm: A then B then A yields three distinct'
+ ' ETags',
async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const path = '/' + TEST_FAMILY + '/'
            + generateIdentifier();
        const first = await handleRequest(db, req(
            'PUT', path, token, { v: 'A' },
            { [IF_NONE_MATCH_HEADER]: '*' },
        ));
        assertStrictEquals(first.status, 201);
        const tagA = first.headers.get('ETag')!;
        const second = await handleRequest(db, req(
            'PUT', path, token, { v: 'B' },
            { [IF_MATCH_HEADER]: tagA },
        ));
        assertStrictEquals(second.status, 200);
        const tagB = second.headers.get('ETag')!;
        const third = await handleRequest(db, req(
            'PUT', path, token, { v: 'A' },
            { [IF_MATCH_HEADER]: tagB },
        ));
        assertStrictEquals(third.status, 200);
        const tagA2 = third.headers.get('ETag')!;
        assertNotStrictEquals(tagA, tagB);
        assertNotStrictEquals(tagB, tagA2);
        assertNotStrictEquals(tagA, tagA2);
    });
});

Deno.test('required arm: a sibling route under the SAME family'
+ ' prefix takes its own conditional (keyed by routePattern,'
+ ' never the bare first segment)', async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const path = '/' + CHILD_PATTERN
            .replace(':id', DOC_CHILD);
        const first = await handleRequest(db, req(
            'PUT', path, token, { v: 'first' },
        ));
        assertStrictEquals(first.status, 201);
        // A second blind PUT — if the gate keyed the
        // entity's 'required' conditional off TEST_FAMILY
        // alone, this would 428.
        const second = await handleRequest(db, req(
            'PUT', path, token, { v: 'second' },
        ));
        assertStrictEquals(second.status, 200);
    });
});

Deno.test('required arm: head present, If-Match absent, 428s',
async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/YHvbnJSZHECuziaHXcsKpw', token,
            { v: 'first' },
            { [IF_NONE_MATCH_HEADER]: '*' },
        ));
        const res = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/YHvbnJSZHECuziaHXcsKpw', token,
            { v: 'second' },
        ));
        assertStrictEquals(res.status, 428);
        assertStrictEquals(
            (await res.json()).error,
            'If-Match or If-None-Match is required to PUT /'
            + TEST_FAMILY + '/YHvbnJSZHECuziaHXcsKpw',
        );
    });
});

Deno.test('required arm: a stale If-Match echo 412s', async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/YIuEjXvCwXAgrpyvcvLJjg', token,
            { v: 'first' },
            { [IF_NONE_MATCH_HEADER]: '*' },
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
            + '/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + TEST_FAMILY + '/YIuEjXvCwXAgrpyvcvLJjg',
        );
    });
});

Deno.test('required arm: a matching echo stores no predecessor'
+ ' columns or headers', async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const first = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/YKtyCizelcaUAaHGwetojA', token,
            { v: 'first' },
            { [IF_NONE_MATCH_HEADER]: '*' },
        ));
        const firstEtag = first.headers.get('ETag')!;
        const second = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/YKtyCizelcaUAaHGwetojA', token,
            { v: 'second' },
            { [IF_MATCH_HEADER]: firstEtag },
        ));
        assertStrictEquals(second.status, 200);
        assertStrictEquals(second.headers.get('Follows'), null);
        assertStrictEquals(second.headers.get('Supersedes'), null);
        const secondId = pairIdOf(second)!;
        const stored = (await db.messagePairs.getAll())
            .find((row) => row.id === secondId);
        assertStrictEquals(stored !== undefined, true);
        assertStrictEquals('follows' in stored!, false);
        assertStrictEquals(
            stored!.supersedes, pairIdOf(first),
        );
    });
});

Deno.test('required arm: a stale If-Match resend answers 412'
+ ' and stores nothing',
async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const first = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/YLbPBVpBLImxPQRqLKPKLw', token,
            { v: 'first' },
            { [IF_NONE_MATCH_HEADER]: '*' },
        ));
        const firstEtag = first.headers.get('ETag')!;
        const editRequest = req(
            'PUT', '/' + TEST_FAMILY + '/YLbPBVpBLImxPQRqLKPKLw', token,
            { v: 'second' },
            { [IF_MATCH_HEADER]: firstEtag },
        );
        const edit = await handleRequest(db, editRequest.clone());
        assertStrictEquals(edit.status, 200);
        const afterEdit = (await db.messagePairs.getAll())
            .length;
        // The edit's If-Match names the genesis head. A resend
        // is stale against the edit and stores nothing.
        const resend = await handleRequest(db, editRequest.clone());
        assertStrictEquals(resend.status, 412);
        assertStrictEquals(
            (await db.messagePairs.getAll()).length,
            afterEdit,
        );
    });
});

Deno.test('required arm: a fresh-keyed replay echoing a superseded'
+ ' head 412s', async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const genesis = await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/YMhCOBWvbUQVTDYjSloGqw', token,
            { v: 'first' },
            { [IF_NONE_MATCH_HEADER]: '*' },
        ));
        const genesisEtag = genesis.headers.get('ETag')!;
        await handleRequest(db, req(
            'PUT', '/' + TEST_FAMILY + '/YMhCOBWvbUQVTDYjSloGqw', token,
            { v: 'second' },
            { [IF_MATCH_HEADER]: genesisEtag },
        ));
        // A DIFFERENT (fresh) document has no head of its own;
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

Deno.test('required arm: two writers racing the SAME echo — the'
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
        organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseBody: { v: 'genesis' },
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await runWrite(
        db,
        attemptFor([genesis]),
        [genesis],
    )
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
        organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseBody: { v: 'a' },
        latchedHeadMessagePairId: genesis.id,
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    const writerB = await formWriteMessagePair({
        method: 'PUT', pathname: '/' + TEST_PATTERN,
        routePattern: TEST_PATTERN,
        routeSegments: [TEST_FAMILY, ':id'],
        pathSegments: [TEST_FAMILY, 'race'],
        headerFields: [echo], body: { v: 'b' },
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA', requestAt: AT,
        organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseBody: { v: 'b' },
        latchedHeadMessagePairId: genesis.id,
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
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

// Two PUTs echoing the same head, through handleRequest.
// The gate reads are separate steps, so both can pass
// before either write commits. The op holds the head
// re-read and the write in one transaction, so the loser
// sees the winner and 412s.
Deno.test('required arm: two concurrent PUTs echoing the same head —'
+ ' the loser 412s via the in-tx head re-read',
async () => {
    await withSyntheticLockedFamily(async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const path = '/' + TEST_FAMILY + '/YRLOudHOEHboXTwRDwLUTg';
        const genesis = await handleRequest(db, req(
            'PUT', path, token, { v: 'genesis' },
            { [IF_NONE_MATCH_HEADER]: '*' },
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
        assertEquals(statuses, [200, 412]);
        const loser = first.status === 412 ? first : second;
        const loserBody =
            await loser.json() as { error: string };
        assertStrictEquals(
            loserBody.error,
            'If-Match does not match the current document at '
            + '/organizations/AjdvjuECVZEgZoFajaIEkg' + path,
        );
        const messagePairs = await db.messagePairs.getAll();
        const atPath = messagePairs.filter(
            (row) =>
                row.path
                    === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
                    + TEST_FAMILY + '/'
                && row.name === 'YRLOudHOEHboXTwRDwLUTg',
        );
        assertStrictEquals(atPath.length, 2);
        // Genesis + exactly one winner write landed; the
        // loser stored NOTHING — no partial write survives.
        assertStrictEquals(messagePairs.length, 5);
    });
});

Deno.test('withSyntheticLockedFamily leaves no residue behind',
() => {
    assertStrictEquals(documentFamilyWiring(TEST_FAMILY), undefined);
    assertStrictEquals(
        MESSAGE_PAIR_WIRED_ROUTE_PATTERNS.has(TEST_PATTERN), false,
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
// 'stateless' registration proves a 'stateless' body needs no
// `state` key: derivedDocumentEntity and
// documentCollectionGetHandler skip the lifecycle walk +
// DELETED-state filter entirely for 'stateless', so a body
// carrying no state/state_at/state_event_id passes clean
// rather than making documentLifecycleEvents' pickString
// throw, proof the branch is skipped, not merely tolerant. A
// DELETE head is a stateless family's only tombstone
// (deriveDocumentsAt's own head-absent semantics), and that
// 404 carries the registration's notFoundTable, never its
// family, proving the two are independent facts. Handlers are
// called DIRECTLY (no registration/route-table ceremony) since
// GET derivation needs only the wiring value itself. ---------

const STATELESS_FAMILY = 'stateless-test-docs';
const STATELESS_TABLE = 'stateless_storage_table';

function statelessEntityOf(
    document: { name: string; body: Record<string, unknown> },
    organization: Id,
): object {
    return {
        id: document.name,
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
        responseBody: { id, ...body },
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await runWrite(
        db,
        attemptFor([messagePair]),
        [messagePair],
    )
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
        responseBody: undefined,
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await runWrite(
        db,
        attemptFor([messagePair]),
        [messagePair],
    )
}

Deno.test('stateless lifecycle: a stateless document PUT derives'
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

Deno.test('stateless lifecycle: documentCollectionGetHandler'
+ ' derives a stateless body', async () => {
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

Deno.test('stateless lifecycle: a DELETE head is Gone carrying'
+ ' notFoundTable, never the family', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await putStatelessDocumentMessagePair(db, SL_3, { v: 'first' });
    await deleteStatelessDocumentMessagePair(db, SL_3);
    const selection = await documentSelect(statelessWiring)(
        db, ['AjdvjuECVZEgZoFajaIEkg', SL_3], 'XXZruirZyAOoRpNxaDnpSA'
            , 'AjdvjuECVZEgZoFajaIEkg', [],
    );
    assertStrictEquals(selection.head.method, 'DELETE');
    const error = assertThrows(
        () => servedSelection(selection, {
            date: 'Wed, 30 Sep 2026 12:00:00 GMT',
            requestId: 'ReqReqReqReqReqReqReqQ',
        }),
        RetiredEntityError,
    );
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
