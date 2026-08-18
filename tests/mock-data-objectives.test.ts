import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    OBJECTIVE_SEEDS,
} from '../api/mock-data.ts';
import {
    validateObjectiveEntity,
    validateObjectiveRevisionEntity,
} from '../api/validators.ts';
import { createRequestContext }
    from '../web-app/app/adapters/shared.ts';
import { devToken, organizationToken } from './token-fixtures.ts';
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
// row halves stripped — assertions ride the pair plane.

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

test('seeds every objective seed plus the org-2 objective',
async () => {
    const db = await sharedMockDb();
    const ctx = createRequestContext(db, await organizationToken());
    const rows = await getObjectives(ctx);
    // getObjectives is org-scoped to the token's org (Stark).
    assert.equal(rows.length, OBJECTIVE_SEEDS.length);
    for (const r of rows) {
        // GET stamps lifecycle trio; validateObjectiveEntity
        // is entity-fields only — strip the stamp before gate.
        const {
            id: _id,
            state: _s,
            ...body
        } = r;
        void _s;
        assert.ok(
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
    assert.equal(org2Revs.length, 1);
    // Phase Final Stage B: objectives table retired.
});

test('postMockDataLoad seeds one revision per objective',
    async () => {
        const db = await sharedMockDb();
        // Stark revisions (4) + org-2 revision (1).
        let total = 0;
        for (const seed of OBJECTIVE_SEEDS) {
            const revs = await deriveObjectiveRevisions(
                db, STARK_ORGANIZATION, seed.id,
            );
            assert.equal(revs.length, 1);
            const { id: _id, ...body } = revs[0]!;
            validateObjectiveRevisionEntity(body);
            total += 1;
        }
        const org2Revs = await deriveObjectiveRevisions(
            db, ORGANIZATION_TWO,
            ORGANIZATION_TWO_OBJECTIVE.id,
        );
        assert.equal(org2Revs.length, 1);
        total += 1;
        assert.equal(total, OBJECTIVE_SEEDS.length + 1);
        // Phase Final Stage B: objective_revisions retired.
    });

// All five objective seeds mint genesis state 'active' via
// the create-body trio (states-address retirement) — none
// are archived. GET objectives stamps that trio on rows.
test('postMockDataLoad seeds zero archived objectives',
    async () => {
        const db = await sharedMockDb();
        const ctx = createRequestContext(db, await organizationToken());
        const ids = await getArchivedObjectiveIds(ctx);
        assert.equal(ids.size, 0);
    });

test('approved projects have full baseline coverage',
    async () => {
        const db = await sharedMockDb();
        const ctx = createRequestContext(db, await organizationToken());
        const approved = await projectIdsByState(
            ctx, 'approved',
        );
        assert.ok(
            approved.length > 0,
            'seed has approved projects',
        );
        // Coverage is per-org since SP-6: an approved project
        // is scored against the objectives in ITS org, not the
        // global set. Phase Final Task 2: objectives + scores
        // from the pair plane.
        const organizationByProject = new Map<string, string>();
        for (const organization of ['1', '2']) {
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
            assert.equal(
                pairs.size,
                organizationObjCount,
                `project ${pid} missing coverage`,
            );
        }
    });

test('completed projects have at least one actual per pair',
    async () => {
        const db = await sharedMockDb();
        const ctx = createRequestContext(db, await organizationToken());
        const completed = await projectIdsByState(
            ctx, 'archived',
        );
        assert.ok(
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
                assert.ok(
                    actualPairs.has(pair),
                    `project ${pid} missing `
                        + `actual for ${pair}`,
                );
            }
        }
    });

test('approved projects have an actual for every pair',
    async () => {
        const db = await sharedMockDb();
        const ctx = createRequestContext(db, await organizationToken());
        const approved = await projectIdsByState(
            ctx, 'approved',
        );
        assert.ok(
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
                assert.ok(
                    actualPairs.has(pair),
                    `approved ${pid} missing `
                        + `actual for ${pair}`,
                );
            }
        }
    });

test('submitted projects have zero scores', async () => {
    const db = await sharedMockDb();
    const ctx = createRequestContext(db, await organizationToken());
    const submitted = await projectIdsByState(
        ctx, 'submitted',
    );
    assert.ok(
        submitted.length > 0,
        'seed has submitted projects',
    );
    for (const pid of submitted) {
        const baselines = await getBaselineScoresForProject(
            ctx, pid,
        );
        assert.equal(baselines.length, 0);
    }
});

// Phase 7 Task 5's STANDING content pins: the id-only
// fingerprint (tests/mock-data-fingerprint.test.ts) no longer
// covers objectives after the strip, so these pin author picks
// via the pair-plane score adapter.
test('a seeded baseline score\'s author matches the pinned'
+ ' pre-hoist pick', async () => {
    const db = await sharedMockDb();
    const ctx = createRequestContext(db, await organizationToken());
    const baselines = await getBaselineScoresForProject(
        ctx, 'u6YkHhlGc91oDMkr3x0isa',
    );
    const row = baselines.find(
        b => b.objectiveId === 'JkW7aEqFdX3nOiPtVhMrCy',
    );
    assert.ok(row, 'no baseline row for the pinned pair');
    assert.equal(row!.memberId, 'current');
});

test('a seeded actual-score triple\'s per-index authors match'
+ ' the pinned pre-hoist picks', async () => {
    const db = await sharedMockDb();
    const ctx = createRequestContext(db, await organizationToken());
    const actuals = await getActualScoresForProject(
        ctx, 'jRE2Tj32NHsFGZIeEADp0p',
    );
    const rows = actuals
        .filter(
            a => a.objectiveId === 'RgT2mNvKpQ8xLsYwBzHcUe',
        )
        .sort((a, b) => a.at.localeCompare(b.at));
    assert.equal(rows.length, 3);
    assert.deepEqual(
        rows.map(r => r.memberId),
        [
            '53J8h9dr76XFqCjYcNVwIR',
            'WxQn4LVWb76YkmqK5B0EPp',
            'Trf1Up2jMsPhEnjbW4Ji1n',
        ],
    );
});
