import { assert, assertStrictEquals } from '@std/assert';
import { createRequestContext } from
    '../client/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import { getDashboardGauges } from
    '../web-app/app/adapters/dashboard.ts';
import {
    getDashboardScoringBundle,
    getObjectiveScoringInputs,
    buildObjectiveAggregates,
} from
    '../client/project-scoring.ts';
import { sharedMockDb } from './mock-seed.ts';

// The mock seeder is deterministic; these values
// are computed from the same hash the seeder runs.
// If the seeder ever changes its hash, its score
// range, the approved-project set, or the objective
// position weights, both tests fall — by design.

Deno.test('mock seed produces portfolio Impact baseline +50',
    async () => {
        const db = await sharedMockDb();
        const ctx = createRequestContext(db, await organizationToken());
        const gauges = getDashboardGauges(
            await getDashboardScoringBundle(ctx),
        );
        const impact = gauges.find(
            g => g.title === 'Impact',
        );
        assert(impact, 'Impact gauge present');
        assertStrictEquals(impact.kind, 'bipolar');
        assertStrictEquals(impact.outer.value, 50);
    });

Deno.test('mock seed produces per-objective baseline means',
    async () => {
        const db = await sharedMockDb();
        const ctx = createRequestContext(db, await organizationToken());
        const aggs = buildObjectiveAggregates(
            getObjectiveScoringInputs(
                await getDashboardScoringBundle(ctx),
            ),
        );
        const expected: ReadonlyArray<
            [string, number]
        > = [
            ['JobGWBxUTEBusPcVhYEKtA', 41],
            ['QVZjTYvKwffyfGpYILwkOA', 39],
            ['VhxqyRIQytSnUArslwxyog', 56],
            ['GNRUyOMVpjoeEQWrZkRMkQ', 63],
        ];
        for (const [id, mean] of expected) {
            const row = aggs.find(
                a => a.objectiveId === id,
            );
            assert(
                row,
                'aggregate row present for ' + id,
            );
            assertStrictEquals(row.baselineMean, mean);
            assertStrictEquals(row.projectsBaselineScored, 8);
        }
    });
