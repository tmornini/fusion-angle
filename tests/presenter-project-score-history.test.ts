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
      project_id: 'p1', objective_id: 'o1',
      score: 50, member_id: 'w1',
      at: '2026-03-01T14:23:00.000Z' },
    { id: 'b2',
      project_id: 'p1', objective_id: 'o1',
      score: 40, member_id: 'w1',
      at: '2026-03-05T09:10:00.000Z' },
];
const actuals = [
    { id: 'a1',
      project_id: 'p1', objective_id: 'o1',
      score: 45, member_id: 'w1',
      at: '2026-04-01T16:45:00.000Z' },
];
const revisions = [
    { id: 'r1',
      objective_id: 'o1', name: 'Increase Revenue',
      description: 'd1', member_id: 'w1',
      at: '2026-02-01T00:00:00.000Z' },
    { id: 'r2',
      objective_id: 'o1', name: 'Drive Growth',
      description: 'd2', member_id: 'w1',
      at: '2026-03-18T11:02:00.000Z' },
];
const archivations: {
    objectiveId: string; memberId: string;
    at: string;
}[] = [];

const memberNames = new Map([['w1', 'Sarah Lee']]);
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
        baselines, actuals, revisions, archivations,
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
            baselines, actuals, revisions, archivations,
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
            [], [], revisions, archivations, resolver, whoName,
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
            'r1 row should render "Increase Revenue"',
        );
        assert.ok(driveGrowthPos > r2Pos,
            'r2 row should render "Drive Growth"');
    });

test('positive score TD carries data-tone="success"', () => {
    const p = new ProjectScoreHistoryPresenter(
        [{ id: 'b1', project_id: 'p1', objective_id: 'o1',
            score: 40, member_id: 'w1',
            at: '2026-03-05T09:10:00.000Z' }],
        [], revisions, archivations, resolver, whoName,
    );
    const html = p.buildBody().toString();
    assert.match(html,
        /<td data-tone="success">\+40<\/td>/);
});

test('negative score TD carries data-tone="error"', () => {
    const p = new ProjectScoreHistoryPresenter(
        [], [{ id: 'a1', project_id: 'p1',
            objective_id: 'o1', score: -50,
            member_id: 'w1',
            at: '2026-04-01T16:45:00.000Z' }],
        revisions, archivations, resolver, whoName,
    );
    const html = p.buildBody().toString();
    assert.match(html,
        /<td data-tone="error">−50<\/td>/);
});

test('zero score TD carries data-tone="muted"', () => {
    const p = new ProjectScoreHistoryPresenter(
        [{ id: 'b1', project_id: 'p1', objective_id: 'o1',
            score: 0, member_id: 'w1',
            at: '2026-03-05T09:10:00.000Z' }],
        [], revisions, archivations, resolver, whoName,
    );
    const html = p.buildBody().toString();
    assert.match(html, /<td data-tone="muted">0<\/td>/);
});

test('archival event row resolves the objective name '
    + 'from the event objectiveId', () => {
    const dep = [{
        objectiveId: 'o1',
        memberId: 'w1',
        at: '2026-05-01T08:00:00.000Z',
    }];
    const p = new ProjectScoreHistoryPresenter(
        [], [], revisions, dep, resolver, whoName,
    );
    const html = p.buildBody().toString();
    const depPos = html.indexOf('2026-05-01');
    assert.ok(depPos >= 0,
        'archival row missing for 2026-05-01');
    const labelPos = html.indexOf(
        'Objective archived', depPos,
    );
    assert.ok(labelPos > depPos,
        'archival event label missing');
    const namePos = html.indexOf('Drive Growth', depPos);
    assert.ok(namePos > depPos,
        'resolver should resolve o1 → Drive Growth at '
            + '2026-05-01 (latest revision applies)');
});

test('Who column renders the actor name per row', () => {
    const who = (id: string): string =>
        id === 'w1' ? 'Sarah Lee' : id;
    const p = new ProjectScoreHistoryPresenter(
        [{ id: 'b1', project_id: 'p1',
           objective_id: 'o1', score: 40,
           member_id: 'w1',
           at: '2026-03-05T09:10:00.000Z' }],
        [], [], [], resolver, who,
    );
    const html = p.buildBody().toString();
    assert.match(html, /<th>Who<\/th>/);
    assert.ok(html.includes('Sarah Lee'),
        'Who cell should render the resolved name');
});
