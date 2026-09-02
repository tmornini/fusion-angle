import {
    assertEquals,
    assertMatch,
    assertNotMatch,
    assertStrictEquals,
} from '@std/assert';
import {
    makeHumanMember, makeAIMember,
} from './member-fixtures.ts';
import {
    reduceRefresh, reduceSave, humanMemberPiiPatchIfDirty,
} from '../web-app/members/detail.ts';
import { HumanMember } from '../api/types.ts';
import {
    HumanMemberDetailPresenter,
} from '../web-app/app/presenters/human-member-detail.ts';

// None of these four modules reads localStorage (checked
// against the full product tree); window/document are
// stubbed because HumanMemberDetailPresenter walks a real
// DOM tree via renderShell/mutateSlot.
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
} as unknown as Window & typeof globalThis;
// @ts-expect-error — Node global stub
globalThis.document = { addEventListener: () => {} };

const HUMAN_DRAFT = {
    name: 'Sarah-edited Chen',
    email: 'sarah@example.com',
    title: 'Engineer',
    department: 'Engineering',
    phone: '555-0100',
    bio: 'Builds things.',
    strengths: ['Leadership'],
};

Deno.test(
    'editing state is preserved when fresh data'
    + ' arrives (sibling member mutated)',
    () => {
        const current = {
            kind: 'editing' as const,
            variant: 'human' as const,
            member: makeHumanMember('hw_1', 'Sarah Chen'),
            draft: HUMAN_DRAFT,
        };
        const fresh = makeHumanMember('hw_1', 'Sarah Chen');
        const next = reduceRefresh(current, fresh);
        // Same reference: the draft is sacred.
        assertStrictEquals(next, current);
    },
);

Deno.test(
    'reading + fresh human → reading human',
    () => {
        const current = {
            kind: 'reading' as const,
            variant: 'human' as const,
            member: makeHumanMember('hw_1', 'Sarah Chen'),
        };
        const fresh = makeHumanMember('hw_1', 'Sarah Chen');
        const next = reduceRefresh(current, fresh);
        assertStrictEquals(next.kind, 'reading');
        assertStrictEquals(next.variant, 'human');
        assertStrictEquals(next.member, fresh);
    },
);

Deno.test(
    'reading + fresh AI → reading AI',
    () => {
        const current = {
            kind: 'reading' as const,
            variant: 'ai' as const,
            member: makeAIMember('ai_1', 'Claude Opus'),
        };
        const fresh = makeAIMember('ai_1', 'Claude Opus');
        const next = reduceRefresh(current, fresh);
        assertStrictEquals(next.kind, 'reading');
        assertStrictEquals(next.variant, 'ai');
        assertStrictEquals(next.member, fresh);
    },
);

Deno.test(
    'reading + fresh null → current preserved'
    + ' (member vanished mid-session)',
    () => {
        const current = {
            kind: 'reading' as const,
            variant: 'human' as const,
            member: makeHumanMember('hw_1', 'Sarah Chen'),
        };
        const next = reduceRefresh(current, null);
        assertStrictEquals(next, current);
    },
);

Deno.test(
    'editing + fresh null → editing preserved',
    () => {
        const current = {
            kind: 'editing' as const,
            variant: 'human' as const,
            member: makeHumanMember('hw_1', 'Sarah Chen'),
            draft: HUMAN_DRAFT,
        };
        const next = reduceRefresh(current, null);
        assertStrictEquals(next, current);
    },
);

Deno.test(
    'reading human + fresh AI follows fresh.kind',
    () => {
        const current = {
            kind: 'reading' as const,
            variant: 'human' as const,
            member: makeHumanMember('hw_1', 'Sarah Chen'),
        };
        const fresh = makeAIMember('ai_1', 'Claude Opus');
        const next = reduceRefresh(current, fresh);
        assertStrictEquals(next.kind, 'reading');
        assertStrictEquals(next.variant, 'ai');
        assertStrictEquals(next.member, fresh);
    },
);

// ── humanMemberPiiPatchIfDirty (Phase 10 Task 2, delta 4): the
// detail save's dirty check — a detail-only save must omit the
// PUT identities/:id/pii second hop.

const ORIGINAL_PII = {
    erased: false as const,
    name: 'Sarah Chen',
    email: 'sarah@example.com',
    phone: '555-0100',
    bio: 'Builds things.',
};

Deno.test(
    'an unchanged draft returns undefined — a detail-only save'
    + ' omits the PUT identities/:id/pii call',
    () => {
        const patch = humanMemberPiiPatchIfDirty(
            {
                name: ORIGINAL_PII.name,
                email: ORIGINAL_PII.email,
                phone: ORIGINAL_PII.phone,
                bio: ORIGINAL_PII.bio,
            },
            ORIGINAL_PII,
        );
        assertStrictEquals(patch, undefined);
    },
);

Deno.test(
    'a changed field returns the full four-field patch',
    () => {
        const patch = humanMemberPiiPatchIfDirty(
            {
                name: 'Sarah C. Chen',
                email: ORIGINAL_PII.email,
                phone: ORIGINAL_PII.phone,
                bio: ORIGINAL_PII.bio,
            },
            ORIGINAL_PII,
        );
        assertEquals(patch, {
            name: 'Sarah C. Chen',
            email: ORIGINAL_PII.email,
            phone: ORIGINAL_PII.phone,
            bio: ORIGINAL_PII.bio,
        });
    },
);

Deno.test(
    'an erased original baselines against blank fields — an'
    + ' untouched erased member never fires a spurious PUT',
    () => {
        const patch = humanMemberPiiPatchIfDirty(
            { name: '', email: '', phone: '', bio: '' },
            { erased: true },
        );
        assertStrictEquals(patch, undefined);
    },
);

Deno.test(
    'an erased original with a newly entered name IS dirty',
    () => {
        const patch = humanMemberPiiPatchIfDirty(
            { name: 'New Name', email: '', phone: '', bio: '' },
            { erased: true },
        );
        assertEquals(patch, {
            name: 'New Name', email: '', phone: '', bio: '',
        });
    },
);

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

Deno.test(
    'reduceSave lands in read mode painting the fresh member',
    () => {
        const fresh = new HumanMember(
            { id: 'hw_1', type: 'human' },
            {
                present: true,
                title: 'Engineer',
                department: 'Engineering',
                strengths: ['Agile Methods'],
                team_dimensions: {},
            },
            {
                erased: false,
                name: 'Sarah Chen',
                email: 'sarah@example.com',
                phone: '555-0199',
                bio: 'Ships things.',
            },
        );
        const next = reduceSave(fresh);
        assertStrictEquals(next.kind, 'reading');
        assertStrictEquals(next.variant, 'human');
        assertStrictEquals(next.member, fresh);
        const rec = makeRecordingContainer();
        new HumanMemberDetailPresenter(fresh)
            .renderShell(rec.container);
        const out = rec.allHtml();
        assertMatch(out, /555-0199/);
        assertMatch(out, /Ships things\./);
        assertMatch(out, /Agile Methods/);
        assertNotMatch(out, /Builds things\./);
        assertMatch(out, /data-member-action="edit"/);
        assertNotMatch(
            out, /data-member-action="save"/,
        );
    },
);
