import { assertMatch, assertNotMatch, assertStrictEquals } from '@std/assert';
import { Project } from '../api/types.ts';
import { ProjectView } from
    '../web-app/app/adapters/projects.ts';
import {
    ProjectDetailPresenter,
} from '../web-app/app/presenters/project-detail.ts';
import { reduceProjectSave } from
    '../web-app/projects/detail.ts';

// None of these four modules reads localStorage (checked
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

Deno.test(
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
        assertStrictEquals(next.kind, 'reading');
        assertStrictEquals(
            next.view.descriptionText(),
            'Edited body',
        );
        const rec = makeRecordingContainer();
        new ProjectDetailPresenter(
            next.view, next.flows,
        ).renderShell(rec.container);
        const out = rec.allHtml();
        assertMatch(out, /Edited body/);
        assertMatch(
            out, /data-project-action="edit"/,
        );
        assertNotMatch(
            out, /data-project-action="save"/,
        );
    },
);
