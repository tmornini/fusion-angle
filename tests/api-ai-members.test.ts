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
import { seedOrgMember } from './root-admin-fixture.ts';
import { firstProviderModel } from './member-fixtures.ts';

const BASE = 'http://localhost';
const MEMBER = 'walt';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// The detail facet — name plus the AI fields the ai_members
// store re-validates after the composing POST puts it. model
// must be a known catalog id (validateAIMemberEntity).
function detail(name: string) {
    return {
        name,
        description: '',
        skill_focus: '',
        model: firstProviderModel().id,
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
    'POST ai-members writes both facets and its initial'
    + ' state event in one operation',
    async () => {
        const db = await freshDb();
        await POST(db, 'ai-members', {
            id: 'a1',
            detail: detail('Claude'),
            initialState: 'active',
            initialStateEventId: 'ev-1',
        }, DEV_TOKEN);
        const member = await GET<{ type: string }>(
            db, 'members/a1', DEV_TOKEN);
        assert.equal(member.type, 'ai');
        const facet = await GET<{
            name: string; description: string;
        }>(db, 'ai-members/a1', DEV_TOKEN);
        assert.equal(facet.name, 'Claude');
        const current = await GET<{
            state: string;
            member_id: string;
        }>(db, 'entity-states/a1', DEV_TOKEN);
        assert.equal(current.state, 'active');
        // Authorship is the verified caller, never the body.
        assert.equal(current.member_id, 'current');
    },
);

test(
    'POST ai-members rolls back every facet when its'
    + ' initial state event conflicts',
    async () => {
        const db = await freshDb();
        // Pre-seed a DIFFERENT event at the create's
        // initialStateEventId. postEvent re-puts that id with a
        // conflicting payload mid-tx (LedgerImmutability), so
        // both facet writes must roll back with it.
        await db.states.put('ev-x', {
            entity_id: 'other',
            state: 'active',
            member_id: 'current',
            at: '2020-01-01T00:00:00.000000Z',
        });
        await assert.rejects(
            () => POST(db, 'ai-members', {
                id: 'doomed',
                detail: detail('Doomed'),
                initialState: 'active',
                initialStateEventId: 'ev-x',
            }, DEV_TOKEN),
        );
        // Not one facet survived the aborted transaction.
        await assert.rejects(
            () => GET(db, 'members/doomed', DEV_TOKEN));
        await assert.rejects(
            () => GET(db, 'ai-members/doomed', DEV_TOKEN));
    },
);

test(
    'POST ai-members/:id re-puts the facets without a'
    + ' state event',
    async () => {
        const db = await freshDb();
        await POST(db, 'ai-members', {
            id: 'a1',
            detail: detail('Claude'),
            initialState: 'active',
            initialStateEventId: 'ev-1',
        }, DEV_TOKEN);
        await POST(db, 'ai-members/a1', {
            detail: { ...detail('Renamed'), skill_focus: 'qa' },
        }, DEV_TOKEN);
        const facet = await GET<{
            name: string; skill_focus: string;
        }>(db, 'ai-members/a1', DEV_TOKEN);
        assert.equal(facet.name, 'Renamed');
        assert.equal(facet.skill_focus, 'qa');
        // The edit wrote no event — the lone create event holds.
        const events = await db.states.getAllFor('a1');
        assert.equal(events.length, 1);
        assert.equal(events[0]?.state, 'active');
    },
);

test(
    'an admin may POST ai-members but a plain member'
    + ' is denied',
    async () => {
        const adminDb = await freshDb();
        const create = await handleRequest(adminDb, req(
            'POST', '/ai-members', DEV_TOKEN, {
                id: 'a1',
                detail: detail('Claude'),
                initialState: 'active',
                initialStateEventId: 'ev-1',
            }));
        assert.equal(create.status, 204);
        const edit = await handleRequest(adminDb, req(
            'POST', '/ai-members/a1', DEV_TOKEN, {
                detail: detail('Renamed'),
            }));
        assert.equal(edit.status, 204);

        const memberDb = new MemoryDbAdapter();
        await memberDb.postSchemaCreation();
        await seedOrgMember(memberDb, MEMBER);
        const token = await devToken(MEMBER);
        const deniedCreate = await handleRequest(
            memberDb, req('POST', '/ai-members', token, {
                id: 'a2',
                detail: detail('Bot'),
                initialState: 'active',
                initialStateEventId: 'ev-2',
            }));
        assert.equal(deniedCreate.status, 403);
        const deniedEdit = await handleRequest(
            memberDb, req(
                'POST', '/ai-members/a2', token, {
                    detail: detail('Bot'),
                }));
        assert.equal(deniedEdit.status, 403);
        // The denied member wrote nothing.
        const members = await memberDb.members.getAll();
        assert.equal(members.length, 0);
    },
);
