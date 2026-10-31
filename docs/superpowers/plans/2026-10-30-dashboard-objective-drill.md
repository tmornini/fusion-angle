# Dashboard Objective Drill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the dashboard, clicking an aggregate objective row replaces that card with the objective's approved projects, each with its gauge and the shared sparkline.

**Architecture:** `buildProjectObjectiveRows` derives one row per approved project. `buildSparkline` is the painter both cards call. `DashboardObjectiveProjectsPresenter` renders the drilled card. `objectiveCardHit` is the pure click rule. The page module holds the open objective id for the visit and redraws through the scoring path it already uses.

**Tech Stack:** Deno, TypeScript, `@std/assert`, `./test` and `./test validate`. No pytest, node, or npm.

---

## Worktree

Implement on branch `ui-refinement` in `/Users/tmornini/code/fusion-angle/.worktrees/ui-refinement`. Do not create a worktree. Do not merge, rebase, or touch master. Every commit below stays on `ui-refinement`.

Run every command from that directory. `./test` runs the whole memory suite (`tests/*.test.ts`, then `tests/tz/*.test.ts`). It takes no file filter. `./test validate` is `deno check`, that suite, the 78-character lint, the schema check, and the API-docs check. A green commit step is `./test validate` exiting 0.

## File map

- `web-app/app/scoring-aggregate.ts` — `ProjectObjectiveRow` and `buildProjectObjectiveRows`, beside `buildObjectiveTrendlines`.
- `web-app/app/presenters/sparkline.ts` — `buildSparkline`. Geometry, axis, segments, dots, and tips move here unchanged.
- `web-app/app/presenters/dashboard-objective-aggregates.ts` — calls `buildSparkline`. Aggregate rows gain `tabindex="0"`.
- `web-app/app/presenters/dashboard-objective-projects.ts` — drilled card.
- `web-app/app/presenters/index.ts` — exports the drilled presenter.
- `web-app/dashboard/objective-card-hit.ts` — `objectiveCardHit`.
- `web-app/dashboard/index.ts` — open id, one listener, presenter choice.
- `web-app/app/styles/components-metrics.css` — desktop `220px 110px 1fr` columns.
- `tests/scoring-project-objective-rows.test.ts` — builder.
- `tests/presenter-dashboard-objective-aggregates.test.ts` — one new pin that the aggregate card uses the shared painter. Existing assertions stay.
- `tests/presenter-dashboard-objective-projects.test.ts` — drilled card and the column rule.
- `tests/objective-card-hit.test.ts` — hit rule.
- `tests/dashboard-objective-drill.test.ts` — page visit. The spec's file list does not name it. Behavior (open id, one listener, Space, redraw) is not reachable from the three named test files. See Spec notes.

## Spec notes

- Project-id ties use string `<`, as the spec says. Do not switch that comparison to `compareIdentifiers`.
- The sparkline's `style="--x:…;--y:…"` attribute moves with the painter. The spec pins that markup.
- The drilled presenter takes a name, so it cannot see a missing definition. The page throws `objective definition missing for ${id}`, the aggregate presenter's error, before building the card.
- Deno's test worker has no `Element` global, so `instanceof Element` throws under `./test`. The page treats a target with a `closest` function as the element. In the browser that target is an `Element`.
- A bare `.objective-drill` rule would outrank `.objective-aggregates-card .score-row` inside `@media (max-width: 767px)` in `web-app/app/styles/responsive.css`. The `220px` rule stays inside `@media (min-width: 768px)`. Do not edit `responsive.css`. The aggregate `140px` rule stays.

---

### Task 1: Project objective series

**Files:**
- Create: `tests/scoring-project-objective-rows.test.ts`
- Modify: `web-app/app/scoring-aggregate.ts`
- Test: `tests/scoring-project-objective-rows.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/scoring-project-objective-rows.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test`

Expected: exit 1. The report says `scoring-aggregate.ts` does not provide an export named `buildProjectObjectiveRows`.

- [ ] **Step 3: Write the minimal implementation**

In `web-app/app/scoring-aggregate.ts`, add `ObjectiveScore` to the type import from `../../client/project-scoring.ts`.

Append this. Do not sort. Task 2 sorts.

```ts
export interface ProjectObjectiveRow {
    projectId: Id;
    title: string;
    baseline: number | undefined;
    latestActual: number | undefined;
    points: TrendPoint[];
}

function scoresForPair(
    rows: readonly ObjectiveScore[],
    projectId: string,
    objectiveId: ObjectiveId,
): ObjectiveScore[] {
    return rows.filter(row =>
        row.projectId === projectId
        && row.objectiveId === objectiveId,
    );
}

function seriesPoints(
    baseline: ObjectiveScore | undefined,
    actuals: readonly ObjectiveScore[],
): TrendPoint[] {
    if (baseline === undefined) return [];
    // Equal `at` keeps input order, so the last row
    // of a shared `at` is the later input. The gauge
    // value is latestPerPair, which breaks a tie by id.
    const indexed = actuals.map((row, index) => ({
        row,
        index,
    }));
    indexed.sort((a, b) =>
        a.row.at < b.row.at ? -1
            : a.row.at > b.row.at ? 1
                : a.index - b.index,
    );
    const points: TrendPoint[] = [{
        at: baseline.at,
        value: baseline.score,
    }];
    let index = 0;
    while (index < indexed.length) {
        let next = index + 1;
        while (
            next < indexed.length
            && indexed[next]!.row.at
                === indexed[index]!.row.at
        ) {
            next += 1;
        }
        const last = indexed[next - 1]!.row;
        points.push({
            at: last.at,
            value: last.score,
        });
        index = next;
    }
    return points;
}

export function buildProjectObjectiveRows(
    inputs: ObjectiveScoringInputs,
    projects: ReadonlyArray<{
        id: Id;
        title: string;
    }>,
    objectiveId: ObjectiveId,
): ProjectObjectiveRow[] {
    const rows: ProjectObjectiveRow[] = [];
    for (const project of projects) {
        if (!inputs.approvedProjectIds.has(
            project.id,
        )) {
            continue;
        }
        const baselines = latestPerPair(
            scoresForPair(
                inputs.baselineScores,
                project.id,
                objectiveId,
            ),
        );
        const actualRows = scoresForPair(
            inputs.actualScores,
            project.id,
            objectiveId,
        );
        const latestActuals = latestPerPair(
            actualRows,
        );
        const baseline = baselines[0];
        const actual = latestActuals[0];
        rows.push({
            projectId: project.id,
            title: project.title,
            baseline: baseline?.score,
            latestActual: actual?.score,
            points: seriesPoints(baseline, actualRows),
        });
    }
    return rows;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `./test validate`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/scoring-aggregate.ts \
    tests/scoring-project-objective-rows.test.ts
git commit -m "$(cat <<'EOF'
Add project objective row series

Co-Authored-By: Grok 4.7 <noreply@xAI>
EOF
)"
```

---

### Task 2: Project objective sort

**Files:**
- Modify: `tests/scoring-project-objective-rows.test.ts`
- Modify: `web-app/app/scoring-aggregate.ts`
- Test: `tests/scoring-project-objective-rows.test.ts`

- [ ] **Step 1: Write the failing test**

Append this test to `tests/scoring-project-objective-rows.test.ts`. It uses `rowsFor` and `score` from that file.

```ts
Deno.test(
    'project rows sort by change, then title, then id',
    () => {
        const at = '2026-05-14T00:00:00.000000Z';
        const later = '2026-05-15T00:00:00.000000Z';
        const projects = [
            { id: 'p-pos', title: 'Pos' },
            { id: 'p-missb', title: 'MissB' },
            { id: 'p-b', title: 'Tie' },
            { id: 'p-zero', title: 'Zero' },
            { id: 'p-out', title: 'Aaa' },
            { id: 'p-neg', title: 'Neg' },
            { id: 'p-missa', title: 'MissA' },
            { id: 'p-a', title: 'Tie' },
            { id: 'p-none', title: 'Empty' },
        ];
        const approved = projects
            .map(project => project.id)
            .filter(id => id !== 'p-out');
        const rows = rowsFor(
            projects,
            approved,
            [
                score('bn', 'p-neg', OBJ, 10, at),
                score('ba', 'p-a', OBJ, 10, at),
                score('bb', 'p-b', OBJ, 0, at),
                score('bz', 'p-zero', OBJ, 5, at),
                score('bp', 'p-pos', OBJ, 1, at),
                score('bma', 'p-missa', OBJ, 9, at),
                score('bo', 'p-out', OBJ, 0, at),
            ],
            [
                score('an', 'p-neg', OBJ, 4, later),
                score('aa', 'p-a', OBJ, 7, later),
                score('ab', 'p-b', OBJ, -3, later),
                score('az', 'p-zero', OBJ, 5, later),
                score('ap', 'p-pos', OBJ, 4, later),
                score('amb', 'p-missb', OBJ, 8, later),
                score('ao', 'p-out', OBJ, -100, later),
            ],
        );
        assertEquals(
            rows.map(row => row.projectId),
            [
                'p-neg',
                'p-a',
                'p-b',
                'p-zero',
                'p-pos',
                'p-none',
                'p-missa',
                'p-missb',
            ],
        );
    },
);
```

The expected order is change -6, then the two -3 rows by title `Tie` and id `p-a` before `p-b`, then 0, then +3, then the no-change rows by title `Empty`, `MissA`, `MissB`. `p-out` is not approved.

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test`

Expected: exit 1. The new test's id list does not match. Task 1 returns approved projects in input order, which starts with `p-pos`.

- [ ] **Step 3: Write the minimal implementation**

Add these functions next to `seriesPoints` in `web-app/app/scoring-aggregate.ts`, and change `buildProjectObjectiveRows` to return `rows.sort(compareProjectObjectiveRows)`.

```ts
function numericChange(
    row: ProjectObjectiveRow,
): number | undefined {
    if (
        row.baseline === undefined
        || row.latestActual === undefined
    ) {
        return undefined;
    }
    return row.latestActual - row.baseline;
}

function compareProjectObjectiveRows(
    a: ProjectObjectiveRow,
    b: ProjectObjectiveRow,
): number {
    const aChange = numericChange(a);
    const bChange = numericChange(b);
    if (
        aChange !== undefined
        && bChange !== undefined
        && aChange !== bChange
    ) {
        return aChange - bChange;
    }
    const aNumeric = aChange !== undefined;
    const bNumeric = bChange !== undefined;
    if (aNumeric !== bNumeric) {
        return aNumeric ? -1 : 1;
    }
    if (a.title < b.title) return -1;
    if (b.title < a.title) return 1;
    if (a.projectId < b.projectId) return -1;
    if (b.projectId < a.projectId) return 1;
    return 0;
}
```

The return is:

```ts
    return rows.sort(compareProjectObjectiveRows);
```

A change of zero stays in the numeric group. A missing baseline or a missing actual has no numeric change and follows every numeric change. Equal changes, and that trailing group, use string `<` on title, then string `<` on project id.

- [ ] **Step 4: Run the test to verify it passes**

Run: `./test validate`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/scoring-aggregate.ts \
    tests/scoring-project-objective-rows.test.ts
git commit -m "$(cat <<'EOF'
Sort project objective rows

Co-Authored-By: Grok 4.7 <noreply@xAI>
EOF
)"
```

---

### Task 3: Shared sparkline painter

**Files:**
- Create: `web-app/app/presenters/sparkline.ts`
- Modify: `web-app/app/presenters/dashboard-objective-aggregates.ts`
- Modify: `tests/presenter-dashboard-objective-aggregates.test.ts`
- Test: `tests/presenter-dashboard-objective-aggregates.test.ts`

- [ ] **Step 1: Write the failing test**

Add this import to `tests/presenter-dashboard-objective-aggregates.test.ts`:

```ts
import { buildSparkline } from
    '../web-app/app/presenters/sparkline.ts';
```

Append these tests. Do not change the tests already in the file.

```ts
Deno.test(
    'buildSparkline paints the aggregate series',
    () => {
        const empty = buildSparkline([]).toString();
        assert(
            empty.includes('class="sparkline-axis"'),
        );
        assertStrictEquals(
            empty.includes('class="sparkline-seg"'),
            false,
        );
        assertStrictEquals(
            empty.includes('class="spark-dot"'),
            false,
        );
        const html = buildSparkline([
            {
                at: '2026-05-01T00:00:00.000000Z',
                value: 20,
            },
            {
                at: '2026-05-10T00:00:00.000000Z',
                value: 40,
            },
            {
                at: '2026-05-20T00:00:00.000000Z',
                value: 25,
            },
        ]).toString();
        assert(html.includes('viewBox="0 0 100 96"'));
        assert(html.includes('data-direction="up"'));
        assert(html.includes('data-direction="down"'));
        assert(html.includes('class="sparkline-seg"'));
        assert(html.includes('class="spark-dot"'));
        assert(
            html.includes('Baseline · 20'),
        );
    },
);

Deno.test(
    'the aggregate card uses the shared painter',
    () => {
        const src = Deno.readTextFileSync(
            'web-app/app/presenters/'
            + 'dashboard-objective-aggregates.ts',
        );
        assert(src.includes(
            "from './sparkline.ts'",
        ));
        assertStrictEquals(
            src.includes('function directionForDelta'),
            false,
        );
        assertStrictEquals(
            src.includes('#sparkline'),
            false,
        );
    },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test`

Expected: exit 1. The suite cannot resolve `./sparkline.ts`, or the source pin does not see that import.

- [ ] **Step 3: Write the minimal implementation**

Create `web-app/app/presenters/sparkline.ts` by moving the painter out of `DashboardObjectiveAggregatesPresenter`. Keep the markup, including each segment and dot `data-direction` and the dot `style` attribute.

```ts
import { html, type SafeHtml } from '../safe-html.ts';
import type { TrendPoint } from
    '../scoring-aggregate.ts';
import { formatDate } from '../format.ts';
import {
    formatSigned,
    toneForScore,
} from '../scoring-format.ts';

const SPARK_HEIGHT = 96;
const SPARK_MID = SPARK_HEIGHT / 2;
const SPARK_PAD = 4;

type Direction = 'up' | 'down' | 'flat';

function directionForDelta(delta: number): Direction {
    if (delta > 0) return 'up';
    if (delta < 0) return 'down';
    return 'flat';
}

export function buildSparkline(
    points: readonly TrendPoint[],
): SafeHtml {
    if (points.length === 0) {
        return html`
            <span class="sparkline-wrap">
                <svg class="sparkline-svg"
                    viewBox="0 0 100 ${SPARK_HEIGHT}"
                    preserveAspectRatio="none">
                    ${axis(SPARK_MID)}
                </svg>
            </span>`;
    }
    const plotted = coords(points);
    const segments = plotted.slice(1).map((c, i) => {
        const prev = plotted[i]!;
        const dir = directionForDelta(
            points[i + 1]!.value - points[i]!.value,
        );
        return html`
            <line class="sparkline-seg"
                data-direction="${dir}"
                x1="${prev.x}" y1="${prev.y}"
                x2="${c.x}" y2="${c.y}"
                vector-effect="non-scaling-stroke"/>`;
    });
    const dots = plotted.map((c, i) =>
        dot(c.x, c.y, points, i));
    return html`
        <span class="sparkline-wrap">
            <svg class="sparkline-svg"
                viewBox="0 0 100 ${SPARK_HEIGHT}"
                preserveAspectRatio="none">
                ${axis(plotted[0]!.y)}
                ${segments}
            </svg>
            ${dots}
        </span>`;
}

function axis(y: number): SafeHtml {
    return html`
        <line class="sparkline-axis"
            x1="0" y1="${y}"
            x2="100" y2="${y}"/>`;
}

function coords(
    points: readonly TrendPoint[],
): { x: number; y: number }[] {
    const values = points.map(p => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const top = SPARK_PAD;
    const bottom = SPARK_HEIGHT - SPARK_PAD;
    return points.map((p, i) => ({
        x: points.length === 1
            ? 50
            : (i / (points.length - 1)) * 100,
        y: span === 0
            ? SPARK_MID
            : bottom
                - ((p.value - min) / span)
                    * (bottom - top),
    }));
}

function dot(
    x: number,
    y: number,
    points: readonly TrendPoint[],
    i: number,
): SafeHtml {
    const p = points[i]!;
    const date = formatDate(p.at);
    const xPct = x.toFixed(2);
    const yPct = (y / SPARK_HEIGHT * 100).toFixed(2);
    const tip = i === 0
        ? baselineTip(date, p.value)
        : changeTip(date, p, points[i - 1]!);
    const label = i === 0
        ? `Baseline ${date}, value ${p.value}`
        : `${date}, ${p.value} / `
            + formatSigned(
                p.value - points[i - 1]!.value,
            );
    const directionAttr = i === 0
        ? html``
        : html`data-direction="${directionForDelta(
            p.value - points[i - 1]!.value,
        )}"`;
    return html`
        <span class="spark-dot" role="img"
            ${directionAttr}
            style="${`--x:${xPct}%;--y:${yPct}%`}"
            tabindex="0"
            aria-label="${label}">
            ${tip}
        </span>`;
}

function baselineTip(
    date: string,
    value: number,
): SafeHtml {
    return html`
        <span class="spark-tip" aria-hidden="true">
            <span class="spark-tip-date">${
                date
            }</span>
            <span class="spark-tip-base">${
                `Baseline · ${value}`
            }</span>
        </span>`;
}

function changeTip(
    date: string,
    p: TrendPoint,
    prev: TrendPoint,
): SafeHtml {
    const change = p.value - prev.value;
    const readout = `${p.value} / ${
        formatSigned(change)
    }`;
    return html`
        <span class="spark-tip" aria-hidden="true">
            <span class="spark-tip-date">${
                date
            }</span>
            <span class="spark-tip-change"
                data-tone="${toneForScore(change)}">${
                readout
            }</span>
        </span>`;
}
```

Replace the import block of `web-app/app/presenters/dashboard-objective-aggregates.ts` with:

```ts
import { html, type SafeHtml } from '../safe-html.ts';
import type { HttpMessage } from
    '../../../shared/http-message/http-message.ts';
import type {
    ObjectiveEntity,
    ObjectiveId,
} from '../../../shared/types.ts';
import { ICON_SIZE, iconTrendingUp } from '../icons.ts';
import { buildBipolarGaugeSvg } from './gauge.ts';
import type { TrendPoint } from '../scoring-aggregate.ts';
import { buildSparkline } from './sparkline.ts';
```

In `#row`, replace `${this.#sparkline(points)}` with `${buildSparkline(points)}`.

Delete `SPARK_HEIGHT`, `SPARK_MID`, `SPARK_PAD`, `Direction`, `directionForDelta`, and the methods `#sparkline`, `#axis`, `#coords`, `#dot`, `#baselineTip`, and `#changeTip`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `./test validate`

Expected: exit 0. The pre-existing aggregate presenter tests still pass. Their assertions are unchanged.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/presenters/sparkline.ts \
    web-app/app/presenters/dashboard-objective-aggregates.ts \
    tests/presenter-dashboard-objective-aggregates.test.ts
git commit -m "$(cat <<'EOF'
Share the sparkline painter

Co-Authored-By: Grok 4.7 <noreply@xAI>
EOF
)"
```

---

### Task 4: Drilled objective presenter

**Files:**
- Create: `web-app/app/presenters/dashboard-objective-projects.ts`
- Create: `tests/presenter-dashboard-objective-projects.test.ts`
- Modify: `web-app/app/presenters/index.ts`
- Test: `tests/presenter-dashboard-objective-projects.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/presenter-dashboard-objective-projects.test.ts`:

```ts
import {
    assert,
    assertMatch,
    assertStrictEquals,
} from '@std/assert';
import { buildPageUrl } from
    '../web-app/app/navigation.ts';
import {
    DashboardObjectiveProjectsPresenter,
} from '../web-app/app/presenters/dashboard-objective-projects.ts';
import type { ProjectObjectiveRow } from
    '../web-app/app/scoring-aggregate.ts';

function row(
    projectId: string,
    title: string,
    baseline: number | undefined,
    latestActual: number | undefined,
    values: readonly number[],
): ProjectObjectiveRow {
    return {
        projectId,
        title,
        baseline,
        latestActual,
        points: values.map((value, index) => ({
            at: '2026-05-1'
                + index
                + 'T00:00:00.000000Z',
            value,
        })),
    };
}

function card(
    name: string,
    rows: readonly ProjectObjectiveRow[],
): string {
    return new DashboardObjectiveProjectsPresenter(
        name,
        rows,
    ).buildCard().toString();
}

function sliceRow(html: string, projectId: string): string {
    const start = html.indexOf(
        'data-project-id="' + projectId + '"',
    );
    assert(start >= 0, projectId);
    const slice = html.slice(start);
    return slice.slice(0, slice.indexOf('</li>'));
}

Deno.test(
    'the drilled header is the back button and the name',
    () => {
        const html = card('Raise income', []);
        assert(
            html.includes('objective-aggregates-card'),
        );
        assert(html.includes('objective-drill'));
        assert(html.includes('type="button"'));
        assert(html.includes('data-drill-back'));
        assert(html.includes('← Objectives'));
        assertMatch(
            html,
            /<h3[^>]*>\s*Raise income\s*<\/h3>/,
        );
        const heading = html.match(
            /<h3[^>]*>[\s\S]*?<\/h3>/,
        );
        assert(heading);
        assertStrictEquals(
            heading[0].includes('<a'),
            false,
        );
        assertStrictEquals(
            html.includes('icon-box'),
            false,
        );
        assertStrictEquals(
            html.includes('score-row'),
            false,
        );
        assertStrictEquals(
            html.includes('data-project-id'),
            false,
        );
    },
);

Deno.test(
    'a drilled row links the name and paints the gauge',
    () => {
        const html = card('Raise income', [
            row('p-b', 'Beta', 32, 25, [20, 40, 25]),
            row('p-a', 'Alpha', undefined, 25, []),
        ]);
        assert(
            html.indexOf('Beta') < html.indexOf('Alpha'),
        );
        const beta = sliceRow(html, 'p-b');
        const href = buildPageUrl('project-detail', {
            projectId: 'p-b',
        });
        assert(beta.includes('href="' + href + '"'));
        assert(beta.includes('data-size="small"'));
        assert(beta.includes(
            'id="outer-left-drill-p-b"',
        ));
        assertMatch(
            beta,
            /d="M 90 20 A 65 65 0 0 1 155 85"/,
        );
        assertMatch(
            beta,
            /d="M 90 40 A 45 45 0 0 1 135 85"/,
        );
        assert(beta.includes('data-direction="up"'));
        assert(beta.includes('data-direction="down"'));
        assert(beta.includes('data-empty="false"'));
        const alpha = sliceRow(html, 'p-a');
        assert(alpha.includes('data-empty="true"'));
        assertStrictEquals(
            /d="M 90 20/.test(alpha),
            false,
        );
        assertMatch(
            alpha,
            /d="M 90 40 A 45 45 0 0 1 135 85"/,
        );
    },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test`

Expected: exit 1. The report cannot resolve `dashboard-objective-projects.ts`.

- [ ] **Step 3: Write the minimal implementation**

Create `web-app/app/presenters/dashboard-objective-projects.ts`:

```ts
import { html, type SafeHtml } from '../safe-html.ts';
import { buildPageUrl } from '../navigation.ts';
import { buildBipolarGaugeSvg } from './gauge.ts';
import { buildSparkline } from './sparkline.ts';
import type { ProjectObjectiveRow } from
    '../scoring-aggregate.ts';

export class DashboardObjectiveProjectsPresenter {
    readonly #name: string;
    readonly #rows: readonly ProjectObjectiveRow[];

    constructor(
        name: string,
        rows: readonly ProjectObjectiveRow[],
    ) {
        this.#name = name;
        this.#rows = rows;
    }

    buildCard(): SafeHtml {
        return html`
            <div class="${
                'card gauge-card'
                + ' objective-aggregates-card'
                + ' objective-drill'
            }">
                <div class="${
                    'flex items-center gap-3 mb-5'
                }">
                    <button type="button"
                        data-drill-back>${
                        '← Objectives'
                    }</button>
                    <h3 class="${
                        'text-sm font-semibold'
                    }">${this.#name}</h3>
                </div>
                <ul class="${
                    'objective-aggregates-rows'
                }">
                    ${this.#rows.map(
                        item => this.#row(item),
                    )}
                </ul>
            </div>
        `;
    }

    #row(item: ProjectObjectiveRow): SafeHtml {
        const gauge = buildBipolarGaugeSvg(
            {
                value: item.baseline,
                label: 'Baseline',
                display: '',
            },
            {
                value: item.latestActual,
                label: 'Actual',
                display: '',
            },
            'drill-' + item.projectId,
            'small',
        );
        return html`
            <li class="score-row"
                data-project-id="${item.projectId}"
                data-empty="${
                    item.points.length === 0
                }">
                <span class="score-row-label">
                    <a href="${buildPageUrl(
                        'project-detail',
                        {
                            projectId: item.projectId,
                        },
                    )}">${item.title}</a>
                </span>
                <span class="score-row-gauge">
                    ${gauge}
                </span>
                <span class="score-row-sparkline">
                    ${buildSparkline(item.points)}
                </span>
            </li>
        `;
    }
}
```

In `web-app/app/presenters/index.ts`, immediately after the `DashboardObjectiveAggregatesPresenter` export, add:

```ts
export {
    DashboardObjectiveProjectsPresenter,
} from './dashboard-objective-projects.ts';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `./test validate`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add \
    web-app/app/presenters/dashboard-objective-projects.ts \
    web-app/app/presenters/index.ts \
    tests/presenter-dashboard-objective-projects.test.ts
git commit -m "$(cat <<'EOF'
Present drilled objective projects

Co-Authored-By: Grok 4.7 <noreply@xAI>
EOF
)"
```

---

### Task 5: Drilled column widths

**Files:**
- Modify: `web-app/app/styles/components-metrics.css`
- Modify: `tests/presenter-dashboard-objective-projects.test.ts`
- Test: `tests/presenter-dashboard-objective-projects.test.ts`

- [ ] **Step 1: Write the failing test**

Append this test to `tests/presenter-dashboard-objective-projects.test.ts`:

```ts
Deno.test(
    'drilled columns are desktop-only',
    () => {
        const metrics = Deno.readTextFileSync(
            'web-app/app/styles/components-metrics.css',
        );
        const aggregate = metrics.indexOf(
            '.objective-aggregates-card .score-row {\n'
            + '    grid-template-columns:'
            + ' 140px 110px 1fr;\n'
            + '}',
        );
        assert(aggregate >= 0);
        const media = metrics.indexOf(
            '@media (min-width: 768px) {',
        );
        const drilled = metrics.indexOf(
            '.objective-aggregates-card'
            + '.objective-drill .score-row',
        );
        const columns = metrics.indexOf(
            'grid-template-columns:'
            + ' 220px 110px 1fr;',
        );
        assert(media > aggregate);
        assert(drilled > media);
        assert(columns > drilled);
        const responsive = Deno.readTextFileSync(
            'web-app/app/styles/responsive.css',
        );
        assert(responsive.includes(
            '.objective-aggregates-card .score-row {\n'
            + '        grid-template-columns:'
            + ' minmax(0, 1fr) 110px;\n'
            + '    }',
        ));
    },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test`

Expected: exit 1. `drilled columns are desktop-only` does not find the `220px` rule.

- [ ] **Step 3: Write the minimal implementation**

In `web-app/app/styles/components-metrics.css`, immediately after the `.objective-aggregates-card .score-row` block that sets `140px 110px 1fr`, add:

```css
/* Desktop only. A bare rule outranks the
    max-width 767px stack in responsive.css. */
@media (min-width: 768px) {
    .objective-aggregates-card.objective-drill .score-row {
        grid-template-columns: 220px 110px 1fr;
    }
}
```

Leave the `140px` rule and `web-app/app/styles/responsive.css` unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `./test validate`

Expected: exit 0. `tests/objectives-card-width.test.ts` still passes.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/styles/components-metrics.css \
    tests/presenter-dashboard-objective-projects.test.ts
git commit -m "$(cat <<'EOF'
Set drilled objective columns

Co-Authored-By: Grok 4.7 <noreply@xAI>
EOF
)"
```

---

### Task 6: Objective card hit rule

**Files:**
- Create: `web-app/dashboard/objective-card-hit.ts`
- Create: `tests/objective-card-hit.test.ts`
- Test: `tests/objective-card-hit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/objective-card-hit.test.ts`:

```ts
import { assertEquals } from '@std/assert';
import {
    objectiveCardHit,
    type ObjectiveCardHit,
} from '../web-app/dashboard/objective-card-hit.ts';

interface HitNode {
    closest: (selector: string) => HitNode | null;
    getAttribute: (name: string) => string | null;
}

function node(
    matches: Readonly<Record<string, HitNode | null>>,
    attributes: Readonly<Record<string, string>> = {},
): HitNode {
    return {
        closest: (selector: string) =>
            matches[selector] ?? null,
        getAttribute: (name: string) =>
            attributes[name] ?? null,
    };
}

function hit(target: HitNode): ObjectiveCardHit {
    return objectiveCardHit(
        target as unknown as Element,
    );
}

Deno.test('a row opens its objective', () => {
    const row = node(
        { '[data-objective-id]': null },
        { 'data-objective-id': 'obj-1' },
    );
    row.closest = (selector: string) =>
        selector === '[data-objective-id]'
            ? row
            : null;
    assertEquals(hit(row), {
        kind: 'open',
        objectiveId: 'obj-1',
    });
});

Deno.test(
    'a spark dot inside a row does not open it',
    () => {
        const row = node({}, {
            'data-objective-id': 'obj-1',
        });
        row.closest = (selector: string) =>
            selector === '[data-objective-id]'
                ? row
                : null;
        const dot = node({});
        dot.closest = (selector: string) => {
            if (selector === '.spark-dot') return dot;
            if (selector === '[data-objective-id]') {
                return row;
            }
            return null;
        };
        assertEquals(hit(dot), { kind: 'none' });
    },
);

Deno.test('the back button closes the drill', () => {
    const button = node({});
    button.closest = (selector: string) =>
        selector === '[data-drill-back]'
            ? button
            : null;
    assertEquals(hit(button), { kind: 'close' });
});

Deno.test(
    'a project link does not open or close',
    () => {
        const row = node({}, {
            'data-objective-id': 'obj-1',
        });
        row.closest = (selector: string) =>
            selector === '[data-objective-id]'
                ? row
                : null;
        const anchor = node({});
        anchor.closest = (selector: string) => {
            if (selector === 'a') return anchor;
            if (selector === '[data-objective-id]') {
                return row;
            }
            return null;
        };
        assertEquals(hit(anchor), { kind: 'none' });
    },
);

Deno.test('empty card chrome is not a hit', () => {
    assertEquals(
        hit(node({})),
        { kind: 'none' },
    );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test`

Expected: exit 1. The report cannot resolve `objective-card-hit.ts`.

- [ ] **Step 3: Write the minimal implementation**

Create `web-app/dashboard/objective-card-hit.ts`:

```ts
export type ObjectiveCardHit =
    | { kind: 'open'; objectiveId: string }
    | { kind: 'close' }
    | { kind: 'none' };

export function objectiveCardHit(
    target: Element,
): ObjectiveCardHit {
    if (target.closest('.spark-dot') !== null) {
        return { kind: 'none' };
    }
    if (target.closest('a') !== null) {
        return { kind: 'none' };
    }
    if (target.closest('[data-drill-back]') !== null) {
        return { kind: 'close' };
    }
    const row = target.closest('[data-objective-id]');
    if (row === null) return { kind: 'none' };
    const objectiveId = row.getAttribute(
        'data-objective-id',
    );
    if (objectiveId === null) return { kind: 'none' };
    return { kind: 'open', objectiveId };
}
```

A dot or an anchor wins over the row that contains it. The back button wins over anything behind it. Anything else is `none`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `./test validate`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add web-app/dashboard/objective-card-hit.ts \
    tests/objective-card-hit.test.ts
git commit -m "$(cat <<'EOF'
Hit-test the objective card

Co-Authored-By: Grok 4.7 <noreply@xAI>
EOF
)"
```

---

### Task 7: Open the drill from the card

**Files:**
- Modify: `web-app/app/presenters/dashboard-objective-aggregates.ts`
- Modify: `web-app/dashboard/index.ts`
- Create: `tests/dashboard-objective-drill.test.ts`
- Test: `tests/dashboard-objective-drill.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/dashboard-objective-drill.test.ts`. One test, so the page module's visit state is not shared across parallel cases. The file is its own worker under `./test`.

```ts
import {
    assert,
    assertStrictEquals,
} from '@std/assert';
import './hmac-test-key.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const MEMBER_ID = 'XXZruirZyAOoRpNxaDnpSA';
const PROJECT_ID = 'pnXmXrxOWayANgDLdCjuBw';
const OBJECTIVE_ID = 'ohqxgUBEaFQwYbXsonRPmg';
const ORGANIZATION_ID = 'AjdvjuECVZEgZoFajaIEkg';
const REDRAW_DEADLINE_MS = 2000;

Deno.test(
    'the objective card drills in place',
    () => withLocalStorageAsync(
        (() => {
            const storage = new Map<string, string>();
            return {
                getItem: (key: string) =>
                    storage.get(key) ?? null,
                setItem: (key: string, value: string) => {
                    storage.set(key, value);
                },
                removeItem: (key: string) => {
                    storage.delete(key);
                },
            };
        })(),
        async () => {
            const g = globalThis as
                Record<string, unknown>;
            const gauges = {
                id: 'gauge-container',
                innerHTML: '',
                addEventListener: () => {},
                querySelector: () => null,
                querySelectorAll: () => [],
            };
            const cardWaiters: Array<
                (html: string) => void
            > = [];
            let cardHtml = '';
            const cardListeners: Array<{
                type: string;
                fn: EventListener;
            }> = [];
            const card = {
                id: 'objective-aggregates-card',
                get innerHTML(): string {
                    return cardHtml;
                },
                set innerHTML(value: string) {
                    cardHtml = value;
                    const waiting = cardWaiters.splice(0);
                    for (const resolve of waiting) {
                        resolve(value);
                    }
                },
                addEventListener(
                    type: string,
                    fn: EventListener,
                ): void {
                    cardListeners.push({ type, fn });
                },
                querySelector: () => null,
                querySelectorAll: () => [],
            };
            g['window'] = {
                addEventListener: () => {},
            };
            g['MutationObserver'] = class {
                observe(): void {}
            };
            g['document'] = {
                addEventListener: () => {},
                createElement: () => ({
                    className: '',
                    setAttribute: () => {},
                }),
                querySelector: (selector: string) => {
                    if (selector === '#gauge-container') {
                        return gauges;
                    }
                    if (
                        selector
                            === '#objective-aggregates-card'
                    ) {
                        return card;
                    }
                    return null;
                },
            };
            try {
                const { initAdapter } = await import(
                    './client-init.ts'
                );
                const db = memoryDbAdapter();
                await seedAdminSchema(db);
                await seedHumanMember(
                    db, MEMBER_ID, 'Demo Test',
                );
                const hasSchema = await initAdapter(
                    () => db,
                );
                assertStrictEquals(hasSchema, true);
                const token = await organizationToken();
                const { getClient } = await import(
                    '../web-app/app/client.ts'
                );
                getClient().putSessionToken(token);
                const { inPageContext } = await import(
                    './in-page-facade.ts'
                );
                const seedCtx = inPageContext(db, token);
                const org = 'organizations/'
                    + ORGANIZATION_ID;
                await seedCtx.PUT(
                    org + '/projects/' + PROJECT_ID,
                    {
                        title: 'North',
                        description: 'd',
                        progress: 0,
                        start_date: '2026-05-14',
                        target_end_date: '2026-05-14',
                        estimated_cost: 0,
                        actual_cost: 0,
                        position: 0,
                        state: 'approved',
                    },
                );
                await seedCtx.PUT(
                    org + '/objectives/' + OBJECTIVE_ID,
                    { position: 0, state: 'active' },
                );
                await seedCtx.PUT(
                    org + '/objectives/' + OBJECTIVE_ID
                        + '/revisions/'
                        + generateIdentifier(),
                    {
                        objective_id: OBJECTIVE_ID,
                        name: 'Raise income',
                        description: 'd',
                        member_id: MEMBER_ID,
                        at: '2026-05-14T00:00:00.000000Z',
                    },
                );
                const { init } = await import(
                    '../web-app/dashboard/index.ts'
                );
                await init();
                assert(cardHtml.includes(
                    'data-objective-id="'
                    + OBJECTIVE_ID + '"',
                ));
                assert(cardHtml.includes('tabindex="0"'));
                assertStrictEquals(
                    cardHtml.includes('data-drill-back'),
                    false,
                );
                assertStrictEquals(
                    cardListeners.filter(
                        item => item.type === 'click',
                    ).length,
                    1,
                );
                assertStrictEquals(
                    cardListeners.filter(
                        item => item.type === 'keydown',
                    ).length,
                    1,
                );

                function listeners(
                    type: string,
                ): EventListener[] {
                    return cardListeners
                        .filter(item => item.type === type)
                        .map(item => item.fn);
                }
                function fire(
                    type: string,
                    event: Event,
                ): void {
                    const fn = listeners(type)[0];
                    assert(fn, type);
                    fn(event);
                }
                function pointer(
                    target: object,
                    key?: string,
                ): Event & { defaultPrevented: boolean } {
                    let prevented = false;
                    return {
                        target,
                        key,
                        preventDefault() {
                            prevented = true;
                        },
                        get defaultPrevented() {
                            return prevented;
                        },
                    } as unknown as Event & {
                        defaultPrevented: boolean;
                    };
                }
                function rowTarget(): object {
                    const row = {
                        closest(selector: string) {
                            if (
                                selector
                                    === '[data-objective-id]'
                            ) {
                                return row;
                            }
                            return null;
                        },
                        getAttribute(name: string) {
                            return name
                                === 'data-objective-id'
                                ? OBJECTIVE_ID
                                : null;
                        },
                    };
                    return row;
                }
                function dotTarget(): object {
                    const dot = {
                        closest(selector: string) {
                            if (selector === '.spark-dot') {
                                return dot;
                            }
                            if (
                                selector
                                    === '[data-objective-id]'
                            ) {
                                return rowTarget();
                            }
                            return null;
                        },
                    };
                    return dot;
                }
                function anchorTarget(): object {
                    const anchor = {
                        closest(selector: string) {
                            if (selector === 'a') {
                                return anchor;
                            }
                            if (
                                selector
                                    === '[data-objective-id]'
                            ) {
                                return rowTarget();
                            }
                            return null;
                        },
                    };
                    return anchor;
                }
                function backTarget(): object {
                    const button = {
                        closest(selector: string) {
                            if (
                                selector
                                    === '[data-drill-back]'
                            ) {
                                return button;
                            }
                            return null;
                        },
                    };
                    return button;
                }
                function nextCardHtml(): Promise<string> {
                    return new Promise((resolve, reject) => {
                        const timer = setTimeout(() => {
                            reject(new Error(
                                'objective card did'
                                + ' not redraw',
                            ));
                        }, REDRAW_DEADLINE_MS);
                        cardWaiters.push(html => {
                            clearTimeout(timer);
                            resolve(html);
                        });
                    });
                }

                const ignored = pointer(rowTarget(), 'x');
                fire('keydown', ignored);
                assertStrictEquals(
                    ignored.defaultPrevented, false,
                );
                const dot = pointer(dotTarget(), ' ');
                fire('keydown', dot);
                assertStrictEquals(
                    dot.defaultPrevented, false,
                );
                const link = pointer(anchorTarget());
                fire('click', link);
                assertStrictEquals(
                    link.defaultPrevented, false,
                );
                const chrome = pointer({
                    closest: () => null,
                });
                fire('click', chrome);
                assertStrictEquals(
                    chrome.defaultPrevented, false,
                );

                const openKey = pointer(rowTarget(), ' ');
                const opened = nextCardHtml();
                fire('keydown', openKey);
                assertStrictEquals(
                    openKey.defaultPrevented, true,
                );
                const drilled = await opened;
                assert(drilled.includes('data-drill-back'));
                assert(drilled.includes('← Objectives'));
                assert(drilled.includes('Raise income'));
                assert(drilled.includes('North'));
                assert(drilled.includes(
                    'href="../projects/detail.html'
                    + '?projectId=' + PROJECT_ID + '"',
                ));
                assert(drilled.includes('objective-drill'));
                assert(drilled.includes(
                    'data-project-id="'
                    + PROJECT_ID + '"',
                ));
                assert(drilled.includes(
                    'data-empty="true"',
                ));
                assertStrictEquals(
                    drilled.includes('icon-box'),
                    false,
                );

                const close = pointer(backTarget());
                const closed = nextCardHtml();
                fire('click', close);
                assertStrictEquals(
                    close.defaultPrevented, false,
                );
                const listed = await closed;
                assert(listed.includes('icon-box'));
                assertStrictEquals(
                    listed.includes('data-drill-back'),
                    false,
                );

                const openEnter = pointer(
                    rowTarget(), 'Enter',
                );
                const entered = nextCardHtml();
                fire('keydown', openEnter);
                assertStrictEquals(
                    openEnter.defaultPrevented, true,
                );
                assert(
                    (await entered).includes(
                        'data-drill-back',
                    ),
                );
                const closeEnter = pointer(backTarget());
                const closedEnter = nextCardHtml();
                fire('click', closeEnter);
                await closedEnter;

                const openClick = pointer(rowTarget());
                const reopened = nextCardHtml();
                fire('click', openClick);
                assertStrictEquals(
                    openClick.defaultPrevented, true,
                );
                assert(
                    (await reopened).includes(
                        'data-drill-back',
                    ),
                );

                await seedCtx.PUT(
                    org + '/projects/' + PROJECT_ID
                        + '/objective-actual-scores/'
                        + generateIdentifier(),
                    {
                        project_id: PROJECT_ID,
                        objective_id: OBJECTIVE_ID,
                        score: 40,
                        member_id: MEMBER_ID,
                        at: '2026-05-15T00:00:00.000000Z',
                    },
                );
                const { notifyProjectScoreChange } =
                    await import(
                        '../client/project-scoring.ts'
                    );
                const scored = nextCardHtml();
                notifyProjectScoreChange();
                const stillDrilled = await scored;
                assert(stillDrilled.includes(
                    'data-drill-back',
                ));
                assert(stillDrilled.includes('North'));

                const {
                    getProjectEntities,
                    putProjectFields,
                } = await import(
                    '../client/projects.ts'
                );
                const heldProject = (
                    await getProjectEntities(seedCtx)
                ).find(message =>
                    message.body().toValue().id
                        === PROJECT_ID,
                );
                assert(heldProject);
                const renamed = nextCardHtml();
                await putProjectFields(
                    seedCtx, heldProject, {
                        title: 'South',
                        description: 'd',
                        startDate: '2026-05-14',
                        targetEndDate: '2026-05-14',
                        estimatedCost: 0,
                    },
                );
                const retitled = await renamed;
                assert(retitled.includes('South'));
                assert(retitled.includes(
                    'data-drill-back',
                ));
                assertStrictEquals(
                    retitled.includes('North'),
                    false,
                );

                const {
                    getObjectives,
                    postObjectiveArchival,
                } = await import(
                    '../client/objectives.ts'
                );
                const heldObjective = (
                    await getObjectives(seedCtx)
                ).find(message =>
                    message.body().toValue().id
                        === OBJECTIVE_ID,
                );
                assert(heldObjective);
                const archived = nextCardHtml();
                await postObjectiveArchival(
                    seedCtx, heldObjective,
                );
                const aggregate = await archived;
                assert(aggregate.includes('icon-box'));
                assertStrictEquals(
                    aggregate.includes('data-drill-back'),
                    false,
                );

                await init();
                assertStrictEquals(
                    cardListeners.filter(
                        item => item.type === 'click',
                    ).length,
                    1,
                );
                assertStrictEquals(
                    cardListeners.filter(
                        item => item.type === 'keydown',
                    ).length,
                    1,
                );
            } finally {
                const { deleteNotificationChannel } =
                    await import(
                        '../client/broadcast-channel.ts'
                    );
                deleteNotificationChannel();
                delete g['window'];
                delete g['MutationObserver'];
                delete g['document'];
            }
        },
    ),
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test`

Expected: exit 1. `the objective card drills in place` fails. The aggregate HTML has no `tabindex="0"`, or the card has no listener, or a Space activation does not redraw the drill. The two-second deadline rejects with `objective card did not redraw` when the listener never redraws.

- [ ] **Step 3: Write the minimal implementation**

In `web-app/app/presenters/dashboard-objective-aggregates.ts`, add `tabindex="0"` to the aggregate row:

```ts
        return html`
            <li class="score-row"
                data-objective-id="${o.id}"
                data-empty="${empty}"
                tabindex="0">
```

Replace `web-app/dashboard/index.ts` with:

```ts
import { $, $required } from '../app/dom.ts';
import {
    html,
    setHtml,
    type SafeHtml,
} from '../app/safe-html.ts';
import {
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import { getDashboardGauges } from '../app/dashboard.ts';
import {
    startDashboardScoringReads,
    getObjectiveScoringInputs,
    activeObjectivesOf,
    subscribeProjectScoreChanges,
    getCurrentObjectiveDefinitions,
    subscribeObjectiveChanges,
    subscribeProjectChanges,
    type DashboardScoringBundle,
} from '../../client/index.ts';
import { sessionContext } from '../app/client.ts';
import {
    buildObjectiveAggregates,
    buildObjectiveTrendlines,
    buildProjectObjectiveRows,
} from '../app/scoring-aggregate.ts';
import {
    GaugePresenter,
    DashboardObjectiveAggregatesPresenter,
    DashboardObjectiveProjectsPresenter,
} from '../app/presenters/index.ts';
import {
    fetchMeasureName,
    markEnd,
    markStart,
    renderMeasureName,
} from '../app/page-performance.ts';
import { objectiveCardHit } from
    './objective-card-hit.ts';

type ObjectiveDefs = Awaited<
    ReturnType<typeof getCurrentObjectiveDefinitions>
>;

let openObjectiveId: string | null = null;
let objectiveCardBound = false;

function definitionsFrom(
    ctx: ReturnType<typeof sessionContext>,
    objectivesP: Promise<
        DashboardScoringBundle['objectives']
    >,
): Promise<ObjectiveDefs> {
    return objectivesP.then(objectives =>
        getCurrentObjectiveDefinitions(
            ctx,
            activeObjectivesOf(objectives)
                .map(m => m.body().toValue().id),
        ),
    );
}

function objectiveCardTarget(
    event: Event,
): Element | null {
    const target = event.target;
    if (
        target === null
        || typeof (target as Element).closest
            !== 'function'
    ) {
        return null;
    }
    return target as Element;
}

function activateObjectiveCard(event: Event): void {
    const target = objectiveCardTarget(event);
    if (target === null) return;
    const hit = objectiveCardHit(target);
    if (hit.kind === 'none') return;
    if (hit.kind === 'open') {
        event.preventDefault();
        openObjectiveId = hit.objectiveId;
    } else {
        openObjectiveId = null;
    }
    void renderObjectiveAggregates();
}

function onObjectiveCardClick(event: Event): void {
    activateObjectiveCard(event);
}

function onObjectiveCardKeydown(event: Event): void {
    const key = (event as KeyboardEvent).key;
    if (key !== 'Enter' && key !== ' ') return;
    activateObjectiveCard(event);
}

function bindObjectiveCard(): void {
    if (objectiveCardBound) return;
    const card = $required(
        '#objective-aggregates-card',
        document,
    );
    card.addEventListener(
        'click', onObjectiveCardClick,
    );
    card.addEventListener(
        'keydown', onObjectiveCardKeydown,
    );
    objectiveCardBound = true;
}

async function fillObjectiveAggregatesCard(
    bundleP: Promise<DashboardScoringBundle>,
    defsP: Promise<ObjectiveDefs>,
): Promise<void> {
    const fetchName = fetchMeasureName(
        'objective-aggregates-card',
    );
    markStart(fetchName);
    const [bundle, defs] = await Promise.all([
        bundleP,
        defsP,
    ]);
    const inputs = getObjectiveScoringInputs(bundle);
    const active = inputs.activeObjectives;
    const activeIds = active.map(
        message => message.body().toValue().id,
    );
    if (
        openObjectiveId !== null
        && !activeIds.includes(openObjectiveId)
    ) {
        openObjectiveId = null;
    }
    const aggregates = buildObjectiveAggregates(
        inputs,
    );
    const trendlines = buildObjectiveTrendlines(
        inputs,
    );
    markEnd(fetchName);
    const renderName = renderMeasureName(
        'objective-aggregates-card',
    );
    markStart(renderName);
    const openId = openObjectiveId;
    let card: SafeHtml;
    if (openId === null) {
        card = new DashboardObjectiveAggregatesPresenter(
            active, defs, aggregates, trendlines,
        ).buildCard();
    } else {
        const def = defs.get(openId);
        if (!def) {
            throw new Error(
                'objective definition missing for '
                + openId,
            );
        }
        const projects = bundle.projects.map(
            message => {
                const project = message.body()
                    .toValue();
                return {
                    id: project.id,
                    title: project.title,
                };
            },
        );
        card = new DashboardObjectiveProjectsPresenter(
            def.name,
            buildProjectObjectiveRows(
                inputs, projects, openId,
            ),
        ).buildCard();
    }
    setHtml(
        $('#objective-aggregates-card', document)!,
        card,
    );
    markEnd(renderName);
}

async function renderObjectiveAggregates(
): Promise<void> {
    const ctx = sessionContext();
    const { bundleP, objectivesP } =
        startDashboardScoringReads(ctx);
    await fillObjectiveAggregatesCard(
        bundleP,
        definitionsFrom(ctx, objectivesP),
    );
}

export async function init(
): Promise<void> {
    bindObjectiveCard();
    const container = $required(
        '#gauge-container', document,
    );

    const ctx = sessionContext();
    const { bundleP, objectivesP } =
        startDashboardScoringReads(ctx);
    const defsP = definitionsFrom(
        ctx, objectivesP,
    );
    await Promise.all([
        loadInto({
            container,
            skeleton: buildSkeleton('card-grid', 3),
            fetch: async () => getDashboardGauges(
                await bundleP,
            ),
            retry: () => init(),
            onData: gauges => {
                const rendered = gauges.map(
                    g => new GaugePresenter(g)
                        .render(),
                );
                setHtml(
                    container,
                    html`${rendered}`,
                );

                subscribeProjectScoreChanges(
                    renderObjectiveAggregates,
                );
                subscribeObjectiveChanges(
                    renderObjectiveAggregates,
                );
                subscribeProjectChanges(
                    renderObjectiveAggregates,
                );
            },
        }),
        fillObjectiveAggregatesCard(
            bundleP, defsP,
        ),
    ]);
}
```

`openObjectiveId` starts null, so the first draw is the aggregate list and a reload returns there. The address is never written. `setHtml` replaces the card's contents. `bindObjectiveCard` runs once per visit, including when `loadInto` retries through `init`. A redraw does not bind again. Click and keydown both use `objectiveCardHit`. Keydown ignores every key except Enter and Space. `preventDefault` runs only when the hit opens the drill, so Space on a row does not scroll and a spark dot, a project link, and the back button keep the browser default. A score, objective, or project notification calls `renderObjectiveAggregates`. That path clears an open id that is no longer an active objective, then draws the drill or the aggregate list. It adds no request and no status. A failed scoring read still rejects the promise `init` already awaits.

- [ ] **Step 4: Run the test to verify it passes**

Run: `./test validate`

Expected: exit 0. `tests/presenter-dashboard-objective-aggregates.test.ts` still passes with `tabindex="0"` on the row. `tests/adapters-dashboard-scoring-dedupe.test.ts` still passes.

- [ ] **Step 5: Commit**

```bash
git add \
    web-app/app/presenters/dashboard-objective-aggregates.ts \
    web-app/dashboard/index.ts \
    tests/dashboard-objective-drill.test.ts
git commit -m "$(cat <<'EOF'
Open the objective drill

Co-Authored-By: Grok 4.7 <noreply@xAI>
EOF
)"
```

---

## Spec coverage

- Drill stays inside the card, address unchanged, reload returns to the list: Task 7. The open id is module memory. No URL write.
- Approved projects only: Task 1.
- Sort, including a zero change and the trailing group: Task 2. Ties use string `<`.
- Project name links; gauge, graph, and spark dot do not navigate away: Task 4 and Task 6. Task 7 does not call `preventDefault` for a `none` hit.
- Step colors stay the existing `data-direction` rules: Task 3 moves the painter unchanged. Task 4 asserts `up` and `down`. No color CSS is added.
- Non-goals: no objective id in the URL, no new route, no change to which projects the aggregate mean includes, no change to the aggregate row's `140px` columns, no change to sparkline geometry, hover copy, or colors, no new empty-state sentence. An empty approved set renders the back button and no rows (Task 4).
- Card root classes, open id starts null, `tabindex="0"`, click, Enter, Space: Task 7. `tabindex` is the aggregate row edit in that task.
- Spark dot and project link are `none`; back button is `close`; row is `open`; chrome is `none`: Task 6.
- Drilled header, row, gauge id `drill-` plus project id, shared sparkline, `data-empty` when the series is empty: Task 4.
- `220px 110px 1fr` only at `min-width: 768px`: Task 5. The mobile rule in `responsive.css` stays.
- Score, objective, and project changes reuse `renderObjectiveAggregates`. A retired objective clears the open id: Task 7.
- `setHtml` keeps the container. One listener, including across `init` retry: Task 7.
- Series rules, including same-`at` collapse versus `latestPerPair`: Task 1.
- Missing definition throws the aggregate presenter's error from the page, because the drilled presenter receives the name: Task 7.
- An unapproved project's score is not a row: Task 1.
- A failed scoring read is still the existing rejection. Task 7 adds no catch and no status.
- Named builder, presenter, and hit tests: Tasks 1, 2, 4, and 6. The aggregate presenter tests stay green: Task 3.

## Placeholder scan

No step defers work, points at another task for its code, or names a symbol the tasks do not define. `ProjectObjectiveRow`, `buildProjectObjectiveRows`, `buildSparkline`, `DashboardObjectiveProjectsPresenter`, `ObjectiveCardHit`, and `objectiveCardHit` are defined before later tasks use them.

## Type consistency

`buildProjectObjectiveRows` takes `ObjectiveScoringInputs`, the project id and title array, and an `ObjectiveId`, and returns `ProjectObjectiveRow[]`. `buildSparkline` takes `readonly TrendPoint[]` and returns `SafeHtml`. `DashboardObjectiveProjectsPresenter` takes the objective name and those rows and returns `buildCard()`. `objectiveCardHit` returns `open` with `objectiveId`, `close`, or `none`. Task 7 uses those names.
