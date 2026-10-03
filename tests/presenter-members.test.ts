import { assert, assertStrictEquals } from '@std/assert';
import {
    FormerMember,
    HumanMember,
    AIMember,
    type Member,
} from '../shared/types.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import { formatDate } from
    '../web-app/app/format.ts';
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

const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const LEAVER = 'toccYYkLEABmlbpHJalgtQ';
const OTHER_LEAVER = 'bwucHkonTVuOMXyaLxC21A';
const REMOVED_AT = '2026-03-15T18:04:05.000000Z';
const OTHER_REMOVED_AT = '2026-04-02T12:00:00.000000Z';

function makeFormer(
    identityId: string,
    at: string,
): FormerMember {
    return new FormerMember({
        id: membershipNameOf(STARK, identityId),
        organization_id: STARK,
        identity_id: identityId,
        type: 'member',
        state: 'removed',
        at,
    });
}

function formerHtml(
    members: Member[],
    membership: 'accepted' | 'removed',
    transform: (s: ReturnType<
        typeof buildInitialManagedMembersState
    >) => ReturnType<
        typeof buildInitialManagedMembersState
    > = s => s,
): string {
    return htmlOf(
        members,
        'self',
        s => ({
            ...transform(s),
            membership,
        }),
    );
}

Deno.test(
    'former members render one row each, the removal'
    + ' date, and no edit link',
    () => {
        const html = formerHtml(
            [
                makeHuman('self', 'Demo'),
                makeFormer(LEAVER, REMOVED_AT),
                makeFormer(OTHER_LEAVER, OTHER_REMOVED_AT),
            ],
            'removed',
        );
        assertStrictEquals(
            html.split('member-row-former').length - 1,
            2,
        );
        assertStrictEquals(
            html.split('Former member').length - 1,
            2,
        );
        assert(
            html.includes(formatDate(REMOVED_AT)),
            'the row shows the removal date',
        );
        assert(
            html.includes(formatDate(OTHER_REMOVED_AT)),
            'each removed membership keeps its own date',
        );
        assert(
            !html.includes('<a'),
            'a former row has no edit link',
        );
        assert(
            !html.includes('member-detail'),
            'a former row does not open member detail',
        );
        assert(
            !html.includes('data-member-id'),
            'a former row is not an editable member',
        );
        assert(
            !html.includes(LEAVER),
            'a former row does not show the identity id',
        );
        assert(
            !html.includes(OTHER_LEAVER),
            'a former row does not show the identity id',
        );
        assert(
            !html.includes('@'),
            'a former row invents no email',
        );
        assert(
            !html.includes('YOU'),
            'former members are not the YOU section',
        );
        assert(
            !html.includes('HUMANS'),
            'former members are not the HUMANS section',
        );
        assert(
            !html.includes('Demo'),
            'a live member is not a former row',
        );
    },
);

Deno.test(
    'a former list with kind and search still shows'
    + ' every former row',
    () => {
        const html = formerHtml(
            [
                makeHuman('self', 'Demo'),
                makeFormer(LEAVER, REMOVED_AT),
            ],
            'removed',
            s => applyManagedMembersKind(
                applyManagedMembersSearch(s, 'zzz'),
                'ai',
            ),
        );
        assertStrictEquals(
            html.split('member-row-former').length - 1,
            1,
        );
        assert(html.includes('Former member'));
        assert(html.includes(formatDate(REMOVED_AT)));
        assert(!html.includes('YOU'));
        assert(!html.includes('HUMANS'));
        assert(!html.includes('AIs'));
        assert(!html.includes('Demo'));
        assert(!html.includes(LEAVER));
    },
);

Deno.test(
    'members pressed still renders today\'s rows',
    () => {
        const html = formerHtml(
            [
                makeHuman('self', 'Demo'),
                makeHuman(
                    'xdaJyuuPyHfffCGLhqDrOQ', 'Alice',
                ),
            ],
            'accepted',
        );
        assert(html.includes('YOU'));
        assert(html.includes('Demo'));
        assert(html.includes('HUMANS'));
        assert(html.includes('Alice'));
        assert(html.includes('data-member-id'));
        assert(!html.includes('member-row-former'));
        assert(!html.includes('Former member'));
    },
);
