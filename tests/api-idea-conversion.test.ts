import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET, POST, PUT } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { deriveProjectStateHistory } from
    '../api/derive-projects.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    type ProjectObjectiveBaselineScoreEntity,
} from '../api/types.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

function pairJsonOf(message: string): {
    readonly body: Record<string, unknown>;
} {
    const body = HttpMessage.fromWire(message).body();
    return {
        body: body.exists()
            ? JSON.parse(body.toText()) as
                Record<string, unknown>
            : {},
    };
}

// POST organizations/:id/ideas/:id/conversion is the LONE cross-aggregate
// write:
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
        project_id: 'pnXmXrxOWayANgDLdCjuBw',
        objective_id: objectiveId,
        score,
        member_id: 'XXZruirZyAOoRpNxaDnpSA',
        at: '2026-04-01T00:00:00.000000Z',
    };
}

const OBJ_1 = generateIdentifier();
const OBJ_2 = generateIdentifier();
const BL_1 = generateIdentifier();
const BL_2 = generateIdentifier();
const BL_9A = generateIdentifier();
const BL_9B = generateIdentifier();
const EV_IDEA_PROMOTED = generateIdentifier();
const EV_PROJECT_INIT = generateIdentifier();
const EV_IDEA_PROMOTED_9 = generateIdentifier();
const EV_PROJECT_INIT_9 = generateIdentifier();

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    // The source idea, already approved — seeded through the
    // wire (Phase 15 Task 7): bare per-entity current-state
    // alias retired; surviving /versions derives from the pair
    // plane, so a raw ideas.put + states.postEvent leaves no
    // pair and history would read empty after a rolled-back
    // conversion.
    await PUT(db
        , 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
        + 'gVvtDIaqhnkXZQcxZeSuiw', {
        ...ideaFields('Source Idea'),
        state: 'approved',
    }, DEV_TOKEN);
    // Phase Final Stage B: objectives table retired — seed
    // through the live document PUT with the lifecycle trio
    // (states-address retirement) so the pair plane owns it.
    await PUT(db,
        'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + OBJ_1, {
        position: 1,
        state: 'active',
    }, DEV_TOKEN);
    await PUT(db,
        'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + OBJ_2, {
        position: 2,
        state: 'active',
    }, DEV_TOKEN);
    return db;
}

test(
    'POST organizations/:id/ideas/:id/conversion writes the project, the'
    + ' promoted idea, two events, and N baselines in one'
    + ' operation',
    async () => {
        const db = await seededDb();
        // Two distinct timestamps — idea strictly before project —
        // to verify each at routes to its own event and not the other.
        await POST(db
            , 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'gVvtDIaqhnkXZQcxZeSuiw/conversion', {
            projectId: 'pnXmXrxOWayANgDLdCjuBw',
            project: projectFields('Promoted Project'),
            idea: ideaFields('Source Idea'),
            ideaStateEventId: EV_IDEA_PROMOTED,
            ideaState: 'promoted',
            projectStateEventId: EV_PROJECT_INIT,
            projectState: 'submitted',
            // Distinct values confirm ideaStateAt→idea event and
            // projectStateAt→project event without crossing.
            ideaStateAt: '2099-06-01T00:00:00.000000Z',
            projectStateAt: '2099-06-01T00:00:01.000000Z',
            baselines: [
                {
                    id: BL_1,
                    fields: baselineFields(OBJ_1, 50),
                },
                {
                    id: BL_2,
                    fields: baselineFields(OBJ_2, -25),
                },
            ],
        }, DEV_TOKEN);

        const project = await GET<{
            title: string;
            organization_id: string;
        }>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw', DEV_TOKEN);
        assert.equal(project.title, 'Promoted Project');
        // The fence stamped the bound org — never the body.
        assert.equal(project.organization_id, 'AjdvjuECVZEgZoFajaIEkg');

        // The idea moved to 'promoted', authored by the actor.
        // bare per-entity current-state alias RETIRED
        // (Phase 15 Task 7); post-write check rides
        // surviving /versions.
        const ideaHistory = await GET<{
            id: string;
            state: string;
        }[]>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'gVvtDIaqhnkXZQcxZeSuiw/versions/', DEV_TOKEN);
        const ideaCurrent = ideaHistory[0]!;
        assert.equal(ideaCurrent.id, 'gVvtDIaqhnkXZQcxZeSuiw');
        assert.equal(ideaCurrent.state, 'promoted');

        // The new project entered at its initial state, also
        // authored by the actor.
        const projectEvents = await deriveProjectStateHistory(db
            , 'AjdvjuECVZEgZoFajaIEkg', 'pnXmXrxOWayANgDLdCjuBw');
        assert.equal(projectEvents.length, 1);
        assert.equal(projectEvents[0]!.state, 'submitted');
        assert.equal(projectEvents[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');

        const mine = await GET<
            ProjectObjectiveBaselineScoreEntity[]
        >(
            db,
            'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'pnXmXrxOWayANgDLdCjuBw/objective-baseline-scores/',
            DEV_TOKEN,
        );
        assert.equal(mine.length, 2);
        const byObj = new Map(
            mine.map(b => [b.objective_id, b.score]),
        );
        assert.equal(byObj.get(OBJ_1), 50);
        assert.equal(byObj.get(OBJ_2), -25);
    },
);

test(
    'POST organizations/:id/ideas/:id/conversion also appends document pairs'
    + ' at the project\'s and the idea\'s own addresses',
    async () => {
        const db = await seededDb();
        await POST(db
            , 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'gVvtDIaqhnkXZQcxZeSuiw/conversion', {
            projectId: 'psZcIMMgiSomMHzDxcUnYQ',
            project: projectFields('Promoted Project'),
            idea: ideaFields('Source Idea'),
            ideaStateEventId: EV_IDEA_PROMOTED_9,
            ideaState: 'promoted',
            projectStateEventId: EV_PROJECT_INIT_9,
            projectState: 'submitted',
            ideaStateAt: '2099-06-03T00:00:00.000000Z',
            projectStateAt: '2099-06-03T00:00:01.000000Z',
            baselines: [
                {
                    id: BL_9A,
                    fields: baselineFields(OBJ_1, 10),
                },
                {
                    id: BL_9B,
                    fields: baselineFields(OBJ_2, -5),
                },
            ],
        }, DEV_TOKEN);

        // Balance invariant: the wire-seeded idea genesis PUT
        // (1) + two objective document PUTs (Stage B: pair
        // plane owns objectives) + five conversion pairs
        // (the operation pair, the synthesized project
        // document pair, the synthesized idea document pair,
        // and TWO synthesized baseline pairs — Phase 7 Task
        // 4's 3+N widening, N=2 here) + three schema/
        // bootstrap pairs = 11.
        const allRequests = await db.pairs.getAll();
        const allResponses = await db.pairs.getAll();
        assert.equal(allRequests.length, 10);
        assert.equal(allResponses.length, 10);
        assert.equal(allRequests.length, allResponses.length);

        const atProjectAddress = allRequests.filter(
            (r) =>
                r.uri_collection === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
                    + 'projects/'
                && r.uri_id === 'psZcIMMgiSomMHzDxcUnYQ',
        );
        assert.equal(atProjectAddress.length, 1);
        const responsesAtProjectAddress = allResponses.filter(
            (r) =>
                r.uri_collection === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
                    + 'projects/'
                && r.uri_id === 'psZcIMMgiSomMHzDxcUnYQ',
        );
        assert.equal(responsesAtProjectAddress.length, 1);

        const request = atProjectAddress[0]!;
        // The requester is the caller, never the idea's author.
        assert.equal(request.requester_identity_id, 'XXZruirZyAOoRpNxaDnpSA');

        const parsed = pairJsonOf(request.request) as {
            body: Record<string, unknown>;
        };
        assert.deepEqual(parsed.body, {
            ...projectFields('Promoted Project'),
            state: 'submitted',
        });

        // Seed genesis PUT + conversion's synthesized idea
        // document pair both land at gVvtDIaqhnkXZQcxZeSuiw's address.
        const atIdeaAddress = allRequests.filter(
            (r) =>
                r.uri_collection === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
                    + 'ideas/'
                && r.uri_id === 'gVvtDIaqhnkXZQcxZeSuiw',
        );
        assert.equal(atIdeaAddress.length, 2);
        const responsesAtIdeaAddress = allResponses.filter(
            (r) =>
                r.uri_collection === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
                    + 'ideas/'
                && r.uri_id === 'gVvtDIaqhnkXZQcxZeSuiw',
        );
        assert.equal(responsesAtIdeaAddress.length, 2);

        // The conversion's idea pair is the one carrying
        // 'promoted' (the seed carried 'approved').
        const ideaRequest = atIdeaAddress.find((r) => {
            const body = (pairJsonOf(r.request) as {
                body: Record<string, unknown>;
            }).body;
            return body['state'] === 'promoted';
        })!;
        assert.ok(ideaRequest);
        // The requester is the caller, never the idea's author.
        assert.equal(
            ideaRequest.requester_identity_id, 'XXZruirZyAOoRpNxaDnpSA',
        );

        const ideaParsed = pairJsonOf(ideaRequest.request) as {
            body: Record<string, unknown>;
        };
        assert.deepEqual(ideaParsed.body, {
            ...ideaFields('Source Idea'),
            state: 'promoted',
        });

        // The baseline pairs (Phase 7 Task 4): one PUT-shaped
        // pair per baseline, at that baseline's OWN address —
        // every baseline id is client-minted FRESH for this
        // conversion, so each pair is genesis there.
        const baselinesPrefix =
            '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'psZcIMMgiSomMHzDxcUnYQ'
            + '/objective-baseline-scores/';
        const baselineCases = [
            { id: BL_9A, fields: baselineFields(OBJ_1, 10) },
            { id: BL_9B, fields: baselineFields(OBJ_2, -5) },
        ];
        for (const { id, fields } of baselineCases) {
            const atBaselineAddress = allRequests.filter(
                (r) =>
                    r.uri_collection === baselinesPrefix
                    && r.uri_id === id,
            );
            assert.equal(atBaselineAddress.length, 1);
            const responsesAtBaselineAddress = allResponses
                .filter(
                    (r) =>
                        r.uri_collection === baselinesPrefix
                        && r.uri_id === id,
                );
            assert.equal(responsesAtBaselineAddress.length, 1);

            const baselineRequest = atBaselineAddress[0]!;
            assert.equal(
                baselineRequest.requester_identity_id,
                'XXZruirZyAOoRpNxaDnpSA',
            );
            const baselineParsed = pairJsonOf(
                baselineRequest.request,
            ) as { body: Record<string, unknown> };
            // KEY-SET spot-check: the wire body is the
            // baseline's `fields` VERBATIM — exactly
            // {project_id, objective_id, score, member_id,
            // at}, no more, no less.
            assert.deepEqual(baselineParsed.body, fields);
        }
    },
);

test(
    'POST organizations/:id/ideas/:id/conversion ignores a raw colliding'
    + ' states row (states ROW half stripped)',
    async () => {
        const db = await seededDb();
        // Phase Final Task 2: states ROW half stripped —
        // a raw colliding states row no longer aborts the
        // pair-plane conversion.
    // Phase Final Stage B: states table retired.
        await POST(db
            , 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'gVvtDIaqhnkXZQcxZeSuiw/conversion', {
            projectId: 'pnXmXrxOWayANgDLdCjuBw',
            project: projectFields('Converted'),
            idea: ideaFields('Source Idea'),
            ideaStateEventId: EV_IDEA_PROMOTED,
            ideaState: 'promoted',
            projectStateEventId: EV_PROJECT_INIT,
            projectState: 'submitted',
            ideaStateAt: '2099-06-02T00:00:00.000000Z',
            projectStateAt: '2099-06-02T00:00:01.000000Z',
            baselines: [
                {
                    id: BL_1,
                    fields: baselineFields(OBJ_1, 50),
                },
            ],
        }, DEV_TOKEN);

        const project = await GET<{ id: string }>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'pnXmXrxOWayANgDLdCjuBw', DEV_TOKEN,
        );
        assert.equal(project.id, 'pnXmXrxOWayANgDLdCjuBw');
        const ideaHistory = await GET<{ state: string }[]>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'gVvtDIaqhnkXZQcxZeSuiw/versions/', DEV_TOKEN,
        );
        // Family history is DESC — index 0 is current.
        const ideaCurrent = ideaHistory[0]!;
        assert.equal(ideaCurrent.state, 'promoted');
    },
);
