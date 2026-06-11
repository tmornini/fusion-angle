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

const {
    Project,
} = await import('../api/types.ts');
const { DISPLAY_ABSENT } = await import(
    '../web-app/app/format.ts'
);
const { ProjectView } = await import(
    '../web-app/app/adapters/projects.ts'
);
const { Organization } = await import(
    '../web-app/app/adapters/admin.ts'
);
const { ProjectPresenter } = await import(
    '../web-app/app/presenters/project.ts'
);
const {
    ProjectDetailPresenter,
    ProjectDetailEditPresenter,
    projectDraftFromView,
} = await import(
    '../web-app/app/presenters/project-detail.ts'
);
const {
    OrganizationPresenter,
    OrganizationEditPresenter,
} = await import(
    '../web-app/app/presenters/organization.ts'
);

// Recording stub for the detail presenters, which
// write into a container via setHtml/$required.
// querySelector returns a fresh recording slot per
// selector; allHtml() concatenates the shell write
// plus every slot write so tests can assert on
// fragments without parsing real DOM.
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

function makeProject(overrides: {
    id?: string;
    title?: string;
    description?: string;
    state?:
        | 'submitted' | 'under-review'
        | 'sent-back' | 'approved'
        | 'declined' | 'archived' | 'deleted';
    progress?: number;
    estimatedCost?: number;
    position?: number;
}) {
    return new Project({
        id: overrides.id ?? 'pr-1',
        title: overrides.title ?? 'Apollo',
        description:
            overrides.description ?? 'Go to space.',
        progress: overrides.progress ?? 42,
        start_date: '2026-01-01',
        target_end_date: '2026-06-01',
        estimated_cost:
            overrides.estimatedCost ?? 50000,
        actual_cost: 25000,
        position: overrides.position ?? 0,
    }, overrides.state ?? 'approved');
}

function makeOrg() {
    return new Organization({
        id: 'org-1',
        name: 'Acme Innovations',
        domain: 'acme.example',
        next_billing: '2026-07-01',
        seats: 50,
        projects_limit: 100,
        ideas_limit: 200,
    }, {
        usedSeats: 12,
        lastActivityAt: '2026-05-01T00:00:00.000000Z',
    });
}

function makeStats() {
    return {
        projectsCurrent: 8,
        ideasCurrent: 30,
        activePeopleCount: 12,
    };
}

// ---- ProjectPresenter (project.ts) ----

test(
    'ProjectPresenter.buildCard renders title,'
    + ' status label and timeline progress',
    () => {
        const p = new ProjectPresenter(
            makeProject({
                title: 'Gemini',
                state: 'archived',
            }),
        );
        const out = p.buildCard(false)
            .toString();
        assert.match(out, /Gemini/);
        assert.match(out, /Archived/);
        // archived projects show 100% timeline
        assert.match(out, /100%/);
        assert.match(
            out, /data-project-card="pr-1"/,
        );
    },
);

test(
    'ProjectPresenter.buildCard includes a drag'
    + ' grip only when showGrip is true',
    () => {
        const p = new ProjectPresenter(
            makeProject({}),
        );
        assert.match(
            p.buildCard(true).toString(),
            /drag-handle/,
        );
        assert.equal(
            p.buildCard(false)
                .toString()
                .includes('drag-handle'),
            false,
        );
    },
);

test(
    'ProjectPresenter.buildStateBadge carries'
    + ' state and dimmed data attributes',
    () => {
        const p = new ProjectPresenter(
            makeProject({ state: 'under-review' }),
        );
        const dimmed = p.buildStateBadge(false)
            .toString();
        assert.match(
            dimmed, /data-state="under-review"/,
        );
        assert.match(dimmed, /data-dimmed="true"/);
        const lit = p.buildStateBadge(true)
            .toString();
        assert.match(lit, /data-dimmed="false"/);
        assert.equal(p.idForLink(), 'pr-1');
        assert.equal(
            p.stateGroup(), 'under-review',
        );
        assert.equal(p.positionSortKey(), 0);
    },
);

// ---- ProjectDetailPresenter (project-detail.ts) ----

test(
    'ProjectDetailPresenter renders a read view'
    + ' with title, description and'
    + ' summary/metrics sections',
    () => {
        const view = new ProjectView(
            makeProject({
                title: 'Apollo',
                description: 'Go to the moon.',
                state: 'approved',
            }),
            [], [], [],
        );
        const rec = makeRecordingContainer();
        new ProjectDetailPresenter(view, [])
            .renderShell(rec.container);
        const out = rec.allHtml();
        assert.match(out, /Apollo/);
        assert.match(out, /Go to the moon\./);
        assert.match(out, /Project Summary/);
        assert.match(out, /Metrics/);
        assert.match(
            out, /data-project-action="edit"/,
        );
        assert.equal(
            out.includes('Unknown'), false,
        );
    },
);

test(
    'ProjectDetailPresenter renders the absent'
    + ' placeholder for zero-valued cost baseline',
    () => {
        const view = new ProjectView(
            makeProject({
                estimatedCost: 0,
            }),
            [], [], [],
        );
        const rec = makeRecordingContainer();
        new ProjectDetailPresenter(view, [])
            .renderShell(rec.container);
        const out = rec.allHtml();
        assert.ok(
            out.includes(DISPLAY_ABSENT),
            'zero baselines should render'
            + ' DISPLAY_ABSENT',
        );
        assert.equal(
            out.includes('Unknown'), false,
        );
    },
);

test(
    'ProjectDetailPresenter offers a New Flow'
    + ' button for approved projects and a'
    + ' gating message otherwise',
    () => {
        const approvedRec = makeRecordingContainer();
        new ProjectDetailPresenter(
            new ProjectView(
                makeProject({ state: 'approved' }),
                [], [], [],
            ),
            [],
        ).renderShell(approvedRec.container);
        const approved = approvedRec.allHtml();
        assert.match(approved, /New Flow/);
        assert.equal(
            approved.includes('Approve to add flows'),
            false,
        );

        const draftRec = makeRecordingContainer();
        new ProjectDetailPresenter(
            new ProjectView(
                makeProject({
                    state: 'under-review',
                }),
                [], [], [],
            ),
            [],
        ).renderShell(draftRec.container);
        const draft = draftRec.allHtml();
        assert.match(draft, /Approve to add flows/);
    },
);

test(
    'ProjectDetailPresenter renders a flow card'
    + ' with the flow name and node/edge counts',
    () => {
        const view = new ProjectView(
            makeProject({ state: 'approved' }),
            [], [], [],
        );
        const rec = makeRecordingContainer();
        new ProjectDetailPresenter(view, [
            {
                id: 'f-1',
                name: 'Onboarding',
                nodeCount: 5,
                edgeCount: 4,
            },
        ]).renderShell(rec.container);
        const out = rec.allHtml();
        assert.match(out, /Onboarding/);
        assert.match(out, /5 nodes/);
        assert.match(out, /4 edges/);
        assert.match(out, /data-flow-id="f-1"/);
    },
);

test(
    'ProjectDetailEditPresenter renders an'
    + ' editable title input, state select and'
    + ' Save/Cancel actions',
    () => {
        const view = new ProjectView(
            makeProject({ title: 'Apollo' }),
            [], [], [],
        );
        const draft = projectDraftFromView(view);
        const rec = makeRecordingContainer();
        new ProjectDetailEditPresenter(
            view, [], draft,
        ).renderShell(rec.container);
        const out = rec.allHtml();
        assert.match(
            out, /data-project-field="title"/,
        );
        assert.match(
            out, /data-project-field="state"/,
        );
        assert.match(
            out, /data-project-field="description"/,
        );
        assert.match(
            out, /data-project-action="save"/,
        );
        assert.match(
            out, /data-project-action="cancel"/,
        );
        assert.equal(
            out.includes(
                'data-project-action="edit"',
            ),
            false,
        );
    },
);

// ---- OrganizationPresenter (organization.ts) ----

test(
    'OrganizationPresenter.buildPage renders the'
    + ' org name, domain, and an Edit action',
    () => {
        const out = new OrganizationPresenter(
            makeOrg(), makeStats(),
        ).buildPage().toString();
        assert.match(out, /Acme Innovations/);
        assert.match(out, /acme\.example/);
        assert.match(out, /data-org-action="edit"/);
        assert.equal(
            out.includes('Unknown'), false,
        );
    },
);

test(
    'OrganizationPresenter.buildPage renders'
    + ' overview stats and usage bars with'
    + ' current/limit values',
    () => {
        const out = new OrganizationPresenter(
            makeOrg(), makeStats(),
        ).buildPage().toString();
        assert.match(out, /Active People/);
        assert.match(out, /Projects/);
        assert.match(out, /Ideas/);
        assert.match(out, /Usage Overview/);
        // a usage bar prints "current / limit"
        assert.match(out, /12 \/ 50/);
    },
);

test(
    'OrganizationEditPresenter.buildPage renders'
    + ' editable name/domain inputs and'
    + ' Save/Cancel actions',
    () => {
        const org = makeOrg();
        const out = new OrganizationEditPresenter(
            org,
            makeStats(),
            org.toGeneralInfoDraft(),
        ).buildPage().toString();
        assert.match(out, /data-org-field="name"/);
        assert.match(
            out, /data-org-field="domain"/,
        );
        assert.match(out, /data-org-action="save"/);
        assert.match(
            out, /data-org-action="cancel"/,
        );
        assert.equal(
            out.includes('data-org-action="edit"'),
            false,
        );
    },
);
