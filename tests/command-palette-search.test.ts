import { test } from 'node:test';
import { strict as assert } from 'node:assert';
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
        title,
        position: 1,
        problem_statement: '',
        target_users: '',
        proposed_solution: '',
        expected_outcome: '',
        success_metrics: '',
    }, {
        state,
        stateAt: '2026-01-01T00:00:00.000000Z',
        stateEventId: 'ev-' + id,
    });
}

function buildProject(
    id: string, title: string,
): Project {
    return new Project({
        id,
        title,
        description: 'desc',
        progress: 42,
        start_date: '2026-01-01',
        target_end_date:
            '2026-06-01T00:00:00Z',
        estimated_cost: 0,
        actual_cost: 0,
        position: 1,
    }, {
        state: 'approved',
        stateAt: '2026-01-01T00:00:00.000000Z',
        stateEventId: 'ev-' + id,
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
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'st-' + id,
        },
        {
            id,
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
        {
            state: 'active',
            stateAt: '2026-01-01T00:00:00.000000Z',
            stateEventId: 'st-' + id,
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

test(
    'searchItems empty query returns first N',
    () => {
        const out = searchItems(sampleItems, '');
        assert.equal(
            out.length, sampleItems.length,
            'all items returned (under cap)',
        );
    },
);

test(
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
        assert.equal(
            out.length, 12,
            'caps at 12 default results',
        );
    },
);

test(
    'searchItems matches title case-insensitively',
    () => {
        const out = searchItems(
            sampleItems, 'APPLE',
        );
        assert.equal(out.length, 1);
        assert.equal(out[0]!.id, 'a');
    },
);

test(
    'searchItems matches meta',
    () => {
        const out = searchItems(
            sampleItems, 'savory',
        );
        assert.equal(out.length, 1);
        assert.equal(out[0]!.id, 'c');
    },
);

test(
    'searchItems matches keywords',
    () => {
        const out = searchItems(
            sampleItems, 'pastry',
        );
        assert.equal(out.length, 1);
        assert.equal(out[0]!.id, 'a');
    },
);

test(
    'searchItems matches across rows',
    () => {
        const out = searchItems(
            sampleItems, 'sweet',
        );
        assert.equal(out.length, 2);
    },
);

test(
    'searchItems no match returns empty',
    () => {
        const out = searchItems(
            sampleItems, 'zzzz',
        );
        assert.equal(out.length, 0);
    },
);

test(
    'ideaToSearchItem builds correct shape',
    () => {
        const tuple = {
            idea: buildIdea('i1', 'My Idea'),
            entity: undefined as unknown as never,
            submitterName: 'Alice',
            submittedAt: '2026-01-01',
        };
        const out = ideaToSearchItem(tuple);
        assert.equal(out.id, 'idea-i1');
        assert.equal(out.title, 'My Idea');
        assert.equal(out.category, 'ideas');
        assert.ok(
            out.keywords.includes('Alice'),
        );
    },
);

test(
    'ideaToSearchItem normalises hyphens in status',
    () => {
        const tuple = {
            idea: buildIdea(
                'i2', 'Other',
                'approved',
            ),
            entity: undefined as unknown as never,
            submitterName: 'Bob',
            submittedAt: '2026-01-01',
        };
        const out = ideaToSearchItem(tuple);
        assert.ok(
            !out.meta.includes('-'),
            'hyphens stripped from meta',
        );
    },
);

test(
    'projectToSearchItem builds correct shape',
    () => {
        const out = projectToSearchItem(
            buildProject('p1', 'My Project'),
        );
        assert.equal(out.id, 'project-p1');
        assert.equal(out.title, 'My Project');
        assert.equal(out.category, 'projects');
        assert.ok(
            out.meta.includes('42%'),
            'meta includes progress',
        );
    },
);

test(
    'humanMemberToSearchItem builds correct shape',
    () => {
        const out = humanMemberToSearchItem(
            buildHumanMember(
                'u1', 'Carol', 'Smith',
                'pm', 'Product',
            ),
        );
        assert.equal(out.id, 'member-u1');
        assert.equal(out.title, 'Carol Smith');
        assert.equal(out.category, 'members');
        assert.ok(
            out.keywords.includes('pm'),
            'title in keywords',
        );
        assert.ok(
            out.keywords.includes('Product'),
            'department in keywords',
        );
        assert.ok(
            out.keywords.includes(
                'carol@example.com',
            ),
            'email in keywords',
        );
    },
);

test(
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
        assert.equal(out.length, 1);
    },
);
