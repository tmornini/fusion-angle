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

const { Project } = await import(
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
        progress: 0,
        start_date: '2026-05-14T00:00:00.000Z',
        target_end_date:
            '2026-05-14T00:00:00.000Z',
        estimated_cost: 0,
        actual_cost: 0,
        position: 0,
    }, 'under-review');
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

test(
    'applyProjectSortToggle orders by projected'
    + ' impact descending with no-score last',
    async () => {
        const {
            applyProjectSortToggle,
        } = await import(
            '../web-app/app/presenters/project.ts'
        );
        const projects = [
            makeProject('p-low'),
            makeProject('p-high'),
            makeProject('p-none'),
        ];
        const scoreMap = new Map([
            ['p-low', {
                projectId: 'p-low',
                baselineAvg: -10,
                latestActualAvg: undefined,
                baselineCount: 3,
                totalActiveObjectives: 3,
            }],
            ['p-high', {
                projectId: 'p-high',
                baselineAvg: 50,
                latestActualAvg: undefined,
                baselineCount: 3,
                totalActiveObjectives: 3,
            }],
            ['p-none', {
                projectId: 'p-none',
                baselineAvg: undefined,
                latestActualAvg: undefined,
                baselineCount: 0,
                totalActiveObjectives: 3,
            }],
        ]);
        const initial =
            buildInitialProjectListState(projects);
        const sorted =
            applyProjectSortToggle(initial);
        assert.equal(
            sorted.sort.kind,
            'projected-impact-desc',
        );
        const p = new ProjectListPresenter(
            sorted, scoreMap,
        );
        const listEl = {
            innerHTML: '',
        } as unknown as HTMLElement;
        p.renderList(listEl);
        const html = listEl.innerHTML;
        const highIdx = html.indexOf('p-high');
        const lowIdx = html.indexOf('p-low');
        const noneIdx = html.indexOf('p-none');
        assert.ok(
            highIdx < lowIdx,
            'p-high (+50) should render'
            + ' before p-low (-10)',
        );
        assert.ok(
            lowIdx < noneIdx,
            'p-low (-10) should render before'
            + ' p-none (no score)',
        );
        const backToPosition =
            applyProjectSortToggle(sorted);
        assert.equal(
            backToPosition.sort.kind,
            'position',
        );
    },
);

test(
    'sort toggle renders with correct label and'
    + ' aria-pressed state',
    () => {
        const state =
            buildInitialProjectListState(
                [makeProject('p1')],
            );
        const sortEl = {
            innerHTML: '',
        } as unknown as HTMLElement;
        new ProjectListPresenter(state, new Map())
            .renderSortControls(sortEl);
        assert.ok(
            sortEl.innerHTML.includes(
                'aria-pressed="false"',
            ),
            'default sort should be unpressed',
        );
        assert.ok(
            sortEl.innerHTML.includes(
                'Sort by projected impact',
            ),
            'default label should prompt sort',
        );
    },
);

test(
    'sort toggle renders nothing on an empty'
    + ' project list',
    () => {
        const state =
            buildInitialProjectListState([]);
        const sortEl = {
            innerHTML: 'placeholder',
        } as unknown as HTMLElement;
        new ProjectListPresenter(state, new Map())
            .renderSortControls(sortEl);
        assert.equal(
            sortEl.innerHTML, '',
            'empty list should erase the sort chip',
        );
    },
);
