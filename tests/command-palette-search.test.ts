import { assert, assertStrictEquals } from '@std/assert';
import {
    searchItems,
    ideaToSearchItem,
    projectToSearchItem,
    humanMemberToSearchItem,
} from '../web-app/app/command-palette.ts';
import type {
    SearchItem,
} from '../web-app/app/command-palette.ts';
import {
    Idea, Project, HumanMember,
    type IdeaState,
} from '../api/types.ts';

function buildIdea(
    id: string, title: string,
    state: IdeaState = 'active',
): Idea {
    return new Idea({
        id,
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        title,
        position: 1,
        problem_statement: '',
        target_users: '',
        proposed_solution: '',
        expected_outcome: '',
        success_metrics: '',
        state,
    }, {
        state,
    });
}

function buildProject(
    id: string, title: string,
): Project {
    return new Project({
        id,
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
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
    }, {
        state: 'approved',
    });
}

function buildHumanMember(
    id: string,
    first: string, last: string,
    title = 'engineer',
    department = 'Eng',
): HumanMember {
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
            name: first + ' ' + last,
            email: first.toLowerCase()
                + '@example.com',
            phone: '',
            bio: '',
        },
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
        keywords: 'sweet pastry',
    },
    {
        id: 'b',
        title: 'Banana Bread',
        meta: 'baked goods',
        category: 'ideas',
        icon: undefined as unknown as never,
        href: '/b',
        keywords: 'sweet loaf',
    },
    {
        id: 'c',
        title: 'Cheese Plate',
        meta: 'savory',
        category: 'ideas',
        icon: undefined as unknown as never,
        href: '/c',
        keywords: 'aged dairy',
    },
];

Deno.test(
    'searchItems empty query returns first N',
    () => {
        const out = searchItems(sampleItems, '');
        assertStrictEquals(
            out.length, sampleItems.length,
            'all items returned (under cap)',
        );
    },
);

Deno.test(
    'searchItems empty query caps at default count',
    () => {
        const many: SearchItem[] = Array
            .from({ length: 50 }, (_, i) => ({
                id: 'x' + i,
                title: 'Item ' + i,
                meta: '',
                category: 'pages',
                icon: undefined as unknown as never,
                href: '/x',
                keywords: '',
            }));
        const out = searchItems(many, '   ');
        assertStrictEquals(
            out.length, 12,
            'caps at 12 default results',
        );
    },
);

Deno.test(
    'searchItems matches title case-insensitively',
    () => {
        const out = searchItems(
            sampleItems, 'APPLE',
        );
        assertStrictEquals(out.length, 1);
        assertStrictEquals(out[0]!.id, 'a');
    },
);

Deno.test(
    'searchItems matches meta',
    () => {
        const out = searchItems(
            sampleItems, 'savory',
        );
        assertStrictEquals(out.length, 1);
        assertStrictEquals(out[0]!.id, 'c');
    },
);

Deno.test(
    'searchItems matches keywords',
    () => {
        const out = searchItems(
            sampleItems, 'pastry',
        );
        assertStrictEquals(out.length, 1);
        assertStrictEquals(out[0]!.id, 'a');
    },
);

Deno.test(
    'searchItems matches across rows',
    () => {
        const out = searchItems(
            sampleItems, 'sweet',
        );
        assertStrictEquals(out.length, 2);
    },
);

Deno.test(
    'searchItems no match returns empty',
    () => {
        const out = searchItems(
            sampleItems, 'zzzz',
        );
        assertStrictEquals(out.length, 0);
    },
);

Deno.test(
    'ideaToSearchItem builds correct shape',
    () => {
        const tuple = {
            idea: buildIdea('fndCYAsXazdzMUlEGMNIZw', 'My Idea'),
            entity: undefined as unknown as never,
            submitterName: 'Alice',
            submittedAt: '2026-01-01',
        };
        const out = ideaToSearchItem(tuple);
        assertStrictEquals(out.id, 'idea-fndCYAsXazdzMUlEGMNIZw');
        assertStrictEquals(out.title, 'My Idea');
        assertStrictEquals(out.category, 'ideas');
        assert(
            out.keywords.includes('Alice'),
        );
    },
);

Deno.test(
    'ideaToSearchItem normalises hyphens in status',
    () => {
        const tuple = {
            idea: buildIdea(
                'fxysGbBPBsnCwJNJsyZnkA', 'Other',
                'approved',
            ),
            entity: undefined as unknown as never,
            submitterName: 'Bob',
            submittedAt: '2026-01-01',
        };
        const out = ideaToSearchItem(tuple);
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
        assert(
            out.keywords.includes('pm'),
            'title in keywords',
        );
        assert(
            out.keywords.includes('Product'),
            'department in keywords',
        );
        assert(
            out.keywords.includes(
                'carol@example.com',
            ),
            'email in keywords',
        );
    },
);

Deno.test(
    'searchItems search by member email works',
    () => {
        const memberItem = humanMemberToSearchItem(
            buildHumanMember(
                'u1', 'Carol', 'Smith',
            ),
        );
        const out = searchItems(
            [memberItem], 'carol@',
        );
        assertStrictEquals(out.length, 1);
    },
);
