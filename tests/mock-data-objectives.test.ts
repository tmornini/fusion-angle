import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    OBJECTIVE_SEEDS,
} from '../api/mock-data.ts';
import {
    validateObjectiveEntity,
    validateObjectiveRevisionEntity,
} from '../api/validators.ts';
import { createRequestContext }
    from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    getArchivedObjectiveIds,
    getObjectives,
} from '../web-app/app/adapters/objectives.ts';
import { getProjectEntities } from
    '../web-app/app/adapters/projects.ts';
import type { Id, ProjectState } from
    '../api/types.ts';
import type { RequestContext } from
    '../web-app/app/adapters/shared.ts';
import {
    getBaselineScoresForProject,
    getActualScoresForProject,
} from '../web-app/app/adapters/project-scoring.ts';
import { deriveProjects } from
    '../api/derive-projects.ts';
import {
    deriveObjectiveRevisions,
} from '../api/derive-objective-revisions.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import {
    ORGANIZATION_TWO_OBJECTIVE,
} from '../api/mock-data/seed-message-pairs.ts';
import { sharedMockDb } from './mock-seed.ts';

// Phase Final Task 2: objectives(+objective_revisions) seed
// row halves stripped — assertions ride the message plane.

async function projectIdsByState(
    ctx: RequestContext,
    wanted: ProjectState,
): Promise<Id[]> {
    // Lifecycle state rides the project GET row trio.
    const rows = await getProjectEntities(ctx);
    return rows
        .filter(p => p.state === wanted)
        .map(p => p.id);
}

Deno.test('seeds every objective seed plus the org-2 objective',
async () => {
    const db = await sharedMockDb();
    const ctx = createRequestContext(db, await organizationToken());
    const rows = await getObjectives(ctx);
    // getObjectives is org-scoped to the token's org (Stark).
    assertStrictEquals(rows.length, OBJECTIVE_SEEDS.length);
    for (const r of rows) {
        // GET stamps lifecycle trio; validateObjectiveEntity
        // is entity-fields only — strip the stamp before gate.
        const {
            id: _id,
            state: _s,
            ...body
        } = r;
        void _s;
        assert(
            typeof r.state === 'string'
            && r.state.length > 0,
            'objective ' + r.id + ' missing state',
        );
        validateObjectiveEntity(body);
    }
    // Org-2 objective via derive from the other plane.
    const org2Revs = await deriveObjectiveRevisions(
        db, ORGANIZATION_TWO, ORGANIZATION_TWO_OBJECTIVE.id,
    );
    assertStrictEquals(org2Revs.length, 1);
    // Phase Final Stage B: objectives table retired.
});

Deno.test('postMockDataLoad seeds one revision per objective',
    async () => {
        const db = await sharedMockDb();
        // Stark revisions (4) + org-2 revision (1).
        let total = 0;
        for (const seed of OBJECTIVE_SEEDS) {
            const revs = await deriveObjectiveRevisions(
                db, STARK_ORGANIZATION, seed.id,
            );
            assertStrictEquals(revs.length, 1);
            const { id: _id, ...body } = revs[0]!;
            validateObjectiveRevisionEntity(body);
            total += 1;
        }
        const org2Revs = await deriveObjectiveRevisions(
            db, ORGANIZATION_TWO,
            ORGANIZATION_TWO_OBJECTIVE.id,
        );
        assertStrictEquals(org2Revs.length, 1);
        total += 1;
        assertStrictEquals(total, OBJECTIVE_SEEDS.length + 1);
        // Phase Final Stage B: objective_revisions retired.
    });

// All five objective seeds mint genesis state 'active' via
// the create-body trio (states-address retirement) — none
// are archived. GET objectives stamps that trio on rows.
Deno.test('postMockDataLoad seeds zero archived objectives',
    async () => {
        const db = await sharedMockDb();
        const ctx = createRequestContext(db, await organizationToken());
        const ids = await getArchivedObjectiveIds(ctx);
        assertStrictEquals(ids.size, 0);
    });

Deno.test('approved projects have full baseline coverage',
    async () => {
        const db = await sharedMockDb();
        const ctx = createRequestContext(db, await organizationToken());
        const approved = await projectIdsByState(
            ctx, 'approved',
        );
        assert(
            approved.length > 0,
            'seed has approved projects',
        );
        // Coverage is per-org since SP-6: an approved project
        // is scored against the objectives in ITS org, not the
        // global set. Phase Final Task 2: objectives + scores
        // from the message plane.
        const organizationByProject = new Map<string, string>();
        for (const organization of ['AjdvjuECVZEgZoFajaIEkg'
            , 'BBjWJsjYIDkTRKIIPrzWRw']) {
            for (const p of await deriveProjects(
                db, organization,
            )) {
                organizationByProject.set(p.id, organization);
            }
        }
        for (const pid of approved) {
            const baselines = await getBaselineScoresForProject(
                ctx, pid,
            );
            const pairs = new Set(
                baselines.map(b => b.objectiveId),
            );
            const organization =
                organizationByProject.get(pid)!;
            // Stark has OBJECTIVE_SEEDS.length; org-2 has 1.
            const organizationObjCount =
                organization === STARK_ORGANIZATION
                    ? OBJECTIVE_SEEDS.length
                    : 1;
            assertStrictEquals(
                pairs.size,
                organizationObjCount,
                `project ${pid} missing coverage`,
            );
        }
    });

Deno.test('completed projects have at least one actual per pair',
    async () => {
        const db = await sharedMockDb();
        const ctx = createRequestContext(db, await organizationToken());
        const completed = await projectIdsByState(
            ctx, 'archived',
        );
        assert(
            completed.length > 0,
            'seed has archived projects',
        );
        for (const pid of completed) {
            const baselines = await getBaselineScoresForProject(
                ctx, pid,
            );
            const actuals = await getActualScoresForProject(
                ctx, pid,
            );
            const pairs = new Set(
                baselines.map(b => b.objectiveId),
            );
            const actualPairs = new Set(
                actuals.map(a => a.objectiveId),
            );
            for (const pair of pairs) {
                assert(
                    actualPairs.has(pair),
                    `project ${pid} missing `
                        + `actual for ${pair}`,
                );
            }
        }
    });

Deno.test('approved projects have an actual for every pair',
    async () => {
        const db = await sharedMockDb();
        const ctx = createRequestContext(db, await organizationToken());
        const approved = await projectIdsByState(
            ctx, 'approved',
        );
        assert(
            approved.length > 0,
            'seed has approved projects',
        );
        for (const pid of approved) {
            const baselines = await getBaselineScoresForProject(
                ctx, pid,
            );
            const actuals = await getActualScoresForProject(
                ctx, pid,
            );
            const pairs = new Set(
                baselines.map(b => b.objectiveId),
            );
            const actualPairs = new Set(
                actuals.map(a => a.objectiveId),
            );
            for (const pair of pairs) {
                assert(
                    actualPairs.has(pair),
                    `approved ${pid} missing `
                        + `actual for ${pair}`,
                );
            }
        }
    });

Deno.test('submitted projects have zero scores', async () => {
    const db = await sharedMockDb();
    const ctx = createRequestContext(db, await organizationToken());
    const submitted = await projectIdsByState(
        ctx, 'submitted',
    );
    assert(
        submitted.length > 0,
        'seed has submitted projects',
    );
    for (const pid of submitted) {
        const baselines = await getBaselineScoresForProject(
            ctx, pid,
        );
        assertStrictEquals(baselines.length, 0);
    }
});

// Phase 7 Task 5's STANDING content pins: the id-only
// fingerprint (tests/mock-data-fingerprint.test.ts) no longer
// covers objectives after the strip, so these pin author picks
// via the message-plane score adapter.
Deno.test('a seeded baseline score\'s author matches the pinned'
+ ' pre-hoist pick', async () => {
    const db = await sharedMockDb();
    const ctx = createRequestContext(db, await organizationToken());
    const baselines = await getBaselineScoresForProject(
        ctx, 'wqGTTFdYUGnmBxWCppmkOQ',
    );
    const row = baselines.find(
        b => b.objectiveId === 'JobGWBxUTEBusPcVhYEKtA',
    );
    assert(row, 'no baseline row for the pinned pair');
    assertStrictEquals(row!.memberId, 'XXZruirZyAOoRpNxaDnpSA');
});

Deno.test('a seeded actual-score triple\'s per-index authors match'
+ ' the pinned pre-hoist picks', async () => {
    const db = await sharedMockDb();
    const ctx = createRequestContext(db, await organizationToken());
    const actuals = await getActualScoresForProject(
        ctx, 'kAxUZTXdcMCAttuoyCdSYA',
    );
    const rows = actuals
        .filter(
            a => a.objectiveId === 'QVZjTYvKwffyfGpYILwkOA',
        )
        .sort((a, b) => a.at.localeCompare(b.at));
    assertStrictEquals(rows.length, 3);
    assertEquals(
        rows.map(r => r.memberId),
        [
            'CJrglMsNBxOWWfbihHQSeg',
            'SsVAZghfSzMZRZmxNKIizw',
            'RPzLGrWcstxLaHoBcViPLQ',
        ],
    );
});
