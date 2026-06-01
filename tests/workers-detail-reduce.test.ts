// state.ts (transitively imported via core.ts ->
// presenters) reads localStorage and window /
// document at module-eval time, which Node lacks.
// Stub before any import, then load the page-module
// reducer with dynamic import() so the stubs are in
// place. Same pattern as presenter-worker-detail.
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

const { makeHumanWorker, makeAIWorker } = await import(
    './worker-fixtures.ts'
);

const { reduceRefresh } = await import(
    '../web-app/workers/detail.ts'
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
    + ' arrives (sibling worker mutated)',
    () => {
        const current = {
            kind: 'editing' as const,
            variant: 'human' as const,
            worker: makeHumanWorker('hw_1', 'Sarah Chen'),
            draft: HUMAN_DRAFT,
        };
        const fresh = makeHumanWorker('hw_1', 'Sarah Chen');
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
            worker: makeHumanWorker('hw_1', 'Sarah Chen'),
        };
        const fresh = makeHumanWorker('hw_1', 'Sarah Chen');
        const next = reduceRefresh(current, fresh);
        assert.equal(next.kind, 'reading');
        assert.equal(next.variant, 'human');
        assert.equal(next.worker, fresh);
    },
);

test(
    'reading + fresh AI → reading AI',
    () => {
        const current = {
            kind: 'reading' as const,
            variant: 'ai' as const,
            worker: makeAIWorker('ai_1', 'Claude Opus'),
        };
        const fresh = makeAIWorker('ai_1', 'Claude Opus');
        const next = reduceRefresh(current, fresh);
        assert.equal(next.kind, 'reading');
        assert.equal(next.variant, 'ai');
        assert.equal(next.worker, fresh);
    },
);

test(
    'reading + fresh null → current preserved'
    + ' (worker vanished mid-session)',
    () => {
        const current = {
            kind: 'reading' as const,
            variant: 'human' as const,
            worker: makeHumanWorker('hw_1', 'Sarah Chen'),
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
            worker: makeHumanWorker('hw_1', 'Sarah Chen'),
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
            worker: makeHumanWorker('hw_1', 'Sarah Chen'),
        };
        const fresh = makeAIWorker('ai_1', 'Claude Opus');
        const next = reduceRefresh(current, fresh);
        assert.equal(next.kind, 'reading');
        assert.equal(next.variant, 'ai');
        assert.equal(next.worker, fresh);
    },
);
