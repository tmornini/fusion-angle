import { assert, assertEquals, assertStrictEquals } from
    '@std/assert';
import { handleRequest } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { decodeAccessToken } from '../api/access-token.ts';
import {
    apiRequest,
    framedRequest,
    partBodiesOf,
    presentedFields,
    withoutCredentialFields,
} from './http-fixtures.ts';
import { makeAssertionSigner } from
    './client-assertion-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../shared/types.ts';
import { messageStore } from '../api/message-store.ts';
import { canonicalPath } from '../api/message-pair.ts';

const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const AT = '2026-01-01T00:00:00.000000Z';

// A service created by the members statement is a
// co-member: the identity fence admits the organization
// admin, and its token's claims name the organization.
async function serviceMember(): Promise<{
    db: MemoryDbAdapter; admin: string; id: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const admin = await organizationToken();
    const id = generateIdentifier();
    const created = await handleRequest(db, apiRequest({
        method: 'POST',
        path: '/organizations/' + STARK + '/memberships/',
        token: admin,
        body: {
            id,
            kind: 'service',
            membership: { type: 'member', at: AT },
            service: { name: 'CI bot', description: 'Builds' },
        },
    }));
    assertStrictEquals(created.status, 201);
    await created.body?.cancel();
    return { db, admin, id };
}

function registration(jwks: string) {
    return {
        grant_types: 'client_credentials',
        redirect_uris: '',
        jwks,
        aud: 'fusion-angle',
        status: 'active',
    };
}

Deno.test('an organization admin reaches a service member'
+ ' identity (G47)', async () => {
    const { db, admin, id } = await serviceMember();
    const identity = await handleRequest(db, apiRequest({
        method: 'GET', path: '/identities/' + id, token: admin,
    }));
    assertStrictEquals(identity.status, 200);
    await identity.body?.cancel();
    const registered = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/identities/' + id + '/registration',
        token: admin,
        body: registration('{"keys":[]}'),
    }));
    assertStrictEquals(registered.status, 201);
    await registered.body?.cancel();
    const listed = await handleRequest(db, apiRequest({
        method: 'GET', path: '/identities/', token: admin,
    }));
    assertStrictEquals(listed.status, 200);
    const ids = (await partBodiesOf<{ id: string }>(listed))
        .map((row) => row.id);
    assert(ids.includes(id));
});

Deno.test('a service member token carries its membership'
+ ' organization', async () => {
    const { db, admin, id } = await serviceMember();
    const signer = await makeAssertionSigner('ES256');
    const registered = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/identities/' + id + '/registration',
        token: admin,
        body: registration(signer.jwks),
    }));
    assertStrictEquals(registered.status, 201);
    await registered.body?.cancel();
    const now = Math.floor(Date.now() / 1000);
    const lifted = withoutCredentialFields({
        grant_type: 'client_credentials',
        client_id: id,
        client_assertion: await signer.sign({
            iss: id, sub: id, aud: 'fusion-angle',
            exp: now + 300, iat: now,
            jti: generateIdentifier(),
        }),
    });
    const minted = await handleRequest(db, framedRequest(
        'http://localhost/authentication/token',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...lifted.headers,
            },
            body: JSON.stringify(lifted.body),
        },
    ));
    assertStrictEquals(minted.status, 200);
    const { access_token } = await presentedFields(
        minted,
    ) as { access_token: string };
    const claims = decodeAccessToken(access_token);
    assertStrictEquals(claims.sub, id);
    assertEquals(claims.organizations, [STARK]);
});

function graphNode(memberIds: string[]) {
    return {
        id: generateIdentifier(),
        name: 'Step',
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        memberIds,
        attributes: [],
        taskInstructions: '',
    };
}

function flowDocument(
    name: string,
    stateEventId: string,
    graph: { nodes: unknown[]; edges: unknown[] },
) {
    return {
        name,
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        state: 'active',
        state_at: AT,
        state_event_id: stateEventId,
        graph,
        graphDelta: {
            nodes: [],
            edges: [],
            deletions: [],
            memberEvents: [],
            attributeEvents: [],
        },
        revivals: [],
    };
}

// A service member is a program: memberIds names person
// identities only, so the law refuses its id as an AI's.
Deno.test('a flow write naming a service member in'
+ ' memberIds is 400', async () => {
    const { db, admin, id } = await serviceMember();
    const flowId = generateIdentifier();
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/' + STARK + '/flows/' + flowId,
        token: admin,
        body: flowDocument(
            'Blocked',
            generateIdentifier(),
            {
                nodes: [graphNode([id])],
                edges: [],
            },
        ),
        headers: { 'if-none-match': '*' },
    }));
    assertStrictEquals(res.status, 400);
    assertEquals(await res.json(), {
        error: 'memberIds may name person identities only,'
            + ' not AI agents or services',
    });
    assertStrictEquals(
        await messageStore(db).getDocumentHead(
            canonicalPath(STARK, '/flows/'), flowId,
        ),
        null,
    );
});
