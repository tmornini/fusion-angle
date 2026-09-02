import {
    assertMatch,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import { Project } from '../api/types.ts';
import type {
    ObjectiveEntity,
} from '../api/types.ts';
import { ProjectView } from
    '../web-app/app/adapters/projects.ts';
import {
    ProjectDetailPresenter,
} from '../web-app/app/presenters/project-detail.ts';

// None of api/types.ts, adapters/projects.ts, or
// presenters/project-detail.ts reads localStorage (checked
// against the full product tree); window/document are
// stubbed because ProjectDetailPresenter walks a real DOM
// tree via renderShell/mutateSlot.
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
} as unknown as Window & typeof globalThis;
// @ts-expect-error — Node global stub
globalThis.document = { addEventListener: () => {} };

function makeRecordingContainer(): {
    container: HTMLElement;
    allHtml: () => string;
} {
    let shell = '';
    const slots = new Map<string, { html: string }>();
    const makeSlot = (key: string) => {
        let slot = slots.get(key);
        if (!slot) {
            slot = { html: '' };
            slots.set(key, slot);
        }
        const ref = slot;
        return {
            set innerHTML(v: string) {
                ref.html = v;
            },
            get innerHTML(): string {
                return ref.html;
            },
        };
    };
    const container = {
        set innerHTML(v: string) {
            shell = v;
        },
        get innerHTML(): string {
            return shell;
        },
        querySelector(sel: string) {
            return makeSlot(sel);
        },
    };
    return {
        container: container as unknown as HTMLElement,
        allHtml: () =>
            shell
            + [...slots.values()]
                .map(s => s.html)
                .join(''),
    };
}

function makeProject() {
    return new Project({
        id: 'pr-1',
        organization_id: 'org-1',
        title: 'Apollo',
        description: 'Go to space.',
        progress: 0,
        start_date: '2026-01-01',
        target_end_date: '2026-12-31',
        estimated_cost: 100000,
        actual_cost: 50000,
        position: 0,
        state: 'approved',
    }, {
        state: 'approved',
    });
}

const objectives: ObjectiveEntity[] = [
    { id: 'ohqxgUBEaFQwYbXsonRPmg', organization_id: 'org-1',
      position: 0, state: 'active' },
    { id: 'o2', organization_id: 'org-1',
      position: 1, state: 'active' },
];

const baselineFull = [
    { id: 'b1', projectId: 'pr-1',
      objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
      score: 50, memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
      at: '2026-01-02T00:00:00.000000Z' },
    { id: 'b2', projectId: 'pr-1',
      objectiveId: 'o2',
      score: 30, memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
      at: '2026-01-02T00:00:00.000000Z' },
];

Deno.test(
    'detail metrics card renders the Impact label',
    () => {
        const view = new ProjectView(
            makeProject(),
            objectives,
            baselineFull,
            [],
        );
        const rec = makeRecordingContainer();
        new ProjectDetailPresenter(view, [])
            .renderShell(rec.container);
        const out = rec.allHtml();
        assertMatch(out, /Impact/);
        assertMatch(out, /pts/);
    },
);

Deno.test(
    'Impact variance renders muted dash when actuals absent',
    () => {
        const view = new ProjectView(
            makeProject(),
            objectives,
            baselineFull,
            [],
        );
        const rec = makeRecordingContainer();
        new ProjectDetailPresenter(view, [])
            .renderShell(rec.container);
        const out = rec.allHtml();
        // Locate the Impact section by its label
        // and confirm the variance row in that
        // neighborhood does not advertise a tone.
        const impactStart = out.indexOf('Impact');
        assertNotStrictEquals(impactStart, -1,
            'Impact label not found in output');
        const impactSection = out.slice(impactStart);
        // The next "metric-cell" or end of output
        // bounds the Impact block.
        const nextCell = impactSection
            .indexOf('metric-cell', 1);
        const block = nextCell === -1
            ? impactSection
            : impactSection.slice(0, nextCell);
        assertStrictEquals(
            block.includes('variance-good'),
            false,
            'absent actuals must not claim improvement',
        );
        assertStrictEquals(
            block.includes('variance-bad'),
            false,
            'absent actuals must not claim regression',
        );
    },
);

Deno.test(
    'Impact variance renders tone when fully scored',
    () => {
        const actuals = [
            { id: 'UQTJZvCoKlFjEoDlDUwekw', projectId: 'pr-1',
              objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
              score: 60, memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
              at: '2026-02-01T00:00:00.000000Z' },
            { id: 'UZgNCkZlSJcSaAmAJuSkcw', projectId: 'pr-1',
              objectiveId: 'o2',
              score: 40, memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
              at: '2026-02-01T00:00:00.000000Z' },
        ];
        const view = new ProjectView(
            makeProject(),
            objectives,
            baselineFull,
            actuals,
        );
        const rec = makeRecordingContainer();
        new ProjectDetailPresenter(view, [])
            .renderShell(rec.container);
        const out = rec.allHtml();
        // Impact actuals (60, 40) > baseline (50, 30):
        // higher is better → tone is variance-good.
        assertMatch(out, /variance-good/);
    },
);

Deno.test(
    'metrics card heading reads Project Metrics',
    () => {
        const view = new ProjectView(
            makeProject(),
            objectives,
            baselineFull,
            [],
        );
        const rec = makeRecordingContainer();
        new ProjectDetailPresenter(view, [])
            .renderShell(rec.container);
        const out = rec.allHtml();
        assertMatch(out, /Project Metrics/);
    },
);
