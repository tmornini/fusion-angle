import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    defaultSearchItems,
    matchedSearchItems,
    ideaToSearchItem,
    projectToSearchItem,
    humanMemberToSearchItem,
    membershipToSearchItem,
} from '../web-app/app/command-palette.ts';
import type {
    PageSearchEntry,
    SearchItem,
} from '../web-app/app/command-palette.ts';
import {
    Idea, Project, HumanMember,
    type IdeaEntity,
    type IdeaState,
    type IdentityPiiEntity,
    type MembershipEntity,
    type MembershipReadEntity,
    type ProjectEntity,
} from '../shared/types.ts';
import {
    MEMBER_WITHOUT_PII_NAME,
    type OrganizationMatches,
} from '../client/index.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { responseMessage } from './fixtures/response-message.ts';

const ORGANIZATION_ID = 'AjdvjuECVZEgZoFajaIEkg';

function buildIdeaMessage(
    id: string, title: string,
    state: IdeaState = 'active',
): HttpMessage<IdeaEntity> {
    return responseMessage<IdeaEntity>({
        id,
        organization_id: ORGANIZATION_ID,
        title,
        position: 1,
        problem_statement: '',
        target_users: '',
        proposed_solution: '',
        expected_outcome: '',
        success_metrics: '',
        state,
    });
}

function buildIdea(
    id: string, title: string,
    state: IdeaState = 'active',
): Idea {
    return new Idea(buildIdeaMessage(id, title, state), state);
}

function buildProjectMessage(
    id: string, title: string,
): HttpMessage<ProjectEntity> {
    return responseMessage<ProjectEntity>({
        id,
        organization_id: ORGANIZATION_ID,
        title,
        description: 'desc',
        progress: 42,
        start_date: '2026-01-01',
        target_end_date:
            '2026-06-01T00:00:00Z',
        estimated_cost: 0,
        actual_cost: 0,
        position: 1,
        state: 'approved',
    });
}

function buildProject(
    id: string, title: string,
): Project {
    return new Project(buildProjectMessage(id, title), 'approved');
}

function buildMembershipMessage(
    identityId: string,
    pii:
        | { readonly name: string; readonly email: string }
        | 'erased',
): HttpMessage<MembershipReadEntity> {
    const joined = pii === 'erased'
        ? {}
        : { invitee_name: pii.name, invitee_email: pii.email };
    return responseMessage<MembershipReadEntity>({
        id: ORGANIZATION_ID + ':' + identityId,
        organization_id: ORGANIZATION_ID,
        identity_id: identityId,
        type: 'member',
        state: 'accepted',
        at: '2026-01-01T00:00:00.000000Z',
        identity_kind: 'person',
        ...joined,
    });
}

function buildPage(
    title: string, keywords: string,
): PageSearchEntry {
    return {
        item: {
            id: 'page-' + title,
            title,
            meta: 'Page',
            category: 'pages',
            icon: undefined as unknown as never,
            href: '/' + title,
        },
        keywords,
    };
}

const NO_MATCHES: OrganizationMatches = {
    ideas: [], projects: [], members: [],
};

function buildHumanMember(
    id: string,
    first: string, last: string,
    title = 'engineer',
    department = 'Eng',
): HumanMember {
    const pii = {
        name: first + ' ' + last,
        email: first.toLowerCase()
            + '@example.com',
        phone: '',
        bio: '',
    };
    return new HumanMember(
        {
            id,
            type: 'human',
        },
        {
            present: true,
            title,
            department,
            strengths: [],
            team_dimensions: {},
        },
        {
            erased: false,
            ...pii,
            message: responseMessage<IdentityPiiEntity>({
                id, ...pii,
            }),
        },
        responseMessage<MembershipEntity>({
            id,
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            identity_id: id,
            type: 'member',
            state: 'accepted',
            at: '2026-01-01T00:00:00.000000Z',
        }),
    );
}

const sampleItems: SearchItem[] = [
    {
        id: 'a',
        title: 'Apple Pie',
        meta: 'dessert',
        category: 'ideas',
        icon: undefined as unknown as never,
        href: '/a',
    },
    {
        id: 'b',
        title: 'Banana Bread',
        meta: 'baked goods',
        category: 'ideas',
        icon: undefined as unknown as never,
        href: '/b',
    },
    {
        id: 'c',
        title: 'Cheese Plate',
        meta: 'savory',
        category: 'ideas',
        icon: undefined as unknown as never,
        href: '/c',
    },
];

Deno.test(
    'defaultSearchItems returns first N',
    () => {
        const out = defaultSearchItems(sampleItems);
        assertStrictEquals(
            out.length, sampleItems.length,
            'all items returned (under cap)',
        );
    },
);

Deno.test(
    'defaultSearchItems caps at default count',
    () => {
        const many: SearchItem[] = Array
            .from({ length: 50 }, (_, i) => ({
                id: 'x' + i,
                title: 'Item ' + i,
                meta: '',
                category: 'pages',
                icon: undefined as unknown as never,
                href: '/x',
            }));
        const out = defaultSearchItems(many);
        assertStrictEquals(
            out.length, 12,
            'caps at 12 default results',
        );
    },
);

Deno.test(
    'matchedSearchItems groups in category order',
    () => {
        const out = matchedSearchItems(
            {
                members: [buildMembershipMessage('u1', {
                    name: 'Kestrel Smith',
                    email: 'kestrel@example.com',
                })],
                projects: [buildProjectMessage(
                    'pnXmXrxOWayANgDLdCjuBw', 'Kestrel Launch',
                )],
                ideas: [buildIdeaMessage(
                    'fndCYAsXazdzMUlEGMNIZw', 'Kestrel Nest',
                )],
            },
            [buildPage('Kestrel Board', '')],
            'kestrel',
        );
        assertEquals(
            out.map(item => item.category),
            ['ideas', 'projects', 'members', 'pages'],
        );
    },
);

Deno.test(
    'matchedSearchItems keeps answer order within each',
    () => {
        const out = matchedSearchItems(
            {
                ideas: [
                    buildIdeaMessage('i2', 'Zebra'),
                    buildIdeaMessage('i1', 'Aardvark'),
                ],
                projects: [
                    buildProjectMessage('p2', 'Zebra'),
                    buildProjectMessage('p1', 'Aardvark'),
                ],
                members: [
                    buildMembershipMessage('u2', {
                        name: 'Zed', email: 'zed@example.com',
                    }),
                    buildMembershipMessage('u1', {
                        name: 'Abe', email: 'abe@example.com',
                    }),
                ],
            },
            [],
            'zebra',
        );
        assertEquals(
            out.map(item => item.id),
            [
                'idea-i2', 'idea-i1',
                'project-p2', 'project-p1',
                'member-u2', 'member-u1',
            ],
        );
    },
);

Deno.test(
    'matchedSearchItems hides archived and deleted ideas',
    () => {
        const out = matchedSearchItems(
            {
                ...NO_MATCHES,
                ideas: [
                    buildIdeaMessage('i1', 'Kept', 'active'),
                    buildIdeaMessage('i2', 'Shelved', 'archived'),
                    buildIdeaMessage('i3', 'Gone', 'deleted'),
                ],
            },
            [],
            'idea',
        );
        assertEquals(out.map(item => item.id), ['idea-i1']);
    },
);

Deno.test(
    'matchedSearchItems ranks pages by the matcher',
    () => {
        const workbox = buildPage('Workbox', 'work orders inbox');
        const ideas = buildPage('Ideas', 'submit propose');
        const out = matchedSearchItems(
            NO_MATCHES, [ideas, workbox], 'wrkbox',
        );
        assertEquals(out, [workbox.item]);
    },
);

Deno.test(
    'matchedSearchItems puts exact pages before edited ones',
    () => {
        const flaw = buildPage('Flaw Report', '');
        const flows = buildPage('Flows', '');
        const out = matchedSearchItems(
            NO_MATCHES, [flaw, flows], 'flow',
        );
        assertEquals(out, [flows.item, flaw.item]);
    },
);

Deno.test(
    'matchedSearchItems matches a page on its keywords',
    () => {
        const workbox = buildPage('Workbox', 'work orders inbox');
        const out = matchedSearchItems(
            NO_MATCHES, [workbox], 'inbox',
        );
        assertEquals(out, [workbox.item]);
    },
);

Deno.test(
    'matchedSearchItems no match returns empty',
    () => {
        const out = matchedSearchItems(
            NO_MATCHES,
            [buildPage('Workbox', 'work orders inbox')],
            'zzzz',
        );
        assertStrictEquals(out.length, 0);
    },
);

Deno.test(
    'ideaToSearchItem builds correct shape',
    () => {
        const out = ideaToSearchItem(
            buildIdea('fndCYAsXazdzMUlEGMNIZw', 'My Idea'),
        );
        assertStrictEquals(out.id, 'idea-fndCYAsXazdzMUlEGMNIZw');
        assertStrictEquals(out.title, 'My Idea');
        assertStrictEquals(out.category, 'ideas');
    },
);

Deno.test(
    'ideaToSearchItem normalises hyphens in status',
    () => {
        const out = ideaToSearchItem(
            buildIdea(
                'fxysGbBPBsnCwJNJsyZnkA', 'Other',
                'approved',
            ),
        );
        assert(
            !out.meta.includes('-'),
            'hyphens stripped from meta',
        );
    },
);

Deno.test(
    'projectToSearchItem builds correct shape',
    () => {
        const out = projectToSearchItem(
            buildProject('pnXmXrxOWayANgDLdCjuBw', 'My Project'),
        );
        assertStrictEquals(out.id, 'project-pnXmXrxOWayANgDLdCjuBw');
        assertStrictEquals(out.title, 'My Project');
        assertStrictEquals(out.category, 'projects');
        assert(
            out.meta.includes('42%'),
            'meta includes progress',
        );
    },
);

Deno.test(
    'humanMemberToSearchItem builds correct shape',
    () => {
        const out = humanMemberToSearchItem(
            buildHumanMember(
                'u1', 'Carol', 'Smith',
                'pm', 'Product',
            ),
        );
        assertStrictEquals(out.id, 'member-u1');
        assertStrictEquals(out.title, 'Carol Smith');
        assertStrictEquals(out.category, 'members');
    },
);

Deno.test(
    'membershipToSearchItem builds correct shape',
    () => {
        const out = membershipToSearchItem(
            buildMembershipMessage('u1', {
                name: 'Carol Smith', email: 'carol@example.com',
            }),
        );
        assertStrictEquals(out.id, 'member-u1');
        assertStrictEquals(out.title, 'Carol Smith');
        assertStrictEquals(out.category, 'members');
    },
);

Deno.test(
    'membershipToSearchItem names an erased member',
    () => {
        const out = membershipToSearchItem(
            buildMembershipMessage('u1', 'erased'),
        );
        assertStrictEquals(out.title, MEMBER_WITHOUT_PII_NAME);
    },
);

Deno.test(
    'matchedSearchItems keeps a member matched by email',
    () => {
        const out = matchedSearchItems(
            {
                ...NO_MATCHES,
                members: [buildMembershipMessage('u1', {
                    name: 'Carol Smith',
                    email: 'carol@example.com',
                })],
            },
            [],
            'carol@',
        );
        assertStrictEquals(out.length, 1);
    },
);
