import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { seedIdentifier } from
    '../api/mock-data/seed-kit.ts';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    EntityNotFoundError,
} from '../api/db.ts';
import type {
    Id,
    ObjectiveEntity,
    ObjectiveRevisionEntity,
} from '../api/types.ts';
import { canonicalUriCollection } from '../api/message-pair.ts';
import { documentMessagePairsAt } from '../api/derive-documents.ts';
import {
    documentGetHandler,
    documentCollectionGetHandler,
    type DocumentFamilyWiring,
} from '../api/document-family.ts';
import {
    pickNumber,
    validateObjectiveDocumentBody,
} from '../api/validators.ts';
import { postObjectiveDocumentOp } from '../api/routes.ts';
import {
    deriveObjectiveRevisions,
} from '../api/derive-objective-revisions.ts';
import {
    deriveBaselineScores,
    deriveActualScores,
} from '../api/derive-project-scores.ts';
import { OBJECTIVE_SEEDS } from '../api/mock-data/objectives.ts';
import {
    ORGANIZATION_TWO_OBJECTIVE,
} from '../api/mock-data/seed-message-pairs.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { buildProjects } from '../api/mock-data/projects.ts';
import { organizationToken } from './token-fixtures.ts';
import { parseWire } from '../shared/http-message/wire-codec.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
    storedPutBodyText,
    storedCollectionText,
} from './http-fixtures.ts';

const IDEA_DRIFT_CHAIN_1_PROMOTED = generateIdentifier();
const PROJ_DRIFT_CHAIN_1_INIT = generateIdentifier();
const OBJ_DRIFT_METHOD_FILTER_1 = generateIdentifier();
const OBJ_DRIFT_Z = generateIdentifier();
const OBJ_DRIFT_A = generateIdentifier();
const OBJ_DRIFT_M = generateIdentifier();
const OBJ_DRIFT_SKEW_1_GENESIS = generateIdentifier();

// Phase Final Task 2: objectives(+objective_revisions)
// dual-write stripped. This file no longer compares derive
// vs old-table oracles — the row plane is empty after seed.
// Coverage re-homes to wire-byte handleRequest assertions
// and non-lexical live fixtures (drift-identity-tokens
// craftsmanship: byIdAscending must diverge from insertion
// order; never function-vs-function only).
//
// Objectives are the FIFTH lifecycle-trio family (states-
// address retirement). Absence-as-active (R2) is RETIRED —
// every objective carries an explicit genesis event; archive/
// reactivate ride PUT /organizations/:id/objectives/:id.
// OBJECTIVES_TEST_WIRING
// mirrors routes.ts's private OBJECTIVES_WIRING so derived
// reads exercise the ACTUAL generic handlers. Nested
// revisions/scores ride bespoke derives (no generic family
// wiring for nests).

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

const OBJECTIVES_TEST_WIRING: DocumentFamilyWiring = {
    family: 'objectives',
    httpNest: 'organization',
    lifecycle: 'trio',
    notFoundTable: 'objectives',
    validateDocument: validateObjectiveDocumentBody,
    documentOp: postObjectiveDocumentOp,
    // Mirror routes.ts objectiveDocumentEntityOf: stamp trio
    // from lifecycle-current (required on trio path).
    entityOf: (document, organization, current) => ({
        id: document.uriId,
        organization_id: organization,
        position: pickNumber(document.body, 'position'),
        state: current!.state,
    }),
};

const READER_ACTOR: Id = generateIdentifier();
const OBJECTIVEID_REV_1 = generateIdentifier();
const OBJECTIVEID_ACTIVE = generateIdentifier();
const OBJECTIVEID_REV_2 = generateIdentifier();
const OBJECTIVEID_REV_3 = generateIdentifier();

async function derivedObjectives(
    db: MemoryDbAdapter, organization: Id,
): Promise<ObjectiveEntity[]> {
    return documentCollectionGetHandler(OBJECTIVES_TEST_WIRING)(
        db, [], READER_ACTOR, organization, [],
    ) as Promise<ObjectiveEntity[]>;
}

async function derivedObjective(
    db: MemoryDbAdapter, organization: Id, id: Id,
): Promise<ObjectiveEntity> {
    return documentGetHandler(OBJECTIVES_TEST_WIRING)(
        db, [organization, id], READER_ACTOR, organization, [],
    ) as Promise<ObjectiveEntity>;
}

// PUT response shape (documentWriteResponseSpec / G1):
// entity fields plus lifecycle-current trio.
function wireObjectivePut(
    id: string,
    position: number,
    organization = STARK_ORGANIZATION,
) {
    return {
        id,
        organization_id: organization,
        position,
    };
}

// GET objectiveDocumentEntityOf form: entity fields plus
// lifecycle-current trio (state ← event.state, state_at ←
// event.at, state_event_id ← event.id) — never the head
// body trio.
function wireObjectiveGet(
    id: string,
    position: number,
    state: string,
    _stateAt: string,
    _stateEventId: string,
    organization = STARK_ORGANIZATION,
): ObjectiveEntity {
    return {
        ...wireObjectivePut(id, position, organization),
        state,
    };
}

function decodeRequestMessage(message: string): {
    readonly method: string;
    readonly body: Record<string, unknown>;
} {
    const model = parseWire(message);
    if (model.startLine.kind !== 'request') {
        throw new Error(
            'stored message carries no request line',
        );
    }
    const body = HttpMessage.fromModel(model).body();
    return {
        method: model.startLine.method,
        body: body.exists()
            ? JSON.parse(body.toText()) as
                Record<string, unknown>
            : {},
    };
}

function objectiveCreateBody(
    id: string,
    position: number,
    revisionId: string,
    name: string,
    at: string,
    organization: string = STARK_ORGANIZATION,
): Record<string, unknown> {
    return {
        id,
        objective: { organization_id: organization, position },
        revisionId,
        revision: {
            objective_id: id, name, description: 'd',
            member_id: 'XXZruirZyAOoRpNxaDnpSA', at,
        },
        initialState: 'active',
        initialStateEventId: generateIdentifier(),
        initialStateAt: at,
    };
}

// -- 1. seeded collection wire equals derive -------------------

Deno.test('seeded GET /objectives wire equals derive, both orgs'
+ ' (the 4/AjdvjuECVZEgZoFajaIEkg split), plus the empty-collection leg',
async () => {
    const db = await seededDb();

    const tokenStark = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const resStark = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            , tokenStark),
    );
    assertStrictEquals(resStark.status, 200);
    const starkPrefix = '/organizations/'
        + STARK_ORGANIZATION + '/objectives/';
    const stark = await derivedObjectives(
        db, STARK_ORGANIZATION,
    );
    assertStrictEquals(
        await resStark.text(),
        await storedCollectionText(db, starkPrefix),
    );
    assertStrictEquals(stark.length, 4);
    assertEquals(
        stark.map((o) => o.id).sort(),
        [...OBJECTIVE_SEEDS.map((s) => s.id)].sort(),
    );

    const tokenTwo = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );
    const resTwo = await handleRequest(
        db, req(
            'GET',
            '/organizations/' + ORGANIZATION_TWO
                + '/objectives/',
            tokenTwo,
        ),
    );
    assertStrictEquals(resTwo.status, 200);
    const org2 = await derivedObjectives(db, ORGANIZATION_TWO);
    assertStrictEquals(
        await resTwo.text(),
        await storedCollectionText(
            db,
            '/organizations/' + ORGANIZATION_TWO
                + '/objectives/',
        ),
    );
    assertStrictEquals(org2.length, 1);
    assertStrictEquals(org2[0]!.id, ORGANIZATION_TWO_OBJECTIVE.id);

    // Empty-collection leg: third organization, zero seeds.
    const THIRD_ORGANIZATION = '3';
    const empty = await derivedObjectives(
        db, THIRD_ORGANIZATION,
    );
    assertEquals(empty, []);
    // Phase Final Stage B: objectives tables retired.
});

// -- 2. per-objective GET wire equals derive; foreign 404 ----

Deno.test('per-objective GET wire equals derive (all 5); a'
+ ' foreign-org GET 404s on wire and on derive',
async () => {
    const db = await seededDb();
    const targets = [
        ...OBJECTIVE_SEEDS.map((s) => ({
            id: s.id,
            organization: STARK_ORGANIZATION,
            position: s.position,
        })),
        {
            id: ORGANIZATION_TWO_OBJECTIVE.id,
            organization: ORGANIZATION_TWO,
            position: ORGANIZATION_TWO_OBJECTIVE.position,
        },
    ];
    assertStrictEquals(targets.length, 5);
    for (const t of targets) {
        const token = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', t.organization,
        );
        const res = await handleRequest(
            db, req(
                'GET',
                '/organizations/' + t.organization
                    + '/objectives/' + t.id,
                token,
            ),
        );
        assertStrictEquals(res.status, 200);
        const derived = await derivedObjective(
            db, t.organization, t.id,
        );
        const prefix = '/organizations/'
            + t.organization + '/objectives/';
        assertStrictEquals(
            await res.text(),
            await storedPutBodyText(db, prefix, t.id),
        );
        assertStrictEquals(derived.position, t.position);
        assertStrictEquals(derived.state, 'active');
    }

    const foreignId = OBJECTIVE_SEEDS[0]!.id;
    const expectedMessage =
        'Not found: objectives/' + foreignId;
    const tokenTwo = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );
    const foreignRes = await handleRequest(
        db, req(
            'GET',
            '/organizations/' + ORGANIZATION_TWO
                + '/objectives/' + foreignId,
            tokenTwo,
        ),
    );
    assertStrictEquals(foreignRes.status, 404);
    const body = await foreignRes.json() as { error: string };
    assertStrictEquals(body.error, expectedMessage);
    const err = await assertRejects(
        () => derivedObjective(db, ORGANIZATION_TWO, foreignId),
    ) as Error;
    assertInstanceOf(err, EntityNotFoundError);
    assertStrictEquals(err.message, expectedMessage);
});

// -- 3. revisions wire equals derive ---------------------------

Deno.test('revisions GET wire equals derive per objective (all 5,'
+ ' one seeded revision each); foreign-parent nested-'
+ ' collection is 200 [] on wire and derive',
async () => {
    const db = await seededDb();
    const targets = [
        ...OBJECTIVE_SEEDS.map((s) => ({
            id: s.id, organization: STARK_ORGANIZATION,
        })),
        {
            id: ORGANIZATION_TWO_OBJECTIVE.id,
            organization: ORGANIZATION_TWO,
        },
    ];
    for (const { id, organization } of targets) {
        const token = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', organization,
        );
        const path = '/organizations/' + organization
            + '/objectives/' + id + '/revisions/';
        const res = await handleRequest(
            db, req('GET', path, token),
        );
        assertStrictEquals(res.status, 200);
        const wireText = await res.text();
        const derived = await deriveObjectiveRevisions(
            db, organization, id,
        );
        assertStrictEquals(wireText, JSON.stringify(derived));
        assertStrictEquals(derived.length, 1);
    }

    const foreignId = OBJECTIVE_SEEDS[0]!.id;
    const tokenTwo = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );
    const foreignRes = await handleRequest(db, req(
        'GET',
        '/organizations/' + ORGANIZATION_TWO
            + '/objectives/' + foreignId + '/revisions/',
        tokenTwo,
    ));
    assertStrictEquals(foreignRes.status, 200);
    assertStrictEquals(await foreignRes.text(), '[]');
    assertEquals(
        await deriveObjectiveRevisions(
            db, ORGANIZATION_TWO, foreignId,
        ),
        [],
    );
});

// -- 4. score collection wire equals derive --------------------

// Phase Final Task 2: score row halves stripped earlier with
// the projects group — re-home stays wire GET byte identity.
Deno.test('score collection wire equals derive per project: an'
+ ' approved project (full 4-baseline coverage + actuals), a'
+ ' partial-coverage live-state project, a submitted project'
+ ' (EMPTY), the org-2 project (empty); whole-org totals (49'
+ ' baselines / 92 actuals); foreign-parent empty', async () => {
    const db = await seededDb();
    const tokenStark = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const tokenTwo = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );

    const fullCoverageProjectId = 'wqGTTFdYUGnmBxWCppmkOQ';
    const fullBasePath =
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + fullCoverageProjectId
        + '/objective-baseline-scores/';
    const fullActPath =
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + fullCoverageProjectId
        + '/objective-actual-scores/';
    const fullBaseRes = await handleRequest(
        db, req('GET', fullBasePath, tokenStark),
    );
    assertStrictEquals(fullBaseRes.status, 200);
    const fullBaseText = await fullBaseRes.text();
    const derivedFullBaselines = await deriveBaselineScores(
        db, STARK_ORGANIZATION, fullCoverageProjectId,
    );
    assertStrictEquals(
        fullBaseText, JSON.stringify(derivedFullBaselines),
    );
    assertStrictEquals(derivedFullBaselines.length, 4);

    const fullActRes = await handleRequest(
        db, req('GET', fullActPath, tokenStark),
    );
    assertStrictEquals(fullActRes.status, 200);
    const derivedFullActuals = await deriveActualScores(
        db, STARK_ORGANIZATION, fullCoverageProjectId,
    );
    assertStrictEquals(
        await fullActRes.text(),
        JSON.stringify(derivedFullActuals),
    );
    assertStrictEquals(derivedFullActuals.length, 5);

    const partialProjectId = 'ORXAfsQvNowpmJfBwQAtWg';
    const partialBaseRes = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + partialProjectId
        + '/objective-baseline-scores/',
        tokenStark,
    ));
    assertStrictEquals(partialBaseRes.status, 200);
    const derivedPartialBaselines = await deriveBaselineScores(
        db, STARK_ORGANIZATION, partialProjectId,
    );
    assertStrictEquals(
        await partialBaseRes.text(),
        JSON.stringify(derivedPartialBaselines),
    );
    assertStrictEquals(derivedPartialBaselines.length, 2);
    assertEquals(
        await deriveActualScores(
            db, STARK_ORGANIZATION, partialProjectId,
        ),
        [],
    );

    const submittedProjectId = 'PIfhHMLQQxTxKFDdabXbOw';
    assertEquals(
        await deriveBaselineScores(
            db, STARK_ORGANIZATION, submittedProjectId,
        ),
        [],
    );
    assertEquals(
        await deriveActualScores(
            db, STARK_ORGANIZATION, submittedProjectId,
        ),
        [],
    );

    const org2ProjectId = seedIdentifier(
        'seed-project-org2',
    );
    assertEquals(
        await deriveBaselineScores(
            db, ORGANIZATION_TWO, org2ProjectId,
        ),
        [],
    );
    assertEquals(
        await deriveActualScores(
            db, ORGANIZATION_TWO, org2ProjectId,
        ),
        [],
    );

    const starkProjectIds = buildProjects().map((p) => p.id);
    assertStrictEquals(starkProjectIds.length, 16);
    const derivedBaselineTotal: { id: string }[] = [];
    const derivedActualTotal: { id: string }[] = [];
    for (const projectId of starkProjectIds) {
        derivedBaselineTotal.push(
            ...(await deriveBaselineScores(
                db, STARK_ORGANIZATION, projectId,
            )),
        );
        derivedActualTotal.push(
            ...(await deriveActualScores(
                db, STARK_ORGANIZATION, projectId,
            )),
        );
    }
    assertStrictEquals(derivedBaselineTotal.length, 49);
    assertStrictEquals(derivedActualTotal.length, 92);

    const foreignRes = await handleRequest(db, req(
        'GET',
        '/organizations/' + ORGANIZATION_TWO
            + '/projects/' + fullCoverageProjectId
            + '/objective-baseline-scores/',
        tokenTwo,
    ));
    assertStrictEquals(foreignRes.status, 200);
    assertStrictEquals(await foreignRes.text(), '[]');
    assertEquals(
        await deriveBaselineScores(
            db, ORGANIZATION_TWO, fullCoverageProjectId,
        ),
        [],
    );
});

// -- 5. live-write chain on the message plane ------------------

Deno.test('live-write chain: create, reposition, revision edit,'
+ ' archive, reactivate, a conversion with 2 baselines, a'
+ ' standalone re-score + actual PUT, and a duplicate create —'
+ ' wire equals derive at every step', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const objectiveId = generateIdentifier();

    const beforeCreate = (await db.messagePairs.getAll()).length;
    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/', token,
        objectiveCreateBody(
            objectiveId, 50, OBJECTIVEID_REV_1,
            'Chain Objective', '2026-06-01T00:00:00.000000Z',
        ),
    ));
    assertStrictEquals(created.status, 201);
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, beforeCreate + 3,
    );
    {
        const getRes = await handleRequest(
            db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                + '' +
                objectiveId, token),
        );
        assertStrictEquals(getRes.status, 200);
        const derived = await derivedObjective(
            db, STARK_ORGANIZATION, objectiveId,
        );
        assertStrictEquals(
            await getRes.text(),
            await storedPutBodyText(
                db,
                '/organizations/' + STARK_ORGANIZATION
                    + '/objectives/',
                objectiveId,
            ),
        );
        assertStrictEquals(derived.position, 50);
        assertStrictEquals(derived.state, 'active');
        const revRes = await handleRequest(db, req(
            'GET',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                + objectiveId + '/revisions/',
            token,
        ));
        const revs = await deriveObjectiveRevisions(
            db, STARK_ORGANIZATION, objectiveId,
        );
        assertStrictEquals(
            await revRes.text(), JSON.stringify(revs),
        );
        assertStrictEquals(revs.length, 1);
    }

    // Position PUT echoes the genesis trio (putObjectivePosition
    // shape) — same state_event_id so echo-dedup mints no event.
    const reposition = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + objectiveId, token,
        {
            position: 77,
            state: 'active',
        },
    ));
    assertStrictEquals(reposition.status, 201);
    const repositionResponseId =
        reposition.headers.get('Response-ID');
    assert(repositionResponseId);
    assertStrictEquals(reposition.headers.get('Supersedes'), null);
    {
        const getRes = await handleRequest(
            db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                + '' +
                objectiveId, token),
        );
        const derived = await derivedObjective(
            db, STARK_ORGANIZATION, objectiveId,
        );
        assertStrictEquals(
            await getRes.text(),
            await storedPutBodyText(
                db,
                '/organizations/' + STARK_ORGANIZATION
                    + '/objectives/',
                objectiveId,
            ),
        );
        assertStrictEquals(derived.position, 77);
        assertStrictEquals(derived.state, 'active');
        assertEquals(
            await reposition.json(),
            wireObjectiveGet(
                objectiveId, 77, 'active',
                '2026-06-01T00:00:00.000000Z',
                OBJECTIVEID_ACTIVE,
            ),
        );
    }

    const revisionId2 = OBJECTIVEID_REV_2;
    const revEdit = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + objectiveId
            + '/revisions/'
            + revisionId2,
        token,
        {
            objective_id: objectiveId,
            name: 'Chain Objective v2',
            description: 'd2', member_id: 'XXZruirZyAOoRpNxaDnpSA',
            at: '2026-06-02T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(revEdit.status, 201);
    {
        const revs = await deriveObjectiveRevisions(
            db, STARK_ORGANIZATION, objectiveId,
        );
        assertStrictEquals(revs.length, 2);
        const latestByAt = [...revs].sort((a, b) =>
            a.at < b.at ? -1 : a.at > b.at ? 1 : 0).at(-1)!;
        assertStrictEquals(latestByAt.id, revisionId2);
    }

    // ARCHIVE via PUT /organizations/:id/objectives/:id with the archived
    // lifecycle trio — objective STAYS in the collection
    // (trio families exclude only 'deleted'; archived is a
    // live objective state).
    const archived = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + objectiveId, token,
        {
            position: 50,
            state: 'archived',
        },
    ));
    assertStrictEquals(archived.status, 201);
    {
        const listRes = await handleRequest(
            db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                + '', token),
        );
        const list = await listRes.json() as { id: string }[];
        assertStrictEquals(
            list.some((o) => o.id === objectiveId), true,
        );
        const derived = await derivedObjectives(
            db, STARK_ORGANIZATION,
        );
        assertStrictEquals(
            derived.some((o) => o.id === objectiveId), true,
        );
    }

    const reactivated = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + objectiveId, token,
        {
            position: 50,
            state: 'active',
        },
    ));
    assertStrictEquals(reactivated.status, 201);
    const reactivatedResponseId =
        reactivated.headers.get('Response-ID');
    assert(reactivatedResponseId);
    {
        const getRes = await handleRequest(
            db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                + '' +
                objectiveId, token),
        );
        assertStrictEquals(getRes.status, 200);
    }

    // Conversion with 2 baselines — idea seeded via document
    // PUT (ideas row half already stripped).
    const ideaId = generateIdentifier();
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + ideaId
            , token, {
            title: 'Chain Idea', position: 1,
            problem_statement: 'p', target_users: 't',
            proposed_solution: 's', expected_outcome: 'o',
            success_metrics: 'm',
            state: 'approved',
        },
    ));
    const projectId = generateIdentifier();
    const baselineIdA = generateIdentifier();
    const baselineIdB = generateIdentifier();
    const secondObjectiveId = OBJECTIVE_SEEDS[0]!.id;
    const beforeConversion = (await db.messagePairs.getAll()).length;
    const conversion = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + ideaId
            + '/conversion', token, {
            projectId,
            project: {
                title: 'Chain Project', description: 'd',
                progress: 0, start_date: '2026-04-01',
                target_end_date: '2026-07-01',
                estimated_cost: 100, actual_cost: 0, position: 1,
            },
            idea: {
                title: 'Chain Idea', position: 1,
                problem_statement: 'p', target_users: 't',
                proposed_solution: 's', expected_outcome: 'o',
                success_metrics: 'm',
            },
            ideaStateEventId: IDEA_DRIFT_CHAIN_1_PROMOTED,
            ideaState: 'promoted',
            projectStateEventId: PROJ_DRIFT_CHAIN_1_INIT,
            projectState: 'submitted',
            ideaStateAt: '2026-06-05T00:00:00.000000Z',
            projectStateAt: '2026-06-05T00:00:01.000000Z',
            baselines: [
                {
                    id: baselineIdA,
                    fields: {
                        project_id: projectId,
                        objective_id: objectiveId, score: 10,
                        member_id: 'XXZruirZyAOoRpNxaDnpSA',
                        at: '2026-06-05T00:00:02.000000Z',
                    },
                },
                {
                    id: baselineIdB,
                    fields: {
                        project_id: projectId,
                        objective_id: secondObjectiveId,
                        score: -10, member_id: 'XXZruirZyAOoRpNxaDnpSA',
                        at: '2026-06-05T00:00:03.000000Z',
                    },
                },
            ],
        },
    ));
    assertStrictEquals(conversion.status, 201);
    assertStrictEquals(
        (await db.messagePairs.getAll()).length,
        beforeConversion + 5,
    );
    const basePath =
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
        + '/objective-baseline-scores/';
    const baseRes = await handleRequest(
        db, req('GET', basePath, token),
    );
    assertStrictEquals(baseRes.status, 200);
    const derivedBaselinesAfterConversion =
        await deriveBaselineScores(
            db, STARK_ORGANIZATION, projectId,
        );
    assertStrictEquals(
        await baseRes.text(),
        JSON.stringify(derivedBaselinesAfterConversion),
    );
    assertStrictEquals(derivedBaselinesAfterConversion.length, 2);

    const baselineIdC = generateIdentifier();
    const standaloneBaseline = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
        + '/objective-baseline-scores/' + baselineIdC,
        token, {
            project_id: projectId, objective_id: objectiveId,
            score: 20, member_id: 'XXZruirZyAOoRpNxaDnpSA',
            at: '2026-06-06T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(standaloneBaseline.status, 201);
    const actualIdA = generateIdentifier();
    const standaloneActual = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
        + '/objective-actual-scores/' + actualIdA,
        token, {
            project_id: projectId, objective_id: objectiveId,
            score: 30, member_id: 'XXZruirZyAOoRpNxaDnpSA',
            at: '2026-06-06T00:00:01.000000Z',
        },
    ));
    assertStrictEquals(standaloneActual.status, 201);

    const baseFinalRes = await handleRequest(
        db, req('GET', basePath, token),
    );
    const derivedBaselinesFinal = await deriveBaselineScores(
        db, STARK_ORGANIZATION, projectId,
    );
    assertStrictEquals(
        await baseFinalRes.text(),
        JSON.stringify(derivedBaselinesFinal),
    );
    assertStrictEquals(derivedBaselinesFinal.length, 3);

    const actPath =
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
        + '/objective-actual-scores/';
    const actFinalRes = await handleRequest(
        db, req('GET', actPath, token),
    );
    const derivedActualsFinal = await deriveActualScores(
        db, STARK_ORGANIZATION, projectId,
    );
    assertStrictEquals(
        await actFinalRes.text(),
        JSON.stringify(derivedActualsFinal),
    );
    assertStrictEquals(derivedActualsFinal.length, 1);

    // Duplicate create — same id, fresh revisionId.
    // Entity-address pairs before: create op + create doc +
    // reposition + archive + reactivate = 5 (archive/reactivate
    // ride PUT /organizations/:id/objectives/:id after states-address
    // retirement).
    const revisionId3 = OBJECTIVEID_REV_3;
    const objectivesPrefix = canonicalUriCollection(
        STARK_ORGANIZATION
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/',
    );
    const beforeDuplicateIds = new Set(
        (
            await db.messagePairs.getAllWhere(
                'uri_collection', objectivesPrefix,
            )
        ).filter((r) => r.uri_id === objectiveId)
            .map((r) => r.id),
    );
    assertStrictEquals(beforeDuplicateIds.size, 5);

    const duplicate = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/', token,
        objectiveCreateBody(
            objectiveId, 88, revisionId3,
            'Chain Objective v3', '2026-06-07T00:00:00.000000Z',
        ),
    ));
    assertStrictEquals(duplicate.status, 201);
    // Supersedes the latest prior entity-address response
    // (reactivate), not the earlier reposition.
    assertStrictEquals(
        duplicate.headers.get('Supersedes'),
        null,
    );

    const [afterRequests, afterResponses] = await Promise.all([
        db.messagePairs.getAllWhere('uri_collection', objectivesPrefix),
        db.messagePairs.getAllWhere('uri_collection', objectivesPrefix),
    ]);
    const afterAtAddress = afterResponses.filter(
        (r) => r.uri_id === objectiveId,
    );
    assertStrictEquals(afterAtAddress.length, 7);
    const newRows = afterAtAddress.filter(
        (r) => !beforeDuplicateIds.has(r.id),
    );
    assertStrictEquals(newRows.length, 2);
    for (const row of newRows) {
        assertStrictEquals('supersedes' in row, false);
    }
    const documentMessagePairsAfter = documentMessagePairsAt(
        afterRequests, objectivesPrefix,
    ).filter((messagePair) => messagePair.uriId === objectiveId);
    // create doc + reposition + archive + reactivate +
    // duplicate create's document = 5
    assertStrictEquals(documentMessagePairsAfter.length, 5);
    const newestDocumentMessagePair =
        documentMessagePairsAfter.at(-1)!;
    const newestDocumentResponseRow = afterAtAddress.find(
        (r) => r.id === newestDocumentMessagePair.id,
    )!;
    assertStrictEquals(
        'supersedes' in newestDocumentResponseRow,
        false,
    );

    const finalGet = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + objectiveId, token),
    );
    const finalObjective = await derivedObjective(
        db, STARK_ORGANIZATION, objectiveId,
    );
    assertStrictEquals(
        await finalGet.text(),
        await storedPutBodyText(
            db,
            '/organizations/' + STARK_ORGANIZATION
                + '/objectives/',
            objectiveId,
        ),
    );
    assertStrictEquals(finalObjective.position, 88);
});

// -- 6. method-filter: create POST is never the document head -

Deno.test('the create-op POST pair is not read as a document message pair —'
+ ' the create body and the document body share zero top-level'
+ ' keys; exactly one PUT pair lands at the objective address'
+ ' after create', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const objectiveId = OBJ_DRIFT_METHOD_FILTER_1;

    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/', token,
        objectiveCreateBody(
            objectiveId, 1, OBJECTIVEID_REV_1, 'n',
            '2026-06-10T00:00:00.000000Z',
        ),
    ));
    assertStrictEquals(created.status, 201);

    const prefix = canonicalUriCollection(
        STARK_ORGANIZATION
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/',
    );
    const [requests] = await Promise.all([
        db.messagePairs.getAllWhere('uri_collection', prefix),
        db.messagePairs.getAllWhere('uri_collection', prefix),
    ]);
    const atAddress = requests.filter(
        (r) => r.uri_collection === prefix
            && r.uri_id === objectiveId,
    );
    assertStrictEquals(atAddress.length, 2);

    const documentMessagePairs = documentMessagePairsAt(
        requests, prefix,
    ).filter((messagePair) => messagePair.uriId === objectiveId);
    assertStrictEquals(documentMessagePairs.length, 1);
    assertStrictEquals(documentMessagePairs[0]!.method, 'PUT');

    const postRow = atAddress.find(
        (r) => decodeRequestMessage(r.request).method === 'POST',
    )!;
    const createBodyKeys = new Set(
        Object.keys(decodeRequestMessage(postRow.request).body),
    );
    const documentBodyKeys = new Set(
        Object.keys(documentMessagePairs[0]!.body),
    );
    const overlap = [...createBodyKeys].filter(
        (key) => documentBodyKeys.has(key),
    );
    assertEquals(overlap, []);
});

// -- 7. resend idempotency -------------------------------------

Deno.test('resend idempotency: a byte-identical position-PUT resend'
+ ' replays the stored response and appends NO second pair',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const objectiveId = generateIdentifier();

    await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/', token,
        objectiveCreateBody(
            objectiveId, 5, OBJECTIVEID_REV_1, 'n',
            '2026-06-11T00:00:00.000000Z',
        ),
    ));

    // Position body carries the echoed genesis trio — required
    // by the document gate after states-address retirement.
    const positionBody = {
        position: 99,
        state: 'active' as const,
    };
    const beforeReposition = (await db.messagePairs.getAll()).length;
    const first = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + objectiveId, token,
        positionBody,
    ));
    assertStrictEquals(first.status, 201);
    const afterFirst = (await db.messagePairs.getAll()).length;
    assertStrictEquals(afterFirst, beforeReposition + 1);

    const second = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + objectiveId, token,
        positionBody,
    ));
    assertStrictEquals(second.status, 201);
    const afterSecond = (await db.messagePairs.getAll()).length;
    assertStrictEquals(afterSecond, afterFirst);
    assertStrictEquals(
        first.headers.get('Response-ID'),
        second.headers.get('Response-ID'),
    );

    const getRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + objectiveId, token),
    );
    const derived = await derivedObjective(
        db, STARK_ORGANIZATION, objectiveId,
    );
    assertStrictEquals(
        await getRes.text(),
        await storedPutBodyText(
            db,
            '/organizations/' + STARK_ORGANIZATION
                + '/objectives/',
            objectiveId,
        ),
    );
    assertStrictEquals(derived.position, 99);
});

// -- 8. THE ARCHIVED-INCLUSION PIN -----------------------------

Deno.test('THE ARCHIVED-INCLUSION PIN: an objective with a live'
+ " 'archived' document-plane event appears in GET /objectives"
+ ' AND GET organizations/:id/objectives/:id 200 — archived is NOT deleted;'
+ " trio families exclude only state='deleted'",
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const objectiveId = generateIdentifier();

    await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/', token,
        objectiveCreateBody(
            objectiveId, 1, OBJECTIVEID_REV_1, 'n',
            '2026-06-12T00:00:00.000000Z',
        ),
    ));
    const archived = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + objectiveId, token,
        {
            position: 1,
            state: 'archived',
        },
    ));
    assertStrictEquals(archived.status, 201);

    const listRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            , token),
    );
    assertStrictEquals(listRes.status, 200);
    const listText = await listRes.text();
    const derivedCollection = await derivedObjectives(
        db, STARK_ORGANIZATION,
    );
    assertStrictEquals(
        listText,
        await storedCollectionText(
            db,
            '/organizations/' + STARK_ORGANIZATION
                + '/objectives/',
        ),
    );
    assertStrictEquals(
        derivedCollection.some((o) => o.id === objectiveId),
        true,
    );

    const getRes = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + objectiveId, token),
    );
    assertStrictEquals(getRes.status, 200);
    const derivedById = await derivedObjective(
        db, STARK_ORGANIZATION, objectiveId,
    );
    assertStrictEquals(derivedById.state, 'archived');
    assertStrictEquals(
        await getRes.text(),
        await storedPutBodyText(
            db,
            '/organizations/' + STARK_ORGANIZATION
                + '/objectives/',
            objectiveId,
        ),
    );
});

// -- 9. non-lexical live fixtures (byIdAscending craft) --------

Deno.test('live PUTs in non-lexical id order: collection is'
+ ' oldest live head (at, id) first',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    // Insert z, then a, then m — collection is that order.
    const fixtures = [
        { id: OBJ_DRIFT_Z, position: 30 },
        { id: OBJ_DRIFT_A, position: 10 },
        { id: OBJ_DRIFT_M, position: 20 },
    ];
    for (const f of fixtures) {
        const put = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                + f.id, token,
            {
                position: f.position,
                state: 'active',
            },
        ));
        assertStrictEquals(put.status, 201);
        assertEquals(
            await put.json(),
            wireObjectiveGet(
                f.id, f.position, 'active',
                '2026-06-13T00:00:00.000000Z',
                f.id,
            ),
        );
    }
    const res = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            , token),
    );
    assertStrictEquals(res.status, 200);
    const list = await res.json() as { id: string }[];
    const added = list.filter((row) =>
        [
            OBJ_DRIFT_Z, OBJ_DRIFT_A, OBJ_DRIFT_M,
        ].includes(row.id));
    assertEquals(
        added.map((row) => row.id),
        [OBJ_DRIFT_Z, OBJ_DRIFT_A, OBJ_DRIFT_M],
    );
    const prefix = '/organizations/'
        + STARK_ORGANIZATION + '/objectives/';
    for (const row of added) {
        const single = await handleRequest(
            db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                + '' + row.id, token),
        );
        assertStrictEquals(single.status, 200);
        assertStrictEquals(
            await single.text(),
            await storedPutBodyText(db, prefix, row.id),
        );
    }
});

// case-7d mirror for objectives GET: a clock-skewed later
// arrival whose state_at sorts BELOW genesis does NOT
// displace genesis as lifecycle-current. Head body fields
// (position) may reflect the later arrival; the GET trio must
// stay genesis (state ← event.state, state_at ← event.at,
// state_event_id ← event.id).

Deno.test('GET objective trio is lifecycle-current under clock skew'
+ ' (genesis-wins-under-skew, case 7d)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const objectiveId = generateIdentifier();
    const genesisAt = '2026-06-01T00:00:00.000000Z';
    const genesisEv = OBJ_DRIFT_SKEW_1_GENESIS;

    const genesis = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + objectiveId, token, {
            position: 1,
            state: 'active',
        },
    ));
    assertStrictEquals(genesis.status, 201);

    // Later arrival, earlier state_at, different state +
    // position. 'archived' is a live objective state — if
    // it won as current the GET trio would flip; genesis-
    // wins keeps the objective active.
    const skewed = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + objectiveId, token, {
            position: 99,
            state: 'archived',
        },
    ));
    assertStrictEquals(skewed.status, 201);

    const expected = wireObjectiveGet(
        objectiveId, 99, 'archived',
        genesisAt, genesisEv,
    );

    const res = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + objectiveId, token),
    );
    assertStrictEquals(res.status, 200);
    assertEquals(await res.json(), expected);
    assertEquals(
        JSON.parse(await storedPutBodyText(
            db,
            '/organizations/' + STARK_ORGANIZATION
                + '/objectives/',
            objectiveId,
        )),
        expected,
    );

    const derived = await derivedObjective(
        db, STARK_ORGANIZATION, objectiveId,
    );
    assertStrictEquals(
        JSON.stringify(derived), JSON.stringify(expected),
    );
    assertStrictEquals(derived.position, 99);
    assertStrictEquals(derived.state, 'archived');

    const objectives = await derivedObjectives(
        db, STARK_ORGANIZATION,
    );
    const row = objectives.find((o) => o.id === objectiveId);
    assertEquals(row, expected);
});

// -- 10. revision PUT wire equals GET collection entry ---------

Deno.test('revision PUT wire body matches collection derive entry',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const objectiveId = generateIdentifier();
    await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/', token,
        objectiveCreateBody(
            objectiveId, 1, OBJECTIVEID_REV_1, 'n',
            '2026-06-13T00:00:00.000000Z',
        ),
    ));
    const revisionId = OBJECTIVEID_REV_2;
    const body = {
        objective_id: objectiveId,
        name: 'Wire Name',
        description: 'wd',
        member_id: 'XXZruirZyAOoRpNxaDnpSA',
        at: '2026-06-13T00:00:01.000000Z',
    };
    const putRes = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + objectiveId
            + '/revisions/'
            + revisionId,
        token, body,
    ));
    assertStrictEquals(putRes.status, 201);
    const expected: ObjectiveRevisionEntity = {
        id: revisionId,
        ...body,
    };
    assertEquals(await putRes.json(), expected);
    const revs = await deriveObjectiveRevisions(
        db, STARK_ORGANIZATION, objectiveId,
    );
    assert(revs.some((r) => r.id === revisionId));
    const found = revs.find((r) => r.id === revisionId)!;
    assertEquals(found, expected);
});
