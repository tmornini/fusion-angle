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
    HumanWorker, AIWorker,
    jsonArrayField, jsonObjectField,
} = await import('../api/types.ts');

const {
    HumanWorkerDetailPresenter,
} = await import(
    '../web-app/app/presenters/human-worker-detail.ts'
);

const {
    AIWorkerDetailPresenter,
} = await import(
    '../web-app/app/presenters/ai-worker-detail.ts'
);

// Recording stub: presenters write into a container
// via setHtml on the shell, then mutateSlot calls
// $required(selector, container).querySelector then
// setHtml on the slot. Capture every write so we
// can assert on the union.
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
            querySelector(_sel: string) {
                return null;
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

function makeHumanWorker() {
    return new HumanWorker({
        id: 'hw_1',
        first_name: 'Sarah',
        last_name: 'Chen',
        email: 'sarah@example.com',
        title: 'Engineer',
        department: 'Engineering',
        strengths: jsonArrayField(['Leadership']),
        team_dimensions: jsonObjectField({
            driver: 60, analytical: 40,
            expressive: 30, amiable: 50,
        }),
        phone: '555-0100',
        bio: 'Builds things.',
    }, 'active');
}

function makeAIWorker() {
    return new AIWorker({
        id: 'ai_1',
        name: 'Claude Opus 4.7 Max',
        provider: 'Anthropic',
        description: 'Long context, deep reasoning.',
        auth_token: 'sk-PLACEHOLDER-DEMOTOKEN-XYZ4',
        created_at: '2026-01-01T00:00:00Z',
    }, 'active');
}

test(
    'HumanWorkerDetailPresenter renders the'
    + ' breadcrumb, name, title, department, and'
    + ' personal-info card',
    () => {
        const rec = makeRecordingContainer();
        new HumanWorkerDetailPresenter(
            makeHumanWorker(),
        ).renderShell(rec.container);
        const out = rec.allHtml();
        assert.match(out, /Workers/);
        assert.match(out, /Sarah Chen/);
        assert.match(out, /Engineer/);
        assert.match(out, /Engineering/);
        assert.match(out, /sarah@example\.com/);
        // Strengths card lists the seeded strength
        assert.match(out, /Leadership/);
        // Edit affordance present in read mode
        assert.match(
            out, /data-worker-action="edit"/,
        );
        // No raw "Unknown" magic string anywhere
        assert.equal(
            out.includes('Unknown'), false,
        );
    },
);

test(
    'AIWorkerDetailPresenter masks the auth token'
    + ' in the rendered output',
    () => {
        const rec = makeRecordingContainer();
        new AIWorkerDetailPresenter(
            makeAIWorker(),
        ).renderShell(rec.container);
        const out = rec.allHtml();
        // The masked form ends with the last 4
        // chars; the raw full token must not leak.
        assert.equal(
            out.includes(
                'sk-PLACEHOLDER-DEMOTOKEN-XYZ4',
            ),
            false,
            'raw auth token must not appear',
        );
        // The masked output retains last-4 chars
        assert.match(out, /XYZ4/);
        // Name and provider still surface
        assert.match(out, /Claude Opus 4\.7 Max/);
        assert.match(out, /Anthropic/);
    },
);

test(
    'AIWorker.maskedToken returns a masked form'
    + ' that omits the middle of the token',
    () => {
        const masked =
            makeAIWorker().maskedToken();
        assert.equal(
            masked.includes(
                'sk-PLACEHOLDER-DEMOTOKEN-XYZ4',
            ),
            false,
        );
        assert.ok(masked.endsWith('XYZ4'));
    },
);
