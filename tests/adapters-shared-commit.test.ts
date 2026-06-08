import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
    CommitError,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
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
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
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
    'ctx.commit throws CommitError and rolls back'
    + ' the whole batch',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
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
            });
        } catch (e) {
            caught = e;
        }
        assert.ok(caught instanceof CommitError);
        const err = caught as CommitError;
        assert.equal(err.failedAt, 0);
        assert.equal(err.applied.length, 0);
        assert.ok(err.cause instanceof Error);
        // Real rollback: the earlier valid op did not land.
        const all = await db.aiMembers.getAll();
        assert.equal(all.length, 0);
    },
);

test(
    'ctx.commit CommitError reports failedAt 0'
    + ' when first op fails',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
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
    'ctx.commit rolls back every op when the'
    + ' final op fails',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
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
            (caught as CommitError).failedAt, 0,
        );
        assert.equal(
            (caught as CommitError).applied.length,
            0,
        );
        // Real rollback: neither good op landed.
        assert.equal(
            (await db.aiMembers.getAll()).length, 0,
        );
    },
);
