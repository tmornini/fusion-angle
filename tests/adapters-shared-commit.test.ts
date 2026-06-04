import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
    CommitError,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    seedRootAdmin,
} from './root-admin-fixture.ts';
import {
    createChannel,
} from '../web-app/app/channels.ts';
import {
    getProviderModels,
} from '../api/provider-models.ts';

function buildAIMemberBody(description: string) {
    return {
        name: 'AI ' + description,
        description,
        skill_focus: '',
        model: getProviderModels()[0]!.id,
    };
}

test(
    'ctx.commit runs all ops in supplied order',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedRootAdmin(db);
        const ctx = createRequestContext(db, devToken());
        await ctx.commit({
            ops: [
                {
                    method: 'put',
                    resource:
                        'state-field-values/sfv_1',
                    body: {
                        state_event_id: 'evt_1',
                        field_id: 'field_a',
                        value: 'first',
                    },
                },
                {
                    method: 'put',
                    resource:
                        'state-field-values/sfv_2',
                    body: {
                        state_event_id: 'evt_1',
                        field_id: 'field_b',
                        value: 'second',
                    },
                },
                {
                    method: 'delete',
                    resource:
                        'state-field-values/sfv_1',
                },
            ],
        });
        const r = await db.stateFieldValues.getAll();
        assert.equal(r.length, 1);
        assert.equal(r[0]!.value, 'second');
    },
);

test(
    'ctx.commit fires each notifyChannel'
    + ' exactly once after ops complete',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedRootAdmin(db);
        const ctx = createRequestContext(db, devToken());
        const ch1 = createChannel<void>();
        const ch2 = createChannel<void>();
        let count1 = 0;
        let count2 = 0;
        ch1.subscribe(() => { count1++; });
        ch2.subscribe(() => { count2++; });
        await ctx.commit({
            ops: [
                {
                    method: 'put',
                    resource: 'ai-members/ai_1',
                    body: buildAIMemberBody('A'),
                },
                {
                    method: 'put',
                    resource: 'ai-members/ai_2',
                    body: buildAIMemberBody('B'),
                },
            ],
            notifyChannels: [ch1, ch2],
        });
        assert.equal(count1, 1);
        assert.equal(count2, 1);
    },
);

test(
    'ctx.commit with empty ops still fires'
    + ' notifyChannels',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedRootAdmin(db);
        const ctx = createRequestContext(db, devToken());
        const ch = createChannel<void>();
        let count = 0;
        ch.subscribe(() => { count++; });
        await ctx.commit({
            ops: [],
            notifyChannels: [ch],
        });
        assert.equal(count, 1);
    },
);

test(
    'ctx.commit throws CommitError naming the'
    + ' failed op and exposing applied prefix',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedRootAdmin(db);
        const ctx = createRequestContext(db, devToken());
        const ch = createChannel<void>();
        let count = 0;
        ch.subscribe(() => { count++; });
        const goodA = {
            method: 'put' as const,
            resource: 'ai-members/ai_1',
            body: buildAIMemberBody('A'),
        };
        const bad = {
            method: 'put' as const,
            resource: 'ai-members/ai_2',
            body: { rogue_field: 'oops' },
        };
        const goodC = {
            method: 'put' as const,
            resource: 'ai-members/ai_3',
            body: buildAIMemberBody('C'),
        };
        let caught: unknown;
        try {
            await ctx.commit({
                ops: [goodA, bad, goodC],
                notifyChannels: [ch],
            });
        } catch (e) {
            caught = e;
        }
        assert.ok(caught instanceof CommitError);
        const err = caught as CommitError;
        assert.equal(err.failedAt, 1);
        assert.equal(err.applied.length, 1);
        assert.equal(err.applied[0], goodA);
        assert.ok(err.cause instanceof Error);
        // No rollback: first op landed.
        const all = await db.aiMembers.getAll();
        assert.equal(all.length, 1);
        assert.equal(all[0]!.id, 'ai_1');
        assert.equal(all[0]!.description, 'A');
        // Channel did NOT fire.
        assert.equal(count, 0);
    },
);

test(
    'ctx.commit CommitError reports failedAt 0'
    + ' when first op fails',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedRootAdmin(db);
        const ctx = createRequestContext(db, devToken());
        const bad = {
            method: 'put' as const,
            resource: 'ai-members/ai_1',
            body: { rogue_field: 'oops' },
        };
        let caught: unknown;
        try {
            await ctx.commit({ ops: [bad] });
        } catch (e) { caught = e; }
        assert.ok(caught instanceof CommitError);
        assert.equal(
            (caught as CommitError).failedAt, 0,
        );
        assert.equal(
            (caught as CommitError).applied.length,
            0,
        );
    },
);

test(
    'ctx.commit CommitError reports failedAt N-1'
    + ' when final op fails',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedRootAdmin(db);
        const ctx = createRequestContext(db, devToken());
        const goodA = {
            method: 'put' as const,
            resource: 'ai-members/ai_1',
            body: buildAIMemberBody('A'),
        };
        const goodB = {
            method: 'put' as const,
            resource: 'ai-members/ai_2',
            body: buildAIMemberBody('B'),
        };
        const bad = {
            method: 'put' as const,
            resource: 'ai-members/ai_3',
            body: { rogue_field: 'oops' },
        };
        let caught: unknown;
        try {
            await ctx.commit({
                ops: [goodA, goodB, bad],
            });
        } catch (e) { caught = e; }
        assert.ok(caught instanceof CommitError);
        assert.equal(
            (caught as CommitError).failedAt, 2,
        );
        assert.equal(
            (caught as CommitError).applied.length,
            2,
        );
    },
);
