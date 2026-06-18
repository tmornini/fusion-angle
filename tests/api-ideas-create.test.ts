import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET, POST } from '../api/api.ts';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// The idea body OMITS organization_id — the org fence stamps
// it from the verified token before the store validates.
function ideaFields(title: string) {
    return {
        title,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
    };
}

test(
    'POST ideas writes the idea row and its initial'
    + ' state event in one operation',
    async () => {
        const db = await freshDb();
        await POST(db, 'ideas', {
            id: 'idea-1',
            idea: ideaFields('Fresh Idea'),
            initialState: 'active',
            initialStateEventId: 'ev-1',
            // Far-future timestamp forces a distinct, verifiable
            // at value so the test can confirm the caller's time
            // was threaded to the event — not a server nowUtc().
            initialStateAt: '2099-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        const idea = await GET<{
            id: string;
            title: string;
            organization_id: string;
        }>(db, 'ideas/idea-1', DEV_TOKEN);
        assert.equal(idea.title, 'Fresh Idea');
        // The fence stamped the bound org — never the body.
        assert.equal(idea.organization_id, '1');
        const current = await GET<{
            state: string;
            member_id: string;
            at: string;
        }>(db, 'entity-states/idea-1', DEV_TOKEN);
        assert.equal(current.state, 'active');
        // Authorship is the verified caller, never the body.
        assert.equal(current.member_id, 'current');
        // The event carries the caller-supplied at, not server time.
        assert.equal(
            current.at, '2099-01-01T00:00:00.000000Z',
        );
    },
);

test(
    'POST ideas rolls back the idea row when its'
    + ' initial state event conflicts',
    async () => {
        const db = await freshDb();
        // Pre-seed a DIFFERENT event at the create's
        // initialStateEventId. postEvent re-puts that id with
        // a conflicting payload mid-tx (LedgerImmutability),
        // so the idea write must roll back with it.
        await db.states.put('ev-x', {
            entity_id: 'other',
            state: 'active',
            member_id: 'current',
            at: '2020-01-01T00:00:00.000000Z',
        });
        await assert.rejects(
            () => POST(db, 'ideas', {
                id: 'idea-rollback',
                idea: ideaFields('Doomed'),
                initialState: 'active',
                initialStateEventId: 'ev-x',
                initialStateAt: '2099-01-02T00:00:00.000000Z',
            }, DEV_TOKEN),
        );
        await assert.rejects(
            () => GET(
                db, 'ideas/idea-rollback', DEV_TOKEN,
            ),
        );
    },
);
