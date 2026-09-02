import { assert, assertMatch, assertStrictEquals } from '@std/assert';
import { Project } from '../api/types.ts';
import { DISPLAY_ABSENT } from '../web-app/app/format.ts';
import { ProjectView } from
    '../web-app/app/adapters/projects.ts';
import { Organization } from
    '../web-app/app/adapters/admin.ts';
import { ProjectPresenter } from
    '../web-app/app/presenters/project.ts';
import {
    ProjectDetailPresenter,
    ProjectDetailEditPresenter,
    projectDraftFromView,
} from '../web-app/app/presenters/project-detail.ts';
import {
    OrganizationPresenter,
    OrganizationEditPresenter,
} from '../web-app/app/presenters/organization.ts';

// None of these seven modules reads localStorage (checked
// against the full product tree); window/document are
// stubbed because the detail presenters below walk a real
// DOM tree via renderShell/mutateSlot.
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
} as unknown as Window & typeof globalThis;
// @ts-expect-error — Node global stub
globalThis.document = { addEventListener: () => {} };

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
        | 'submitted' | 'under_review'
        | 'sent_back' | 'approved'
        | 'declined' | 'archived' | 'deleted';
    progress?: number;
    estimatedCost?: number;
    position?: number;
}) {
    return new Project({
        id: overrides.id ?? 'pr-1',
        organization_id: 'org-1',
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
        state: overrides.state ?? 'approved',
    }, {
        state: overrides.state ?? 'approved',
    });
}

function makeOrganization() {
    return new Organization({
        id: 'org-1',
        name: 'Acme Innovations',
        domain: 'acme.example',
        next_billing: '2026-07-01T00:00:00.000000Z',
        seats: 50,
        projects_limit: 100,
        ideas_limit: 200,
    }, {
        usedSeats: 12,
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

Deno.test(
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
        assertMatch(out, /Gemini/);
        assertMatch(out, /Archived/);
        // archived projects show 100% timeline
        assertMatch(out, /100%/);
        assertMatch(
            out, /data-project-card="pr-1"/,
        );
    },
);

Deno.test(
    'ProjectPresenter.buildCard includes a drag'
    + ' grip only when showGrip is true',
    () => {
        const p = new ProjectPresenter(
            makeProject({}),
        );
        assertMatch(
            p.buildCard(true).toString(),
            /drag-handle/,
        );
        assertStrictEquals(
            p.buildCard(false)
                .toString()
                .includes('drag-handle'),
            false,
        );
    },
);

Deno.test(
    'ProjectPresenter.buildStateBadge carries'
    + ' state and dimmed data attributes',
    () => {
        const p = new ProjectPresenter(
            makeProject({ state: 'under_review' }),
        );
        const dimmed = p.buildStateBadge(false)
            .toString();
        assertMatch(
            dimmed, /data-state="under_review"/,
        );
        assertMatch(dimmed, /data-dimmed="true"/);
        const lit = p.buildStateBadge(true)
            .toString();
        assertMatch(lit, /data-dimmed="false"/);
        assertStrictEquals(p.idForLink(), 'pr-1');
        assertStrictEquals(
            p.stateGroup(), 'under_review',
        );
        assertStrictEquals(p.positionSortKey(), 0);
    },
);

// ---- ProjectDetailPresenter (project-detail.ts) ----

Deno.test(
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
        assertMatch(out, /Apollo/);
        assertMatch(out, /Go to the moon\./);
        assertMatch(out, /Project Summary/);
        assertMatch(out, /Metrics/);
        assertMatch(
            out, /data-project-action="edit"/,
        );
        assertStrictEquals(
            out.includes('Unknown'), false,
        );
    },
);

Deno.test(
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
        assert(
            out.includes(DISPLAY_ABSENT),
            'zero baselines should render'
            + ' DISPLAY_ABSENT',
        );
        assertStrictEquals(
            out.includes('Unknown'), false,
        );
    },
);

Deno.test(
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
        assertMatch(approved, /New Flow/);
        assertStrictEquals(
            approved.includes('Approve to add flows'),
            false,
        );

        const draftRec = makeRecordingContainer();
        new ProjectDetailPresenter(
            new ProjectView(
                makeProject({
                    state: 'under_review',
                }),
                [], [], [],
            ),
            [],
        ).renderShell(draftRec.container);
        const draft = draftRec.allHtml();
        assertMatch(draft, /Approve to add flows/);
    },
);

Deno.test(
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
        assertMatch(out, /Onboarding/);
        assertMatch(out, /5 nodes/);
        assertMatch(out, /4 edges/);
        assertMatch(out, /data-flow-id="f-1"/);
    },
);

Deno.test(
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
        assertMatch(
            out, /data-project-field="title"/,
        );
        assertMatch(
            out, /data-project-field="state"/,
        );
        assertMatch(
            out, /data-project-field="description"/,
        );
        assertMatch(
            out, /data-project-action="save"/,
        );
        assertMatch(
            out, /data-project-action="cancel"/,
        );
        assertStrictEquals(
            out.includes(
                'data-project-action="edit"',
            ),
            false,
        );
    },
);

// ---- OrganizationPresenter (organization.ts) ----

Deno.test(
    'OrganizationPresenter.buildPage renders the'
    + ' org name, domain, and an Edit action',
    () => {
        const out = new OrganizationPresenter(
            makeOrganization(), makeStats(),
        ).buildPage().toString();
        assertMatch(out, /Acme Innovations/);
        assertMatch(out, /acme\.example/);
        assertMatch(out, /data-org-action="edit"/);
        assertStrictEquals(
            out.includes('Unknown'), false,
        );
    },
);

Deno.test(
    'OrganizationPresenter.buildPage renders'
    + ' overview stats and usage bars with'
    + ' XXZruirZyAOoRpNxaDnpSA/limit values',
    () => {
        const out = new OrganizationPresenter(
            makeOrganization(), makeStats(),
        ).buildPage().toString();
        assertMatch(out, /Active People/);
        assertMatch(out, /Projects/);
        assertMatch(out, /Ideas/);
        assertMatch(out, /Usage Overview/);
        // a usage bar prints "current / limit"
        assertMatch(out, /12 \/ 50/);
    },
);

Deno.test(
    'OrganizationEditPresenter.buildPage renders'
    + ' editable name/domain inputs and'
    + ' Save/Cancel actions',
    () => {
        const organization = makeOrganization();
        const out = new OrganizationEditPresenter(
            organization,
            makeStats(),
            organization.toGeneralInfoDraft(),
        ).buildPage().toString();
        assertMatch(out, /data-org-field="name"/);
        assertMatch(
            out, /data-org-field="domain"/,
        );
        assertMatch(out, /data-org-action="save"/);
        assertMatch(
            out, /data-org-action="cancel"/,
        );
        assertStrictEquals(
            out.includes('data-org-action="edit"'),
            false,
        );
    },
);
