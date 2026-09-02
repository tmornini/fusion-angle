import { assert, assertStrictEquals } from '@std/assert';
import {
    HumanMember,
    AIMember,
    type Member,
} from '../api/types.ts';
import {
    makeHumanMember,
    makeAIMember,
} from './member-fixtures.ts';
import {
    ManagedMembersPresenter,
    buildInitialManagedMembersState,
    applyManagedMembersSearch,
    applyManagedMembersKind,
} from '../web-app/app/presenters/member.ts';

// presenters/member.ts never reads localStorage (checked
// against the full product tree); window/document are
// stubbed because ManagedMembersPresenter.render walks a
// real DOM element via addEventListener.

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

Deno.test(
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
        assert(
            youIdx >= 0,
            'YOU section must render',
        );
        assert(
            humansIdx > youIdx,
            'HUMANS must follow YOU',
        );
        assert(
            aisIdx > humansIdx,
            'AIs must follow HUMANS',
        );
    },
);

Deno.test(
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
        assert(
            youBlock.includes('Demo'),
            'YOU block must show self name',
        );
        assert(
            !youBlock.includes('Alice'),
            'YOU block must not show others',
        );
    },
);

Deno.test(
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
        assert(
            humansBlock.includes('Alice'),
            'HUMANS must include other humans',
        );
        const demoMatches = humansBlock
            .split('Demo').length - 1;
        assertStrictEquals(
            demoMatches, 0,
            'HUMANS must not include self',
        );
    },
);

Deno.test(
    'Self card carries data-self="true"',
    () => {
        const html = htmlOf(
            [
                makeHuman('self', 'Demo'),
                makeHuman('xdaJyuuPyHfffCGLhqDrOQ', 'Alice'),
            ],
            'self',
        );
        assert(
            html.includes('data-self="true"'),
            'self card must mark itself',
        );
        const selfTrueMatches = html
            .split('data-self="true"').length - 1;
        assertStrictEquals(
            selfTrueMatches, 1,
            'only one row carries data-self="true"',
        );
    },
);

Deno.test(
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
        assert(
            !html.includes('YOU'),
            'YOU must be hidden under kind=ai',
        );
        assert(
            !html.includes('HUMANS'),
            'HUMANS must be hidden under kind=ai',
        );
        assert(
            html.includes('AIs'),
            'AIs must remain visible',
        );
        assert(
            html.includes('Claude'),
            'Claude row must render',
        );
    },
);

Deno.test(
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
        assert(
            html.includes('YOU'),
            'YOU stays visible under kind=human',
        );
        assert(
            !html.includes('AIs'),
            'AIs hidden under kind=human',
        );
    },
);

Deno.test(
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
        assert(
            !html.includes('Zelda'),
            'self filtered out by search',
        );
        assert(
            html.includes('Alice'),
            'Alice remains under search',
        );
        assert(
            !html.includes('Claude'),
            'Claude filtered out by search',
        );
    },
);
