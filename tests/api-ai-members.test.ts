import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET, POST, handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';
import { firstProviderModel } from './member-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
    storedPutBodyText,
} from './http-fixtures.ts';
import { aiMemberDocumentEntityOf } from '../api/routes.ts';

const BASE = 'http://localhost';
const MEMBER = 'walt';

async function freshDb() {
    const db = memoryDbAdapter();
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
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
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
            // Far-future sentinel proves the caller's at is
            // threaded, not server-stamped.
            initialStateAt: '2099-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        const member = await GET<{ type: string }>(
            db, 'members/a1', DEV_TOKEN);
        assert.equal(member.type, 'ai');
        const facet = await GET<{
            name: string; description: string;
        }>(db, 'ai-members/a1', DEV_TOKEN);
        assert.equal(facet.name, 'Claude');
        // bare per-entity current-state alias RETIRED
        // (Phase 15 Task 7); post-write check rides
        // surviving /versions.
        const history = await GET<{
            state: string;
            member_id: string;
            at: string;
        }[]>(db, 'members/a1/versions', DEV_TOKEN);
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
    'POST ai-members ignores a raw colliding states row'
    + ' (states ROW half stripped)',
    async () => {
        const db = await freshDb();
        // Phase Final Task 2: states ROW half stripped —
        // a raw colliding states row no longer aborts the
        // pair-plane create.
    // Phase Final Stage B: states table retired.
        await POST(db, 'ai-members', {
            id: 'survives',
            detail: detail('Survives'),
            initialState: 'active',
            initialStateEventId: 'ev-x',
            initialStateAt: '2099-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        const parent = await GET<{ id: string }>(
            db, 'members/survives', DEV_TOKEN,
        );
        assert.equal(parent.id, 'survives');
        const detailRow = await GET<{ name: string }>(
            db, 'ai-members/survives', DEV_TOKEN,
        );
        assert.equal(detailRow.name, 'Survives');
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
            initialStateAt: '2099-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        await POST(db, 'ai-members/a1', {
            detail: { ...detail('Renamed'), skill_focus: 'qa' },
            state: 'active',
            stateAt: '2099-01-01T00:00:00.000000Z',
            stateEventId: 'ev-1',
        }, DEV_TOKEN);
        const facet = await GET<{
            name: string; skill_focus: string;
        }>(db, 'ai-members/a1', DEV_TOKEN);
        assert.equal(facet.name, 'Renamed');
        assert.equal(facet.skill_focus, 'qa');
        // The edit wrote no event — the lone create event holds.
        const { deriveMemberStates } = await import(
            '../api/derive-states.ts'
        );
        const events = (await deriveMemberStates(db))
            .filter((e) => e.entity_id === 'a1');
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
                initialStateAt: '2099-01-01T00:00:00.000000Z',
            }));
        assert.equal(create.status, 201);
        const edit = await handleRequest(adminDb, req(
            'POST', '/ai-members/a1', DEV_TOKEN, {
                detail: detail('Renamed'),
                state: 'active',
                stateAt: '2099-01-01T00:00:00.000000Z',
                stateEventId: 'ev-1',
            }));
        assert.equal(edit.status, 201);

        const memberDb = memoryDbAdapter();
        await memberDb.postSchemaCreation();
        await seedOrganizationMember(memberDb, MEMBER);
        const token = await devToken(MEMBER);
        const deniedCreate = await handleRequest(
            memberDb, req('POST', '/ai-members', token, {
                id: 'a2',
                detail: detail('Bot'),
                initialState: 'active',
                initialStateEventId: 'ev-2',
                initialStateAt: '2099-01-01T00:00:00.000000Z',
            }));
        assert.equal(deniedCreate.status, 403);
        const deniedEdit = await handleRequest(
            memberDb, req(
                'POST', '/ai-members/a2', token, {
                    detail: detail('Bot'),
                    state: 'active',
                    stateAt: '2099-01-01T00:00:00.000000Z',
                    stateEventId: 'ev-2',
                }));
        assert.equal(deniedEdit.status, 403);
        // The denied member wrote nothing on the pair plane
        // beyond seed pairs — no AI-member document for a2.
        await assert.rejects(
            () => GET(
                memberDb, 'ai-members/a2', token,
            ),
        );
    },
);

test('AI create stores aiMemberDocumentEntityOf at '
+ 'ai-members/:id', async () => {
    const db = await freshDb();
    const id = 'a-g3-create';
    const fields = detail('Claude');
    await POST(db, 'ai-members', {
        id,
        detail: fields,
        initialState: 'active',
        initialStateEventId: 'ev-g3',
        initialStateAt: '2099-01-01T00:00:00.000000Z',
    }, DEV_TOKEN);
    const stored = JSON.parse(
        await storedPutBodyText(db, '/ai-members/', id),
    );
    assert.deepEqual(
        stored,
        aiMemberDocumentEntityOf(
            {
                uriId: id,
                pairId: id,
                method: 'PUT',
                body: fields,
            },
            '',
        ),
    );
});

test('AI edit stores aiMemberDocumentEntityOf at '
+ 'ai-members/:id', async () => {
    const db = await freshDb();
    const id = 'a-g3-edit';
    await POST(db, 'ai-members', {
        id,
        detail: detail('Claude'),
        initialState: 'active',
        initialStateEventId: 'ev-g3',
        initialStateAt: '2099-01-01T00:00:00.000000Z',
    }, DEV_TOKEN);
    const fields = { ...detail('Renamed'), skill_focus: 'qa' };
    await POST(db, 'ai-members/' + id, {
        detail: fields,
        state: 'active',
        stateAt: '2099-01-01T00:00:00.000000Z',
        stateEventId: 'ev-g3',
    }, DEV_TOKEN);
    const stored = JSON.parse(
        await storedPutBodyText(db, '/ai-members/', id),
    );
    assert.deepEqual(
        stored,
        aiMemberDocumentEntityOf(
            {
                uriId: id,
                pairId: id,
                method: 'PUT',
                body: fields,
            },
            '',
        ),
    );
});
