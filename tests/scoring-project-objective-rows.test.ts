import { assert, assertEquals } from '@std/assert';
import type { ObjectiveScore } from
    '../client/project-scoring.ts';
import {
    buildProjectObjectiveRows,
    type ProjectObjectiveRow,
} from '../web-app/app/scoring-aggregate.ts';

const OBJ = 'ohqxgUBEaFQwYbXsonRPmg';
const OTHER = 'o2';
const LOW_ID = 'BAAAAAAAAAAAAAAAAAAAAA';
const HIGH_ID = 'CAAAAAAAAAAAAAAAAAAAAA';

function score(
    id: string,
    projectId: string,
    objectiveId: string,
    value: number,
    at: string,
): ObjectiveScore {
    return {
        id,
        projectId,
        objectiveId,
        memberId: 'member-1',
        score: value,
        at,
    };
}

function rowsFor(
    projects: ReadonlyArray<{
        id: string;
        title: string;
    }>,
    approved: readonly string[],
    baselineScores: ObjectiveScore[],
    actualScores: ObjectiveScore[],
): ProjectObjectiveRow[] {
    return buildProjectObjectiveRows(
        {
            activeObjectives: [],
            approvedProjectIds: new Set(approved),
            baselineScores,
            actualScores,
        },
        projects,
        OBJ,
    );
}

function findRow(
    rows: readonly ProjectObjectiveRow[],
    projectId: string,
): ProjectObjectiveRow {
    const row = rows.find(
        item => item.projectId === projectId,
    );
    assert(row, projectId);
    return row;
}

Deno.test(
    'buildProjectObjectiveRows reads one'
    + ' project series',
    () => {
        const rows = rowsFor(
            [
                { id: 'p1', title: 'North' },
                { id: 'p2', title: 'South' },
            ],
            ['p1', 'p2'],
            [
                score(
                    'b-old', 'p1', OBJ, 1,
                    '2026-05-01T00:00:00.000000Z',
                ),
                score(
                    'b-new', 'p1', OBJ, 10,
                    '2026-05-14T00:00:00.000000Z',
                ),
                score(
                    'b-other', 'p1', OTHER, 99,
                    '2026-05-20T00:00:00.000000Z',
                ),
            ],
            [
                score(
                    'a1', 'p1', OBJ, 40,
                    '2026-05-15T00:00:00.000000Z',
                ),
                score(
                    'a2', 'p1', OBJ, 25,
                    '2026-05-16T00:00:00.000000Z',
                ),
                score(
                    'a-other', 'p1', OTHER, 80,
                    '2026-05-17T00:00:00.000000Z',
                ),
            ],
        );
        const row = findRow(rows, 'p1');
        assertEquals(row.baseline, 10);
        assertEquals(row.latestActual, 25);
        assertEquals(row.points, [
            {
                at: '2026-05-14T00:00:00.000000Z',
                value: 10,
            },
            {
                at: '2026-05-15T00:00:00.000000Z',
                value: 40,
            },
            {
                at: '2026-05-16T00:00:00.000000Z',
                value: 25,
            },
        ]);
        assertEquals(findRow(rows, 'p2').points, []);
        assertEquals(
            findRow(rows, 'p2').baseline, undefined,
        );
        assertEquals(
            findRow(rows, 'p2').latestActual, undefined,
        );
    },
);

Deno.test(
    'two actuals that share an at collapse'
    + ' to the later input',
    () => {
        const rows = rowsFor(
            [{ id: 'p1', title: 'North' }],
            ['p1'],
            [
                score(
                    'b1', 'p1', OBJ, 10,
                    '2026-05-14T00:00:00.000000Z',
                ),
            ],
            [
                score(
                    HIGH_ID, 'p1', OBJ, 3,
                    '2026-05-15T00:00:00.000000Z',
                ),
                score(
                    LOW_ID, 'p1', OBJ, 9,
                    '2026-05-15T00:00:00.000000Z',
                ),
            ],
        );
        const row = findRow(rows, 'p1');
        assertEquals(row.points, [
            {
                at: '2026-05-14T00:00:00.000000Z',
                value: 10,
            },
            {
                at: '2026-05-15T00:00:00.000000Z',
                value: 9,
            },
        ]);
        assertEquals(row.latestActual, 3);
    },
);

Deno.test(
    'no baseline yields no points',
    () => {
        const rows = rowsFor(
            [{ id: 'p1', title: 'North' }],
            ['p1'],
            [],
            [
                score(
                    'a1', 'p1', OBJ, 40,
                    '2026-05-15T00:00:00.000000Z',
                ),
            ],
        );
        const row = findRow(rows, 'p1');
        assertEquals(row.points, []);
        assertEquals(row.baseline, undefined);
        assertEquals(row.latestActual, 40);
    },
);

Deno.test(
    'a project outside approvedProjectIds'
    + ' is omitted',
    () => {
        const rows = rowsFor(
            [
                { id: 'kept', title: 'Kept' },
                { id: 'dropped', title: 'Dropped' },
            ],
            ['kept'],
            [
                score(
                    'b1', 'dropped', OBJ, 1,
                    '2026-05-14T00:00:00.000000Z',
                ),
            ],
            [
                score(
                    'a1', 'dropped', OBJ, 2,
                    '2026-05-15T00:00:00.000000Z',
                ),
            ],
        );
        assertEquals(
            rows.map(row => row.projectId),
            ['kept'],
        );
    },
);
