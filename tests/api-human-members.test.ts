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

// The detail facet — the org-profile fields the human_members
// store re-validates. strengths/team_dimensions are raw JSON
// strings, exactly as storage holds them.
function detail() {
    return {
        title: 'Engineer',
        department: 'Product',
        strengths: '[]',
        team_dimensions: '{}',
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
    'POST human-members writes all four facets and its'
    + ' initial state event in one operation',
    async () => {
        const db = await freshDb();
        await POST(db, 'human-members', {
            id: 'w1',
            pii: pii('Alice'),
            detail: detail(),
            initialState: 'active',
            initialStateEventId: 'ev-1',
            // Far-future sentinel proves the caller's at is
            // threaded, not server-stamped.
            initialStateAt: '2099-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        const member = await GET<{ type: string }>(
            db, 'members/w1', DEV_TOKEN);
        assert.equal(member.type, 'human');
        const identity = await GET<{ kind: string }>(
            db, 'identities/w1', DEV_TOKEN);
        assert.equal(identity.kind, 'person');
        const facet = await GET<{
            title: string; department: string;
        }>(db, 'human-members/w1', DEV_TOKEN);
        assert.equal(facet.title, 'Engineer');
        assert.equal(facet.department, 'Product');
        const piiRow = await db.identityPii.getById('w1');
        assert.equal(piiRow.name, 'Alice');
        const current = await GET<{
            state: string;
            member_id: string;
            at: string;
        }>(db, 'entity-states/w1', DEV_TOKEN);
        assert.equal(current.state, 'active');
        // Authorship is the verified caller, never the body.
        assert.equal(current.member_id, 'current');
        // The caller's at is threaded verbatim.
        assert.equal(
            current.at, '2099-01-01T00:00:00.000000Z',
        );
    },
);

test(
    'POST human-members rolls back every facet when its'
    + ' initial state event conflicts',
    async () => {
        const db = await freshDb();
        // Pre-seed a DIFFERENT event at the create's
        // initialStateEventId. postEvent re-puts that id with a
        // conflicting payload mid-tx (LedgerImmutability), so
        // all four facet writes must roll back with it.
        await db.states.put('ev-x', {
            entity_id: 'other',
            state: 'active',
            member_id: 'current',
            at: '2020-01-01T00:00:00.000000Z',
        });
        await assert.rejects(
            () => POST(db, 'human-members', {
                id: 'doomed',
                pii: pii('Doomed'),
                detail: detail(),
                initialState: 'active',
                initialStateEventId: 'ev-x',
                initialStateAt: '2099-01-01T00:00:00.000000Z',
            }, DEV_TOKEN),
        );
        // Not one facet survived the aborted transaction.
        await assert.rejects(
            () => GET(db, 'members/doomed', DEV_TOKEN));
        await assert.rejects(
            () => GET(db, 'human-members/doomed', DEV_TOKEN));
        await assert.rejects(
            () => db.identityPii.getById('doomed'));
    },
);

test(
    'POST human-members/:id re-puts the facets without a'
    + ' state event',
    async () => {
        const db = await freshDb();
        await POST(db, 'human-members', {
            id: 'w1',
            pii: pii('Alice'),
            detail: detail(),
            initialState: 'active',
            initialStateEventId: 'ev-1',
            initialStateAt: '2099-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        await POST(db, 'human-members/w1', {
            pii: pii('Renamed'),
            detail: { ...detail(), title: 'Director' },
        }, DEV_TOKEN);
        const piiRow = await db.identityPii.getById('w1');
        assert.equal(piiRow.name, 'Renamed');
        const facet = await GET<{ title: string }>(
            db, 'human-members/w1', DEV_TOKEN);
        assert.equal(facet.title, 'Director');
        // The edit wrote no event — the lone create event holds.
        const events = await db.states.getAllFor('w1');
        assert.equal(events.length, 1);
        assert.equal(events[0]?.state, 'active');
    },
);

test(
    'an admin may POST human-members but a plain member'
    + ' is denied',
    async () => {
        const adminDb = await freshDb();
        const create = await handleRequest(adminDb, req(
            'POST', '/human-members', DEV_TOKEN, {
                id: 'w1',
                pii: pii('Alice'),
                detail: detail(),
                initialState: 'active',
                initialStateEventId: 'ev-1',
                initialStateAt: '2099-01-01T00:00:00.000000Z',
            }));
        assert.equal(create.status, 204);
        const edit = await handleRequest(adminDb, req(
            'POST', '/human-members/w1', DEV_TOKEN, {
                pii: pii('Renamed'),
                detail: detail(),
            }));
        assert.equal(edit.status, 204);

        const memberDb = new MemoryDbAdapter();
        await memberDb.postSchemaCreation();
        await seedOrganizationMember(memberDb, MEMBER);
        const token = await devToken(MEMBER);
        const deniedCreate = await handleRequest(
            memberDb, req('POST', '/human-members', token, {
                id: 'w2',
                pii: pii('Bob'),
                detail: detail(),
                initialState: 'active',
                initialStateEventId: 'ev-2',
                initialStateAt: '2099-01-01T00:00:00.000000Z',
            }));
        assert.equal(deniedCreate.status, 403);
        const deniedEdit = await handleRequest(
            memberDb, req(
                'POST', '/human-members/w2', token, {
                    pii: pii('Bob'),
                    detail: detail(),
                }));
        assert.equal(deniedEdit.status, 403);
        // The denied member wrote nothing.
        const members = await memberDb.members.getAll();
        assert.equal(members.length, 0);
    },
);
