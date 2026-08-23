import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sharedMockDb } from './mock-seed.ts';
import { organizationToken } from
    './token-fixtures.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import { getFlowsForCreation } from
    '../web-app/app/adapters/flow-publish.ts';

test('mock admin sees Customer Onboarding and Lead-to-Close',
async () => {
    const db = await sharedMockDb();
    const ctx = createRequestContext(
        db, await organizationToken(),
    );
    const { ready, notReady } =
        await getFlowsForCreation(ctx);
    assert.deepEqual(
        ready.map((f) => f.name).sort(),
        ['Customer Onboarding', 'Lead-to-Close'],
    );
    assert.deepEqual(
        notReady
            .map((f) => ({
                name: f.name,
                problemCount: f.problemCount,
            }))
            .sort((a, b) =>
                a.name.localeCompare(b.name)),
        [
            {
                name: 'Fusion Angle Flow',
                problemCount: 16,
            },
            {
                name:
                    'Layout Test: Proposal Review Cycle',
                problemCount: 15,
            },
        ],
    );
});
