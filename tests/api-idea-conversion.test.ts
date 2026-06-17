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
import {
    type ProjectObjectiveBaselineScore,
} from '../api/types.ts';

// POST ideas/:id/conversion is the LONE cross-aggregate write:
// a new project row, the promoted idea row, TWO state events
// (the idea's 'promoted' and the project's initial), and N
// baseline-score rows, all in ONE re-entrant transaction. Both
// events are authored by the verified caller (actor). A mid-op
// failure rolls back EVERYTHING.

// The project body OMITS organization_id — the org fence stamps
// it from the verified token before the store validates.
function projectFields(title: string) {
    return {
        title,
        description: 'done when X',
        progress: 0,
        start_date: '2026-04-01',
        target_end_date: '2026-07-01',
        estimated_cost: 100,
        actual_cost: 0,
        position: 1,
    };
}

// The promoted idea row also OMITS organization_id.
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

function baselineFields(
    objectiveId: string, score: number,
) {
    return {
        project_id: 'p1',
        objective_id: objectiveId,
        score,
        member_id: 'current',
        at: '2026-04-01T00:00:00.000000Z',
    };
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    // The source idea, already approved.
    await db.ideas.put('idea-1', {
        organization_id: '1',
        ...ideaFields('Source Idea'),
    });
    await db.states.postEvent(
        'st-idea-1', 'idea-1', 'approved', 'system',
    );
    // The objectives the baselines reference.
    await db.objectives.put('obj-1', {
        organization_id: '1', position: 1,
    });
    await db.objectives.put('obj-2', {
        organization_id: '1', position: 2,
    });
    return db;
}

test(
    'POST ideas/:id/conversion writes the project, the'
    + ' promoted idea, two events, and N baselines in one'
    + ' operation',
    async () => {
        const db = await seededDb();
        await POST(db, 'ideas/idea-1/conversion', {
            projectId: 'p1',
            project: projectFields('Promoted Project'),
            idea: ideaFields('Source Idea'),
            ideaStateEventId: 'ev-idea-promoted',
            ideaState: 'promoted',
            projectStateEventId: 'ev-project-init',
            projectState: 'submitted',
            baselines: [
                {
                    id: 'bl-1',
                    fields: baselineFields('obj-1', 50),
                },
                {
                    id: 'bl-2',
                    fields: baselineFields('obj-2', -25),
                },
            ],
        }, DEV_TOKEN);

        const project = await GET<{
            title: string;
            organization_id: string;
        }>(db, 'projects/p1', DEV_TOKEN);
        assert.equal(project.title, 'Promoted Project');
        // The fence stamped the bound org — never the body.
        assert.equal(project.organization_id, '1');

        // The idea moved to 'promoted', authored by the actor.
        const ideaCurrent = await GET<{
            state: string;
            member_id: string;
        }>(db, 'entity-states/idea-1', DEV_TOKEN);
        assert.equal(ideaCurrent.state, 'promoted');
        assert.equal(ideaCurrent.member_id, 'current');

        // The new project entered at its initial state, also
        // authored by the actor.
        const projectEvents = await db.states.getAllFor('p1');
        assert.equal(projectEvents.length, 1);
        assert.equal(projectEvents[0]!.state, 'submitted');
        assert.equal(projectEvents[0]!.member_id, 'current');

        const mine = await GET<
            ProjectObjectiveBaselineScore[]
        >(
            db,
            'projects/p1/objective-baseline-scores',
            DEV_TOKEN,
        );
        assert.equal(mine.length, 2);
        const byObj = new Map(
            mine.map(b => [b.objective_id, b.score]),
        );
        assert.equal(byObj.get('obj-1'), 50);
        assert.equal(byObj.get('obj-2'), -25);
    },
);

test(
    'POST ideas/:id/conversion rolls back EVERYTHING when'
    + ' a state event conflicts mid-op',
    async () => {
        const db = await seededDb();
        // Pre-seed a DIFFERENT event at the project event id.
        // postEvent re-puts that id with a conflicting payload
        // mid-tx (LedgerImmutability), so the whole conversion
        // — project, idea promotion, idea event, baselines —
        // must roll back with it.
        await db.states.put('ev-project-init', {
            entity_id: 'other',
            state: 'submitted',
            member_id: 'current',
            at: '2020-01-01T00:00:00.000000Z',
        });
        await assert.rejects(
            () => POST(db, 'ideas/idea-1/conversion', {
                projectId: 'p1',
                project: projectFields('Doomed'),
                idea: ideaFields('Source Idea'),
                ideaStateEventId: 'ev-idea-promoted',
                ideaState: 'promoted',
                projectStateEventId: 'ev-project-init',
                projectState: 'submitted',
                baselines: [
                    {
                        id: 'bl-1',
                        fields: baselineFields('obj-1', 50),
                    },
                ],
            }, DEV_TOKEN),
        );

        // No project row, no project event, no baseline.
        await assert.rejects(
            () => GET(db, 'projects/p1', DEV_TOKEN),
        );
        const projectEvents = await db.states.getAllFor('p1');
        assert.equal(projectEvents.length, 0);
        const baselines =
            await db.projectObjectiveBaselineScores.getAll();
        assert.equal(baselines.length, 0);

        // The idea stayed at 'approved' — the 'promoted' event
        // rolled back with the rest.
        const ideaCurrent = await GET<{ state: string }>(
            db, 'entity-states/idea-1', DEV_TOKEN,
        );
        assert.equal(ideaCurrent.state, 'approved');
    },
);
