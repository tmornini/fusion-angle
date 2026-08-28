// state.ts (transitively imported via core.ts ->
// presenters) reads localStorage and window /
// document at module-eval time, which Node lacks.
// Stub before any import, then load the page-module
// reducer with dynamic import() so the stubs are in
// place. Same pattern as members-detail-reduce.
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

const { Project } = await import('../api/types.ts');
const { ProjectView } = await import(
    '../web-app/app/adapters/projects.ts'
);
const { ProjectDetailPresenter } = await import(
    '../web-app/app/presenters/project-detail.ts'
);
const { reduceProjectSave } = await import(
    '../web-app/projects/detail.ts'
);

function makeRecordingContainer(): {
    container: HTMLElement;
    allHtml: () => string;
} {
    let shell = '';
    const slots = new Map<
        string, { html: string }
    >();
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
        container:
            container as unknown as HTMLElement,
        allHtml: () =>
            shell
            + [...slots.values()]
                .map(s => s.html)
                .join(''),
    };
}

test(
    'reduceProjectSave lands in read mode with'
    + ' the fresh description and Edit, not Save',
    () => {
        const entity = {
            id: 'pr-1',
            organization_id: 'og-1',
            title: 'Apollo',
            description: 'Edited body',
            progress: 42,
            start_date: '2026-01-01',
            target_end_date: '2026-06-01',
            estimated_cost: 50000,
            actual_cost: 25000,
            position: 0,
            state: 'approved',
        };
        const detail = {
            state: 'approved' as const,
        };
        const view = new ProjectView(
            new Project(entity, detail),
            [], [], [],
        );
        const next = reduceProjectSave({
            view,
            entity,
            detail,
            flows: [],
        });
        assert.equal(next.kind, 'reading');
        assert.equal(
            next.view.descriptionText(),
            'Edited body',
        );
        const rec = makeRecordingContainer();
        new ProjectDetailPresenter(
            next.view, next.flows,
        ).renderShell(rec.container);
        const out = rec.allHtml();
        assert.match(out, /Edited body/);
        assert.match(
            out, /data-project-action="edit"/,
        );
        assert.doesNotMatch(
            out, /data-project-action="save"/,
        );
    },
);
