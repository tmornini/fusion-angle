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
import { organizationScopedAdapter } from
    '../api/db-organization-scoped.ts';
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

// The E10 drift check (Phase 7 Task 6): message-derived reads
// proven equal to the old-table-derived reads Task 7 flips onto
// them. NOTHING reads the pairs in production yet — this file
// alone gates that flip; it stays as a regression guard through
// Phase Final.
//
// Objectives are the THIRD 'stateless' family (Author gate 3 —
// the SECOND named partial amendment to Decision 7), and the
// FIRST whose own entity/collection reads are the GENERIC
// handlers by design — OBJECTIVES_WIRING IS that derivation; no
// lifecycle/history module exists for this family, unlike
// records' full trio walk. This file hand-builds
// OBJECTIVES_TEST_WIRING, a byte-for-byte mirror of routes.ts's
// module-private OBJECTIVES_WIRING row (the drift-records
// RECORDS_TEST_WIRING precedent), so cases 1/2/6/8 exercise the
// ACTUAL generic handlers (documentCollectionGetHandler/
// documentGetHandler) — the same code path Task 7 wires live,
// never a reimplementation. The two nested sub-resources
// (revisions, project-scores) have no generic handler to ride at
// all (research finding 10: the generic reads serve only a
// FAMILY-ROOTED prefix) — deriveObjectiveRevisions and
// deriveBaselineScores/deriveActualScores are the bespoke
// modules this task adds, the deriveFlowRecords structural
// mirror.
//
// H7: id-lex explicit sorts are IndexedDB-invisible (a native
// index scan already returns primary-key order) and memory-tier
// load-bearing (the memory/localStorage backends are arrival-
// ordered) — every list comparison below normalizes the OLD side
// to id-lex; the derived side is already id-lex by construction
// (byIdAscending, shared by every generic read path and the two
// modules this file drift-proves).
//
// The states/:id escape hatch (objectives edition) is a NAMED
// divergence acceptance (Author gate 3's watch-point) and is NOT
// drift-tested here: a hand-crafted 'deleted' event posted
// through the generic states route would hide an objective
// old-plane while the derived read still shows it — nothing
// typed can produce a 'deleted' objective state (the alphabet
// excludes it), so this is a WEAKER risk than the trio families'
// own escape hatch, but it rides the exit checklist as a
// watch-point for the states-consumers flip rather than a pinned
// parity assertion here.

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

function sortById<T extends { id: string }>(
    rows: readonly T[],
): T[] {
    return [...rows].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    return db;
}

// -- test-side wiring mirror (routes.ts's private OBJECTIVES_ ---
// -- WIRING row, by content) -------------------------------------

const OBJECTIVES_TEST_WIRING: DocumentFamilyWiring = {
    family: 'objectives',
    lifecycle: 'stateless',
    notFoundTable: 'objectives',
    validateDocument: validateObjectiveDocumentBody,
    documentOp: postObjectiveDocumentOp,
    entityOf: (document, organization) => ({
        id: document.uriId,
        organization_id: organization,
        position: pickNumber(document.body, 'position'),
    }),
};

// Any Id works here — both generic read paths ignore their
// `actor` argument entirely.
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

async function assertObjectiveParity(
    db: MemoryDbAdapter, organization: Id, id: Id,
): Promise<void> {
    const derived = await derivedObjective(db, organization, id);
    const old = await organizationScopedAdapter(
        db, organization,
    ).objectives.getById(id);
    assert.deepEqual(derived, old);
}

async function assertRevisionsParity(
    db: MemoryDbAdapter, organization: Id, id: Id,
): Promise<ObjectiveRevisionEntity[]> {
    const derived = sortById(
        await deriveObjectiveRevisions(db, organization, id),
    );
    const old = sortById(
        await organizationScopedAdapter(db, organization)
            .objectiveRevisions.getAllWhere('objective_id', id),
    );
    assert.deepEqual(derived, old);
    return derived;
}

// -- decode helper (mirrors tests/drift-records.test.ts's own ---
// -- decodeRequestMessage) ---------------------------------------

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
    };
}

// -- 1. objectives collection parity, both orgs (the 4/1 -------
// -- split), plus the empty-collection leg -----------------------

test('objectives collection: message-derived equals old-table-'
+ 'derived, both orgs (the 4/1 split), plus the empty-'
+ 'collection leg for a third organization', async () => {
    const db = await seededDb();

    const stark = sortById(
        await derivedObjectives(db, STARK_ORGANIZATION),
    );
    const starkOld = sortById(
        await organizationScopedAdapter(db, STARK_ORGANIZATION)
            .objectives.getAll(),
    );
    assert.deepEqual(stark, starkOld);
    assert.equal(stark.length, 4);
    assert.deepEqual(
        stark.map((o) => o.id).sort(),
        [...OBJECTIVE_SEEDS.map((s) => s.id)].sort(),
    );

    const org2 = sortById(
        await derivedObjectives(db, ORGANIZATION_TWO),
    );
    const org2Old = sortById(
        await organizationScopedAdapter(db, ORGANIZATION_TWO)
            .objectives.getAll(),
    );
    assert.deepEqual(org2, org2Old);
    assert.equal(org2.length, 1);
    assert.equal(org2[0]!.id, ORGANIZATION_TWO_OBJECTIVE.id);

    // The empty-collection leg (verification finding, drift
    // lens): a third organization id, zero seeded objectives —
    // both planes empty.
    const THIRD_ORGANIZATION = '3';
    const empty = await derivedObjectives(db, THIRD_ORGANIZATION);
    const emptyOld = await organizationScopedAdapter(
        db, THIRD_ORGANIZATION,
    ).objectives.getAll();
    assert.deepEqual(empty, []);
    assert.deepEqual(emptyOld, []);
});

// -- 2. per-objective getById parity (all 5); foreign-org -------
// -- getById 404 parity, byte-equal body --------------------------

test('per-objective getById parity (all 5); a foreign-org'
+ ' getById 404s identically on both planes, byte-equal body',
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
    assert.equal(targets.length, 5);
    for (const { id, organization } of targets) {
        const derived = await derivedObjective(
            db, organization, id,
        );
        const old = await organizationScopedAdapter(
            db, organization,
        ).objectives.getById(id);
        assert.deepEqual(derived, old);
    }

    const foreignId = OBJECTIVE_SEEDS[0]!.id;
    const expectedMessage = 'Not found: objectives/' + foreignId;
    await assert.rejects(
        () => derivedObjective(db, ORGANIZATION_TWO, foreignId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedMessage,
    );
    await assert.rejects(
        () => organizationScopedAdapter(db, ORGANIZATION_TWO)
            .objectives.getById(foreignId),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.message === expectedMessage,
    );
});

// -- 3. revisions parity per objective (all 5, one seeded -------
// -- revision each); foreign-parent nested-collection parity ----

test('revisions parity per objective (all 5, one seeded'
+ ' revision each); the foreign-parent nested-collection read'
+ ' is 200 [] on both planes', async () => {
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
        const revisions = await assertRevisionsParity(
            db, organization, id,
        );
        assert.equal(revisions.length, 1);
    }

    // The foreign-parent read (research finding 12): a Stark
    // objective's revisions, scoped to org 2 — 200 [] on both
    // planes (the api-organization-isolation.test.ts LEAF_CASES
    // precedent, re-proven here at drift altitude).
    const foreignId = OBJECTIVE_SEEDS[0]!.id;
    const derivedForeign = await deriveObjectiveRevisions(
        db, ORGANIZATION_TWO, foreignId,
    );
    const oldForeign = await organizationScopedAdapter(
        db, ORGANIZATION_TWO,
    ).objectiveRevisions.getAllWhere('objective_id', foreignId);
    assert.deepEqual(derivedForeign, []);
    assert.deepEqual(oldForeign, []);
});

// -- 4. score collection parity per project; whole-org totals; --
// -- foreign-parent parity ----------------------------------------

test('score collection parity per project: an approved project'
+ ' (full 4-baseline coverage + actuals), a partial-coverage'
+ ' live-state project, a submitted project (both planes'
+ ' EMPTY), the org-2 project (empty); whole-org totals (49'
+ ' baselines / 92 actuals); foreign-parent parity', async () => {
    const db = await seededDb();

    // Full coverage, approved: 'AI-Powered Customer
    // Segmentation' — 4 baselines (every seeded objective), 5
    // actuals (verified by content, buildSeedScoreRows over the
    // seed's own project/state data).
    const fullCoverageProjectId = 'u6YkHhlGc91oDMkr3x0isa';
    const derivedFullBaselines = sortById(
        await deriveBaselineScores(
            db, STARK_ORGANIZATION, fullCoverageProjectId,
        ),
    );
    const oldFullBaselines = sortById(
        await organizationScopedAdapter(db, STARK_ORGANIZATION)
            .projectObjectiveBaselineScores.getAllWhere(
                'project_id', fullCoverageProjectId,
            ),
    );
    assert.equal(derivedFullBaselines.length, 4);
    assert.deepEqual(derivedFullBaselines, oldFullBaselines);

    const derivedFullActuals = sortById(
        await deriveActualScores(
            db, STARK_ORGANIZATION, fullCoverageProjectId,
        ),
    );
    const oldFullActuals = sortById(
        await organizationScopedAdapter(db, STARK_ORGANIZATION)
            .projectObjectiveActualScores.getAllWhere(
                'project_id', fullCoverageProjectId,
            ),
    );
    assert.equal(derivedFullActuals.length, 5);
    assert.deepEqual(derivedFullActuals, oldFullActuals);

    // Partial coverage, a live state ('under_review'):
    // 'Predictive Maintenance System' — 2 baselines (the
    // deterministic-partial coverage a non-approved/archived
    // state draws), 0 actuals (actuals require approved/
    // archived).
    const partialProjectId = 'P04PredMa1ntzyXY010203';
    const derivedPartialBaselines = sortById(
        await deriveBaselineScores(
            db, STARK_ORGANIZATION, partialProjectId,
        ),
    );
    const oldPartialBaselines = sortById(
        await organizationScopedAdapter(db, STARK_ORGANIZATION)
            .projectObjectiveBaselineScores.getAllWhere(
                'project_id', partialProjectId,
            ),
    );
    assert.equal(derivedPartialBaselines.length, 2);
    assert.deepEqual(derivedPartialBaselines, oldPartialBaselines);
    assert.deepEqual(
        await deriveActualScores(
            db, STARK_ORGANIZATION, partialProjectId,
        ),
        [],
    );

    // A submitted project — both planes EMPTY (the scoring loop
    // skips 'submitted'/'declined'/'deleted' entirely).
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

    // The org-2 project — also 'submitted' (empty), AND in the
    // other organization.
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

    // Whole-org totals: every Stark project's derived score
    // reads, summed — 49 baselines / 92 actuals — byte-equal to
    // the old plane's org-wide getAll() (ParentScopedEntityStore
    // resolves each row's owning org through its parent
    // project, so getAll() here is genuinely org-wide, not
    // per-project).
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
    const oldBaselineTotal = await organizationScopedAdapter(
        db, STARK_ORGANIZATION,
    ).projectObjectiveBaselineScores.getAll();
    const oldActualTotal = await organizationScopedAdapter(
        db, STARK_ORGANIZATION,
    ).projectObjectiveActualScores.getAll();
    assert.equal(derivedBaselineTotal.length, 49);
    assert.equal(oldBaselineTotal.length, 49);
    assert.deepEqual(
        sortById(derivedBaselineTotal), sortById(oldBaselineTotal),
    );
    assert.equal(derivedActualTotal.length, 92);
    assert.equal(oldActualTotal.length, 92);
    assert.deepEqual(
        sortById(derivedActualTotal), sortById(oldActualTotal),
    );

    // Foreign-parent parity: a Stark project's scores, scoped to
    // org 2 — 200 [] on both planes.
    const derivedForeignBaselines = await deriveBaselineScores(
        db, ORGANIZATION_TWO, fullCoverageProjectId,
    );
    const oldForeignBaselines = await organizationScopedAdapter(
        db, ORGANIZATION_TWO,
    ).projectObjectiveBaselineScores.getAllWhere(
        'project_id', fullCoverageProjectId,
    );
    assert.deepEqual(derivedForeignBaselines, []);
    assert.deepEqual(oldForeignBaselines, []);
});

// -- 5. live-write chain, re-compared on both planes at every ---
// -- step -----------------------------------------------------------

test('live-write chain: create, reposition, revision edit,'
+ ' archive, reactivate, a conversion with 2 baselines, a'
+ ' standalone re-score + actual PUT, and a duplicate create —'
+ ' re-compared on both planes at every step', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const objectiveId = 'obj-drift-chain-1';

    // Step 1: create — bundle balance 3 (operation + document +
    // revision pairs); derived collection + revisions see it
    // immediately (the synthesis proof).
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
    await assertObjectiveParity(db, STARK_ORGANIZATION, objectiveId);
    const parity1 = await assertRevisionsParity(
        db, STARK_ORGANIZATION, objectiveId,
    );
    assert.equal(parity1.length, 1);
    const created1 = await derivedObjective(
        db, STARK_ORGANIZATION, objectiveId,
    );
    assert.equal(created1.position, 50);

    // Step 2: reposition PUT (Supersedes; derived position
    // updates). A DISTINCT position value from create (the E6
    // fold discipline): a no-change resend would replay-skip,
    // never forming the Supersedes chain this step proves.
    const reposition = await handleRequest(db, req(
        'PUT', '/objectives/' + objectiveId, token,
        { position: 77 },
    ));
    assert.equal(reposition.status, 200);
    const repositionResponseId =
        reposition.headers.get('Response-ID');
    assert.ok(repositionResponseId);
    assert.ok(reposition.headers.get('Supersedes'));
    await assertObjectiveParity(db, STARK_ORGANIZATION, objectiveId);
    const repositioned = await derivedObjective(
        db, STARK_ORGANIZATION, objectiveId,
    );
    assert.equal(repositioned.position, 77);

    // Step 3: revision edit — a FRESH revision id (genesis at
    // its own nested address), a later `at` than genesis. Both
    // revisions now derive; the one with the greatest `at` is
    // the new one (the definition reducer's own pick, exercised
    // downstream of this module).
    const revisionId2 = objectiveId + '-rev-2';
    const revEdit = await handleRequest(db, req(
        'PUT',
        '/objectives/' + objectiveId + '/revisions/' + revisionId2,
        token,
        {
            objective_id: objectiveId, name: 'Chain Objective v2',
            description: 'd2', member_id: 'current',
            at: '2026-06-02T00:00:00.000000Z',
        },
    ));
    assert.equal(revEdit.status, 200);
    const parity2 = await assertRevisionsParity(
        db, STARK_ORGANIZATION, objectiveId,
    );
    assert.equal(parity2.length, 2);
    const latestByAt = [...parity2].sort((a, b) =>
        a.at < b.at ? -1 : a.at > b.at ? 1 : 0).at(-1)!;
    assert.equal(latestByAt.id, revisionId2);

    // Step 4: ARCHIVE via the postStateEvent path (a live PUT
    // /states/:id, the wire-reachable route for ANY entity's
    // lifecycle event) — GET /objectives parity: the objective
    // STAYS in the collection on BOTH planes (the stateless
    // election's standing proof, Author gate 3).
    const archived = await handleRequest(db, req(
        'PUT', '/states/' + objectiveId + '-archived', token,
        {
            entity_id: objectiveId, state: 'archived',
            at: '2026-06-03T00:00:00.000000Z',
        },
    ));
    assert.equal(archived.status, 200);
    await assertObjectiveParity(db, STARK_ORGANIZATION, objectiveId);
    const afterArchiveDerived = await derivedObjectives(
        db, STARK_ORGANIZATION,
    );
    const afterArchiveOld = await organizationScopedAdapter(
        db, STARK_ORGANIZATION,
    ).objectives.getAll();
    assert.equal(
        afterArchiveDerived.some((o) => o.id === objectiveId),
        true,
    );
    assert.equal(
        afterArchiveOld.some((o) => o.id === objectiveId), true,
    );

    // Step 5: reactivate — parity again; states rows exist but
    // objectives reads never consult them.
    const reactivated = await handleRequest(db, req(
        'PUT', '/states/' + objectiveId + '-reactivated', token,
        {
            entity_id: objectiveId, state: 'active',
            at: '2026-06-04T00:00:00.000000Z',
        },
    ));
    assert.equal(reactivated.status, 200);
    await assertObjectiveParity(db, STARK_ORGANIZATION, objectiveId);

    // Step 6: a conversion with 2 baselines (balance 3+2; the
    // idea-conversion bundle's per-baseline synthesized pairs) —
    // derived baselines see both rows byte-equal. The source
    // idea is seeded below-facade (a fixture for THIS step, not
    // itself under drift proof here — ideas' own drift file
    // covers that family).
    await db.ideas.put('idea-drift-chain-1', {
        organization_id: STARK_ORGANIZATION,
        title: 'Chain Idea', position: 1,
        problem_statement: 'p', target_users: 't',
        proposed_solution: 's', expected_outcome: 'o',
        success_metrics: 'm',
    });
    await db.states.postEvent(
        'idea-drift-chain-1-approved', 'idea-drift-chain-1',
        'approved', 'system', '2026-01-01T00:00:00.000000Z',
    );
    const projectId = 'proj-drift-chain-1';
    const baselineIdA = 'bl-drift-chain-1-a';
    const baselineIdB = 'bl-drift-chain-1-b';
    const secondObjectiveId = OBJECTIVE_SEEDS[0]!.id;
    const beforeConversion = (await db.requests.getAll()).length;
    const conversion = await handleRequest(db, req(
        'POST', '/ideas/idea-drift-chain-1/conversion', token, {
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
    const derivedBaselinesAfterConversion = sortById(
        await deriveBaselineScores(
            db, STARK_ORGANIZATION, projectId,
        ),
    );
    const oldBaselinesAfterConversion = sortById(
        await organizationScopedAdapter(db, STARK_ORGANIZATION)
            .projectObjectiveBaselineScores.getAllWhere(
                'project_id', projectId,
            ),
    );
    assert.equal(derivedBaselinesAfterConversion.length, 2);
    assert.deepEqual(
        derivedBaselinesAfterConversion, oldBaselinesAfterConversion,
    );

    // Step 7: a standalone baseline re-score + one actual PUT —
    // derived sees both.
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

    const derivedBaselinesFinal = sortById(
        await deriveBaselineScores(
            db, STARK_ORGANIZATION, projectId,
        ),
    );
    const oldBaselinesFinal = sortById(
        await organizationScopedAdapter(db, STARK_ORGANIZATION)
            .projectObjectiveBaselineScores.getAllWhere(
                'project_id', projectId,
            ),
    );
    assert.equal(derivedBaselinesFinal.length, 3);
    assert.deepEqual(derivedBaselinesFinal, oldBaselinesFinal);

    const derivedActualsFinal = sortById(
        await deriveActualScores(
            db, STARK_ORGANIZATION, projectId,
        ),
    );
    const oldActualsFinal = sortById(
        await organizationScopedAdapter(db, STARK_ORGANIZATION)
            .projectObjectiveActualScores.getAllWhere(
                'project_id', projectId,
            ),
    );
    assert.equal(derivedActualsFinal.length, 1);
    assert.deepEqual(derivedActualsFinal, oldActualsFinal);

    // Step 8: duplicate objective create — same id, fresh
    // revisionId. ONE row both planes; the new document pair
    // Supersedes the CURRENT head (the reposition pair, the last
    // document-class write at this address before this step —
    // no state-log write ever visits the document address, so
    // steps 4/5 left the head unchanged since step 2); the
    // operation pair's OWN target is the SAME head (pinned via
    // its own Supersedes header, proving both of THIS create's
    // pairs were computed from one pre-tx read).
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
    assert.equal(beforeDuplicateIds.size, 3);

    const duplicate = await handleRequest(db, req(
        'POST', '/objectives', token,
        objectiveCreateBody(
            objectiveId, 88, revisionId3,
            'Chain Objective v3', '2026-06-07T00:00:00.000000Z',
        ),
    ));
    assert.equal(duplicate.status, 204);
    // The operation pair's own target (via its wire headers) —
    // "the operation pair's target pinned too".
    assert.equal(
        duplicate.headers.get('Supersedes'), repositionResponseId,
    );

    const [afterRequests, afterResponses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', objectivesPrefix),
        db.responses.getAllWhere('uri_prefix', objectivesPrefix),
    ]);
    const afterAtAddress = afterResponses.filter(
        (r) => r.uri_id === objectiveId,
    );
    assert.equal(afterAtAddress.length, 5);
    const newRows = afterAtAddress.filter(
        (r) => !beforeDuplicateIds.has(r.id),
    );
    assert.equal(newRows.length, 2);
    // BOTH of this create's pairs (operation + document) target
    // the SAME pre-tx head-read.
    for (const row of newRows) {
        assert.equal(row.supersedes, repositionResponseId);
    }
    // The document pair specifically, identified through the
    // SAME reduction the live gate uses (documentPairsAt),
    // confirms its own Supersedes independently of the header
    // check above.
    const documentPairsAfter = documentPairsAt(
        afterRequests, afterResponses, objectivesPrefix,
    ).filter((pair) => pair.uriId === objectiveId);
    assert.equal(documentPairsAfter.length, 3);
    const newestDocumentPair = documentPairsAfter.at(-1)!;
    const newestDocumentResponseRow = afterAtAddress.find(
        (r) => r.id === newestDocumentPair.id,
    )!;
    assert.equal(
        newestDocumentResponseRow.supersedes, repositionResponseId,
    );

    await assertObjectiveParity(db, STARK_ORGANIZATION, objectiveId);
    const finalObjective = await derivedObjective(
        db, STARK_ORGANIZATION, objectiveId,
    );
    assert.equal(finalObjective.position, 88);
});

// -- 6. method-filter: the create's POST pair is never the ------
// -- derived head --------------------------------------------------

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
    // Both an operation (POST, 204) pair and a document (PUT)
    // pair share the SAME uriId (the create-body-id-field
    // override).
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
    // The create body's top-level keys ({id, objective,
    // revisionId, revision}) share ZERO names with the document
    // body's ({position}) — a leaked operation pair fed to
    // entityOf would throw (pickNumber on the missing
    // 'position').
    const overlap = [...createBodyKeys].filter(
        (key) => documentBodyKeys.has(key),
    );
    assert.deepEqual(overlap, []);
});

// -- 7. resend idempotency ----------------------------------------

test('resend idempotency: a byte-identical position-PUT resend'
+ ' replays the stored response and appends NO second pair (the'
+ ' E6 fast-path at drift altitude)', async () => {
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

    const beforeReposition = (await db.requests.getAll()).length;
    const first = await handleRequest(db, req(
        'PUT', '/objectives/' + objectiveId, token,
        { position: 99 },
    ));
    assert.equal(first.status, 200);
    const afterFirst = (await db.requests.getAll()).length;
    assert.equal(afterFirst, beforeReposition + 1);

    // A byte-identical resend of the SAME reposition PUT: the
    // pre-tx idempotency fast path (api.ts's storedResponseFor,
    // keyed by the request's own hash) replays the stored
    // response — nothing new is appended.
    const second = await handleRequest(db, req(
        'PUT', '/objectives/' + objectiveId, token,
        { position: 99 },
    ));
    assert.equal(second.status, 200);
    const afterSecond = (await db.requests.getAll()).length;
    assert.equal(afterSecond, afterFirst);
    assert.equal(
        first.headers.get('Response-ID'),
        second.headers.get('Response-ID'),
    );

    await assertObjectiveParity(db, STARK_ORGANIZATION, objectiveId);
    const derived = await derivedObjective(
        db, STARK_ORGANIZATION, objectiveId,
    );
    assert.equal(derived.position, 99);
});

// -- 8. THE ARCHIVED-INCLUSION PIN --------------------------------

test('THE ARCHIVED-INCLUSION PIN: an objective with a live'
+ " 'archived' states event appears in GET /objectives AND GET"
+ ' objectives/:id 200 on BOTH planes, asserted THROUGH the'
+ ' mirrored generic handlers (the same stateless arm the live'
+ ' route rides) — the deliberate CONTRAST to the trio'
+ " families' deleted-exclusion (Author gate 3: objectives'"
+ ' lifecycle rides the SHARED states log; the document'
+ ' plane\'s own reads perform no lifecycle walk at all)',
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
        'PUT', '/states/' + objectiveId + '-archived', token,
        {
            entity_id: objectiveId, state: 'archived',
            at: '2026-06-12T00:00:01.000000Z',
        },
    ));
    assert.equal(archived.status, 200);

    const derivedCollection = await derivedObjectives(
        db, STARK_ORGANIZATION,
    );
    const oldCollection = await organizationScopedAdapter(
        db, STARK_ORGANIZATION,
    ).objectives.getAll();
    assert.equal(
        derivedCollection.some((o) => o.id === objectiveId), true,
    );
    assert.equal(
        oldCollection.some((o) => o.id === objectiveId), true,
    );
    assert.deepEqual(
        sortById(derivedCollection), sortById(oldCollection),
    );

    const derivedById = await derivedObjective(
        db, STARK_ORGANIZATION, objectiveId,
    );
    const oldById = await organizationScopedAdapter(
        db, STARK_ORGANIZATION,
    ).objectives.getById(objectiveId);
    assert.deepEqual(derivedById, oldById);
});
