import { assertEquals } from '@std/assert';
import {
    rankedBySearch,
    type SearchMatch,
    searchMatchOf,
    searchWordsOf,
} from '../shared/search-match.ts';

const uuid = '3f2a9c1e-7b4d-4e8a-9c21-5d6f0a1b2c3d';
const uuidText = `work order ${uuid}`;
const identifier = 'Ab_c-DeFgHiJkLmNoPqRsTu';
const identifierText = `member ${identifier} joined`;

type Row = {
    readonly name: string;
    readonly query: string;
    readonly fields: readonly string[];
    readonly expected: SearchMatch;
};

const matched = (edits: number): SearchMatch => ({
    kind: 'matched',
    edits,
});
const missed: SearchMatch = { kind: 'missed' };

const rows: readonly Row[] = [
    {
        name: 'prefix',
        query: 'appr',
        fields: ['Approval'],
        expected: matched(0),
    },
    {
        name: 'case',
        query: 'APPROVAL',
        fields: ['approval'],
        expected: matched(0),
    },
    {
        name: 'substring mid-word',
        query: 'rov',
        fields: ['Approval'],
        expected: matched(0),
    },
    {
        name: '1 edit long',
        query: 'aproval',
        fields: ['Approval'],
        expected: matched(1),
    },
    {
        name: '2 edits long',
        query: 'aprovl',
        fields: ['Approval'],
        expected: matched(2),
    },
    {
        name: '3 edits long',
        query: 'aprvl',
        fields: ['Approval'],
        expected: missed,
    },
    {
        name: '1 edit short',
        query: 'flaw',
        fields: ['flow'],
        expected: matched(1),
    },
    {
        name: '2 edits short',
        query: 'flex',
        fields: ['flow'],
        expected: missed,
    },
    {
        name: '2 edits one past short',
        query: 'flexs',
        fields: ['flows'],
        expected: matched(2),
    },
    {
        name: 'every word',
        query: 'review legal',
        fields: ['Legal review'],
        expected: matched(0),
    },
    {
        name: 'one word missing',
        query: 'review zebra',
        fields: ['Legal review'],
        expected: missed,
    },
    {
        name: 'words across fields',
        query: 'legal acme',
        fields: ['Legal', 'Acme'],
        expected: matched(0),
    },
    {
        name: 'whole UUID',
        query: uuid,
        fields: [uuidText],
        expected: matched(0),
    },
    {
        name: 'UUID group',
        query: '7b4d',
        fields: [uuidText],
        expected: matched(0),
    },
    {
        name: 'identifier with _ and -',
        query: identifier,
        fields: [identifierText],
        expected: matched(0),
    },
    {
        name: '# display id',
        query: '#a7c3e1f9',
        fields: ['a7c3e1f9'],
        expected: matched(0),
    },
    {
        name: 'symbol substring',
        query: '@',
        fields: ['carol@example.com'],
        expected: matched(0),
    },
    {
        name: 'symbol no hit',
        query: '@',
        fields: ['Carol'],
        expected: missed,
    },
    {
        name: 'empty',
        query: '',
        fields: ['x'],
        expected: missed,
    },
    {
        name: 'whitespace',
        query: '   ',
        fields: ['x'],
        expected: missed,
    },
];

for (const { name, query, fields, expected } of rows) {
    Deno.test(`searchMatchOf: ${name}`, () => {
        assertEquals(searchMatchOf(query, fields), expected);
    });
}

// An empty query is a substring of every text, yet the
// matcher misses it by rule, so the superset covers only the
// queries with a word or symbol in them.
const substringRows = rows.filter(({ query, fields }) =>
    query.trim() !== ''
    && fields.some((field) =>
        field.toLowerCase().includes(query.toLowerCase())
    )
);

Deno.test('searchMatchOf finds every substring hit', () => {
    assertEquals(substringRows.length, 7);
    for (const { query, fields } of substringRows) {
        assertEquals(searchMatchOf(query, fields), matched(0));
    }
});

Deno.test('rankedBySearch keeps hits, fewest edits first', () => {
    assertEquals(
        rankedBySearch(
            ['Aproval form', 'Approval', 'Unrelated', 'Approval two'],
            'approval',
            (item) => [item],
        ),
        ['Approval', 'Approval two', 'Aproval form'],
    );
});

Deno.test('searchWordsOf splits on all but letters, digits', () => {
    assertEquals(
        searchWordsOf('Ab_c-De #a7 x.y'),
        ['ab', 'c', 'de', 'a7', 'x', 'y'],
    );
});
