// project.ts (transitively) reads localStorage /
// window at module-eval time, which Node lacks.
// Stub before any import, then load via dynamic
// import() so stubs are in place.
// Same pattern as presenter-projects-org.test.ts.
// @ts-expect-error - Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};
// @ts-expect-error - Node global stub
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
};
// @ts-expect-error - Node global stub
globalThis.document = {
    addEventListener: () => {},
};

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const { Project, jsonObjectField } = await import(
    '../api/types.ts'
);
const {
    ProjectListPresenter,
    buildInitialProjectListState,
} = await import(
    '../web-app/app/presenters/project.ts'
);

function makeProject(id: string): InstanceType<
    typeof Project
> {
    return new Project({
        id,
        title: 't',
        description: 'd',
        status: 'under-review' as const,
        progress: 0,
        start_date: '2026-05-14T00:00:00.000Z',
        target_end_date:
            '2026-05-14T00:00:00.000Z',
        estimated_duration: 0,
        actual_duration: 0,
        estimated_cost: 0,
        actual_cost: 0,
        position: 0,
        business_context: jsonObjectField({}),
        timeline_label: 'q1',
    });
}

test(
    'projected impact column renders for each'
    + ' project',
    () => {
        const projects = [makeProject('p1')];
        const scoreMap = new Map([
            ['p1', {
                projectId: 'p1',
                baselineAvg: 47,
                latestActualAvg: undefined,
                baselineCount: 3,
                totalActiveObjectives: 3,
            }],
        ]);
        const state =
            buildInitialProjectListState(
                projects,
            );
        const p = new ProjectListPresenter(
            state, scoreMap,
        );
        const listEl = {
            innerHTML: '',
        } as unknown as HTMLElement;
        p.renderList(listEl);
        const html = listEl.innerHTML;
        assert.ok(
            html.includes('+47'),
            'expected +47 in rendered html',
        );
        assert.ok(
            html.includes(
                'data-score-present="true"',
            ),
            'expected data-score-present="true"',
        );
        assert.ok(
            html.includes(
                'data-score-value="47"',
            ),
            'expected data-score-value="47"',
        );
    },
);

test(
    'missing score renders absent and sorts last',
    () => {
        const projects = [makeProject('p1')];
        const scoreMap = new Map([
            ['p1', {
                projectId: 'p1',
                baselineAvg: undefined,
                latestActualAvg: undefined,
                baselineCount: 0,
                totalActiveObjectives: 3,
            }],
        ]);
        const state =
            buildInitialProjectListState(
                projects,
            );
        const p = new ProjectListPresenter(
            state, scoreMap,
        );
        const listEl = {
            innerHTML: '',
        } as unknown as HTMLElement;
        p.renderList(listEl);
        const html = listEl.innerHTML;
        assert.ok(
            html.includes(
                'data-score-present="false"',
            ),
            'expected data-score-present="false"',
        );
    },
);
