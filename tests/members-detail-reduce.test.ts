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
// @ts-expect-error — Node global stub
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
};
// @ts-expect-error — Node global stub
globalThis.document = { addEventListener: () => {} };

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const { makeHumanMember, makeAIMember } = await import(
    './member-fixtures.ts'
);

const { reduceRefresh } = await import(
    '../web-app/members/detail.ts'
);

const HUMAN_DRAFT = {
    name: 'Sarah-edited Chen',
    email: 'sarah@example.com',
    title: 'Engineer',
    department: 'Engineering',
    phone: '555-0100',
    bio: 'Builds things.',
    strengths: ['Leadership'],
    state: 'active' as const,
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
