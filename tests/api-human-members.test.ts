import { test } from 'node:test';
import { deriveMemberStates } from
    '../api/derive-states.ts';
import { strict as assert } from 'node:assert';
import { GET, POST, PUT, handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';

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
    'POST human-members writes three facets and its initial'
    + ' state event in one operation; PII enters via a separate'
    + ' PUT identities/:id/pii (Phase 10 Task 2 intake'
    + ' decomposition)',
    async () => {
        const db = await freshDb();
        await POST(db, 'human-members', {
            id: 'w1',
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
        // No PII yet — the create body carries no pii key.
        // Phase Final Task 2: identity_pii ROW half stripped —
        // oracle is deriveIdentityPii.
        const { deriveIdentityPii } = await import(
            '../api/derive-identity-spine.ts'
        );
        await assert.rejects(
            () => deriveIdentityPii(db, 'w1'));
        await PUT(db, 'identities/w1/pii', pii('Alice'), DEV_TOKEN);
        const piiRow = await deriveIdentityPii(db, 'w1');
        assert.equal(piiRow.name, 'Alice');
        // Phase Final Stage B: identity spine tables retired.
        // bare entity-states/:id RETIRED (Phase 15 Task 7);
        // post-write check rides surviving /history.
        const history = await GET<{
            state: string;
            member_id: string;
            at: string;
        }[]>(db, 'members/w1/history', DEV_TOKEN);
        assert.equal(history.length, 1);
        const current = history[0]!;
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
    'POST human-members ignores a raw colliding states row'
    + ' (states ROW half stripped)',
    async () => {
        const db = await freshDb();
        // Phase Final Task 2: states ROW half stripped —
        // a raw colliding states row no longer aborts the
        // pair-plane create.
    // Phase Final Stage B: states table retired.
        await POST(db, 'human-members', {
            id: 'survives',
            detail: detail(),
            initialState: 'active',
            initialStateEventId: 'ev-x',
            initialStateAt: '2099-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        const parent = await GET<{ id: string }>(
            db, 'members/survives', DEV_TOKEN,
        );
        assert.equal(parent.id, 'survives');
        const detailRow = await GET<{ id: string }>(
            db, 'human-members/survives', DEV_TOKEN,
        );
        assert.equal(detailRow.id, 'survives');
    },
);

test(
    'POST human-members/:id re-puts the detail facet without a'
    + ' state event; PII is unaffected by the edit — it changes'
    + ' ONLY via a separate PUT identities/:id/pii (Phase 10'
    + ' Task 2 intake decomposition)',
    async () => {
        const db = await freshDb();
        await POST(db, 'human-members', {
            id: 'w1',
            detail: detail(),
            initialState: 'active',
            initialStateEventId: 'ev-1',
            initialStateAt: '2099-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        await PUT(db, 'identities/w1/pii', pii('Alice'), DEV_TOKEN);
        await POST(db, 'human-members/w1', {
            detail: { ...detail(), title: 'Director' },
            state: 'active',
            stateAt: '2099-01-01T00:00:00.000000Z',
            stateEventId: 'ev-1',
        }, DEV_TOKEN);
        // Phase Final Task 2: identity_pii ROW half stripped.
        const { deriveIdentityPii } = await import(
            '../api/derive-identity-spine.ts'
        );
        const piiRow = await deriveIdentityPii(db, 'w1');
        assert.equal(piiRow.name, 'Alice');
        const facet = await GET<{ title: string }>(
            db, 'human-members/w1', DEV_TOKEN);
        assert.equal(facet.title, 'Director');
        // The edit wrote no event — the lone create event holds.
        const events = (await deriveMemberStates(db))
            .filter((e) => e.entity_id === 'w1');
        // Phase Final Stage B: states table retired.
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
                detail: detail(),
                initialState: 'active',
                initialStateEventId: 'ev-1',
                initialStateAt: '2099-01-01T00:00:00.000000Z',
            }));
        assert.equal(create.status, 204);
        const edit = await handleRequest(adminDb, req(
            'POST', '/human-members/w1', DEV_TOKEN, {
                detail: detail(),
                state: 'active',
                stateAt: '2099-01-01T00:00:00.000000Z',
                stateEventId: 'ev-1',
            }));
        assert.equal(edit.status, 204);

        const memberDb = memoryDbAdapter();
        await memberDb.postSchemaCreation();
        await seedOrganizationMember(memberDb, MEMBER);
        const token = await devToken(MEMBER);
        const deniedCreate = await handleRequest(
            memberDb, req('POST', '/human-members', token, {
                id: 'w2',
                detail: detail(),
                initialState: 'active',
                initialStateEventId: 'ev-2',
                initialStateAt: '2099-01-01T00:00:00.000000Z',
            }));
        assert.equal(deniedCreate.status, 403);
        const deniedEdit = await handleRequest(
            memberDb, req(
                'POST', '/human-members/w2', token, {
                    detail: detail(),
                    state: 'active',
                    stateAt: '2099-01-01T00:00:00.000000Z',
                    stateEventId: 'ev-2',
                }));
        assert.equal(deniedEdit.status, 403);
        // The denied member wrote nothing on the pair plane
        // beyond seed pairs — no human-member document for w2.
        await assert.rejects(
            () => GET(
                memberDb, 'human-members/w2', token,
            ),
        );
    },
);
