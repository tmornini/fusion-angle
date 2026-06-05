import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    GET, POST, unionTablesFor, type CommitOp,
} from '../api/api.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';

function ideaBody(id: string, title: string) {
    return {
        id,
        organization_id: '1', title,
        position: 0, problem_statement: '',
        target_users: '', proposed_solution: '',
        expected_outcome: '', success_metrics: '',
    };
}

async function freshDb() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await seedRootAdmin(db);
    return db;
}

test(
    'unionTablesFor maps resources and always adds states',
    () => {
        const ops: CommitOp[] = [
            {
                method: 'put',
                resource: 'ai-members/x',
                body: {},
            },
            { method: 'delete', resource: 'ideas/y' },
            {
                method: 'put',
                resource: 'identity-credentials/z',
                body: {},
            },
        ];
        const tables = unionTablesFor(ops);
        assert.ok(tables.includes('ai_members'));
        assert.ok(tables.includes('ideas'));
        assert.ok(tables.includes('identity_credentials'));
        assert.ok(tables.includes('states'));
    },
);

test(
    'unionTablesFor throws on a resource with no table',
    () => {
        assert.throws(() => unionTablesFor([
            { method: 'put', resource: 'bogus/x', body: {} },
        ]));
    },
);

test(
    'commit applies a batch of puts in one operation',
    async () => {
        const db = await freshDb();
        await POST(db, 'commit', {
            ops: [
                {
                    method: 'put',
                    resource: 'ideas/i1',
                    body: ideaBody('i1', 'one'),
                },
                {
                    method: 'put',
                    resource: 'ideas/i2',
                    body: ideaBody('i2', 'two'),
                },
            ],
        }, DEV_TOKEN);
        const all = await GET<unknown[]>(
            db, 'ideas', DEV_TOKEN,
        );
        assert.equal(all.length, 2);
    },
);

test(
    'commit rolls the whole batch back on a failing op',
    async () => {
        const db = await freshDb();
        await assert.rejects(
            () => POST(db, 'commit', {
                ops: [
                    {
                        method: 'put',
                        resource: 'ideas/i1',
                        body: ideaBody('i1', 'ok'),
                    },
                    {
                        method: 'put',
                        resource: 'ideas/i2',
                        body: { id: 'i2', title: 'bad' },
                    },
                ],
            }, DEV_TOKEN),
        );
        const all = await GET<unknown[]>(
            db, 'ideas', DEV_TOKEN,
        );
        assert.equal(
            all.length, 0,
            'the earlier valid op must roll back too',
        );
    },
);
