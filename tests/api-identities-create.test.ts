import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET, POST, PUT, handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';
import {
    deriveIdentityPii,
    deriveCredentialsFor,
} from '../api/derive-identity-spine.ts';

const BASE = 'http://localhost';
const MEMBER = 'walt';

async function freshDb() {
    const db = memoryDbAdapter();
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
    'POST identities (person) writes the bare identity; its'
    + ' PII enters via a separate PUT identities/:id/pii'
    + ' (Phase 10 Task 2 intake decomposition)',
    async () => {
        const db = await freshDb();
        await POST(db, 'identities', {
            id: 'p1',
            kind: 'person',
        }, DEV_TOKEN);
        const identity = await GET<{ kind: string }>(
            db, 'identities/p1', DEV_TOKEN);
        assert.equal(identity.kind, 'person');
        // No PII yet — create body no longer carries pii.
        // Phase Final Task 2: identity spine ROW halves stripped.
        await assert.rejects(
            () => deriveIdentityPii(db, 'p1'));
        await PUT(
            db, 'identities/p1/pii', pii('Alice'), DEV_TOKEN);
        const piiRow = await deriveIdentityPii(db, 'p1');
        assert.equal(piiRow.name, 'Alice');
        // A person carries no credential.
        const creds = await deriveCredentialsFor(db, 'p1');
        assert.equal(creds.length, 0);
        // Phase Final Stage B: identity spine tables retired.
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
        const creds = await deriveCredentialsFor(db, 's1');
        const cred = creds.find(c => c.kind === 'client_secret');
        assert.ok(cred, 'credential exists on pair plane');
        assert.equal(cred.status, 'set');
        // A service carries no PII.
        await assert.rejects(
            () => deriveIdentityPii(db, 's1'));
        // Phase Final Stage B: identity spine tables retired.
    },
);

test(
    'POST identities (person) rejects a legacy pii-bearing'
    + ' body: PII now enters ONLY via PUT identities/:id/pii'
    + ' (Phase 10 Task 2 retires the create-time PII facet, and'
    + ' with it the atomic create+PII rollback this body once'
    + ' exercised)',
    async () => {
        const db = await freshDb();
        await assert.rejects(
            () => POST(db, 'identities', {
                id: 'doomed',
                kind: 'person',
                pii: {
                    name: 'Doomed',
                    email: 'doomed@example.com',
                    phone: '', bio: '',
                },
            }, DEV_TOKEN),
        );
        // The unexpected `pii` key 400s before any facet lands.
        await assert.rejects(
            () => GET(db, 'identities/doomed', DEV_TOKEN));
        await assert.rejects(
            () => deriveIdentityPii(db, 'doomed'));
    },
);

test(
    'a bad PUT identities/:id/pii after a good create leaves'
    + ' the identity standing PII-less — the torn-state'
    + ' acceptance the intake decomposition names',
    async () => {
        const db = await freshDb();
        await POST(db, 'identities', {
            id: 'torn', kind: 'person',
        }, DEV_TOKEN);
        await assert.rejects(
            // PII missing the required `bio` key.
            () => PUT(db, 'identities/torn/pii', {
                name: 'Torn',
                email: 'torn@example.com',
                phone: '',
            }, DEV_TOKEN),
        );
        // The identity survives; it simply carries no PII yet.
        const identity = await GET<{ kind: string }>(
            db, 'identities/torn', DEV_TOKEN);
        assert.equal(identity.kind, 'person');
        await assert.rejects(
            () => deriveIdentityPii(db, 'torn'));
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
        const creds = await deriveCredentialsFor(db, 'doomed');
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
            }));
        assert.equal(create.status, 204);

        const memberDb = memoryDbAdapter();
        await memberDb.postSchemaCreation();
        await seedOrganizationMember(memberDb, MEMBER);
        const token = await devToken(MEMBER);
        const denied = await handleRequest(
            memberDb, req('POST', '/identities', token, {
                id: 'p2',
                kind: 'person',
            }));
        assert.equal(denied.status, 403);
        // The denied member wrote nothing on the pair plane
        // — no identities/p2 document.
        await assert.rejects(
            () => GET(memberDb, 'identities/p2', token),
        );
    },
);
