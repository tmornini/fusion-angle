import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    getIdeaStates,
    getProjectStates,
    getRecordStates,
    getMemberStates,
} from '../web-app/app/adapters/state-events.ts';
import {
    seedAIMember,
    seedHumanMember,
} from './member-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import type {
    IdeaEntity, ProjectEntity, RecordEntity,
} from '../api/types.ts';

function ideaBody(title: string): Omit<IdeaEntity, 'id'> {
    return {
        organization_id: '1',
        title,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
    };
}

function projectBody(
    title: string,
): Omit<ProjectEntity, 'id'> {
    return {
        organization_id: '1',
        title,
        description: 'd',
        progress: 0,
        start_date: '2026-01-01',
        target_end_date: '2026-12-31',
        estimated_cost: 1000,
        actual_cost: 0,
        position: 1,
    };
}

function recordBody(
    name: string,
): Omit<RecordEntity, 'id'> {
    return {
        organization_id: '1',
        name,
        description: 'd',
        position: 1,
    };
}

// The states log is shared across entity types and the
// alphabets overlap, so each get*States must discriminate
// by entity identity, not by state value.

test('getProjectStates excludes a same-valued idea',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await db.projects.put('p1', projectBody('P'));
        await db.states.postEvent(
            'ev-p1', 'p1', 'approved', 'system',
        );
        await db.ideas.put('i1', ideaBody('I'));
        await db.states.postEvent(
            'ev-i1', 'i1', 'approved', 'system',
        );
        const ctx = createRequestContext(db, await devToken());
        const states = await getProjectStates(ctx);
        assert.equal(states.get('p1'), 'approved');
        assert.ok(
            !states.has('i1'),
            'idea must not leak into project states',
        );
    });

test('getIdeaStates excludes a same-valued project',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await db.ideas.put('i1', ideaBody('I'));
        await db.states.postEvent(
            'ev-i1', 'i1', 'active', 'system',
        );
        await db.projects.put('p1', projectBody('P'));
        await db.states.postEvent(
            'ev-p1', 'p1', 'approved', 'system',
        );
        const ctx = createRequestContext(db, await devToken());
        const states = await getIdeaStates(ctx);
        assert.equal(states.get('i1'), 'active');
        assert.ok(
            !states.has('p1'),
            'project must not leak into idea states',
        );
    });

test('getRecordStates excludes a same-valued idea',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await db.records.put('r1', recordBody('R'));
        await db.states.postEvent(
            'ev-r1', 'r1', 'active', 'system',
        );
        await db.ideas.put('i1', ideaBody('I'));
        await db.states.postEvent(
            'ev-i1', 'i1', 'archived', 'system',
        );
        const ctx = createRequestContext(db, await devToken());
        const states = await getRecordStates(ctx);
        assert.equal(states.get('r1'), 'active');
        assert.ok(
            !states.has('i1'),
            'idea must not leak into record states',
        );
    });

test('getMemberStates spans kinds and excludes an idea',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'wh', 'Human');
        await seedAIMember(db, 'wa', 'Ai');
        await db.ideas.put('i1', ideaBody('I'));
        await db.states.postEvent(
            'ev-i1', 'i1', 'active', 'system',
        );
        const ctx = createRequestContext(db, await devToken());
        const states = await getMemberStates(ctx);
        assert.equal(states.get('wh'), 'active');
        assert.equal(states.get('wa'), 'active');
        assert.ok(
            !states.has('i1'),
            'idea must not leak into member states',
        );
    });

test('getProjectStates keeps the later event on a tie',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await db.projects.put('p1', projectBody('P'));
        const at = '2026-01-01T00:00:00.000000Z';
        await db.states.put('ev-1', {
            entity_id: 'p1',
            state: 'under-review',
            member_id: 'system',
            at,
        });
        await db.states.put('ev-2', {
            entity_id: 'p1',
            state: 'approved',
            member_id: 'system',
            at,
        });
        const ctx = createRequestContext(db, await devToken());
        const states = await getProjectStates(ctx);
        assert.equal(states.get('p1'), 'approved');
    });
