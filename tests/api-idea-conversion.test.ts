import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { GET, POST, PUT } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    type ProjectObjectiveBaselineScoreEntity,
} from '../shared/types.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { operationIdHeader } from
    './operation-id-header.ts';


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
    // alias retired; surviving /versions derives from the
    // message plane, so a raw ideas.put + states.postEvent
    // leaves no pair and history would read empty after a
    // rolled-back conversion.
    await PUT(db
        , 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
        + 'gVvtDIaqhnkXZQcxZeSuiw', {
        ...ideaFields('Source Idea'),
        state: 'approved',
    }, DEV_TOKEN,
        operationIdHeader());
    // Phase Final Stage B: objectives table retired — seed
    // through the live document PUT (states-document
    // retirement) so the message plane owns it.
    await PUT(db,
        'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + OBJ_1, {
        position: 1,
        state: 'active',
    }, DEV_TOKEN,
        operationIdHeader());
    await PUT(db,
        'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + OBJ_2, {
        position: 2,
        state: 'active',
    }, DEV_TOKEN,
        operationIdHeader());
    return db;
}

Deno.test(
    'POST organizations/:id/ideas/:id/conversion writes the project, the'
    + ' promoted idea, two documents, and N baselines in one'
    + ' operation',
    async () => {
        const db = await seededDb();
        // Two distinct timestamps — idea strictly before project —
        // to verify each at routes to its own event and not the other.
        const ideaHead = await db.messagePairs.getHeadPair(
            '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
            'gVvtDIaqhnkXZQcxZeSuiw',
        );
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
        }, DEV_TOKEN,
            operationIdHeader([
                ['If-Match', '"' + ideaHead!.id + '"'],
            ]));

        const project = await GET<{
            title: string;
            organization_id: string;
            state: string;
        }>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw', DEV_TOKEN, operationIdHeader());
        assertStrictEquals(project.title, 'Promoted Project');
        // The fence stamped the bound org — never the body.
        assertStrictEquals(project.organization_id, 'AjdvjuECVZEgZoFajaIEkg');
        assertStrictEquals(project.state, 'submitted');

        // The idea moved to 'promoted', authored by the actor.
        // bare per-entity current-state alias RETIRED
        // (Phase 15 Task 7); post-write check rides
        // surviving /versions.
        const ideaHistory = await GET<{
            id: string;
            state: string;
        }[]>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'gVvtDIaqhnkXZQcxZeSuiw/versions/', DEV_TOKEN,
                operationIdHeader());
        const ideaCurrent = ideaHistory[0]!;
        assertStrictEquals(ideaCurrent.id, 'gVvtDIaqhnkXZQcxZeSuiw');
        assertStrictEquals(ideaCurrent.state, 'promoted');

        // The new project entered at its initial state, also
        // authored by the actor.
        const projectVersions = await GET<{
            state: string;
            member_id: string;
        }[]>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw/versions/', DEV_TOKEN,
                operationIdHeader());
        assertStrictEquals(projectVersions.length, 1);
        assertStrictEquals(
            projectVersions[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA',
        );

        const mine = await GET<
            ProjectObjectiveBaselineScoreEntity[]
        >(
            db,
            'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'pnXmXrxOWayANgDLdCjuBw/objective-baseline-scores/',
            DEV_TOKEN,
            operationIdHeader());
        assertStrictEquals(mine.length, 2);
        const byObj = new Map(
            mine.map(b => [b.objective_id, b.score]),
        );
        assertStrictEquals(byObj.get(OBJ_1), 50);
        assertStrictEquals(byObj.get(OBJ_2), -25);
    },
);

Deno.test(
    'POST organizations/:id/ideas/:id/conversion also'
    + ' appends document message pairs at the project\'s'
    + ' and the idea\'s own documents',
    async () => {
        const db = await seededDb();
        const ideaHead = await db.messagePairs.getHeadPair(
            '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
            'gVvtDIaqhnkXZQcxZeSuiw',
        );
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
        }, DEV_TOKEN,
            operationIdHeader([
                ['If-Match', '"' + ideaHead!.id + '"'],
            ]));

        // Balance invariant: the wire-seeded idea genesis PUT
        // (1) + two objective document PUTs (Stage B: message
        // plane owns objectives) + five conversion pairs
        // (the operation message pair, the synthesized
        // project document message pair, the synthesized
        // idea document message pair, and TWO synthesized
        // baseline pairs — Phase 7 Task 4's 3+N widening,
        // N=2 here) + three schema/bootstrap pairs = 11.
        const allRequests = await db.messagePairs.getAll();
        const allResponses = await db.messagePairs.getAll();
        assertStrictEquals(allRequests.length, 11);
        assertStrictEquals(allResponses.length, 11);
        assertStrictEquals(allRequests.length, allResponses.length);

        const atProject = allRequests.filter(
            (r) =>
                r.path === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
                    + 'projects/'
                && r.name === 'psZcIMMgiSomMHzDxcUnYQ',
        );
        assertStrictEquals(atProject.length, 1);
        const responsesAtProject = allResponses.filter(
            (r) =>
                r.path === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
                    + 'projects/'
                && r.name === 'psZcIMMgiSomMHzDxcUnYQ',
        );
        assertStrictEquals(responsesAtProject.length, 1);

        const request = atProject[0]!;
        // The requester is the caller, never the idea's author.
        assertStrictEquals(
            request.requester_identity_id, 'XXZruirZyAOoRpNxaDnpSA',
        );

        const parsed = pairJsonOf(request.response) as {
            body: Record<string, unknown>;
        };
        // The stored response is the project's state, which
        // leads with its id and organization.
        assertEquals(parsed.body, {
            id: 'psZcIMMgiSomMHzDxcUnYQ',
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            ...projectFields('Promoted Project'),
            state: 'submitted',
        });

        // Seed genesis PUT + conversion's synthesized idea
        // document message pair both land at
        // gVvtDIaqhnkXZQcxZeSuiw's document.
        const atIdea = allRequests.filter(
            (r) =>
                r.path === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
                    + 'ideas/'
                && r.name === 'gVvtDIaqhnkXZQcxZeSuiw',
        );
        assertStrictEquals(atIdea.length, 2);
        const responsesAtIdea = allResponses.filter(
            (r) =>
                r.path === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
                    + 'ideas/'
                && r.name === 'gVvtDIaqhnkXZQcxZeSuiw',
        );
        assertStrictEquals(responsesAtIdea.length, 2);

        // The conversion's idea pair is the one carrying
        // 'promoted' (the seed carried 'approved').
        const ideaRequest = atIdea.find((r) => {
            const body = (pairJsonOf(r.response) as {
                body: Record<string, unknown>;
            }).body;
            return body['state'] === 'promoted';
        })!;
        assert(ideaRequest);
        // The requester is the caller, never the idea's author.
        assertStrictEquals(
            ideaRequest.requester_identity_id, 'XXZruirZyAOoRpNxaDnpSA',
        );

        const ideaParsed = pairJsonOf(ideaRequest.response) as {
            body: Record<string, unknown>;
        };
        assertEquals(ideaParsed.body, {
            id: 'gVvtDIaqhnkXZQcxZeSuiw',
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            ...ideaFields('Source Idea'),
            state: 'promoted',
        });

        // The baseline pairs (Phase 7 Task 4): one PUT-shaped
        // pair per baseline, at that baseline's OWN document —
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
            const atBaseline = allRequests.filter(
                (r) =>
                    r.path === baselinesPrefix
                    && r.name === id,
            );
            assertStrictEquals(atBaseline.length, 1);
            const responsesAtBaseline = allResponses
                .filter(
                    (r) =>
                        r.path === baselinesPrefix
                        && r.name === id,
                );
            assertStrictEquals(responsesAtBaseline.length, 1);

            const baselineRequest = atBaseline[0]!;
            assertStrictEquals(
                baselineRequest.requester_identity_id,
                'XXZruirZyAOoRpNxaDnpSA',
            );
            const baselineParsed = pairJsonOf(
                baselineRequest.response,
            ) as { body: Record<string, unknown> };
            // KEY-SET spot-check: the stored body is the
            // baseline's id and its `fields` VERBATIM —
            // exactly {id, project_id, objective_id, score,
            // member_id, at}, no more, no less.
            assertEquals(baselineParsed.body, { id, ...fields });
        }
    },
);

Deno.test(
    'POST organizations/:id/ideas/:id/conversion ignores a raw colliding'
    + ' states row (states ROW half stripped)',
    async () => {
        const db = await seededDb();
        // Phase Final Task 2: states ROW half stripped —
        // a raw colliding states row no longer aborts the
        // message-plane conversion.
    // Phase Final Stage B: states table retired.
        const ideaHead = await db.messagePairs.getHeadPair(
            '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
            'gVvtDIaqhnkXZQcxZeSuiw',
        );
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
        }, DEV_TOKEN,
            operationIdHeader([
                ['If-Match', '"' + ideaHead!.id + '"'],
            ]));

        const project = await GET<{ id: string }>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'pnXmXrxOWayANgDLdCjuBw', DEV_TOKEN,
                operationIdHeader());
        assertStrictEquals(project.id, 'pnXmXrxOWayANgDLdCjuBw');
        const ideaHistory = await GET<{ state: string }[]>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'gVvtDIaqhnkXZQcxZeSuiw/versions/', DEV_TOKEN,
                operationIdHeader());
        // Family history is DESC — index 0 is current.
        const ideaCurrent = ideaHistory[0]!;
        assertStrictEquals(ideaCurrent.state, 'promoted');
    },
);
