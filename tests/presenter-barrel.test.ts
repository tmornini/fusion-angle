import { assert } from '@std/assert';
import * as presenters from
    '../web-app/app/presenters/index.ts';

// The presenters barrel never reads localStorage (checked
// against the full product tree); window/document are
// stubbed because some re-exported presenters walk a real
// DOM element.
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
} as unknown as Window & typeof globalThis;
// @ts-expect-error — Node global stub
globalThis.document = { addEventListener: () => {} };

Deno.test('barrel exports all new presenters', () => {
    const expected = [
        'OrganizationObjectivesPresenter',
        'ProjectActionBarPresenter',
        'ProjectObjectivesPresenter',
        'ProjectScoreHistoryPresenter',
        'DashboardObjectiveAggregatesPresenter',
    ];
    for (const name of expected) {
        assert(
            name in presenters,
            'barrel missing export: ' + name,
        );
    }
});
