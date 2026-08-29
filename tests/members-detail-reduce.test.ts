// state.ts (transitively imported via core.ts ->
// presenters) reads localStorage and window /
// document at module-eval time, which Node lacks.
// Stub before any import, then load the page-module
// reducer with dynamic import() so the stubs are in
// place. Same pattern as presenter-member-detail.
// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
} as unknown as Window & typeof globalThis;
// @ts-expect-error — Node global stub
globalThis.document = { addEventListener: () => {} };

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const { makeHumanMember, makeAIMember } = await import(
    './member-fixtures.ts'
);

const { reduceRefresh, reduceSave, humanMemberPiiPatchIfDirty } =
    await import('../web-app/members/detail.ts');

const { HumanMember } = await import('../api/types.ts');

const { HumanMemberDetailPresenter } = await import(
    '../web-app/app/presenters/human-member-detail.ts'
);

const HUMAN_DRAFT = {
    name: 'Sarah-edited Chen',
    email: 'sarah@example.com',
    title: 'Engineer',
    department: 'Engineering',
    phone: '555-0100',
    bio: 'Builds things.',
    strengths: ['Leadership'],
};

test(
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
        assert.equal(next, current);
    },
);

test(
    'reading + fresh human → reading human',
    () => {
        const current = {
            kind: 'reading' as const,
            variant: 'human' as const,
            member: makeHumanMember('hw_1', 'Sarah Chen'),
        };
        const fresh = makeHumanMember('hw_1', 'Sarah Chen');
        const next = reduceRefresh(current, fresh);
        assert.equal(next.kind, 'reading');
        assert.equal(next.variant, 'human');
        assert.equal(next.member, fresh);
    },
);

test(
    'reading + fresh AI → reading AI',
    () => {
        const current = {
            kind: 'reading' as const,
            variant: 'ai' as const,
            member: makeAIMember('ai_1', 'Claude Opus'),
        };
        const fresh = makeAIMember('ai_1', 'Claude Opus');
        const next = reduceRefresh(current, fresh);
        assert.equal(next.kind, 'reading');
        assert.equal(next.variant, 'ai');
        assert.equal(next.member, fresh);
    },
);

test(
    'reading + fresh null → current preserved'
    + ' (member vanished mid-session)',
    () => {
        const current = {
            kind: 'reading' as const,
            variant: 'human' as const,
            member: makeHumanMember('hw_1', 'Sarah Chen'),
        };
        const next = reduceRefresh(current, null);
        assert.equal(next, current);
    },
);

test(
    'editing + fresh null → editing preserved',
    () => {
        const current = {
            kind: 'editing' as const,
            variant: 'human' as const,
            member: makeHumanMember('hw_1', 'Sarah Chen'),
            draft: HUMAN_DRAFT,
        };
        const next = reduceRefresh(current, null);
        assert.equal(next, current);
    },
);

test(
    'reading human + fresh AI follows fresh.kind',
    () => {
        const current = {
            kind: 'reading' as const,
            variant: 'human' as const,
            member: makeHumanMember('hw_1', 'Sarah Chen'),
        };
        const fresh = makeAIMember('ai_1', 'Claude Opus');
        const next = reduceRefresh(current, fresh);
        assert.equal(next.kind, 'reading');
        assert.equal(next.variant, 'ai');
        assert.equal(next.member, fresh);
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

test(
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
        assert.equal(patch, undefined);
    },
);

test(
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
        assert.deepEqual(patch, {
            name: 'Sarah C. Chen',
            email: ORIGINAL_PII.email,
            phone: ORIGINAL_PII.phone,
            bio: ORIGINAL_PII.bio,
        });
    },
);

test(
    'an erased original baselines against blank fields — an'
    + ' untouched erased member never fires a spurious PUT',
    () => {
        const patch = humanMemberPiiPatchIfDirty(
            { name: '', email: '', phone: '', bio: '' },
            { erased: true },
        );
        assert.equal(patch, undefined);
    },
);

test(
    'an erased original with a newly entered name IS dirty',
    () => {
        const patch = humanMemberPiiPatchIfDirty(
            { name: 'New Name', email: '', phone: '', bio: '' },
            { erased: true },
        );
        assert.deepEqual(patch, {
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

test(
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
        assert.equal(next.kind, 'reading');
        assert.equal(next.variant, 'human');
        assert.equal(next.member, fresh);
        const rec = makeRecordingContainer();
        new HumanMemberDetailPresenter(fresh)
            .renderShell(rec.container);
        const out = rec.allHtml();
        assert.match(out, /555-0199/);
        assert.match(out, /Ships things\./);
        assert.match(out, /Agile Methods/);
        assert.doesNotMatch(out, /Builds things\./);
        assert.match(out, /data-member-action="edit"/);
        assert.doesNotMatch(
            out, /data-member-action="save"/,
        );
    },
);
