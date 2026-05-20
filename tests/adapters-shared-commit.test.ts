import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
    CommitError,
} from '../web-app/app/adapters/shared.ts';
import {
    createChannel,
} from '../web-app/app/channels.ts';

function buildAIWorkerBody(name: string) {
    return {
        name,
        provider: 'Anthropic',
        description: '',
        auth_token: 'sk-test-XXXX',
    };
}

test(
    'ctx.commit runs all ops in supplied order',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = createRequestContext(db);
        await ctx.commit({
            ops: [
                {
                    method: 'put',
                    resource: 'ai-workers/ai_1',
                    body: buildAIWorkerBody(
                        'First',
                    ),
                },
                {
                    method: 'put',
                    resource: 'ai-workers/ai_2',
                    body: buildAIWorkerBody(
                        'Second',
                    ),
                },
                {
                    method: 'delete',
                    resource: 'ai-workers/ai_1',
                },
            ],
        });
        const r1 = await db.aiWorkers.getAll();
        assert.equal(r1.length, 1);
        assert.equal(r1[0]!.name, 'Second');
    },
);

test(
    'ctx.commit fires each notifyChannel'
    + ' exactly once after ops complete',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = createRequestContext(db);
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
                    resource: 'ai-workers/ai_1',
                    body: buildAIWorkerBody('A'),
                },
                {
                    method: 'put',
                    resource: 'ai-workers/ai_2',
                    body: buildAIWorkerBody('B'),
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
        const ctx = createRequestContext(db);
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
        const ctx = createRequestContext(db);
        const ch = createChannel<void>();
        let count = 0;
        ch.subscribe(() => { count++; });
        const goodA = {
            method: 'put' as const,
            resource: 'ai-workers/ai_1',
            body: buildAIWorkerBody('A'),
        };
        const bad = {
            method: 'put' as const,
            resource: 'ai-workers/ai_2',
            body: { rogue_field: 'oops' },
        };
        const goodC = {
            method: 'put' as const,
            resource: 'ai-workers/ai_3',
            body: buildAIWorkerBody('C'),
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
        const all = await db.aiWorkers.getAll();
        assert.equal(all.length, 1);
        assert.equal(all[0]!.name, 'A');
        // Channel did NOT fire.
        assert.equal(count, 0);
    },
);

test(
    'ctx.commit CommitError reports failedAt 0'
    + ' when first op fails',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = createRequestContext(db);
        const bad = {
            method: 'put' as const,
            resource: 'ai-workers/ai_1',
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
        const ctx = createRequestContext(db);
        const goodA = {
            method: 'put' as const,
            resource: 'ai-workers/ai_1',
            body: buildAIWorkerBody('A'),
        };
        const goodB = {
            method: 'put' as const,
            resource: 'ai-workers/ai_2',
            body: buildAIWorkerBody('B'),
        };
        const bad = {
            method: 'put' as const,
            resource: 'ai-workers/ai_3',
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
