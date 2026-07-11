import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { EntityNotFoundError } from '../api/db.ts';
import type {
    Id,
    ObjectiveEntity,
    ObjectiveRevisionEntity,
} from '../api/types.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { canonicalUriPrefix } from '../api/message-pair.ts';
import { documentPairsAt } from '../api/derive-documents.ts';
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
import { parseJson } from '../shared/http-message/json-codec.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import {
    defaultBodyRegistry,
} from '../shared/http-message/media-registry.ts';

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
// reactivate ride PUT /objectives/:id. OBJECTIVES_TEST_WIRING
// mirrors routes.ts's private OBJECTIVES_WIRING so derived
// reads exercise the ACTUAL generic handlers. Nested
// revisions/scores ride bespoke derives (no generic family
// wiring for nests).

const BASE = 'http://localhost';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    return db;
}

const OBJECTIVES_TEST_WIRING: DocumentFamilyWiring = {
    family: 'objectives',
    lifecycle: 'trio',
    notFoundTable: 'objectives',
    validateDocument: validateObjectiveDocumentBody,
    documentOp: postObjectiveDocumentOp,
    entityOf: (document, organization) => ({
        id: document.uriId,
        organization_id: organization,
        position: pickNumber(document.body, 'position'),
    }),
};

const READER_ACTOR: Id = 'drift-reader';

async function derivedObjectives(
    db: MemoryDbAdapter, organization: Id,
): Promise<ObjectiveEntity[]> {
    return documentCollectionGetHandler(OBJECTIVES_TEST_WIRING)(
        db, [], READER_ACTOR, organization,
    ) as Promise<ObjectiveEntity[]>;
}

async function derivedObjective(
    db: MemoryDbAdapter, organization: Id, id: Id,
): Promise<ObjectiveEntity> {
    return documentGetHandler(OBJECTIVES_TEST_WIRING)(
        db, [id], READER_ACTOR, organization,
    ) as Promise<ObjectiveEntity>;
}

function wireObjective(
    id: string,
    position: number,
    organization = STARK_ORGANIZATION,
): ObjectiveEntity {
    return {
        id,
        organization_id: organization,
        position,
    };
}

function decodeRequestMessage(message: string): {
    readonly method: string;
    readonly body: Record<string, unknown>;
} {
    const model = parseJson(message, defaultBodyRegistry());
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
            member_id: 'current', at,
        },
        initialState: 'active',
        initialStateEventId: id + '-active',
        initialStateAt: at,
    };
}

// -- 1. seeded collection wire equals derive -------------------

test('seeded GET /objectives wire equals derive, both orgs'
+ ' (the 4/1 split), plus the empty-collection leg',
async () => {
    const db = await seededDb();

    const tokenStark = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const resStark = await handleRequest(
        db, req('GET', '/objectives', tokenStark),
    );
    assert.equal(resStark.status, 200);
    const starkText = await resStark.text();
    const stark = await derivedObjectives(
        db, STARK_ORGANIZATION,
    );
    assert.equal(starkText, JSON.stringify(stark));
    assert.equal(stark.length, 4);
    assert.deepEqual(
        stark.map((o) => o.id).sort(),
        [...OBJECTIVE_SEEDS.map((s) => s.id)].sort(),
    );

    const tokenTwo = await organizationToken(
        'current', ORGANIZATION_TWO,
    );
    const resTwo = await handleRequest(
        db, req('GET', '/objectives', tokenTwo),
    );
    assert.equal(resTwo.status, 200);
    const org2 = await derivedObjectives(db, ORGANIZATION_TWO);
    assert.equal(await resTwo.text(), JSON.stringify(org2));
    assert.equal(org2.length, 1);
    assert.equal(org2[0]!.id, ORGANIZATION_TWO_OBJECTIVE.id);

    // Empty-collection leg: third organization, zero seeds.
    const THIRD_ORGANIZATION = '3';
    const empty = await derivedObjectives(
        db, THIRD_ORGANIZATION,
    );
    assert.deepEqual(empty, []);
    // Phase Final Stage B: objectives tables retired.
});

// -- 2. per-objective GET wire equals derive; foreign 404 ----

test('per-objective GET wire equals derive (all 5); a'
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
    assert.equal(targets.length, 5);
    for (const t of targets) {
        const token = await organizationToken(
            'current', t.organization,
        );
        const res = await handleRequest(
            db, req('GET', '/objectives/' + t.id, token),
        );
        assert.equal(res.status, 200);
        const wireText = await res.text();
        const derived = await derivedObjective(
            db, t.organization, t.id,
        );
        assert.equal(wireText, JSON.stringify(derived));
        assert.equal(derived.position, t.position);
        assert.equal(
            wireText,
            JSON.stringify(
                wireObjective(
                    t.id, t.position, t.organization,
                ),
            ),
        );
    }

    const foreignId = OBJECTIVE_SEEDS[0]!.id;
    const expectedMessage = 'Not found: objectives/' + foreignId;
    const tokenTwo = await organizationToken(
        'current', ORGANIZATION_TWO,
    );
    const foreignRes = await handleRequest(
        db, req('GET', '/objectives/' + foreignId, tokenTwo),
    );
    assert.equal(foreignRes.status, 404);
    const body = await foreignRes.json() as { error: string };
    assert.equal(body.error, expectedMessage);
    await assert.rejects(
        () => derivedObjective(db, ORGANIZATION_TWO, foreignId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedMessage,
    );
});

// -- 3. revisions wire equals derive ---------------------------

test('revisions GET wire equals derive per objective (all 5,'
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
            'current', organization,
        );
        const path = '/objectives/' + id + '/revisions';
        const res = await handleRequest(
            db, req('GET', path, token),
        );
        assert.equal(res.status, 200);
        const wireText = await res.text();
        const derived = await deriveObjectiveRevisions(
            db, organization, id,
        );
        assert.equal(wireText, JSON.stringify(derived));
        assert.equal(derived.length, 1);
    }

    const foreignId = OBJECTIVE_SEEDS[0]!.id;
    const tokenTwo = await organizationToken(
        'current', ORGANIZATION_TWO,
    );
    const foreignRes = await handleRequest(db, req(
        'GET',
        '/objectives/' + foreignId + '/revisions',
        tokenTwo,
    ));
    assert.equal(foreignRes.status, 200);
    assert.equal(await foreignRes.text(), '[]');
    assert.deepEqual(
        await deriveObjectiveRevisions(
            db, ORGANIZATION_TWO, foreignId,
        ),
        [],
    );
});

// -- 4. score collection wire equals derive --------------------

// Phase Final Task 2: score row halves stripped earlier with
// the projects group — re-home stays wire GET byte identity.
test('score collection wire equals derive per project: an'
+ ' approved project (full 4-baseline coverage + actuals), a'
+ ' partial-coverage live-state project, a submitted project'
+ ' (EMPTY), the org-2 project (empty); whole-org totals (49'
+ ' baselines / 92 actuals); foreign-parent empty', async () => {
    const db = await seededDb();
    const tokenStark = await organizationToken(
        'current', STARK_ORGANIZATION,
    );
    const tokenTwo = await organizationToken(
        'current', ORGANIZATION_TWO,
    );

    const fullCoverageProjectId = 'u6YkHhlGc91oDMkr3x0isa';
    const fullBasePath =
        '/projects/' + fullCoverageProjectId
        + '/objective-baseline-scores';
    const fullActPath =
        '/projects/' + fullCoverageProjectId
        + '/objective-actual-scores';
    const fullBaseRes = await handleRequest(
        db, req('GET', fullBasePath, tokenStark),
    );
    assert.equal(fullBaseRes.status, 200);
    const fullBaseText = await fullBaseRes.text();
    const derivedFullBaselines = await deriveBaselineScores(
        db, STARK_ORGANIZATION, fullCoverageProjectId,
    );
    assert.equal(
        fullBaseText, JSON.stringify(derivedFullBaselines),
    );
    assert.equal(derivedFullBaselines.length, 4);

    const fullActRes = await handleRequest(
        db, req('GET', fullActPath, tokenStark),
    );
    assert.equal(fullActRes.status, 200);
    const derivedFullActuals = await deriveActualScores(
        db, STARK_ORGANIZATION, fullCoverageProjectId,
    );
    assert.equal(
        await fullActRes.text(),
        JSON.stringify(derivedFullActuals),
    );
    assert.equal(derivedFullActuals.length, 5);

    const partialProjectId = 'P04PredMa1ntzyXY010203';
    const partialBaseRes = await handleRequest(db, req(
        'GET',
        '/projects/' + partialProjectId
        + '/objective-baseline-scores',
        tokenStark,
    ));
    assert.equal(partialBaseRes.status, 200);
    const derivedPartialBaselines = await deriveBaselineScores(
        db, STARK_ORGANIZATION, partialProjectId,
    );
    assert.equal(
        await partialBaseRes.text(),
        JSON.stringify(derivedPartialBaselines),
    );
    assert.equal(derivedPartialBaselines.length, 2);
    assert.deepEqual(
        await deriveActualScores(
            db, STARK_ORGANIZATION, partialProjectId,
        ),
        [],
    );

    const submittedProjectId = 'P16MktSent1mentXY01020';
    assert.deepEqual(
        await deriveBaselineScores(
            db, STARK_ORGANIZATION, submittedProjectId,
        ),
        [],
    );
    assert.deepEqual(
        await deriveActualScores(
            db, STARK_ORGANIZATION, submittedProjectId,
        ),
        [],
    );

    const org2ProjectId = 'seed-project-org2';
    assert.deepEqual(
        await deriveBaselineScores(
            db, ORGANIZATION_TWO, org2ProjectId,
        ),
        [],
    );
    assert.deepEqual(
        await deriveActualScores(
            db, ORGANIZATION_TWO, org2ProjectId,
        ),
        [],
    );

    const starkProjectIds = buildProjects().map((p) => p.id);
    assert.equal(starkProjectIds.length, 16);
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
    assert.equal(derivedBaselineTotal.length, 49);
    assert.equal(derivedActualTotal.length, 92);

    const foreignRes = await handleRequest(db, req(
        'GET', fullBasePath, tokenTwo,
    ));
    assert.equal(foreignRes.status, 200);
    assert.equal(await foreignRes.text(), '[]');
    assert.deepEqual(
        await deriveBaselineScores(
            db, ORGANIZATION_TWO, fullCoverageProjectId,
        ),
        [],
    );
});

// -- 5. live-write chain on the pair plane ---------------------

test('live-write chain: create, reposition, revision edit,'
+ ' archive, reactivate, a conversion with 2 baselines, a'
+ ' standalone re-score + actual PUT, and a duplicate create —'
+ ' wire equals derive at every step', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const objectiveId = 'obj-drift-chain-1';

    const beforeCreate = (await db.requests.getAll()).length;
    const created = await handleRequest(db, req(
        'POST', '/objectives', token,
        objectiveCreateBody(
            objectiveId, 50, objectiveId + '-rev-1',
            'Chain Objective', '2026-06-01T00:00:00.000000Z',
        ),
    ));
    assert.equal(created.status, 204);
    assert.equal(
        (await db.requests.getAll()).length, beforeCreate + 3,
    );
    {
        const getRes = await handleRequest(
            db, req('GET', '/objectives/' + objectiveId, token),
        );
        assert.equal(getRes.status, 200);
        const derived = await derivedObjective(
            db, STARK_ORGANIZATION, objectiveId,
        );
        assert.equal(
            await getRes.text(), JSON.stringify(derived),
        );
        assert.equal(derived.position, 50);
        const revRes = await handleRequest(db, req(
            'GET',
            '/objectives/' + objectiveId + '/revisions',
            token,
        ));
        const revs = await deriveObjectiveRevisions(
            db, STARK_ORGANIZATION, objectiveId,
        );
        assert.equal(
            await revRes.text(), JSON.stringify(revs),
        );
        assert.equal(revs.length, 1);
    }

    // Position PUT echoes the genesis trio (putObjectivePosition
    // shape) — same state_event_id so echo-dedup mints no event.
    const reposition = await handleRequest(db, req(
        'PUT', '/objectives/' + objectiveId, token,
        {
            position: 77,
            state: 'active',
            state_at: '2026-06-01T00:00:00.000000Z',
            state_event_id: objectiveId + '-active',
        },
    ));
    assert.equal(reposition.status, 200);
    const repositionResponseId =
        reposition.headers.get('Response-ID');
    assert.ok(repositionResponseId);
    assert.ok(reposition.headers.get('Supersedes'));
    {
        const getRes = await handleRequest(
            db, req('GET', '/objectives/' + objectiveId, token),
        );
        const derived = await derivedObjective(
            db, STARK_ORGANIZATION, objectiveId,
        );
        assert.equal(
            await getRes.text(), JSON.stringify(derived),
        );
        assert.equal(derived.position, 77);
        assert.deepEqual(
            await reposition.json(),
            wireObjective(objectiveId, 77),
        );
    }

    const revisionId2 = objectiveId + '-rev-2';
    const revEdit = await handleRequest(db, req(
        'PUT',
        '/objectives/' + objectiveId + '/revisions/'
            + revisionId2,
        token,
        {
            objective_id: objectiveId,
            name: 'Chain Objective v2',
            description: 'd2', member_id: 'current',
            at: '2026-06-02T00:00:00.000000Z',
        },
    ));
    assert.equal(revEdit.status, 200);
    {
        const revs = await deriveObjectiveRevisions(
            db, STARK_ORGANIZATION, objectiveId,
        );
        assert.equal(revs.length, 2);
        const latestByAt = [...revs].sort((a, b) =>
            a.at < b.at ? -1 : a.at > b.at ? 1 : 0).at(-1)!;
        assert.equal(latestByAt.id, revisionId2);
    }

    // ARCHIVE via PUT /objectives/:id with the archived
    // lifecycle trio — objective STAYS in the collection
    // (trio families exclude only 'deleted'; archived is a
    // live objective state).
    const archived = await handleRequest(db, req(
        'PUT', '/objectives/' + objectiveId, token,
        {
            position: 50,
            state: 'archived',
            state_at: '2026-06-03T00:00:00.000000Z',
            state_event_id: objectiveId + '-archived',
        },
    ));
    assert.equal(archived.status, 200);
    {
        const listRes = await handleRequest(
            db, req('GET', '/objectives', token),
        );
        const list = await listRes.json() as { id: string }[];
        assert.equal(
            list.some((o) => o.id === objectiveId), true,
        );
        const derived = await derivedObjectives(
            db, STARK_ORGANIZATION,
        );
        assert.equal(
            derived.some((o) => o.id === objectiveId), true,
        );
    }

    const reactivated = await handleRequest(db, req(
        'PUT', '/objectives/' + objectiveId, token,
        {
            position: 50,
            state: 'active',
            state_at: '2026-06-04T00:00:00.000000Z',
            state_event_id: objectiveId + '-reactivated',
        },
    ));
    assert.equal(reactivated.status, 200);
    const reactivatedResponseId =
        reactivated.headers.get('Response-ID');
    assert.ok(reactivatedResponseId);
    {
        const getRes = await handleRequest(
            db, req('GET', '/objectives/' + objectiveId, token),
        );
        assert.equal(getRes.status, 200);
    }

    // Conversion with 2 baselines — idea seeded via document
    // PUT (ideas row half already stripped).
    const ideaId = 'idea-drift-chain-1';
    await handleRequest(db, req(
        'PUT', '/ideas/' + ideaId, token, {
            title: 'Chain Idea', position: 1,
            problem_statement: 'p', target_users: 't',
            proposed_solution: 's', expected_outcome: 'o',
            success_metrics: 'm',
            state: 'approved',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'idea-drift-chain-1-approved',
        },
    ));
    const projectId = 'proj-drift-chain-1';
    const baselineIdA = 'bl-drift-chain-1-a';
    const baselineIdB = 'bl-drift-chain-1-b';
    const secondObjectiveId = OBJECTIVE_SEEDS[0]!.id;
    const beforeConversion = (await db.requests.getAll()).length;
    const conversion = await handleRequest(db, req(
        'POST', '/ideas/' + ideaId + '/conversion', token, {
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
            ideaStateEventId: 'idea-drift-chain-1-promoted',
            ideaState: 'promoted',
            projectStateEventId: 'proj-drift-chain-1-init',
            projectState: 'submitted',
            ideaStateAt: '2026-06-05T00:00:00.000000Z',
            projectStateAt: '2026-06-05T00:00:01.000000Z',
            baselines: [
                {
                    id: baselineIdA,
                    fields: {
                        project_id: projectId,
                        objective_id: objectiveId, score: 10,
                        member_id: 'current',
                        at: '2026-06-05T00:00:02.000000Z',
                    },
                },
                {
                    id: baselineIdB,
                    fields: {
                        project_id: projectId,
                        objective_id: secondObjectiveId,
                        score: -10, member_id: 'current',
                        at: '2026-06-05T00:00:03.000000Z',
                    },
                },
            ],
        },
    ));
    assert.equal(conversion.status, 204);
    assert.equal(
        (await db.requests.getAll()).length,
        beforeConversion + 5,
    );
    const basePath =
        '/projects/' + projectId
        + '/objective-baseline-scores';
    const baseRes = await handleRequest(
        db, req('GET', basePath, token),
    );
    assert.equal(baseRes.status, 200);
    const derivedBaselinesAfterConversion =
        await deriveBaselineScores(
            db, STARK_ORGANIZATION, projectId,
        );
    assert.equal(
        await baseRes.text(),
        JSON.stringify(derivedBaselinesAfterConversion),
    );
    assert.equal(derivedBaselinesAfterConversion.length, 2);

    const baselineIdC = 'bl-drift-chain-1-c';
    const standaloneBaseline = await handleRequest(db, req(
        'PUT',
        '/projects/' + projectId
        + '/objective-baseline-scores/' + baselineIdC,
        token, {
            project_id: projectId, objective_id: objectiveId,
            score: 20, member_id: 'current',
            at: '2026-06-06T00:00:00.000000Z',
        },
    ));
    assert.equal(standaloneBaseline.status, 200);
    const actualIdA = 'as-drift-chain-1-a';
    const standaloneActual = await handleRequest(db, req(
        'PUT',
        '/projects/' + projectId
        + '/objective-actual-scores/' + actualIdA,
        token, {
            project_id: projectId, objective_id: objectiveId,
            score: 30, member_id: 'current',
            at: '2026-06-06T00:00:01.000000Z',
        },
    ));
    assert.equal(standaloneActual.status, 200);

    const baseFinalRes = await handleRequest(
        db, req('GET', basePath, token),
    );
    const derivedBaselinesFinal = await deriveBaselineScores(
        db, STARK_ORGANIZATION, projectId,
    );
    assert.equal(
        await baseFinalRes.text(),
        JSON.stringify(derivedBaselinesFinal),
    );
    assert.equal(derivedBaselinesFinal.length, 3);

    const actPath =
        '/projects/' + projectId
        + '/objective-actual-scores';
    const actFinalRes = await handleRequest(
        db, req('GET', actPath, token),
    );
    const derivedActualsFinal = await deriveActualScores(
        db, STARK_ORGANIZATION, projectId,
    );
    assert.equal(
        await actFinalRes.text(),
        JSON.stringify(derivedActualsFinal),
    );
    assert.equal(derivedActualsFinal.length, 1);

    // Duplicate create — same id, fresh revisionId.
    // Entity-address pairs before: create op + create doc +
    // reposition + archive + reactivate = 5 (archive/reactivate
    // ride PUT /objectives/:id after states-address retirement).
    const revisionId3 = objectiveId + '-rev-3';
    const objectivesPrefix = canonicalUriPrefix(
        STARK_ORGANIZATION, '/objectives/',
    );
    const beforeDuplicateIds = new Set(
        (
            await db.responses.getAllWhere(
                'uri_prefix', objectivesPrefix,
            )
        ).filter((r) => r.uri_id === objectiveId)
            .map((r) => r.id),
    );
    assert.equal(beforeDuplicateIds.size, 5);

    const duplicate = await handleRequest(db, req(
        'POST', '/objectives', token,
        objectiveCreateBody(
            objectiveId, 88, revisionId3,
            'Chain Objective v3', '2026-06-07T00:00:00.000000Z',
        ),
    ));
    assert.equal(duplicate.status, 204);
    // Supersedes the latest prior entity-address response
    // (reactivate), not the earlier reposition.
    assert.equal(
        duplicate.headers.get('Supersedes'),
        reactivatedResponseId,
    );

    const [afterRequests, afterResponses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', objectivesPrefix),
        db.responses.getAllWhere('uri_prefix', objectivesPrefix),
    ]);
    const afterAtAddress = afterResponses.filter(
        (r) => r.uri_id === objectiveId,
    );
    assert.equal(afterAtAddress.length, 7);
    const newRows = afterAtAddress.filter(
        (r) => !beforeDuplicateIds.has(r.id),
    );
    assert.equal(newRows.length, 2);
    for (const row of newRows) {
        assert.equal(row.supersedes, reactivatedResponseId);
    }
    const documentPairsAfter = documentPairsAt(
        afterRequests, afterResponses, objectivesPrefix,
    ).filter((pair) => pair.uriId === objectiveId);
    // create doc + reposition + archive + reactivate +
    // duplicate create's document = 5
    assert.equal(documentPairsAfter.length, 5);
    const newestDocumentPair = documentPairsAfter.at(-1)!;
    const newestDocumentResponseRow = afterAtAddress.find(
        (r) => r.id === newestDocumentPair.id,
    )!;
    assert.equal(
        newestDocumentResponseRow.supersedes,
        reactivatedResponseId,
    );

    const finalGet = await handleRequest(
        db, req('GET', '/objectives/' + objectiveId, token),
    );
    const finalObjective = await derivedObjective(
        db, STARK_ORGANIZATION, objectiveId,
    );
    assert.equal(
        await finalGet.text(), JSON.stringify(finalObjective),
    );
    assert.equal(finalObjective.position, 88);
});

// -- 6. method-filter: create POST is never the document head -

test('the create-op POST pair is not read as a document pair —'
+ ' the create body and the document body share zero top-level'
+ ' keys; exactly one PUT pair lands at the objective address'
+ ' after create', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const objectiveId = 'obj-drift-method-filter-1';

    const created = await handleRequest(db, req(
        'POST', '/objectives', token,
        objectiveCreateBody(
            objectiveId, 1, objectiveId + '-rev-1', 'n',
            '2026-06-10T00:00:00.000000Z',
        ),
    ));
    assert.equal(created.status, 204);

    const prefix = canonicalUriPrefix(
        STARK_ORGANIZATION, '/objectives/',
    );
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    const atAddress = requests.filter(
        (r) => r.uri_prefix === prefix
            && r.uri_id === objectiveId,
    );
    assert.equal(atAddress.length, 2);

    const documentPairs = documentPairsAt(
        requests, responses, prefix,
    ).filter((pair) => pair.uriId === objectiveId);
    assert.equal(documentPairs.length, 1);
    assert.equal(documentPairs[0]!.method, 'PUT');

    const postRow = atAddress.find(
        (r) => decodeRequestMessage(r.message).method === 'POST',
    )!;
    const createBodyKeys = new Set(
        Object.keys(decodeRequestMessage(postRow.message).body),
    );
    const documentBodyKeys = new Set(
        Object.keys(documentPairs[0]!.body),
    );
    const overlap = [...createBodyKeys].filter(
        (key) => documentBodyKeys.has(key),
    );
    assert.deepEqual(overlap, []);
});

// -- 7. resend idempotency -------------------------------------

test('resend idempotency: a byte-identical position-PUT resend'
+ ' replays the stored response and appends NO second pair',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const objectiveId = 'obj-drift-resend-1';

    await handleRequest(db, req(
        'POST', '/objectives', token,
        objectiveCreateBody(
            objectiveId, 5, objectiveId + '-rev-1', 'n',
            '2026-06-11T00:00:00.000000Z',
        ),
    ));

    // Position body carries the echoed genesis trio — required
    // by the document gate after states-address retirement.
    const positionBody = {
        position: 99,
        state: 'active' as const,
        state_at: '2026-06-11T00:00:00.000000Z',
        state_event_id: objectiveId + '-active',
    };
    const beforeReposition = (await db.requests.getAll()).length;
    const first = await handleRequest(db, req(
        'PUT', '/objectives/' + objectiveId, token,
        positionBody,
    ));
    assert.equal(first.status, 200);
    const afterFirst = (await db.requests.getAll()).length;
    assert.equal(afterFirst, beforeReposition + 1);

    const second = await handleRequest(db, req(
        'PUT', '/objectives/' + objectiveId, token,
        positionBody,
    ));
    assert.equal(second.status, 200);
    const afterSecond = (await db.requests.getAll()).length;
    assert.equal(afterSecond, afterFirst);
    assert.equal(
        first.headers.get('Response-ID'),
        second.headers.get('Response-ID'),
    );

    const getRes = await handleRequest(
        db, req('GET', '/objectives/' + objectiveId, token),
    );
    const derived = await derivedObjective(
        db, STARK_ORGANIZATION, objectiveId,
    );
    assert.equal(await getRes.text(), JSON.stringify(derived));
    assert.equal(derived.position, 99);
});

// -- 8. THE ARCHIVED-INCLUSION PIN -----------------------------

test('THE ARCHIVED-INCLUSION PIN: an objective with a live'
+ " 'archived' document-plane event appears in GET /objectives"
+ ' AND GET objectives/:id 200 — archived is NOT deleted;'
+ " trio families exclude only state='deleted'",
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const objectiveId = 'obj-drift-archived-1';

    await handleRequest(db, req(
        'POST', '/objectives', token,
        objectiveCreateBody(
            objectiveId, 1, objectiveId + '-rev-1', 'n',
            '2026-06-12T00:00:00.000000Z',
        ),
    ));
    const archived = await handleRequest(db, req(
        'PUT', '/objectives/' + objectiveId, token,
        {
            position: 1,
            state: 'archived',
            state_at: '2026-06-12T00:00:01.000000Z',
            state_event_id: objectiveId + '-archived',
        },
    ));
    assert.equal(archived.status, 200);

    const listRes = await handleRequest(
        db, req('GET', '/objectives', token),
    );
    assert.equal(listRes.status, 200);
    const listText = await listRes.text();
    const derivedCollection = await derivedObjectives(
        db, STARK_ORGANIZATION,
    );
    assert.equal(listText, JSON.stringify(derivedCollection));
    assert.equal(
        derivedCollection.some((o) => o.id === objectiveId),
        true,
    );

    const getRes = await handleRequest(
        db, req('GET', '/objectives/' + objectiveId, token),
    );
    assert.equal(getRes.status, 200);
    const derivedById = await derivedObjective(
        db, STARK_ORGANIZATION, objectiveId,
    );
    assert.equal(
        await getRes.text(), JSON.stringify(derivedById),
    );
});

// -- 9. non-lexical live fixtures (byIdAscending craft) --------

test('live PUTs in non-lexical id order: collection is'
+ ' id-lex ordered, not insertion order',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    // Insert z, then a, then m — collection must return a, m, z.
    const fixtures = [
        { id: 'obj-drift-z', position: 30 },
        { id: 'obj-drift-a', position: 10 },
        { id: 'obj-drift-m', position: 20 },
    ];
    for (const f of fixtures) {
        const put = await handleRequest(db, req(
            'PUT', '/objectives/' + f.id, token,
            {
                position: f.position,
                state: 'active',
                state_at: '2026-06-13T00:00:00.000000Z',
                state_event_id: f.id + '-active',
            },
        ));
        assert.equal(put.status, 200);
        assert.deepEqual(
            await put.json(),
            wireObjective(f.id, f.position),
        );
    }
    const expectedAdded = [
        wireObjective('obj-drift-a', 10),
        wireObjective('obj-drift-m', 20),
        wireObjective('obj-drift-z', 30),
    ];
    const res = await handleRequest(
        db, req('GET', '/objectives', token),
    );
    assert.equal(res.status, 200);
    const list = await res.json() as { id: string }[];
    const added = list.filter((row) =>
        row.id.startsWith('obj-drift-'));
    assert.equal(
        JSON.stringify(added),
        JSON.stringify(expectedAdded),
    );
    for (const row of expectedAdded) {
        const single = await handleRequest(
            db, req('GET', '/objectives/' + row.id, token),
        );
        assert.equal(single.status, 200);
        assert.equal(
            await single.text(), JSON.stringify(row),
        );
    }
});

// -- 10. revision PUT wire equals GET collection entry ---------

test('revision PUT wire body matches collection derive entry',
async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const objectiveId = 'obj-drift-rev-wire-1';
    await handleRequest(db, req(
        'POST', '/objectives', token,
        objectiveCreateBody(
            objectiveId, 1, objectiveId + '-rev-1', 'n',
            '2026-06-13T00:00:00.000000Z',
        ),
    ));
    const revisionId = objectiveId + '-rev-2';
    const body = {
        objective_id: objectiveId,
        name: 'Wire Name',
        description: 'wd',
        member_id: 'current',
        at: '2026-06-13T00:00:01.000000Z',
    };
    const putRes = await handleRequest(db, req(
        'PUT',
        '/objectives/' + objectiveId + '/revisions/'
            + revisionId,
        token, body,
    ));
    assert.equal(putRes.status, 200);
    const expected: ObjectiveRevisionEntity = {
        id: revisionId,
        ...body,
    };
    assert.deepEqual(await putRes.json(), expected);
    const revs = await deriveObjectiveRevisions(
        db, STARK_ORGANIZATION, objectiveId,
    );
    assert.ok(revs.some((r) => r.id === revisionId));
    const found = revs.find((r) => r.id === revisionId)!;
    assert.deepEqual(found, expected);
});
