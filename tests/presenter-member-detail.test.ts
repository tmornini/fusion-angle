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
    HumanMember, AIMember,
    jsonArrayField, jsonObjectField,
} = await import('../api/types.ts');

const {
    firstProviderModel,
} = await import('./member-fixtures.ts');

const {
    HumanMemberDetailPresenter,
} = await import(
    '../web-app/app/presenters/human-member-detail.ts'
);

const {
    AIMemberDetailPresenter,
    AIMemberDetailEditPresenter,
    aiMemberDraftFromMember,
} = await import(
    '../web-app/app/presenters/ai-member-detail.ts'
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

function makeHumanMember() {
    return new HumanMember(
        {
            id: 'hw_1',
            type: 'human',
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'st-hw_1',
        },
        {
            id: 'hw_1',
            title: 'Engineer',
            department: 'Engineering',
            strengths: jsonArrayField(['Leadership']),
            team_dimensions: jsonObjectField({
                driver: 60, analytical: 40,
                expressive: 30, amiable: 50,
            }),
        },
        {
            erased: false,
            name: 'Sarah Chen',
            email: 'sarah@example.com',
            phone: '555-0100',
            bio: 'Builds things.',
        },
        {
            state: 'active',
            stateAt: '2026-01-01T00:00:00.000000Z',
            stateEventId: 'st-hw_1',
        },
    );
}

function makeAIMember() {
    return new AIMember(
        {
            id: 'ai_1',
            type: 'ai',
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'st-ai_1',
        },
        {
            id: 'ai_1',
            name: 'Claude Opus 4.8',
            description:
                'Long context, deep reasoning.',
            skill_focus:
                'Deep reasoning over long docs.',
            model: firstProviderModel().id,
        },
        {
            state: 'active',
            stateAt: '2026-01-01T00:00:00.000000Z',
            stateEventId: 'st-ai_1',
        },
    );
}

test(
    'HumanMemberDetailPresenter renders the'
    + ' name, title, department, and'
    + ' personal-info card',
    () => {
        const rec = makeRecordingContainer();
        new HumanMemberDetailPresenter(
            makeHumanMember(),
        ).renderShell(rec.container);
        const out = rec.allHtml();
        assert.match(out, /Sarah Chen/);
        assert.match(out, /Engineer/);
        assert.match(out, /Engineering/);
        assert.match(out, /sarah@example\.com/);
        // Strengths card lists the seeded strength
        assert.match(out, /Leadership/);
        // Edit affordance present in read mode
        assert.match(
            out, /data-member-action="edit"/,
        );
        // No raw "Unknown" magic string anywhere
        assert.equal(
            out.includes('Unknown'), false,
        );
    },
);

test(
    'AIMemberDetailPresenter renders the model'
    + ' name, provider, and skill focus',
    () => {
        const rec = makeRecordingContainer();
        new AIMemberDetailPresenter(
            makeAIMember(),
        ).renderShell(rec.container);
        const out = rec.allHtml();
        const model = firstProviderModel();
        assert.match(out, new RegExp(model.name));
        assert.match(
            out, new RegExp(model.provider),
        );
        assert.match(
            out,
            /Deep reasoning over long docs\./,
        );
        // No auth-token affordance remains.
        assert.equal(
            out.includes('Auth Token'), false,
        );
        // The lifecycle state badge surfaces.
        assert.match(out, /Active/);
    },
);

test(
    'AIMemberDetailEditPresenter renders a State'
    + ' select hooked to the member-field, with the'
    + ' current state pre-selected',
    () => {
        const rec = makeRecordingContainer();
        const member = makeAIMember();
        new AIMemberDetailEditPresenter(
            member,
            aiMemberDraftFromMember(member),
        ).renderShell(rec.container);
        const out = rec.allHtml();
        assert.match(out, /id="ai-state"/);
        assert.match(
            out, /data-member-field="state"/,
        );
        assert.match(
            out, /value="active"[\s\S]*?selected/,
        );
        // Save affordance present in edit mode.
        assert.match(
            out, /data-member-action="save"/,
        );
        // Model select with optgroups and the
        // current model pre-selected.
        assert.match(out, /id="ai-model"/);
        assert.match(out, /<optgroup/);
        assert.match(
            out,
            new RegExp(
                'value="'
                + firstProviderModel().id
                + '"[\\s\\S]*?selected',
            ),
        );
    },
);
