import { assertEquals, assertStrictEquals } from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    apiRequest,
    storedMessageBodyText,
} from './http-fixtures.ts';
import { messageStore } from '../api/message-store.ts';

const IDENTITY = 'XXZruirZyAOoRpNxaDnpSA';
const CREDENTIAL = 'CrCrCrCrCrCrCrCrCrCrCQ';
const BODY = {
    identity_id: IDENTITY,
    kind: 'password',
    status: 'set',
    secret: '$scrypt$ln=17,r=8,p=1$c2FsdA$aGFzaA',
    at: '2026-09-30T00:00:00.000000Z',
};

async function put(body: unknown) {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const response = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/identities/' + IDENTITY + '/credentials/'
            + CREDENTIAL,
        token: DEV_TOKEN,
        body,
    }));
    return { db, response };
}

Deno.test('a credential write answers without its secret',
async () => {
    const { response } = await put(BODY);
    assertStrictEquals(response.status, 201);
    const answer = await response.json();
    assertStrictEquals('secret' in answer, false);
    assertStrictEquals(answer.kind, 'password');
});

Deno.test('the stored credential keeps its secret',
async () => {
    const { db } = await put(BODY);
    const head = await messageStore(db).getDocumentHead(
        '/identities/' + IDENTITY + '/credentials/',
        CREDENTIAL,
    );
    assertEquals(
        JSON.parse(storedMessageBodyText(head!.response))
            .secret,
        BODY.secret,
    );
});

Deno.test('a resent credential write answers its head'
    + ' without the secret', async () => {
    const { db } = await put(BODY);
    const again = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/identities/' + IDENTITY + '/credentials/'
            + CREDENTIAL,
        token: DEV_TOKEN,
        body: BODY,
    }));
    assertStrictEquals(again.status, 200);
    assertStrictEquals(
        'secret' in await again.json(), false,
    );
});

Deno.test('a client_secret credential is refused at the gate',
async () => {
    const { db, response } = await put({
        identity_id: IDENTITY,
        kind: 'client_secret',
        status: 'set',
        secret: 'x',
        at: '2026-09-30T00:00:00.000000Z',
    });
    assertStrictEquals(response.status, 400);
    assertEquals(await response.json(), {
        error: 'invalid credential kind "client_secret"'
            + ' on IdentityCredentialEntity',
    });
    assertStrictEquals(
        await messageStore(db).getDocumentHead(
            '/identities/' + IDENTITY + '/credentials/',
            CREDENTIAL,
        ),
        null,
    );
});
