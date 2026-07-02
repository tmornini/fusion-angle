import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET, POST, handleRequest } from '../api/api.ts';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';

const BASE = 'http://localhost';
const MEMBER = 'walt';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// The PII facet — the contact fields the identity_pii store
// re-validates after the composing POST puts it.
function pii(name: string) {
    return {
        name,
        email: `${name}@example.com`.toLowerCase(),
        phone: '',
        bio: '',
    };
}

// The client_secret credential facet — the row the
// identity_credentials store re-validates after the composing
// POST puts it. `secret` arrives already hashed; the test
// passes an opaque non-empty stand-in.
function credential(id: string) {
    return {
        id: `${id}-client-secret`,
        identity_id: id,
        kind: 'client_secret',
        status: 'set',
        secret: 'hashed-secret',
        at: '2026-01-01T00:00:00.000000Z',
    };
}

function req(
    method: string, path: string, token: string,
    body?: unknown,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        },
        ...(body === undefined
            ? {} : { body: JSON.stringify(body) }),
    });
}

test(
    'POST identities (person) writes the identity and its'
    + ' PII row in one operation',
    async () => {
        const db = await freshDb();
        await POST(db, 'identities', {
            id: 'p1',
            kind: 'person',
            pii: pii('Alice'),
        }, DEV_TOKEN);
        const identity = await GET<{ kind: string }>(
            db, 'identities/p1', DEV_TOKEN);
        assert.equal(identity.kind, 'person');
        const piiRow = await db.identityPii.getById('p1');
        assert.equal(piiRow.name, 'Alice');
        // A person carries no credential.
        const creds = (await db.identityCredentials.getAll())
            .filter(c => c.identity_id === 'p1');
        assert.equal(creds.length, 0);
    },
);

test(
    'POST identities (service) writes the identity and its'
    + ' client_secret credential in one operation',
    async () => {
        const db = await freshDb();
        await POST(db, 'identities', {
            id: 's1',
            kind: 'service',
            credential: credential('s1'),
        }, DEV_TOKEN);
        const identity = await GET<{ kind: string }>(
            db, 'identities/s1', DEV_TOKEN);
        assert.equal(identity.kind, 'service');
        const cred = (await db.identityCredentials.getAll())
            .find(c => c.identity_id === 's1');
        assert.ok(cred, 'credential row exists');
        assert.equal(cred.kind, 'client_secret');
        assert.equal(cred.status, 'set');
        // A service carries no PII.
        const piiRow = (await db.identityPii.getAll())
            .find(r => r.id === 's1');
        assert.equal(piiRow, undefined);
    },
);

test(
    'POST identities (person) rolls back the identity when'
    + ' its PII sub-object is invalid',
    async () => {
        const db = await freshDb();
        await assert.rejects(
            // PII missing the required `bio` key — the
            // identity_pii store rejects it mid-tx, AFTER the
            // identities put has landed, so both must roll back.
            () => POST(db, 'identities', {
                id: 'doomed',
                kind: 'person',
                pii: {
                    name: 'Doomed',
                    email: 'doomed@example.com',
                    phone: '',
                },
            }, DEV_TOKEN),
        );
        // Neither facet survived the aborted transaction.
        await assert.rejects(
            () => GET(db, 'identities/doomed', DEV_TOKEN));
        await assert.rejects(
            () => db.identityPii.getById('doomed'));
    },
);

test(
    'POST identities (service) rolls back the identity when'
    + ' its credential sub-object is invalid',
    async () => {
        const db = await freshDb();
        await assert.rejects(
            // Credential with a malformed `at` — the
            // identity_credentials store rejects it mid-tx,
            // AFTER the identities put has landed, so both must
            // roll back.
            () => POST(db, 'identities', {
                id: 'doomed',
                kind: 'service',
                credential: {
                    ...credential('doomed'),
                    at: 'not-a-timestamp',
                },
            }, DEV_TOKEN),
        );
        await assert.rejects(
            () => GET(db, 'identities/doomed', DEV_TOKEN));
        const creds = (await db.identityCredentials.getAll())
            .filter(c => c.identity_id === 'doomed');
        assert.equal(creds.length, 0);
    },
);

test(
    'an admin may POST identities but a plain member is'
    + ' denied',
    async () => {
        const adminDb = await freshDb();
        const create = await handleRequest(adminDb, req(
            'POST', '/identities', DEV_TOKEN, {
                id: 'p1',
                kind: 'person',
                pii: pii('Alice'),
            }));
        assert.equal(create.status, 204);

        const memberDb = new MemoryDbAdapter();
        await memberDb.postSchemaCreation();
        await seedOrganizationMember(memberDb, MEMBER);
        const token = await devToken(MEMBER);
        const denied = await handleRequest(
            memberDb, req('POST', '/identities', token, {
                id: 'p2',
                kind: 'person',
                pii: pii('Bob'),
            }));
        assert.equal(denied.status, 403);
        // The denied member wrote nothing.
        const identities = await memberDb.identities.getAll();
        assert.equal(identities.length, 0);
    },
);
