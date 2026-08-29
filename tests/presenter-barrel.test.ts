// state.ts (transitively imported via core.ts ->
// presenters) reads localStorage and window /
// document at module-eval time, which Node lacks.
// Stub before any import, then load presenter
// modules with dynamic import() so the stubs are
// in place. Same pattern as logger.test.ts.
// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
} as unknown as Window & typeof globalThis;
// @ts-expect-error — Node global stub
globalThis.document = { addEventListener: () => {} };

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

test('barrel exports all new presenters', async () => {
    const P = await import('../web-app/app/presenters/index.ts');
    const expected = [
        'OrganizationObjectivesPresenter',
        'ProjectActionBarPresenter',
        'ProjectObjectivesPresenter',
        'ProjectScoreHistoryPresenter',
        'DashboardObjectiveAggregatesPresenter',
    ];
    for (const name of expected) {
        assert.ok(
            name in P,
            'barrel missing export: ' + name,
        );
    }
});
