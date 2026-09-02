import { assertStrictEquals, assertThrows } from '@std/assert';
import { Project, COST_DIVISOR } from '../api/types.ts';
import { ProjectView } from
    '../web-app/app/adapters/projects.ts';
import {
    projectDraftFromView,
    projectPatchFromDraft,
} from '../web-app/app/presenters/project-detail.ts';

// None of api/types.ts, adapters/projects.ts, or
// presenters/project-detail.ts reads localStorage (checked
// against the full product tree); window/document are
// stubbed only because a real DOM tree is out of scope for
// these pure-function tests but the presenter module graph
// still expects the globals to exist.
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
} as unknown as Window & typeof globalThis;
// @ts-expect-error — Node global stub
globalThis.document = { addEventListener: () => {} };

function buildView() {
    const project = new Project({
        id: 'pnXmXrxOWayANgDLdCjuBw',
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        title: 'Costly',
        description: 'd',
        progress: 25,
        start_date: '2026-01-01',
        target_end_date: '2026-12-31',
        estimated_cost: 50000,
        actual_cost: 12000,
        position: 1,
        state: 'approved',
    }, {
        state: 'approved',
    });
    return new ProjectView(project, [], [], []);
}

Deno.test(
    'projectPatchFromDraft rejects an empty cost',
    () => {
        const view = buildView();
        const draft = {
            ...projectDraftFromView(view),
            costBaseline: '',
        };
        // Number('') is 0 — accepting it would store a
        // fabricated $0k baseline
        assertThrows(
            () => projectPatchFromDraft(view, draft),
            Error,
            'estimated cost must be a number',
        );
    },
);

Deno.test(
    'projectPatchFromDraft rejects a non-numeric cost',
    () => {
        const view = buildView();
        const draft = {
            ...projectDraftFromView(view),
            costBaseline: 'lots',
        };
        assertThrows(
            () => projectPatchFromDraft(view, draft),
            Error,
            'estimated cost must be a number',
        );
    },
);

Deno.test(
    'projectPatchFromDraft scales a numeric cost',
    () => {
        const view = buildView();
        const draft = {
            ...projectDraftFromView(view),
            costBaseline: '7',
        };
        const patch =
            projectPatchFromDraft(view, draft);
        assertStrictEquals(
            patch.fields.estimatedCost,
            7 * COST_DIVISOR,
        );
    },
);
