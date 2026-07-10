import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    getIdeaStates,
    getProjectStates,
    getRecordStateDetails,
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

// A states-log event, posted through the SAME wire-reachable
// PUT the live route serves (states/:id) — required for the
// flipped GET /states route (Task 7), which every get*States
// reader below consults. A raw db.states.put/postEvent left no
// message pair here.
async function seedStateEvent(
    ctx: RequestContext,
    id: string,
    entityId: string,
    state: string,
    at: string,
): Promise<void> {
    await ctx.PUT(`states/${id}`, {
        entity_id: entityId,
        state,
        at,
    });
}

test('getProjectStates excludes a same-valued idea',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        // Seeded through the live document PUT (not a raw
        // db.projects.put) so p1's message pair exists — the
        // flipped GET projects route (Phase 3 Task 6), which
        // getProjectStates reads for its id set, derives from
        // the ledger, not the old projects table.
        const { organization_id: _organizationId, ...p1Fields } =
            projectBody('P');
        await ctx.PUT('projects/p1', {
            ...p1Fields,
            state: 'approved',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'ev-p1',
        });
        // Phase Final Stage B: ideas table retired — a bare
        // state event on an idea-shaped entity_id is enough
        // to prove project states do not absorb it.
        await seedStateEvent(
            ctx, 'ev-i1', 'i1', 'approved',
            '2026-01-01T00:00:01.000000Z',
        );
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
        const ctx = createRequestContext(db, await devToken());
        // Seeded through the live document PUT (not a raw
        // db.ideas.put) so i1's message pair exists — the
        // flipped GET ideas route (Phase 2 Task 5), which
        // getIdeaStates reads for its id set, derives from the
        // ledger, not the old ideas table.
        const { organization_id: _organizationId, ...i1Fields } =
            ideaBody('I');
        await ctx.PUT('ideas/i1', {
            ...i1Fields,
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'ev-i1',
        });
        // Phase Final Stage B: projects table retired — a bare
        // state event on a project-shaped entity_id is enough
        // to prove idea states do not absorb it.
        await seedStateEvent(
            ctx, 'ev-p1', 'p1', 'approved',
            '2026-01-01T00:00:01.000000Z',
        );
        const states = await getIdeaStates(ctx);
        assert.equal(states.get('i1'), 'active');
        assert.ok(
            !states.has('p1'),
            'project must not leak into idea states',
        );
    });

test('getRecordStateDetails excludes a same-valued idea',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        // Seeded through the live document PUT (not a raw
        // db.records.put) so r1's message pair exists — the
        // flipped GET records route (Phase 6 Task 7), which
        // getRecordStateDetails reads for its id set, derives
        // from the ledger, not the old records table.
        const { organization_id: _organizationId, ...r1Fields } =
            recordBody('R');
        await ctx.PUT('records/r1', {
            ...r1Fields,
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'ev-r1',
        });
        // Phase Final Stage B: ideas table retired — bare
        // state event is enough for the exclusion pin.
        await seedStateEvent(
            ctx, 'ev-i1', 'i1', 'archived',
            '2026-01-01T00:00:01.000000Z',
        );
        const states = await getRecordStateDetails(ctx);
        assert.equal(states.get('r1')?.state, 'active');
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
        const ctx = createRequestContext(db, await devToken());
        await seedStateEvent(
            ctx, 'ev-i1', 'i1', 'active',
            '2026-01-01T00:00:00.000000Z',
        );
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
        const ctx = createRequestContext(db, await devToken());
        // A genesis document PUT so p1's message pair exists —
        // the flipped GET projects route (Phase 3 Task 6), which
        // getProjectStates reads for its id set, derives from
        // the ledger, not the old projects table. Its stateAt is
        // SYNTHESIZED strictly before the tied `at` below, so
        // the genesis event itself can never win the tie under
        // test.
        const { organization_id: _organizationId, ...p1Fields } =
            projectBody('P');
        await ctx.PUT('projects/p1', {
            ...p1Fields,
            state: 'submitted',
            state_at: '2025-12-31T23:59:59.000000Z',
            state_event_id: 'ev-genesis',
        });
        const at = '2026-01-01T00:00:00.000000Z';
        await seedStateEvent(ctx, 'ev-1', 'p1', 'under_review', at);
        await seedStateEvent(ctx, 'ev-2', 'p1', 'approved', at);
        const states = await getProjectStates(ctx);
        assert.equal(states.get('p1'), 'approved');
    });
