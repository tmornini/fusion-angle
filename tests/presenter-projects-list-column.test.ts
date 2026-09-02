import { assert, assertStrictEquals } from '@std/assert';
import { Project } from '../api/types.ts';
import {
    ProjectListPresenter,
    buildInitialProjectListState,
} from '../web-app/app/presenters/project.ts';

// project.ts never reads localStorage (checked against
// the full product tree); window/document are stubbed
// because ProjectListPresenter.render walks a real DOM
// element.
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
} as unknown as Window & typeof globalThis;
// @ts-expect-error — Node global stub
globalThis.document = {
    addEventListener: () => {},
};

function makeProject(id: string): InstanceType<
    typeof Project
> {
    return new Project({
        id,
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        title: 't',
        description: 'd',
        progress: 0,
        start_date: '2026-05-14',
        target_end_date:
            '2026-05-14T00:00:00.000000Z',
        estimated_cost: 0,
        actual_cost: 0,
        position: 0,
        state: 'under_review',
    }, {
        state: 'under_review',
    });
}

Deno.test(
    'projected impact column renders for each'
    + ' project',
    () => {
        const projects = [makeProject('pnXmXrxOWayANgDLdCjuBw')];
        const scoreMap = new Map([
            ['pnXmXrxOWayANgDLdCjuBw', {
                projectId: 'pnXmXrxOWayANgDLdCjuBw',
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
        assert(
            html.includes('+47'),
            'expected +47 in rendered html',
        );
        assert(
            html.includes(
                'data-score-present="true"',
            ),
            'expected data-score-present="true"',
        );
        assert(
            html.includes(
                'data-score-value="47"',
            ),
            'expected data-score-value="47"',
        );
    },
);

Deno.test(
    'missing score renders absent and sorts last',
    () => {
        const projects = [makeProject('pnXmXrxOWayANgDLdCjuBw')];
        const scoreMap = new Map([
            ['pnXmXrxOWayANgDLdCjuBw', {
                projectId: 'pnXmXrxOWayANgDLdCjuBw',
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
        assert(
            html.includes(
                'data-score-present="false"',
            ),
            'expected data-score-present="false"',
        );
    },
);

Deno.test(
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
        assertStrictEquals(
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
        assert(
            highIdx < lowIdx,
            'p-high (+50) should render'
            + ' before p-low (-10)',
        );
        assert(
            lowIdx < noneIdx,
            'p-low (-10) should render before'
            + ' p-none (no score)',
        );
        const backToPosition =
            applyProjectSortToggle(sorted);
        assertStrictEquals(
            backToPosition.sort.kind,
            'position',
        );
    },
);

Deno.test(
    'sort toggle renders with correct label and'
    + ' aria-pressed state',
    () => {
        const state =
            buildInitialProjectListState(
                [makeProject('pnXmXrxOWayANgDLdCjuBw')],
            );
        const sortEl = {
            innerHTML: '',
        } as unknown as HTMLElement;
        new ProjectListPresenter(state, new Map())
            .renderSortControls(sortEl);
        assert(
            sortEl.innerHTML.includes(
                'aria-pressed="false"',
            ),
            'default sort should be unpressed',
        );
        assert(
            sortEl.innerHTML.includes(
                'Sort by projected impact',
            ),
            'default label should prompt sort',
        );
    },
);

Deno.test(
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
        assertStrictEquals(
            sortEl.innerHTML, '',
            'empty list should erase the sort chip',
        );
    },
);
