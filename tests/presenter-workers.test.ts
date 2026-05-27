import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    HumanWorker,
    AIWorker,
    type HumanWorkerEntity,
    type AIWorkerEntity,
    type Worker,
} from '../api/types.ts';

// The worker presenter transitively imports state.ts
// (via core.ts), which reads from localStorage and
// addEventListener at module init. Stub the browser
// globals here and dynamic-import after they land.

interface StubEl {
    captured: string;
    writes: number;
}

function makeStubEl(): StubEl {
    const state: StubEl = {
        captured: '', writes: 0,
    };
    Object.defineProperty(state, 'innerHTML', {
        set(value: string): void {
            state.captured = value;
            state.writes++;
        },
        get(): string {
            return state.captured;
        },
    });
    return state;
}

const g = globalThis as Record<string, unknown>;
g['localStorage'] = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
};
g['window'] = {
    matchMedia: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
    }),
    addEventListener: () => {},
};
g['document'] = {
    addEventListener: () => {},
};

const workerMod = await import(
    '../web-app/app/presenters/worker.ts'
);
const {
    ManagedWorkersPresenter,
    buildInitialManagedWorkersState,
    applyManagedWorkersSearch,
    applyManagedWorkersKind,
} = workerMod;

function makeHuman(
    id: string,
    first: string,
    last: string = 'Smith',
): HumanWorker {
    const entity: HumanWorkerEntity = {
        id,
        first_name: first,
        last_name: last,
        email:
            `${first}@example.com`.toLowerCase(),
        title: 'Engineer',
        department: 'Product',
        strengths: '[]' as never,
        team_dimensions: '{}' as never,
        phone: '',
        bio: '',
    };
    return new HumanWorker(entity, 'active');
}

function makeAI(
    id: string,
    name: string,
): AIWorker {
    const entity: AIWorkerEntity = {
        id,
        name,
        provider: 'Anthropic',
        description: 'test',
        auth_token: 'sk-test-token-12345',
    };
    return new AIWorker(entity);
}

function htmlOf(
    workers: Worker[],
    currentId: string,
    transform: (s: ReturnType<
        typeof buildInitialManagedWorkersState
    >) => ReturnType<
        typeof buildInitialManagedWorkersState
    > = s => s,
): string {
    const state = transform(
        buildInitialManagedWorkersState(
            workers, currentId,
        ),
    );
    const el = makeStubEl();
    new ManagedWorkersPresenter(state)
        .renderList(el as unknown as HTMLElement);
    return el.captured;
}

test(
    'ManagedWorkersPresenter renders three sections'
    + ' with YOU above HUMANS above AIs',
    () => {
        const html = htmlOf(
            [
                makeHuman('self', 'Demo'),
                makeHuman('w1', 'Alice'),
                makeAI('ai1', 'Claude'),
            ],
            'self',
        );
        const youIdx = html.indexOf('YOU');
        const humansIdx = html.indexOf('HUMANS');
        const aisIdx = html.indexOf('AIs');
        assert.ok(
            youIdx >= 0,
            'YOU section must render',
        );
        assert.ok(
            humansIdx > youIdx,
            'HUMANS must follow YOU',
        );
        assert.ok(
            aisIdx > humansIdx,
            'AIs must follow HUMANS',
        );
    },
);

test(
    'YOU section contains only the current worker',
    () => {
        const html = htmlOf(
            [
                makeHuman('self', 'Demo'),
                makeHuman('w1', 'Alice'),
            ],
            'self',
        );
        const youBlock = html.slice(
            html.indexOf('YOU'),
            html.indexOf('HUMANS'),
        );
        assert.ok(
            youBlock.includes('Demo'),
            'YOU block must show self name',
        );
        assert.ok(
            !youBlock.includes('Alice'),
            'YOU block must not show others',
        );
    },
);

test(
    'HUMANS section excludes the current worker',
    () => {
        const html = htmlOf(
            [
                makeHuman('self', 'Demo'),
                makeHuman('w1', 'Alice'),
            ],
            'self',
        );
        const humansBlock = html.slice(
            html.indexOf('HUMANS'),
        );
        assert.ok(
            humansBlock.includes('Alice'),
            'HUMANS must include other humans',
        );
        const demoMatches = humansBlock
            .split('Demo').length - 1;
        assert.equal(
            demoMatches, 0,
            'HUMANS must not include self',
        );
    },
);

test(
    'Self card carries data-self="true"',
    () => {
        const html = htmlOf(
            [
                makeHuman('self', 'Demo'),
                makeHuman('w1', 'Alice'),
            ],
            'self',
        );
        assert.ok(
            html.includes('data-self="true"'),
            'self card must mark itself',
        );
        const selfTrueMatches = html
            .split('data-self="true"').length - 1;
        assert.equal(
            selfTrueMatches, 1,
            'only one row carries data-self="true"',
        );
    },
);

test(
    'kind=ai filter hides YOU and HUMANS',
    () => {
        const html = htmlOf(
            [
                makeHuman('self', 'Demo'),
                makeHuman('w1', 'Alice'),
                makeAI('ai1', 'Claude'),
            ],
            'self',
            s => applyManagedWorkersKind(s, 'ai'),
        );
        assert.ok(
            !html.includes('YOU'),
            'YOU must be hidden under kind=ai',
        );
        assert.ok(
            !html.includes('HUMANS'),
            'HUMANS must be hidden under kind=ai',
        );
        assert.ok(
            html.includes('AIs'),
            'AIs must remain visible',
        );
        assert.ok(
            html.includes('Claude'),
            'Claude row must render',
        );
    },
);

test(
    'kind=human filter hides AIs but keeps YOU',
    () => {
        const html = htmlOf(
            [
                makeHuman('self', 'Demo'),
                makeAI('ai1', 'Claude'),
            ],
            'self',
            s =>
                applyManagedWorkersKind(s, 'human'),
        );
        assert.ok(
            html.includes('YOU'),
            'YOU stays visible under kind=human',
        );
        assert.ok(
            !html.includes('AIs'),
            'AIs hidden under kind=human',
        );
    },
);

test(
    'search filter applies to all three sections',
    () => {
        const html = htmlOf(
            [
                makeHuman('self', 'Zelda'),
                makeHuman('w1', 'Alice'),
                makeAI('ai1', 'Claude'),
            ],
            'self',
            s =>
                applyManagedWorkersSearch(
                    s, 'alice',
                ),
        );
        assert.ok(
            !html.includes('Zelda'),
            'self filtered out by search',
        );
        assert.ok(
            html.includes('Alice'),
            'Alice remains under search',
        );
        assert.ok(
            !html.includes('Claude'),
            'Claude filtered out by search',
        );
    },
);
