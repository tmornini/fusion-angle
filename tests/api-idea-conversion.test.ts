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
    type ProjectObjectiveBaselineScoreEntity,
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
        '2026-01-01T00:00:00.000000Z',
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
        // Two distinct timestamps — idea strictly before project —
        // to verify each at routes to its own event and not the other.
        await POST(db, 'ideas/idea-1/conversion', {
            projectId: 'p1',
            project: projectFields('Promoted Project'),
            idea: ideaFields('Source Idea'),
            ideaStateEventId: 'ev-idea-promoted',
            ideaState: 'promoted',
            projectStateEventId: 'ev-project-init',
            projectState: 'submitted',
            // Distinct values confirm ideaStateAt→idea event and
            // projectStateAt→project event without crossing.
            ideaStateAt: '2099-06-01T00:00:00.000000Z',
            projectStateAt: '2099-06-01T00:00:01.000000Z',
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
            at: string;
        }>(db, 'entity-states/idea-1', DEV_TOKEN);
        assert.equal(ideaCurrent.state, 'promoted');
        assert.equal(ideaCurrent.member_id, 'current');
        // The idea event carries the caller-supplied ideaStateAt.
        assert.equal(
            ideaCurrent.at, '2099-06-01T00:00:00.000000Z',
        );

        // The new project entered at its initial state, also
        // authored by the actor.
        const projectEvents = await db.states.getAllFor('p1');
        assert.equal(projectEvents.length, 1);
        assert.equal(projectEvents[0]!.state, 'submitted');
        assert.equal(projectEvents[0]!.member_id, 'current');
        // The project event carries the caller-supplied projectStateAt.
        assert.equal(
            projectEvents[0]!.at,
            '2099-06-01T00:00:01.000000Z',
        );

        const mine = await GET<
            ProjectObjectiveBaselineScoreEntity[]
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
    'POST ideas/:id/conversion also appends document pairs'
    + ' at the project\'s and the idea\'s own addresses',
    async () => {
        const db = await seededDb();
        await POST(db, 'ideas/idea-1/conversion', {
            projectId: 'p9',
            project: projectFields('Promoted Project'),
            idea: ideaFields('Source Idea'),
            ideaStateEventId: 'ev-idea-promoted-9',
            ideaState: 'promoted',
            projectStateEventId: 'ev-project-init-9',
            projectState: 'submitted',
            ideaStateAt: '2099-06-03T00:00:00.000000Z',
            projectStateAt: '2099-06-03T00:00:01.000000Z',
            baselines: [],
        }, DEV_TOKEN);

        // Balance invariant: three REQUEST rows + three RESPONSE
        // rows for one conversion (the operation pair, the
        // synthesized project document pair, and the synthesized
        // idea document pair).
        const allRequests = await db.requests.getAll();
        const allResponses = await db.responses.getAll();
        assert.equal(allRequests.length, 3);
        assert.equal(allResponses.length, 3);
        assert.equal(allRequests.length, allResponses.length);

        const atProjectAddress = allRequests.filter(
            (r) =>
                r.uri_prefix === '/organizations/1/projects/'
                && r.uri_id === 'p9',
        );
        assert.equal(atProjectAddress.length, 1);
        const responsesAtProjectAddress = allResponses.filter(
            (r) =>
                r.uri_prefix === '/organizations/1/projects/'
                && r.uri_id === 'p9',
        );
        assert.equal(responsesAtProjectAddress.length, 1);

        const request = atProjectAddress[0]!;
        // The requester is the caller, never the idea's author.
        assert.equal(request.requester_identity_id, 'current');

        const parsed = JSON.parse(request.message) as {
            body: Record<string, unknown>;
        };
        assert.deepEqual(parsed.body, {
            ...projectFields('Promoted Project'),
            state: 'submitted',
            state_at: '2099-06-03T00:00:01.000000Z',
            state_event_id: 'ev-project-init-9',
        });

        const atIdeaAddress = allRequests.filter(
            (r) =>
                r.uri_prefix === '/organizations/1/ideas/'
                && r.uri_id === 'idea-1',
        );
        assert.equal(atIdeaAddress.length, 1);
        const responsesAtIdeaAddress = allResponses.filter(
            (r) =>
                r.uri_prefix === '/organizations/1/ideas/'
                && r.uri_id === 'idea-1',
        );
        assert.equal(responsesAtIdeaAddress.length, 1);

        const ideaRequest = atIdeaAddress[0]!;
        // The requester is the caller, never the idea's author.
        assert.equal(
            ideaRequest.requester_identity_id, 'current',
        );

        const ideaParsed = JSON.parse(ideaRequest.message) as {
            body: Record<string, unknown>;
        };
        assert.deepEqual(ideaParsed.body, {
            ...ideaFields('Source Idea'),
            state: 'promoted',
            state_at: '2099-06-03T00:00:00.000000Z',
            state_event_id: 'ev-idea-promoted-9',
        });
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
                ideaStateAt: '2099-06-02T00:00:00.000000Z',
                projectStateAt: '2099-06-02T00:00:01.000000Z',
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
