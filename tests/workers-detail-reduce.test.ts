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

const {
    HumanWorker, AIWorker,
    jsonArrayField, jsonObjectField,
} = await import('../api/types.ts');

const { reduceRefresh } = await import(
    '../web-app/workers/detail.ts'
);

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
    }, 'active');
}

test(
    'editing state is preserved when fresh data'
    + ' arrives (sibling worker mutated)',
    () => {
        const worker = makeHumanWorker();
        const current = {
            kind: 'editing' as const,
            variant: 'human' as const,
            worker,
            draft: {
                first_name: 'Sarah-edited',
                last_name: 'Chen',
                email: 'sarah@example.com',
                title: 'Engineer',
                department: 'Engineering',
                phone: '555-0100',
                bio: 'Builds things.',
                strengths: ['Leadership'],
                state: 'active' as const,
            },
        };
        const fresh = makeHumanWorker();
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
            worker: makeHumanWorker(),
        };
        const fresh = makeHumanWorker();
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
            worker: makeAIWorker(),
        };
        const fresh = makeAIWorker();
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
            worker: makeHumanWorker(),
        };
        const next = reduceRefresh(current, null);
        assert.equal(next, current);
    },
);

test(
    'editing + fresh null → editing preserved',
    () => {
        const worker = makeHumanWorker();
        const current = {
            kind: 'editing' as const,
            variant: 'human' as const,
            worker,
            draft: {
                first_name: 'Sarah-edited',
                last_name: 'Chen',
                email: 'sarah@example.com',
                title: 'Engineer',
                department: 'Engineering',
                phone: '555-0100',
                bio: 'Builds things.',
                strengths: ['Leadership'],
                state: 'active' as const,
            },
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
            worker: makeHumanWorker(),
        };
        const fresh = makeAIWorker();
        const next = reduceRefresh(current, fresh);
        assert.equal(next.kind, 'reading');
        assert.equal(next.variant, 'ai');
        assert.equal(next.worker, fresh);
    },
);
