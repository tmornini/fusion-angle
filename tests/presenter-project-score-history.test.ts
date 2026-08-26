import { test } from 'node:test';
import { strict as assert } from 'node:assert';

// ProjectScoreHistoryPresenter imports from
// ../core.ts, whose module init reads theme/sidebar
// from localStorage via state.ts. Stubs must land
// before the dynamic import pulls in the presenter.

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
g['document'] = { addEventListener: () => {} };

const { ProjectScoreHistoryPresenter } = await import(
    '../web-app/app/presenters/project-score-history.ts'
);

const baselines = [
    { id: 'b1',
      projectId: 'pnXmXrxOWayANgDLdCjuBw'
          , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
      score: 50, memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
      at: '2026-03-01T14:23:00.000000Z' },
    { id: 'b2',
      projectId: 'pnXmXrxOWayANgDLdCjuBw'
          , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
      score: 40, memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
      at: '2026-03-05T09:10:00.000000Z' },
];
const actuals = [
    { id: 'UQTJZvCoKlFjEoDlDUwekw',
      projectId: 'pnXmXrxOWayANgDLdCjuBw'
          , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
      score: 45, memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
      at: '2026-04-01T16:45:00.000000Z' },
];
const revisions = [
    { id: 'rOEPOcVMQdJiiiMuiiEhlg',
      objectiveId: 'ohqxgUBEaFQwYbXsonRPmg', name: 'Increase Revenue',
      description: 'd1', memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
      at: '2026-02-01T00:00:00.000000Z' },
    { id: 'r2',
      objectiveId: 'ohqxgUBEaFQwYbXsonRPmg', name: 'Drive Growth',
      description: 'd2', memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
      at: '2026-03-18T11:02:00.000000Z' },
];
const lifecycle: {
    objectiveId: string;
    kind: 'archival' | 'reactivation';
    memberId: string;
    at: string;
}[] = [];

const memberNames = new Map([['xdaJyuuPyHfffCGLhqDrOQ', 'Sarah Lee']]);
function whoName(id: string): string {
    return memberNames.get(id) ?? id;
}

function resolver(objId: string, atTime: string) {
    const eligible = revisions
        .filter(r => r.at <= atTime);
    if (eligible.length === 0) return undefined;
    eligible.sort((a, b) =>
        b.at.localeCompare(a.at));
    return {
        name: eligible[0]!.name,
        description: eligible[0]!.description,
    };
}

test('merges all four streams chronologically', () => {
    const p = new ProjectScoreHistoryPresenter(
        baselines, actuals, revisions, lifecycle,
        resolver, whoName,
    );
    const html = p.buildBody().toString();
    const positions = [
        html.indexOf('2026-02-01'),
        html.indexOf('2026-03-01'),
        html.indexOf('2026-03-05'),
        html.indexOf('2026-03-18'),
        html.indexOf('2026-04-01'),
    ];
    for (let i = 1; i < positions.length; i++) {
        assert.ok(positions[i]! > positions[i - 1]!,
            'events out of order at index ' + i);
    }
});

test('resolves historical objective name at each event',
    () => {
        const p = new ProjectScoreHistoryPresenter(
            baselines, actuals, revisions, lifecycle,
            resolver, whoName,
        );
        const html = p.buildBody().toString();
        const marchOnePos = html.indexOf('2026-03-01');
        const aprilOnePos = html.indexOf('2026-04-01');
        const incrRevAfterMarch = html
            .indexOf('Increase Revenue', marchOnePos);
        const driveGrowthAfterApril = html
            .indexOf('Drive Growth', aprilOnePos);
        assert.ok(
            incrRevAfterMarch > marchOnePos
                && incrRevAfterMarch < aprilOnePos,
            'March score should render under '
                + '"Increase Revenue"',
        );
        assert.ok(driveGrowthAfterApril > aprilOnePos,
            'April score should render under "Drive Growth"');
    });

test('revision event row shows the new objective name',
    () => {
        const p = new ProjectScoreHistoryPresenter(
            [], [], revisions, lifecycle, resolver, whoName,
        );
        const html = p.buildBody().toString();
        const r1Pos = html.indexOf('2026-02-01');
        const r2Pos = html.indexOf('2026-03-18');
        const incrRevPos = html
            .indexOf('Increase Revenue', r1Pos);
        const driveGrowthPos = html
            .indexOf('Drive Growth', r2Pos);
        assert.ok(
            incrRevPos > r1Pos && incrRevPos < r2Pos,
            'rOEPOcVMQdJiiiMuiiEhlg row should render "Increase Revenue"',
        );
        assert.ok(driveGrowthPos > r2Pos,
            'r2 row should render "Drive Growth"');
    });

test('positive score TD carries data-tone="success"', () => {
    const p = new ProjectScoreHistoryPresenter(
        [{ id: 'b1', projectId: 'pnXmXrxOWayANgDLdCjuBw'
            , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
            score: 40, memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
            at: '2026-03-05T09:10:00.000000Z' }],
        [], revisions, lifecycle, resolver, whoName,
    );
    const html = p.buildBody().toString();
    assert.match(html,
        /<td data-tone="success">\+40<\/td>/);
});

test('negative score TD carries data-tone="error"', () => {
    const p = new ProjectScoreHistoryPresenter(
        [], [{ id: 'UQTJZvCoKlFjEoDlDUwekw'
            , projectId: 'pnXmXrxOWayANgDLdCjuBw',
            objectiveId: 'ohqxgUBEaFQwYbXsonRPmg', score: -50,
            memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
            at: '2026-04-01T16:45:00.000000Z' }],
        revisions, lifecycle, resolver, whoName,
    );
    const html = p.buildBody().toString();
    assert.match(html,
        /<td data-tone="error">−50<\/td>/);
});

test('zero score TD carries data-tone="muted"', () => {
    const p = new ProjectScoreHistoryPresenter(
        [{ id: 'b1', projectId: 'pnXmXrxOWayANgDLdCjuBw'
            , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
            score: 0, memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
            at: '2026-03-05T09:10:00.000000Z' }],
        [], revisions, lifecycle, resolver, whoName,
    );
    const html = p.buildBody().toString();
    assert.match(html, /<td data-tone="muted">0<\/td>/);
});

test('Who column renders the actor name per row', () => {
    const who = (id: string): string =>
        id === 'xdaJyuuPyHfffCGLhqDrOQ' ? 'Sarah Lee' : id;
    const p = new ProjectScoreHistoryPresenter(
        [{ id: 'b1', projectId: 'pnXmXrxOWayANgDLdCjuBw',
           objectiveId: 'ohqxgUBEaFQwYbXsonRPmg', score: 40,
           memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
           at: '2026-03-05T09:10:00.000000Z' }],
        [], [], [], resolver, who,
    );
    const html = p.buildBody().toString();
    assert.match(html, /<th>Who<\/th>/);
    assert.ok(html.includes('Sarah Lee'),
        'Who cell should render the resolved name');
});

test(
    'archival row shows date, who, and objective'
    + ' name',
    () => {
        const p = new ProjectScoreHistoryPresenter(
            [], [], revisions,
            [{
                objectiveId:
                    'ohqxgUBEaFQwYbXsonRPmg',
                kind: 'archival',
                memberId:
                    'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-01T10:00:00.000000Z',
            }],
            resolver, whoName,
        );
        const html = p.buildBody().toString();
        const row = html.split('<tr>').find(
            r => r.includes('Objective archived'),
        );
        assert.ok(row, 'archival row missing');
        assert.ok(row.includes(
            'datetime="2026-05-01T10:00:00.000000Z"',
        ));
        assert.ok(row.includes('Sarah Lee'));
        assert.ok(row.includes('Drive Growth'));
        assert.ok(row.includes('archived'));
        assert.ok(
            !row.includes('—'),
            'no em-dash resignation',
        );
    },
);

test(
    'reactivation renders its own dated row',
    () => {
        const p = new ProjectScoreHistoryPresenter(
            [], [], revisions,
            [{
                objectiveId:
                    'ohqxgUBEaFQwYbXsonRPmg',
                kind: 'reactivation',
                memberId:
                    'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-02T10:00:00.000000Z',
            }],
            resolver, whoName,
        );
        const html = p.buildBody().toString();
        const row = html.split('<tr>').find(
            r => r.includes(
                'Objective reactivated',
            ),
        );
        assert.ok(row, 'reactivation row missing');
        assert.ok(row.includes(
            'datetime="2026-05-02T10:00:00.000000Z"',
        ));
        assert.ok(row.includes('Sarah Lee'));
        assert.ok(row.includes('Drive Growth'));
        assert.ok(row.includes('reactivated'));
    },
);

test(
    'lifecycle rows interleave chronologically',
    () => {
        const p = new ProjectScoreHistoryPresenter(
            baselines, [], revisions,
            [{
                objectiveId:
                    'ohqxgUBEaFQwYbXsonRPmg',
                kind: 'archival',
                memberId:
                    'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-03-03T00:00:00.000000Z',
            }],
            resolver, whoName,
        );
        const html = p.buildBody().toString();
        const first = html.indexOf(
            'datetime="2026-03-01',
        );
        const mid = html.indexOf(
            'datetime="2026-03-03',
        );
        const last = html.indexOf(
            'datetime="2026-03-05',
        );
        assert.ok(first >= 0 && mid >= 0
            && last >= 0);
        assert.ok(
            first < mid && mid < last,
            'archival must sort between the'
            + ' baselines, not trail the table',
        );
    },
);
