import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { populateMockData } from '../api/mock-data.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { getDashboardGauges } from
    '../web-app/app/adapters/dashboard.ts';
import { getObjectiveAggregates } from
    '../web-app/app/adapters/project-scoring.ts';

// The mock seeder is deterministic; these values
// are computed from the same hash the seeder runs.
// If the seeder ever changes its hash, its score
// range, the approved-project set, or the objective
// position weights, both tests fall — by design.

test('mock seed produces portfolio Impact baseline +50',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await populateMockData(db);
        const ctx = createRequestContext(db, devToken());
        const gauges = await getDashboardGauges(ctx);
        const impact = gauges.find(
            g => g.title === 'Impact',
        );
        assert.ok(impact, 'Impact gauge present');
        assert.equal(impact.kind, 'bipolar');
        assert.equal(impact.outer.value, 50);
    });

test('mock seed produces per-objective baseline means',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await populateMockData(db);
        const ctx = createRequestContext(db, devToken());
        const aggs = await getObjectiveAggregates(ctx);
        const expected: ReadonlyArray<
            [string, number]
        > = [
            ['JkW7aEqFdX3nOiPtVhMrCy', 41],
            ['RgT2mNvKpQ8xLsYwBzHcUe', 39],
            ['bDf6uStZlA9eGmYjIoNcWq', 56],
            ['CvH4wRnXkU1pQsBgTyEzMo', 63],
        ];
        for (const [id, mean] of expected) {
            const row = aggs.find(
                a => a.objectiveId === id,
            );
            assert.ok(
                row,
                'aggregate row present for ' + id,
            );
            assert.equal(row.baselineMean, mean);
            assert.equal(row.projectsBaselineScored, 8);
        }
    });
