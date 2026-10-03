import {
    assert,
    assertEquals,
    assertMatch,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { seededMockDb } from './mock-seed.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    apiRequest,
    partsOf,
    storedPutBodyText,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { nowUtc } from '../shared/types.ts';
import { ORGANIZATION_TWO } from
    '../api/mock-data/seed-constants.ts';
import { messageStore } from '../api/message-store.ts';
import {
    attemptFor,
    formWriteMessagePair,
    runWrite,
} from '../api/message-pair.ts';
import { withoutId } from '../api/document-family.ts';
import { parseWire } from
    '../shared/http-message/wire-codec.ts';
import { imfFixdate } from '../shared/pair-root.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import { captureConsole } from './fixtures/console-capture.ts';

const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const ME = 'XXZruirZyAOoRpNxaDnpSA';
const IDEAS = '/organizations/' + STARK + '/ideas/';

function idea(state: string) {
    return {
        title: 'Served', position: 1,
        problem_statement: 'p', target_users: 't',
        proposed_solution: 's', expected_outcome: 'o',
        success_metrics: 'm', state,
    };
}

async function put(
    db: Awaited<ReturnType<typeof seededMockDb>>,
    path: string,
    body: unknown,
    token: string,
    operationId?: string,
) {
    const response = await handleRequest(db, apiRequest({
        method: 'PUT', path, token, body,
        ...(operationId === undefined ? {} : { operationId }),
    }));
    await response.body?.cancel();
    return response;
}

// The seed's first document of a family and its stored body.
async function seededDocument(
    db: Awaited<ReturnType<typeof seededMockDb>>,
    path: string,
    family: string,
): Promise<{ id: string, body: Record<string, unknown> }> {
    const [first] = await messageStore(db).getCollection(
        path,
    ) as { id: string }[];
    assert(first, 'the seed holds a ' + family + ' document');
    const body = JSON.parse(
        await storedPutBodyText(db, path, first.id),
    ) as Record<string, unknown>;
    return { id: first.id, body };
}

Deno.test('a document GET serves the stored lines and'
    + ' octets', async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const id = generateIdentifier();
    const operationId = generateIdentifier();
    await put(db, IDEAS + id, idea('active'), token, operationId);
    const got = await handleRequest(db, apiRequest({
        method: 'GET', path: IDEAS + id, token,
    }));
    assertStrictEquals(got.status, 200);
    const head = await messageStore(db).getDocumentHead(
        IDEAS, id,
    );
    const stored = new Map(parseWire(head!.response).fields
        .map((field) => [field.name, field.value]));
    assertStrictEquals(got.headers.get('etag'), stored.get('etag'));
    assertStrictEquals(
        got.headers.get('operation-id'), operationId,
    );
    assertStrictEquals(
        got.headers.get('content-type'),
        stored.get('content-type'),
    );
    assertNotStrictEquals(
        got.headers.get('request-id'),
        stored.get('request-id'),
    );
    assertMatch(got.headers.get('date')!, /GMT$/);
    assertStrictEquals(
        await got.text(),
        await storedPutBodyText(db, IDEAS, id),
    );
});

Deno.test('a landed PUT\'s answer carries its own three'
    + ' lines', async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const id = generateIdentifier();
    const response = await handleRequest(db, apiRequest({
        method: 'PUT', path: IDEAS + id, token,
        body: idea('active'),
    }));
    assertStrictEquals(response.status, 201);
    const head = await messageStore(db).getDocumentHead(
        IDEAS, id,
    );
    assert(head);
    assertStrictEquals(head.requester_identity_id, ME);
    assertStrictEquals(
        response.headers.get('last-modified'),
        response.headers.get('date'),
    );
    assertStrictEquals(
        response.headers.get('response-at'),
        head.response_at,
    );
    assertStrictEquals(
        response.headers.get('requester-identity-id'),
        ME,
    );
    await response.body?.cancel();
});

Deno.test('a no-op PUT\'s answer carries the head\'s three'
    + ' lines', async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const id = generateIdentifier();
    const body = idea('active');
    const first = await handleRequest(db, apiRequest({
        method: 'PUT', path: IDEAS + id, token, body,
    }));
    assertStrictEquals(first.status, 201);
    await first.body?.cancel();
    const head = await messageStore(db).getDocumentHead(
        IDEAS, id,
    );
    assert(head);
    const again = await handleRequest(db, apiRequest({
        method: 'PUT', path: IDEAS + id, token, body,
    }));
    assertStrictEquals(again.status, 200);
    assertStrictEquals(
        again.headers.get('response-at'),
        head.response_at,
    );
    assertStrictEquals(
        again.headers.get('requester-identity-id'),
        head.requester_identity_id,
    );
    assertStrictEquals(
        again.headers.get('last-modified'),
        imfFixdate(head.response_at),
    );
    await again.body?.cancel();
});

Deno.test('a document GET and its collection part carry'
    + ' the same three lines', async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const id = generateIdentifier();
    assertStrictEquals(
        (await put(db, IDEAS + id, idea('active'), token))
            .status,
        201,
    );
    const head = await db.messagePairs.getHeadPair(IDEAS, id);
    assert(head);
    const got = await handleRequest(db, apiRequest({
        method: 'GET', path: IDEAS + id, token,
    }));
    assertStrictEquals(got.status, 200);
    const parts = await partsOf(await handleRequest(
        db, apiRequest({ method: 'GET', path: IDEAS, token }),
    ));
    const part = parts.find((item) =>
        item.query('header.etag').toText()
            === '"' + head.id + '"');
    assert(part);
    for (const name of [
        'last-modified', 'response-at', 'requester-identity-id',
    ]) {
        assertStrictEquals(
            part.query('header.' + name).toText(),
            got.headers.get(name),
        );
    }
    assertStrictEquals(
        got.headers.get('last-modified'),
        imfFixdate(head.response_at),
    );
    assertStrictEquals(
        got.headers.get('response-at'), head.response_at,
    );
    assertStrictEquals(
        got.headers.get('requester-identity-id'),
        head.requester_identity_id,
    );
    await got.body?.cancel();
});

Deno.test('a grant\'s 201 carries its own pair\'s three'
    + ' lines', async () => {
    const db = await seededMockDb();
    const invitee = 'MQFcPtrZPIGjMCRAXtZUnA';
    const name = membershipNameOf(ORGANIZATION_TWO, invitee);
    const token = await organizationToken(
        ME, ORGANIZATION_TWO,
    );
    const grant = await handleRequest(db, apiRequest({
        method: 'POST',
        path: '/organizations/' + ORGANIZATION_TWO
            + '/invitations/',
        token,
        body: {
            email: 'sarah.chen@company.com',
            grantAt: '2026-06-04T00:00:00.000000Z',
        },
    }));
    assertStrictEquals(grant.status, 201);
    const operation = (await db.messagePairs.getAll()).find(
        (row) => row.method === 'POST'
            && row.path === '/invitations/' + name + '/'
            && row.name === 'pending',
    );
    assert(operation);
    assertStrictEquals(operation.requester_identity_id, ME);
    assertStrictEquals(
        grant.headers.get('last-modified'),
        grant.headers.get('date'),
    );
    assertStrictEquals(
        grant.headers.get('response-at'),
        operation.response_at,
    );
    assertStrictEquals(
        grant.headers.get('requester-identity-id'), ME,
    );
    await grant.body?.cancel();
});

Deno.test('a state-deleted idea answers 410 after the fence',
async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const id = generateIdentifier();
    await put(db, IDEAS + id, idea('active'), token);
    await put(db, IDEAS + id, idea('deleted'), token);
    const got = await handleRequest(db, apiRequest({
        method: 'GET', path: IDEAS + id, token,
    }));
    assertStrictEquals(got.status, 410);
    assertEquals(await got.json(), {
        error: 'Gone: ideas/' + id,
    });
    // The collection names no part for the deleted head.
    const headId = (await db.messagePairs.getHeadPair(IDEAS, id))!
        .id;
    const parts = await partsOf(await handleRequest(db, apiRequest({
        method: 'GET', path: IDEAS, token,
    })));
    assertEquals(
        parts.filter((p) => p.query('header.etag').toText()
            === '"' + headId + '"'),
        [],
    );
});

Deno.test('a name never written answers 404', async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const got = await handleRequest(db, apiRequest({
        method: 'GET', path: IDEAS + generateIdentifier(),
        token,
    }));
    assertStrictEquals(got.status, 404);
    await got.body?.cancel();
});

Deno.test('a foreign deleted idea answers what its live one'
    + ' does', async () => {
    const db = await seededMockDb();
    const mine = await organizationToken();
    const theirs = await organizationToken(ME, ORGANIZATION_TWO);
    const theirIdeas = '/organizations/' + ORGANIZATION_TWO
        + '/ideas/';
    const live = generateIdentifier();
    const gone = generateIdentifier();
    assertStrictEquals(
        (await put(db, theirIdeas + live, idea('active'),
            theirs)).status,
        201,
    );
    await put(db, theirIdeas + gone, idea('active'), theirs);
    await put(db, theirIdeas + gone, idea('deleted'), theirs);
    const readLive = await handleRequest(db, apiRequest({
        method: 'GET', path: theirIdeas + live, token: mine,
    }));
    const readGone = await handleRequest(db, apiRequest({
        method: 'GET', path: theirIdeas + gone, token: mine,
    }));
    assertStrictEquals(readLive.status, 403);
    assertStrictEquals(readGone.status, 403);
    await readLive.body?.cancel();
    await readGone.body?.cancel();
    // At the caller's own collection the foreign id is the
    // owner probe's miss (404 today), and the deleted one
    // answers that same miss, never Gone.
    const mineLive = await handleRequest(db, apiRequest({
        method: 'GET', path: IDEAS + live, token: mine,
    }));
    const mineGone = await handleRequest(db, apiRequest({
        method: 'GET', path: IDEAS + gone, token: mine,
    }));
    assertStrictEquals(mineGone.status, mineLive.status);
    assertStrictEquals(mineLive.status, 404);
    await mineLive.body?.cancel();
    await mineGone.body?.cancel();
});

Deno.test('a state-deleted project and objective answer 410',
async () => {
    const db = await seededMockDb();
    const token = await organizationToken();

    // A project admits `deleted` through the facade.
    const projects = '/organizations/' + STARK + '/projects/';
    const project = await seededDocument(db, projects, 'projects');
    const projectHead = await messageStore(db).getDocumentHead(
        projects, project.id,
    );
    const deletedProject = await handleRequest(db, apiRequest({
        method: 'PUT', path: projects + project.id, token,
        body: { ...withoutId(project.body), state: 'deleted' },
        headers: { 'If-Match': '"' + projectHead!.id + '"' },
    }));
    assertStrictEquals(deletedProject.status, 200, 'projects');
    await deletedProject.body?.cancel();
    const gotProject = await handleRequest(db, apiRequest({
        method: 'GET', path: projects + project.id, token,
    }));
    assertStrictEquals(gotProject.status, 410, 'projects');
    await gotProject.body?.cancel();

    // An objective's validator admits no `deleted`, so its
    // state-deleted head is formed below the facade.
    const objectives = '/organizations/' + STARK
        + '/objectives/';
    const objective = await seededDocument(
        db, objectives, 'objectives',
    );
    const deletedBody = {
        ...withoutId(objective.body), state: 'deleted',
    };
    const messagePair = await formWriteMessagePair({
        method: 'PUT',
        pathname: objectives + objective.id,
        routePattern: 'organizations/:id/objectives/:id',
        routeSegments: [
            'organizations', ':id', 'objectives', ':id',
        ],
        pathSegments: [
            'organizations', STARK, 'objectives', objective.id,
        ],
        headerFields: [],
        body: deletedBody,
        requesterIdentityId: ME,
        requestAt: nowUtc(),
        organization: STARK,
        responseBody: { id: objective.id, ...deletedBody },
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await runWrite(
        db, attemptFor([messagePair]), [messagePair],
    );
    const objectiveHead = await db.messagePairs.getHeadPair(
        objectives, objective.id,
    );
    assertStrictEquals(
        objectiveHead?.id, messagePair.id, 'objectives',
    );
    const gotObjective = await handleRequest(db, apiRequest({
        method: 'GET', path: objectives + objective.id, token,
    }));
    assertStrictEquals(gotObjective.status, 410, 'objectives');
    await gotObjective.body?.cancel();
});

// A 'state' family's PUT validator makes a stored head with
// no `state` impossible; one formed below the facade is a
// bug the request crashes on, never the reader's fault.
Deno.test('a state head stored without a state answers 500',
async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const id = generateIdentifier();
    const { state: _state, ...stateless } = idea('active');
    const messagePair = await formWriteMessagePair({
        method: 'PUT',
        pathname: IDEAS + id,
        routePattern: 'organizations/:id/ideas/:id',
        routeSegments: ['organizations', ':id', 'ideas', ':id'],
        pathSegments: ['organizations', STARK, 'ideas', id],
        headerFields: [],
        body: stateless,
        requesterIdentityId: ME,
        requestAt: nowUtc(),
        organization: STARK,
        responseBody: { id, ...stateless },
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await runWrite(
        db, attemptFor([messagePair]), [messagePair],
    );
    const head = await db.messagePairs.getHeadPair(IDEAS, id);
    assertStrictEquals(head?.id, messagePair.id);
    const { result: got, calls } = await captureConsole(
        'error',
        () => handleRequest(db, apiRequest({
            method: 'GET', path: IDEAS + id, token,
        })),
    );
    assertStrictEquals(got.status, 500);
    assertEquals(await got.json(), { error: 'internal error' });
    assertStrictEquals(calls.length, 1);
    const [event, , error] = calls[0]!;
    assertStrictEquals(event, 'request failed');
    assertMatch(
        (error as Error).message,
        new RegExp(IDEAS + id + '.*' + messagePair.id),
    );
});
