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
// @ts-expect-error — Node global stub
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
};
// @ts-expect-error — Node global stub
globalThis.document = { addEventListener: () => {} };

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const { Project, COST_DIVISOR } =
    await import('../api/types.ts');
const { ProjectView } =
    await import('../web-app/app/adapters/projects.ts');
const {
    projectDraftFromView,
    projectPatchFromDraft,
} = await import(
    '../web-app/app/presenters/project-detail.ts'
);

function buildView() {
    const project = new Project({
        id: 'p1',
        organization_id: '1',
        title: 'Costly',
        description: 'd',
        progress: 25,
        start_date: '2026-01-01',
        target_end_date: '2026-12-31',
        estimated_cost: 50000,
        actual_cost: 12000,
        position: 1,
    }, 'approved');
    return new ProjectView(project, [], [], []);
}

test(
    'projectPatchFromDraft rejects an empty cost',
    () => {
        const view = buildView();
        const draft = {
            ...projectDraftFromView(view),
            costBaseline: '',
        };
        // Number('') is 0 — accepting it would store a
        // fabricated $0k baseline
        assert.throws(
            () => projectPatchFromDraft(view, draft),
            /estimated cost must be a number/,
        );
    },
);

test(
    'projectPatchFromDraft rejects a non-numeric cost',
    () => {
        const view = buildView();
        const draft = {
            ...projectDraftFromView(view),
            costBaseline: 'lots',
        };
        assert.throws(
            () => projectPatchFromDraft(view, draft),
            /estimated cost must be a number/,
        );
    },
);

test(
    'projectPatchFromDraft scales a numeric cost',
    () => {
        const view = buildView();
        const draft = {
            ...projectDraftFromView(view),
            costBaseline: '7',
        };
        const patch =
            projectPatchFromDraft(view, draft);
        assert.equal(
            patch.entity.estimated_cost,
            7 * COST_DIVISOR,
        );
    },
);
