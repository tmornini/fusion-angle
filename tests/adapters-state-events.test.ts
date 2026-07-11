import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    getIdeaStates,
    getProjectStates,
    getRecordStateDetails,
    getMemberStateDetails,
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
// by entity identity, not by state value. Lifecycle writes
// ride document trios (states/:id retired).

test('getProjectStates excludes a same-valued idea',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        const { organization_id: _organizationId, ...p1Fields } =
            projectBody('P');
        await ctx.PUT('projects/p1', {
            ...p1Fields,
            state: 'approved',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'ev-p1',
        });
        // Cross-family exclusion: a same-valued idea trio
        // must not leak into project states.
        const { organization_id: _ideaOrganizationId, ...i1Fields } =
            ideaBody('I');
        await ctx.PUT('ideas/i1', {
            ...i1Fields,
            state: 'approved',
            state_at: '2026-01-01T00:00:01.000000Z',
            state_event_id: 'ev-i1',
        });
        const states = await getProjectStates(ctx);
        assert.equal(states.get('p1'), 'approved');
        assert.ok(
            !states.has('i1'),
            'idea must not leak into project states',
        );
    });

test('getIdeaStates excludes a same-valued project',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        const { organization_id: _organizationId, ...i1Fields } =
            ideaBody('I');
        await ctx.PUT('ideas/i1', {
            ...i1Fields,
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'ev-i1',
        });
        const { organization_id: _projectOrganizationId, ...p1Fields } =
            projectBody('P');
        await ctx.PUT('projects/p1', {
            ...p1Fields,
            state: 'approved',
            state_at: '2026-01-01T00:00:01.000000Z',
            state_event_id: 'ev-p1',
        });
        const states = await getIdeaStates(ctx);
        assert.equal(states.get('i1'), 'active');
        assert.ok(
            !states.has('p1'),
            'project must not leak into idea states',
        );
    });

test('getRecordStateDetails excludes a same-valued idea',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        const { organization_id: _organizationId, ...r1Fields } =
            recordBody('R');
        await ctx.PUT('records/r1', {
            ...r1Fields,
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'ev-r1',
        });
        const { organization_id: _ideaOrganizationId, ...i1Fields } =
            ideaBody('I');
        await ctx.PUT('ideas/i1', {
            ...i1Fields,
            state: 'archived',
            state_at: '2026-01-01T00:00:01.000000Z',
            state_event_id: 'ev-i1',
        });
        const states = await getRecordStateDetails(ctx);
        assert.equal(states.get('r1')?.state, 'active');
        assert.ok(
            !states.has('i1'),
            'idea must not leak into record states',
        );
    });

test('getMemberStateDetails spans kinds and excludes an idea',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'wh', 'Human');
        await seedAIMember(db, 'wa', 'Ai');
        const ctx = createRequestContext(db, await devToken());
        const { organization_id: _ideaOrganizationId, ...i1Fields } =
            ideaBody('I');
        await ctx.PUT('ideas/i1', {
            ...i1Fields,
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'ev-i1',
        });
        const states = await getMemberStateDetails(ctx);
        assert.equal(states.get('wh')?.state, 'active');
        assert.equal(states.get('wa')?.state, 'active');
        assert.ok(
            !states.has('i1'),
            'idea must not leak into member states',
        );
    });

test('getProjectStates keeps the later event on a tie',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        // Genesis then two document-trio PUTs at the SAME
        // state_at — (at, id) reduction picks the
        // larger state_event_id (ev-2 > ev-1).
        const { organization_id: _organizationId, ...p1Fields } =
            projectBody('P');
        await ctx.PUT('projects/p1', {
            ...p1Fields,
            state: 'submitted',
            state_at: '2025-12-31T23:59:59.000000Z',
            state_event_id: 'ev-genesis',
        });
        const at = '2026-01-01T00:00:00.000000Z';
        await ctx.PUT('projects/p1', {
            ...p1Fields,
            state: 'under_review',
            state_at: at,
            state_event_id: 'ev-1',
        });
        await ctx.PUT('projects/p1', {
            ...p1Fields,
            state: 'approved',
            state_at: at,
            state_event_id: 'ev-2',
        });
        const states = await getProjectStates(ctx);
        assert.equal(states.get('p1'), 'approved');
    });
