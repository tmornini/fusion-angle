// state.ts (transitively imported via core.ts ->
// presenters) reads localStorage and window /
// document at module-eval time, which Node lacks.
// Stub before any import, then load presenter
// modules with dynamic import() so the stubs are
// in place. Same pattern as logger.test.ts.
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
globalThis.document = { addEventListener: () => {} };

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const {
    Project, jsonObjectField,
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
    status?:
        | 'submitted' | 'under-review'
        | 'sent-back' | 'approved'
        | 'declined' | 'completed' | 'deleted';
    progress?: number;
    estimatedCost?: number;
    estimatedImpact?: number;
    position?: number;
}) {
    return new Project({
        id: overrides.id ?? 'pr-1',
        title: overrides.title ?? 'Apollo',
        description:
            overrides.description ?? 'Go to space.',
        status: overrides.status ?? 'approved',
        progress: overrides.progress ?? 42,
        start_date: '2026-01-01',
        target_end_date: '2026-06-01',
        estimated_duration: 0,
        actual_duration: 0,
        estimated_cost:
            overrides.estimatedCost ?? 50000,
        actual_cost: 25000,
        estimated_impact:
            overrides.estimatedImpact ?? 80,
        actual_impact: 40,
        position: overrides.position ?? 0,
        business_context: jsonObjectField({}),
        timeline_label: '',
    });
}

function makeOrg() {
    return new Organization({
        id: 'org-1',
        name: 'Acme Innovations',
        domain: 'acme.example',
        plan: 'Enterprise',
        plan_status: 'active',
        next_billing: '2026-07-01',
        seats: 50,
        used_seats: 12,
        projects_limit: 100,
        projects_current: 8,
        ideas_limit: 200,
        ideas_current: 30,
        storage_limit: 100,
        storage_current: 20,
        ai_credits_limit: 1000,
        ai_credits_current: 200,
        health_score: 92,
        health_status: 'Healthy',
        last_activity: '2026-05-01',
        active_people: 12,
    });
}

// ---- ProjectPresenter (project.ts) ----

test(
    'ProjectPresenter.buildCard renders title,'
    + ' status label and timeline progress',
    () => {
        const p = new ProjectPresenter(
            makeProject({
                title: 'Gemini',
                status: 'completed',
            }),
        );
        const out = p.buildCard('position', false)
            .toString();
        assert.match(out, /Gemini/);
        // 'completed' status config label is 'Active'
        assert.match(out, /Active/);
        // completed projects show 100% timeline
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
            p.buildCard('position', true).toString(),
            /cursor-grab/,
        );
        assert.equal(
            p.buildCard('position', false)
                .toString()
                .includes('cursor-grab'),
            false,
        );
    },
);

test(
    'ProjectPresenter.buildStatusBadge carries'
    + ' status and dimmed data attributes',
    () => {
        const p = new ProjectPresenter(
            makeProject({ status: 'under-review' }),
        );
        const dimmed = p.buildStatusBadge(false)
            .toString();
        assert.match(
            dimmed, /data-status="under-review"/,
        );
        assert.match(dimmed, /data-dimmed="true"/);
        const lit = p.buildStatusBadge(true)
            .toString();
        assert.match(lit, /data-dimmed="false"/);
        assert.equal(p.idForLink(), 'pr-1');
        assert.equal(
            p.statusGroup(), 'under-review',
        );
        assert.equal(p.positionSortKey(), 0);
    },
);

// ---- ProjectDetailPresenter (project-detail.ts) ----

test(
    'ProjectDetailPresenter renders a read view'
    + ' with breadcrumb, title, description and'
    + ' summary/metrics sections',
    () => {
        const view = new ProjectView(
            makeProject({
                title: 'Apollo',
                description: 'Go to the moon.',
                status: 'approved',
            }),
        );
        const rec = makeRecordingContainer();
        new ProjectDetailPresenter(view, [])
            .renderShell(rec.container);
        const out = rec.allHtml();
        assert.match(out, /Projects/);
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
    + ' placeholder for zero-valued cost and'
    + ' impact baselines',
    () => {
        const view = new ProjectView(
            makeProject({
                estimatedCost: 0,
                estimatedImpact: 0,
            }),
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
                makeProject({ status: 'approved' }),
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
                    status: 'under-review',
                }),
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
            makeProject({ status: 'approved' }),
        );
        const rec = makeRecordingContainer();
        new ProjectDetailPresenter(view, [
            {
                id: 'f-1',
                name: 'Onboarding',
                description: 'Welcome flow',
                nodeCount: 5,
                edgeCount: 4,
            },
        ]).renderShell(rec.container);
        const out = rec.allHtml();
        assert.match(out, /Onboarding/);
        assert.match(out, /Welcome flow/);
        assert.match(out, /5 nodes/);
        assert.match(out, /4 edges/);
        assert.match(out, /data-flow-id="f-1"/);
    },
);

test(
    'ProjectDetailEditPresenter renders an'
    + ' editable title input, status select and'
    + ' Save/Cancel actions',
    () => {
        const view = new ProjectView(
            makeProject({ title: 'Apollo' }),
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
            out, /data-project-field="status"/,
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
    + ' org name, domain, plan label and an Edit'
    + ' action',
    () => {
        const out = new OrganizationPresenter(
            makeOrg(),
        ).buildPage().toString();
        assert.match(out, /Acme Innovations/);
        assert.match(out, /acme\.example/);
        assert.match(out, /Enterprise Plan/);
        assert.match(out, /Organization Name/);
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
            makeOrg(),
        ).buildPage().toString();
        assert.match(out, /Active People/);
        assert.match(out, /Projects/);
        assert.match(out, /Ideas/);
        assert.match(out, /Usage Overview/);
        assert.match(out, /AI Credits/);
        // a usage bar prints "current / limit"
        assert.match(out, /12 \/ 50/);
        assert.match(out, /Health Score: 92%/);
    },
);

test(
    'OrganizationEditPresenter.buildPage renders'
    + ' editable name/domain inputs and'
    + ' Save/Cancel actions',
    () => {
        const org = makeOrg();
        const out = new OrganizationEditPresenter(
            org, org.toGeneralInfoDraft(),
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
