import { assertMatch, assertStrictEquals } from '@std/assert';
import { HumanMember, AIMember } from '../api/types.ts';
import { firstProviderModel } from './member-fixtures.ts';
import {
    HumanMemberDetailPresenter,
    HumanMemberDetailEditPresenter,
    humanMemberDraftFromMember,
} from '../web-app/app/presenters/human-member-detail.ts';
import {
    AIMemberDetailPresenter,
    AIMemberDetailEditPresenter,
    aiMemberDraftFromMember,
} from '../web-app/app/presenters/ai-member-detail.ts';

// None of these four modules reads localStorage (checked
// against the full product tree); window/document are
// stubbed because the presenters below walk a real DOM
// tree via renderShell/mutateSlot.
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
} as unknown as Window & typeof globalThis;
// @ts-expect-error — Node global stub
globalThis.document = { addEventListener: () => {} };

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
        },
        {
            present: true,
            title: 'Engineer',
            department: 'Engineering',
            strengths: ['Leadership'],
            team_dimensions: {
                driver: 60, analytical: 40,
                expressive: 30, amiable: 50,
            },
        },
        {
            erased: false,
            name: 'Sarah Chen',
            email: 'sarah@example.com',
            phone: '555-0100',
            bio: 'Builds things.',
        },
    );
}

function makeAIMember() {
    return new AIMember(
        {
            id: 'ai_1',
            type: 'ai',
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
    );
}

Deno.test(
    'HumanMemberDetailPresenter renders the'
    + ' name, title, department, and'
    + ' personal-info card',
    () => {
        const rec = makeRecordingContainer();
        new HumanMemberDetailPresenter(
            makeHumanMember(),
        ).renderShell(rec.container);
        const out = rec.allHtml();
        assertMatch(out, /Sarah Chen/);
        assertMatch(out, /Engineer/);
        assertMatch(out, /Engineering/);
        assertMatch(out, /sarah@example\.com/);
        // Strengths card lists the seeded strength
        assertMatch(out, /Leadership/);
        // Edit affordance present in read mode
        assertMatch(
            out, /data-member-action="edit"/,
        );
        // No raw "Unknown" magic string anywhere
        assertStrictEquals(
            out.includes('Unknown'), false,
        );
        // No lifecycle state badge.
        assertStrictEquals(out.includes('Active'), false);
    },
);

Deno.test(
    'AIMemberDetailPresenter renders the model'
    + ' name, provider, and skill focus',
    () => {
        const rec = makeRecordingContainer();
        new AIMemberDetailPresenter(
            makeAIMember(),
        ).renderShell(rec.container);
        const out = rec.allHtml();
        const model = firstProviderModel();
        assertMatch(out, new RegExp(model.name));
        assertMatch(
            out, new RegExp(model.provider),
        );
        assertMatch(
            out,
            /Deep reasoning over long docs\./,
        );
        // No auth-token affordance remains.
        assertStrictEquals(
            out.includes('Auth Token'), false,
        );
        // No lifecycle state badge.
        assertStrictEquals(out.includes('Active'), false);
    },
);

Deno.test(
    'HumanMemberDetailEditPresenter renders no'
    + ' State select',
    () => {
        const rec = makeRecordingContainer();
        const member = makeHumanMember();
        new HumanMemberDetailEditPresenter(
            member,
            humanMemberDraftFromMember(member),
        ).renderShell(rec.container);
        const out = rec.allHtml();
        assertStrictEquals(
            out.includes('id="member-state"'),
            false,
        );
        assertStrictEquals(
            out.includes('data-member-field="state"'),
            false,
        );
        assertStrictEquals(out.includes('Active'), false);
        assertMatch(
            out, /data-member-action="save"/,
        );
    },
);

Deno.test(
    'AIMemberDetailEditPresenter renders no State'
    + ' select',
    () => {
        const rec = makeRecordingContainer();
        const member = makeAIMember();
        new AIMemberDetailEditPresenter(
            member,
            aiMemberDraftFromMember(member),
        ).renderShell(rec.container);
        const out = rec.allHtml();
        assertStrictEquals(
            out.includes('id="ai-state"'), false,
        );
        assertStrictEquals(
            out.includes('data-member-field="state"'),
            false,
        );
        assertStrictEquals(
            /value="active"[\s\S]*?selected/.test(
                out,
            ),
            false,
        );
        // Save affordance present in edit mode.
        assertMatch(
            out, /data-member-action="save"/,
        );
        // Model select with optgroups and the
        // current model pre-selected.
        assertMatch(out, /id="ai-model"/);
        assertMatch(out, /<optgroup/);
        assertMatch(
            out,
            new RegExp(
                'value="'
                + firstProviderModel().id
                + '"[\\s\\S]*?selected',
            ),
        );
    },
);
