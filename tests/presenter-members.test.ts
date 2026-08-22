import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    HumanMember,
    AIMember,
    type Member,
} from '../api/types.ts';
import {
    makeHumanMember,
    makeAIMember,
} from './member-fixtures.ts';

// The member presenter transitively imports state.ts
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

const memberMod = await import(
    '../web-app/app/presenters/member.ts'
);
const {
    ManagedMembersPresenter,
    buildInitialManagedMembersState,
    applyManagedMembersSearch,
    applyManagedMembersKind,
} = memberMod;

function makeHuman(
    id: string,
    first: string,
    last: string = 'Smith',
): HumanMember {
    return makeHumanMember(id, `${first} ${last}`);
}

function makeAI(
    id: string,
    name: string,
): AIMember {
    return makeAIMember(id, name);
}

function htmlOf(
    members: Member[],
    currentId: string,
    transform: (s: ReturnType<
        typeof buildInitialManagedMembersState
    >) => ReturnType<
        typeof buildInitialManagedMembersState
    > = s => s,
): string {
    const state = transform(
        buildInitialManagedMembersState(
            members, currentId,
        ),
    );
    const el = makeStubEl();
    new ManagedMembersPresenter(state)
        .renderList(el as unknown as HTMLElement);
    return el.captured;
}

test(
    'ManagedMembersPresenter renders three sections'
    + ' with YOU above HUMANS above AIs',
    () => {
        const html = htmlOf(
            [
                makeHuman('self', 'Demo'),
                makeHuman('xdaJyuuPyHfffCGLhqDrOQ', 'Alice'),
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
    'YOU section contains only the current member',
    () => {
        const html = htmlOf(
            [
                makeHuman('self', 'Demo'),
                makeHuman('xdaJyuuPyHfffCGLhqDrOQ', 'Alice'),
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
    'HUMANS section excludes the current member',
    () => {
        const html = htmlOf(
            [
                makeHuman('self', 'Demo'),
                makeHuman('xdaJyuuPyHfffCGLhqDrOQ', 'Alice'),
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
                makeHuman('xdaJyuuPyHfffCGLhqDrOQ', 'Alice'),
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
                makeHuman('xdaJyuuPyHfffCGLhqDrOQ', 'Alice'),
                makeAI('ai1', 'Claude'),
            ],
            'self',
            s => applyManagedMembersKind(s, 'ai'),
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
                applyManagedMembersKind(s, 'human'),
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
                makeHuman('xdaJyuuPyHfffCGLhqDrOQ', 'Alice'),
                makeAI('ai1', 'Claude'),
            ],
            'self',
            s =>
                applyManagedMembersSearch(
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
