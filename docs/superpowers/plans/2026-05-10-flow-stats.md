# Flow Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only `flows/stats.html` page rendering one flow's diagram with per-node heat tint (blue→green→yellow→red over share of trailing-90-day flow time), a hover/click stat card, and a stepper across the most-common→least-common completed-WO paths.

**Architecture:** Three-layer split — a pure aggregate (`flow-stats-aggregate.ts`) computes the model from raw rows; a data-access adapter (`adapters/flow-stats.ts`) gathers rows through `FetchContext`; an immutable presenter (`FlowStatsPresenter`) and a NEW read-only SVG renderer (`flow-stats-graph.ts`, sibling of the editor's `flow-graph.ts`) emit `SafeHtml`. The heat ramp is a 4-stop fixed-scale `color-mix(in oklch, …)` in CSS driven by a per-node `--heat-t` custom property — zero TS color math.

**Tech Stack:** Vanilla TypeScript (ES2024, strict + `noUncheckedIndexedAccess`), Node:test (`node --test --strip-types`) with `MemoryDbAdapter` for adapter tests, zero runtime dependencies, CSS-first styling (`hsl(var(--token))`, `oklch` interpolation).

**Source design spec:** `docs/superpowers/specs/2026-05-10-flow-stats-design.md` (committed earlier on this branch).

---

## Doctrine (the Church of Code) — binding on every task

- **Commandment III, Uniformity.** Match the codebase's voice — `node:test` + `assert.strict`, presenter classes returning `SafeHtml`, adapters that take `ctx: FetchContext` first, page modules importing from `../app/core`/source modules, no inline `style=` except sanctioned data exceptions, all colors `hsl(var(--token))`, 78-char line limit on `.ts`/`.html`/`.css`.
- **Commandment IX, no premature generalization.** The new renderer is a sibling, not a parameterization, of `flow-graph.ts`. Share constants + already-exported pure helpers; don't refactor the editor.
- **Office of the Commit — every task is one commit.** Subject ~50 chars in "When applied, this commit will ___" form, never mention file names or paths. Each commit on this branch must build, function, pass tests. Use:

  ```bash
  git commit -m "<subject>" \
    -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

- **Office of Verification — TDD red-green-commit.** Every test asserts behavior, not implementation. Each test is an isolated world; helpers (e.g., `makeFixture()`) return *fresh* fixtures, no shared mutable state. A test that cannot fail is not a test.
- **Office of Commentary.** Comments explain *why*, never *what*. Reach for one only after simplifying/renaming/restructuring failed.

## Prerequisites — already done

- Worktree at `/tmp/claude/flow-stats` on branch `feature/flow-stats`, branched from master.
- Spec committed: `capture flow-stats design decisions`.
- This plan committed as the second commit on the branch.

## Task overview

| # | Task | Layer |
|---|---|---|
| 1 | `formatMinAscending(seconds)` | duration formatter |
| 2 | Aggregate types + skeleton | pure aggregate |
| 3 | `quantile` + window-clip helpers | pure aggregate |
| 4 | Path reconstruction + sojourn + heat | pure aggregate |
| 5 | Percentiles + visits + WIP + throughput + revisit | pure aggregate |
| 6 | Clan resolution + top producer | pure aggregate |
| 7 | Branch split + distinct paths + rest bucket | pure aggregate |
| 8 | Hazard + assignmentLabel + modelName | pure aggregate |
| 9 | `getFlowWorkOrderRows` fetcher | adapter |
| 10 | `getFlowStats(ctx, flowId)` adapter | adapter |
| 11 | Renderer core (grid, nodes, edges, hazards) | renderer |
| 12 | Path highlight on the canvas | renderer |
| 13 | Presenter shell + renderUpdate | presenter |
| 14 | Presenter card + renderCard | presenter |
| 15 | Heat-stop tokens (light + dark) | styling |
| 16 | `pages.css` flow-stats section | styling |
| 17 | Page registration + navigation test | wiring |
| 18 | Page module (init + event wiring) | wiring |
| 19 | Entry points (detail header + flows/index card) | wiring |
| 20 | Mock data on flagship flow | mock data |
| 21 | Mock data on a second flow | mock data |
| 22 | TEST-PLAN.md FS1–FS9 | manual |
| 23 | Update CLAUDE.md with flow-stats | docs |
| 24 | Update DESIGN-SYSTEM.md heat ramp | docs |
| 25 | Verify other .md docs (SCHEMA / README / TT-GAP) | docs |
| 26 | Final `./validate` + end-to-end smoke | verification |

All commands assume the working directory is `/tmp/claude/flow-stats` unless otherwise noted.

---

## Task 1: Format durations in ascending units

Adds `formatMinAscending(seconds)` — the page's display formatter. Picks the largest unit on the `s → m → h → d → w` ladder where the scaled value is ≥ 1; one decimal if scaled <10, integer otherwise. Used everywhere the page shows a duration (node face, card avg/median/p90).

**Files:**
- Create: `web-app/app/duration-units.ts`
- Test: `tests/duration-units.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/duration-units.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMinAscending } from '../web-app/app/duration-units.ts';

test('formatMinAscending picks the largest unit ≥ 1', () => {
    assert.equal(formatMinAscending(0),       '0s');
    assert.equal(formatMinAscending(47),      '47s');
    assert.equal(formatMinAscending(59),      '59s');
    assert.equal(formatMinAscending(60),      '1m');
    assert.equal(formatMinAscending(90),      '1.5m');
    assert.equal(formatMinAscending(510),     '8.5m');
    assert.equal(formatMinAscending(600),     '10m');
    assert.equal(formatMinAscending(3599),    '60m');
    assert.equal(formatMinAscending(3600),    '1h');
    assert.equal(formatMinAscending(11520),   '3.2h');
    assert.equal(formatMinAscending(86400),   '1d');
    assert.equal(formatMinAscending(414720),  '4.8d');
    assert.equal(formatMinAscending(604800),  '1w');
    assert.equal(formatMinAscending(1270080), '2.1w');
    assert.equal(formatMinAscending(52 * 604800), '52w');
});

test('formatMinAscending rejects negative input', () => {
    assert.throws(() => formatMinAscending(-1), /negative/i);
});
```

- [ ] **Step 2: Run and watch it fail**

```
node --test --strip-types tests/duration-units.test.ts
```

Expected: FAIL — `ERR_MODULE_NOT_FOUND` for the missing module.

- [ ] **Step 3: Implement the module**

Create `web-app/app/duration-units.ts`:

```typescript
import { SECONDS_PER_HOUR, SECONDS_PER_DAY } from '../../api/types.ts';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_WEEK   = 604800;

interface Unit {
    readonly threshold: number;
    readonly suffix: string;
}

const LADDER: readonly Unit[] = [
    { threshold: SECONDS_PER_WEEK,   suffix: 'w' },
    { threshold: SECONDS_PER_DAY,    suffix: 'd' },
    { threshold: SECONDS_PER_HOUR,   suffix: 'h' },
    { threshold: SECONDS_PER_MINUTE, suffix: 'm' },
    { threshold: 1,                  suffix: 's' },
];

export function formatMinAscending(seconds: number): string {
    if (seconds < 0) {
        throw new Error('formatMinAscending: negative seconds');
    }
    if (seconds === 0) return '0s';
    for (const unit of LADDER) {
        if (seconds >= unit.threshold) {
            const scaled = seconds / unit.threshold;
            const rendered = scaled >= 10
                ? Math.round(scaled).toString()
                : scaled.toFixed(1);
            return `${rendered}${unit.suffix}`;
        }
    }
    return '0s';
}
```

- [ ] **Step 4: Run and watch it pass**

```
node --test --strip-types tests/duration-units.test.ts
./validate
```

Expected: 2 tests pass; `./validate` clean.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/duration-units.ts tests/duration-units.test.ts
git commit -m "format durations in ascending unit ladder" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Scaffold the aggregate types and skeleton

Establishes `FlowStatsInput`, `FlowStatsModel` (+ sub-types), and an empty `buildFlowStats` returning a structurally-valid model. Subsequent tasks fill in each field. Also creates the test file's `makeFixture()` helper — a fresh 4-node flow (`C → A → B → Z`, Z complete) — reused by Tasks 3–8 (called per-test, never shared).

**Files:**
- Create: `web-app/app/flow-stats-aggregate.ts`
- Test: `tests/flow-stats-aggregate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/flow-stats-aggregate.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildFlowStats,
    type FlowStatsInput,
    type FlowStatsModel,
} from '../web-app/app/flow-stats-aggregate.ts';

export function makeFixture(): FlowStatsInput {
    return {
        nodes: [
            { id: 'c', name: 'Create',  description: '',
              positionX: 0,   positionY: 0,
              isStart: true,  isComplete: false,
              crew: { kind: 'unassigned' }, fields: [] },
            { id: 'a', name: 'Data Capture', description: '',
              positionX: 200, positionY: 0,
              isStart: false, isComplete: false,
              crew: { kind: 'unassigned' }, fields: [] },
            { id: 'b', name: 'Review', description: '',
              positionX: 400, positionY: 0,
              isStart: false, isComplete: false,
              crew: { kind: 'unassigned' }, fields: [] },
            { id: 'z', name: 'Archive', description: '',
              positionX: 600, positionY: 0,
              isStart: false, isComplete: true,
              crew: { kind: 'unassigned' }, fields: [] },
        ],
        edges: [
            { id: 'e1', name: '',        description: '',
              fromNodeId: 'c', toNodeId: 'a' },
            { id: 'e2', name: '',        description: '',
              fromNodeId: 'a', toNodeId: 'b' },
            { id: 'e3', name: 'approve', description: '',
              fromNodeId: 'b', toNodeId: 'z' },
            { id: 'e4', name: 'revise',  description: '',
              fromNodeId: 'b', toNodeId: 'a' },
        ],
        workOrders: [],
        transitions: [],
        nowMs: Date.parse('2026-05-10T00:00:00.000Z'),
        windowDays: 90,
        roleMemberSetByRoleId: new Map(),
        crewMemberSetByCrewId: new Map(),
        personNameById: new Map(),
        modelNameById:  new Map(),
        roleNameById:   new Map(),
        crewNameById:   new Map(),
    };
}

test('buildFlowStats returns the structural shape on empty input', () => {
    const m: FlowStatsModel = buildFlowStats(makeFixture());
    assert.equal(m.nodes.length, 4);
    assert.deepEqual(m.nodes.map(n => n.id), ['c', 'a', 'b', 'z']);
    assert.equal(m.edges.length, 4);
    assert.equal(m.pathEntries.length, 0);
    assert.equal(m.completedWorkOrderCount, 0);
    assert.equal(m.incompleteWorkOrderCount, 0);
    assert.equal(m.windowDays, 90);
    assert.equal(m.droppedNodeIds.size, 0);
    assert.equal(m.pathsWithDroppedStepsCount, 0);
});
```

- [ ] **Step 2: Run and watch it fail**

```
node --test --strip-types tests/flow-stats-aggregate.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement types and an empty `buildFlowStats`**

Create `web-app/app/flow-stats-aggregate.ts`:

```typescript
import type {
    GraphEdge, GraphNode, Id,
    WorkOrderEntity, WorkOrderTransitionEntity,
} from '../../api/types.ts';

export interface FlowStatsInput {
    readonly nodes: readonly GraphNode[];
    readonly edges: readonly GraphEdge[];
    readonly workOrders:  readonly WorkOrderEntity[];
    readonly transitions: readonly WorkOrderTransitionEntity[];
    readonly nowMs: number;
    readonly windowDays: number;
    readonly roleMemberSetByRoleId: ReadonlyMap<Id, ReadonlySet<Id>>;
    readonly crewMemberSetByCrewId: ReadonlyMap<Id, ReadonlySet<Id>>;
    readonly personNameById: ReadonlyMap<Id, string>;
    readonly modelNameById:  ReadonlyMap<Id, string>;
    readonly roleNameById:   ReadonlyMap<Id, string>;
    readonly crewNameById:   ReadonlyMap<Id, string>;
}

export interface NodeStat {
    readonly id: string;
    readonly displayName: string;
    readonly isStart: boolean;
    readonly isComplete: boolean;
    readonly positionX: number;
    readonly positionY: number;
    readonly outgoingEdgeIds: readonly string[];
    readonly heatPct: number;
    readonly heatT:   number;
    readonly avgSeconds:    number | null;
    readonly medianSeconds: number | null;
    readonly p90Seconds:    number | null;
    readonly visitsInWindow:     number;
    readonly distinctWorkOrders: number;
    readonly currentlyHere:      number;
    readonly throughputPerWeek:  number;
    readonly revisitRatePct: number;
    readonly clanSize:           number;
    readonly activeProducerCount: number;
    readonly topProducer: {
        readonly name: string;
        readonly vsClanAvgPct: number | null;
        readonly sharePct:     number | null;
        readonly inCurrentClan: boolean;
    } | null;
    readonly modelName: string | null;
    readonly assignmentLabel: string;
    readonly hasHazard: boolean;
    readonly branchSplit: readonly {
        readonly edgeId: string;
        readonly label: string;
        readonly toNodeId: string;
        readonly pct: number;
    }[];
}

export interface FlowPath {
    readonly nodeIds: readonly string[];
    readonly edgeIds: readonly string[];
    readonly workOrderCount: number;
    readonly sharePct: number;
}

export type PathEntry =
    | { readonly kind: 'path'; readonly path: FlowPath }
    | { readonly kind: 'rest'; readonly count: number;
        readonly combinedSharePct: number };

export interface FlowStatsModel {
    readonly nodes: readonly NodeStat[];
    readonly edges: readonly GraphEdge[];
    readonly pathEntries: readonly PathEntry[];
    readonly completedWorkOrderCount:   number;
    readonly incompleteWorkOrderCount:  number;
    readonly windowDays: number;
    readonly droppedNodeIds: ReadonlySet<string>;
    readonly pathsWithDroppedStepsCount: number;
}

function emptyNodeStat(n: GraphNode): NodeStat {
    return {
        id: n.id, displayName: n.name,
        isStart: n.isStart, isComplete: n.isComplete,
        positionX: n.positionX, positionY: n.positionY,
        outgoingEdgeIds: [],
        heatPct: 0, heatT: 0,
        avgSeconds: null, medianSeconds: null, p90Seconds: null,
        visitsInWindow: 0, distinctWorkOrders: 0,
        currentlyHere: 0, throughputPerWeek: 0,
        revisitRatePct: 0,
        clanSize: 0, activeProducerCount: 0,
        topProducer: null,
        modelName: null, assignmentLabel: 'Unassigned',
        hasHazard: false, branchSplit: [],
    };
}

export function buildFlowStats(input: FlowStatsInput): FlowStatsModel {
    return {
        nodes: input.nodes.map(emptyNodeStat),
        edges: input.edges,
        pathEntries: [],
        completedWorkOrderCount: 0,
        incompleteWorkOrderCount: 0,
        windowDays: input.windowDays,
        droppedNodeIds: new Set(),
        pathsWithDroppedStepsCount: 0,
    };
}
```

- [ ] **Step 4: Run and watch it pass**

```
node --test --strip-types tests/flow-stats-aggregate.test.ts
./validate
```

Expected: 1 test passes; `./validate` clean.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/flow-stats-aggregate.ts tests/flow-stats-aggregate.test.ts
git commit -m "scaffold flow-stats aggregate types and skeleton" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add quantile and window-clip helpers

Two small pure helpers used by Tasks 4 and 5: `quantile(sorted, q)` does linear-interpolation R-7 quantiles (so `p50` is the true median); `clipInterval(startMs, endMs, loMs, hiMs)` returns seconds of overlap between an interval and the window.

**Files:**
- Modify: `web-app/app/flow-stats-aggregate.ts`
- Modify: `tests/flow-stats-aggregate.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/flow-stats-aggregate.test.ts`:

```typescript
import {
    quantile,
    clipInterval,
} from '../web-app/app/flow-stats-aggregate.ts';

test('quantile is linear-interpolation, p50 is true median', () => {
    assert.equal(quantile([60, 120, 180, 240, 300], 0.5), 180);
    assert.equal(quantile([60, 120, 180, 240, 300], 0.9), 276);
    assert.equal(quantile([10],                    0.5),  10);
    assert.equal(quantile([1, 3],                  0.5),   2);
});

test('quantile on empty input returns 0', () => {
    assert.equal(quantile([], 0.5), 0);
});

test('clipInterval returns overlap in seconds', () => {
    // window [10000, 100000] ms = [10s, 100s].
    assert.equal(clipInterval(50000,  80000, 10000, 100000), 30);
    assert.equal(clipInterval(0,      50000, 10000, 100000), 40);
    assert.equal(clipInterval(-100000, 200000, 10000, 100000), 90);
    assert.equal(clipInterval(0,      5000,  10000, 100000), 0);
    assert.equal(clipInterval(110000, 200000, 10000, 100000), 0);
    assert.equal(clipInterval(80000,  50000, 10000, 100000), 0);
});
```

- [ ] **Step 2: Run and watch it fail**

```
node --test --strip-types tests/flow-stats-aggregate.test.ts
```

Expected: FAIL — `quantile` / `clipInterval` not exported.

- [ ] **Step 3: Implement the helpers**

Append to `web-app/app/flow-stats-aggregate.ts`:

```typescript
export function quantile(sorted: readonly number[], q: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0]!;
    const idx = q * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo]!;
    return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export function clipInterval(
    startMs: number, endMs: number,
    loMs:    number, hiMs:  number,
): number {
    if (endMs <= startMs) return 0;
    const start = Math.max(startMs, loMs);
    const end   = Math.min(endMs,   hiMs);
    return end <= start ? 0 : Math.round((end - start) / 1000);
}
```

- [ ] **Step 4: Run and watch it pass**

```
node --test --strip-types tests/flow-stats-aggregate.test.ts
./validate
```

Expected: 4 tests pass; `./validate` clean.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/flow-stats-aggregate.ts tests/flow-stats-aggregate.test.ts
git commit -m "add quantile and window-clip helpers" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Reconstruct paths, attribute sojourns, compute heat

Groups transitions by `work_order_id`, sorts each by `transitioned_at`, walks them to attribute clipped sojourn seconds per `to_node_id`, sums to a flow total, and produces `heatPct` + `heatT` per node. Sojourn in `isStart`/`isComplete` nodes = 0. Transitions referencing node IDs not in the current graph are dropped into `droppedNodeIds`; the WO's path elides them. Per-WO completion is tracked.

**Files:**
- Modify: `web-app/app/flow-stats-aggregate.ts`
- Modify: `tests/flow-stats-aggregate.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/flow-stats-aggregate.test.ts`:

```typescript
function tBefore(input: FlowStatsInput, ms: number): string {
    return new Date(input.nowMs - ms).toISOString();
}

function emptyWO(id: string, createdAt: string) {
    return { id, display_id: id,
        flow_graph: { id: 'fg', value: {} as any },
        position: 0, created_at: createdAt };
}

test('attributes sojourns and computes heatPct + heatT', () => {
    const f = makeFixture();
    const tCreated = tBefore(f, 3 * 3600 * 1000);
    const tEnterB  = tBefore(f, 1 * 3600 * 1000);
    const tEnterZ  = tBefore(f, 0);
    const input: FlowStatsInput = { ...f,
        workOrders: [emptyWO('w1', tCreated)],
        transitions: [
            { id: 't0', work_order_id: 'w1', from_node_id: '',
              to_node_id: 'c', person_id: 'p1',
              transitioned_at: tCreated },
            { id: 't1', work_order_id: 'w1', from_node_id: 'c',
              to_node_id: 'a', person_id: 'p1',
              transitioned_at: tCreated },
            { id: 't2', work_order_id: 'w1', from_node_id: 'a',
              to_node_id: 'b', person_id: 'p2',
              transitioned_at: tEnterB },
            { id: 't3', work_order_id: 'w1', from_node_id: 'b',
              to_node_id: 'z', person_id: 'p1',
              transitioned_at: tEnterZ },
        ],
    };
    const m = buildFlowStats(input);
    const byId = new Map(m.nodes.map(n => [n.id, n]));
    assert.equal(Math.round(byId.get('a')!.heatPct), 67);
    assert.equal(Math.round(byId.get('b')!.heatPct), 33);
    assert.equal(byId.get('c')!.heatPct, 0);
    assert.equal(byId.get('z')!.heatPct, 0);
    assert.equal(byId.get('a')!.heatT.toFixed(2), '0.67');
    assert.equal(byId.get('b')!.heatT.toFixed(2), '0.33');
    assert.equal(m.completedWorkOrderCount,  1);
    assert.equal(m.incompleteWorkOrderCount, 0);
});

test('drops transitions to nodes missing from the current graph', () => {
    const f = makeFixture();
    const tCreated = tBefore(f, 60_000);
    const input: FlowStatsInput = { ...f,
        workOrders: [emptyWO('w1', tCreated)],
        transitions: [
            { id: 't0', work_order_id: 'w1', from_node_id: '',
              to_node_id: 'c', person_id: 'p1',
              transitioned_at: tCreated },
            { id: 't1', work_order_id: 'w1', from_node_id: 'c',
              to_node_id: 'GHOST', person_id: 'p1',
              transitioned_at: tBefore(f, 30_000) },
        ],
    };
    const m = buildFlowStats(input);
    assert.ok(m.droppedNodeIds.has('GHOST'));
    assert.equal(m.pathsWithDroppedStepsCount, 1);
});

test('clips sojourns to the trailing 90-day window', () => {
    const f = makeFixture();
    const D = 24 * 3600 * 1000;
    const t100d = tBefore(f, 100 * D);
    const t10d  = tBefore(f, 10  * D);
    const input: FlowStatsInput = { ...f,
        workOrders: [emptyWO('w1', t100d)],
        transitions: [
            { id: 't0', work_order_id: 'w1', from_node_id: '',
              to_node_id: 'c', person_id: 'p1', transitioned_at: t100d },
            { id: 't1', work_order_id: 'w1', from_node_id: 'c',
              to_node_id: 'a', person_id: 'p1', transitioned_at: t100d },
            { id: 't2', work_order_id: 'w1', from_node_id: 'a',
              to_node_id: 'z', person_id: 'p1', transitioned_at: t10d },
        ],
    };
    const m = buildFlowStats(input);
    assert.equal(Math.round(
        m.nodes.find(n => n.id === 'a')!.heatPct), 100);
});

test('tracks incomplete (in-flight) work orders', () => {
    const f = makeFixture();
    const t = tBefore(f, 60_000);
    const input: FlowStatsInput = { ...f,
        workOrders: [emptyWO('w1', t)],
        transitions: [
            { id: 't0', work_order_id: 'w1', from_node_id: '',
              to_node_id: 'c', person_id: 'p1', transitioned_at: t },
            { id: 't1', work_order_id: 'w1', from_node_id: 'c',
              to_node_id: 'a', person_id: 'p1', transitioned_at: t },
        ],
    };
    const m = buildFlowStats(input);
    assert.equal(m.completedWorkOrderCount,  0);
    assert.equal(m.incompleteWorkOrderCount, 1);
});
```

- [ ] **Step 2: Run and watch it fail**

```
node --test --strip-types tests/flow-stats-aggregate.test.ts
```

Expected: FAIL — heat is 0, completion counts are 0.

- [ ] **Step 3: Implement reconstruction + attribution**

In `web-app/app/flow-stats-aggregate.ts`, add the `MS_PER_DAY` import and the run-reconstruction helper, then rewrite `buildFlowStats`:

```typescript
import { MS_PER_DAY } from '../../api/types.ts';

interface Sojourn {
    readonly nodeId: string;
    readonly enterMs: number;
    readonly exitMs:  number;
    readonly personId: string;
}

interface WoRun {
    readonly workOrderId: string;
    readonly sojourns: readonly Sojourn[];
    readonly pathNodeIds: readonly string[];
    readonly completed: boolean;
    readonly hadDroppedStep: boolean;
}

function reconstructRuns(
    input: FlowStatsInput,
    nodeById: ReadonlyMap<string, GraphNode>,
): { runs: readonly WoRun[]; droppedNodeIds: ReadonlySet<string> } {
    const byWo = new Map<string, WorkOrderTransitionEntity[]>();
    for (const t of input.transitions) {
        const arr = byWo.get(t.work_order_id) ?? [];
        arr.push(t);
        byWo.set(t.work_order_id, arr);
    }
    const dropped = new Set<string>();
    const runs: WoRun[] = [];
    for (const [woId, ts] of byWo) {
        ts.sort((a, b) =>
            a.transitioned_at.localeCompare(b.transitioned_at));
        const sojourns: Sojourn[] = [];
        const pathNodeIds: string[] = [];
        let completed = false;
        let hadDropped = false;
        for (let i = 0; i < ts.length; i++) {
            const t = ts[i]!;
            const node = nodeById.get(t.to_node_id);
            if (!node) {
                dropped.add(t.to_node_id);
                hadDropped = true;
                continue;
            }
            pathNodeIds.push(node.id);
            const enterMs = Date.parse(t.transitioned_at);
            const nextT   = ts[i + 1];
            const exitMs  = nextT
                ? Date.parse(nextT.transitioned_at)
                : input.nowMs;
            if (!node.isStart && !node.isComplete) {
                sojourns.push({
                    nodeId: node.id, enterMs, exitMs,
                    personId: t.person_id,
                });
            }
            if (node.isComplete) completed = true;
        }
        runs.push({ workOrderId: woId, sojourns,
                    pathNodeIds, completed,
                    hadDroppedStep: hadDropped });
    }
    return { runs, droppedNodeIds: dropped };
}

export function buildFlowStats(input: FlowStatsInput): FlowStatsModel {
    const nodeById = new Map(input.nodes.map(n => [n.id, n]));
    const winLo = input.nowMs - input.windowDays * MS_PER_DAY;
    const winHi = input.nowMs;
    const { runs, droppedNodeIds } = reconstructRuns(input, nodeById);

    const nodeSec = new Map<string, number>();
    let flowSec = 0;
    for (const run of runs) {
        for (const s of run.sojourns) {
            const sec = clipInterval(s.enterMs, s.exitMs, winLo, winHi);
            nodeSec.set(s.nodeId, (nodeSec.get(s.nodeId) ?? 0) + sec);
            flowSec += sec;
        }
    }

    const stats: NodeStat[] = input.nodes.map(n => {
        const sec = nodeSec.get(n.id) ?? 0;
        const heatPct =
            flowSec > 0 && !n.isStart && !n.isComplete
                ? (sec / flowSec) * 100
                : 0;
        const heatT = Math.min(1, Math.max(0, heatPct / 100));
        return { ...emptyNodeStat(n), heatPct, heatT };
    });

    return {
        nodes: stats,
        edges: input.edges,
        pathEntries: [],
        completedWorkOrderCount:  runs.filter(r => r.completed).length,
        incompleteWorkOrderCount: runs.filter(r => !r.completed).length,
        windowDays: input.windowDays,
        droppedNodeIds,
        pathsWithDroppedStepsCount:
            runs.filter(r => r.hadDroppedStep).length,
    };
}
```

- [ ] **Step 4: Run and watch it pass**

```
node --test --strip-types tests/flow-stats-aggregate.test.ts
./validate
```

Expected: all aggregate tests pass; `./validate` clean.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/flow-stats-aggregate.ts tests/flow-stats-aggregate.test.ts
git commit -m "attribute sojourns and compute heat per node" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Compute percentiles, visits, WIP, throughput, revisit

Per node, computes `avgSeconds`/`medianSeconds`/`p90Seconds` (via `quantile` from Task 3), `visitsInWindow` (in-window occupancies), `distinctWorkOrders`, `currentlyHere` (WOs whose last transition's destination is this node and node not `isComplete`), `throughputPerWeek` (= visits / (windowDays/7)), and `revisitRatePct` (= 2nd+-visits-by-same-WO / visits).

**Files:**
- Modify: `web-app/app/flow-stats-aggregate.ts`
- Modify: `tests/flow-stats-aggregate.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/flow-stats-aggregate.test.ts`:

```typescript
test('per-node percentiles, visits, WIP, throughput, revisit', () => {
    const f = makeFixture();
    const t = (msAgo: number) => tBefore(f, msAgo);
    const H = 3600 * 1000;
    // w1: c→a(2h)→b(1h)→z   (complete)
    // w2: c→a(4h)→b→a(1h)→b→z   (a revisited)
    // w3: c→a (still in-flight at a)
    const input: FlowStatsInput = { ...f,
        workOrders: [
            emptyWO('w1', t(3 * H)),
            emptyWO('w2', t(6 * H)),
            emptyWO('w3', t(1 * H)),
        ],
        transitions: [
            { id:'1a', work_order_id:'w1', from_node_id:'',
              to_node_id:'c', person_id:'p1', transitioned_at:t(3*H) },
            { id:'1b', work_order_id:'w1', from_node_id:'c',
              to_node_id:'a', person_id:'p1', transitioned_at:t(3*H) },
            { id:'1c', work_order_id:'w1', from_node_id:'a',
              to_node_id:'b', person_id:'p1', transitioned_at:t(1*H) },
            { id:'1d', work_order_id:'w1', from_node_id:'b',
              to_node_id:'z', person_id:'p1', transitioned_at:t(0)   },
            { id:'2a', work_order_id:'w2', from_node_id:'',
              to_node_id:'c', person_id:'p2', transitioned_at:t(6*H) },
            { id:'2b', work_order_id:'w2', from_node_id:'c',
              to_node_id:'a', person_id:'p2', transitioned_at:t(6*H) },
            { id:'2c', work_order_id:'w2', from_node_id:'a',
              to_node_id:'b', person_id:'p2', transitioned_at:t(2*H) },
            { id:'2d', work_order_id:'w2', from_node_id:'b',
              to_node_id:'a', person_id:'p2', transitioned_at:t(2*H) },
            { id:'2e', work_order_id:'w2', from_node_id:'a',
              to_node_id:'b', person_id:'p2', transitioned_at:t(1*H) },
            { id:'2f', work_order_id:'w2', from_node_id:'b',
              to_node_id:'z', person_id:'p2', transitioned_at:t(0)   },
            { id:'3a', work_order_id:'w3', from_node_id:'',
              to_node_id:'c', person_id:'p3', transitioned_at:t(1*H) },
            { id:'3b', work_order_id:'w3', from_node_id:'c',
              to_node_id:'a', person_id:'p3', transitioned_at:t(1*H) },
        ],
    };
    const m = buildFlowStats(input);
    const a = m.nodes.find(n => n.id === 'a')!;
    const b = m.nodes.find(n => n.id === 'b')!;
    // a visits: w1×1 + w2×2 + w3×1 = 4
    assert.equal(a.visitsInWindow, 4);
    assert.equal(a.distinctWorkOrders, 3);
    assert.equal(a.currentlyHere, 1);
    // revisits: w2's 2nd visit → 1/4 = 25%
    assert.equal(a.revisitRatePct, 25);
    // throughput: 4 / (90/7) ≈ 0.31
    assert.equal(a.throughputPerWeek.toFixed(2), '0.31');
    assert.equal(b.visitsInWindow, 3);
    assert.equal(b.currentlyHere, 0);
    // a sojourns sorted: [3600, 3600, 7200, 14400] → avg 7200,
    // median (q*(n-1)=1.5 between idx1=3600 and idx2=7200) = 5400,
    // p90 (idx=2.7 → 7200 + 0.7*(14400-7200) = 12240)
    assert.equal(a.avgSeconds,    7200);
    assert.equal(a.medianSeconds, 5400);
    assert.equal(a.p90Seconds,    12240);
});
```

- [ ] **Step 2: Run and watch it fail**

```
node --test --strip-types tests/flow-stats-aggregate.test.ts
```

Expected: FAIL — visits/percentiles/WIP all zero.

- [ ] **Step 3: Extend `buildFlowStats`**

Inside `buildFlowStats` (after the `nodeSec`/`flowSec` loop, before constructing `stats`), gather per-node sojourn distributions + visit + WIP counts:

```typescript
const sojournsByNode = new Map<string, number[]>();
const visitsByNode   = new Map<string, number>();
const woIdsByNode    = new Map<string, Set<string>>();
const revisitsByNode = new Map<string, number>();
const currentlyAt    = new Map<string, number>();

for (const run of runs) {
    const seenInRun = new Set<string>();
    for (const s of run.sojourns) {
        const sec = clipInterval(s.enterMs, s.exitMs, winLo, winHi);
        if (sec === 0) continue;
        const arr = sojournsByNode.get(s.nodeId) ?? [];
        arr.push(sec);
        sojournsByNode.set(s.nodeId, arr);
        visitsByNode.set(s.nodeId,
            (visitsByNode.get(s.nodeId) ?? 0) + 1);
        const woIds = woIdsByNode.get(s.nodeId) ?? new Set<string>();
        woIds.add(run.workOrderId);
        woIdsByNode.set(s.nodeId, woIds);
        if (seenInRun.has(s.nodeId)) {
            revisitsByNode.set(s.nodeId,
                (revisitsByNode.get(s.nodeId) ?? 0) + 1);
        }
        seenInRun.add(s.nodeId);
    }
    if (!run.completed && run.pathNodeIds.length > 0) {
        const last = run.pathNodeIds[run.pathNodeIds.length - 1]!;
        const lastNode = nodeById.get(last);
        if (lastNode && !lastNode.isComplete) {
            currentlyAt.set(last,
                (currentlyAt.get(last) ?? 0) + 1);
        }
    }
}

const weeks = input.windowDays / 7;
```

Then extend the per-node `stats.map` body to include the new fields:

```typescript
const sojourns = (sojournsByNode.get(n.id) ?? []).slice()
    .sort((x, y) => x - y);
const visits   = visitsByNode.get(n.id)   ?? 0;
const revisits = revisitsByNode.get(n.id) ?? 0;
return { ...emptyNodeStat(n),
    heatPct, heatT,
    avgSeconds: sojourns.length === 0
        ? null
        : Math.round(sojourns.reduce((a, b) => a + b, 0)
                     / sojourns.length),
    medianSeconds: sojourns.length === 0
        ? null : Math.round(quantile(sojourns, 0.5)),
    p90Seconds: sojourns.length === 0
        ? null : Math.round(quantile(sojourns, 0.9)),
    visitsInWindow:     visits,
    distinctWorkOrders: woIdsByNode.get(n.id)?.size ?? 0,
    currentlyHere:      currentlyAt.get(n.id) ?? 0,
    throughputPerWeek:  weeks > 0 ? visits / weeks : 0,
    revisitRatePct:     visits > 0
        ? Math.round((revisits / visits) * 100) : 0,
};
```

- [ ] **Step 4: Run and watch it pass**

```
node --test --strip-types tests/flow-stats-aggregate.test.ts
./validate
```

- [ ] **Step 5: Commit**

```bash
git add web-app/app/flow-stats-aggregate.ts tests/flow-stats-aggregate.test.ts
git commit -m "compute percentiles, visits, throughput, revisits" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Resolve the clan and identify the top producer

Per node, resolves the clan member set from `crew: NodeAssignment` (role → members, crew → crew→role→members, user-private role → 1 person, unassigned/model → ∅), counts active producers (distinct `person_id`s on OUT-transitions in-window), picks the top producer (most OUT-transitions; tiebreak by name then id), and computes `vsClanAvgPct` (= count ÷ (totalOut ÷ clanSize)) and `sharePct` (= count ÷ totalOut). Sets `assignmentLabel` and `modelName`.

**Files:**
- Modify: `web-app/app/flow-stats-aggregate.ts`
- Modify: `tests/flow-stats-aggregate.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/flow-stats-aggregate.test.ts`:

```typescript
test('resolves clan, identifies top producer + vsClanAvg + share', () => {
    const f = makeFixture();
    const nodes = f.nodes.map(n =>
        n.id === 'a'
            ? { ...n, crew: { kind: 'role' as const, roleId: 'r1' } }
            : n);
    const t = (msAgo: number) => tBefore(f, msAgo);
    const H = 3600 * 1000;
    // 4 OUT-transitions from a: p1×3, p2×1.  p3 in clan but inactive.
    const input: FlowStatsInput = { ...f, nodes,
        workOrders: [emptyWO('w', t(10*H))],
        transitions: [
            { id:'in0', work_order_id:'w', from_node_id:'',
              to_node_id:'c', person_id:'p1', transitioned_at:t(10*H) },
            { id:'in1', work_order_id:'w', from_node_id:'c',
              to_node_id:'a', person_id:'p1', transitioned_at:t(10*H) },
            { id:'o1', work_order_id:'w', from_node_id:'a',
              to_node_id:'b', person_id:'p1', transitioned_at:t(9*H) },
            { id:'r1', work_order_id:'w', from_node_id:'b',
              to_node_id:'a', person_id:'p1', transitioned_at:t(8*H) },
            { id:'o2', work_order_id:'w', from_node_id:'a',
              to_node_id:'b', person_id:'p1', transitioned_at:t(7*H) },
            { id:'r2', work_order_id:'w', from_node_id:'b',
              to_node_id:'a', person_id:'p1', transitioned_at:t(6*H) },
            { id:'o3', work_order_id:'w', from_node_id:'a',
              to_node_id:'b', person_id:'p1', transitioned_at:t(5*H) },
            { id:'r3', work_order_id:'w', from_node_id:'b',
              to_node_id:'a', person_id:'p2', transitioned_at:t(4*H) },
            { id:'o4', work_order_id:'w', from_node_id:'a',
              to_node_id:'b', person_id:'p2', transitioned_at:t(3*H) },
            { id:'fin', work_order_id:'w', from_node_id:'b',
              to_node_id:'z', person_id:'p2', transitioned_at:t(0)   },
        ],
        roleMemberSetByRoleId: new Map([
            ['r1', new Set(['p1', 'p2', 'p3'])],
        ]),
        personNameById: new Map([
            ['p1','Alex'], ['p2','Bea'], ['p3','Cy']]),
        roleNameById:   new Map([['r1','Reviewer']]),
    };
    const m = buildFlowStats(input);
    const a = m.nodes.find(n => n.id === 'a')!;
    assert.equal(a.clanSize, 3);
    assert.equal(a.activeProducerCount, 2);
    assert.equal(a.assignmentLabel, 'Role: Reviewer');
    assert.ok(a.topProducer);
    assert.equal(a.topProducer!.name, 'Alex');
    assert.equal(a.topProducer!.sharePct, 75);
    assert.equal(a.topProducer!.vsClanAvgPct, 225);
    assert.equal(a.topProducer!.inCurrentClan, true);
});

test('top producer outside the current clan is flagged', () => {
    const f = makeFixture();
    const nodes = f.nodes.map(n =>
        n.id === 'a'
            ? { ...n, crew: { kind: 'role' as const, roleId: 'r1' } }
            : n);
    const t = (msAgo: number) => tBefore(f, msAgo);
    const H = 3600 * 1000;
    const input: FlowStatsInput = { ...f, nodes,
        workOrders: [emptyWO('w', t(2*H))],
        transitions: [
            { id:'1', work_order_id:'w', from_node_id:'',
              to_node_id:'c', person_id:'p1', transitioned_at:t(2*H) },
            { id:'2', work_order_id:'w', from_node_id:'c',
              to_node_id:'a', person_id:'p1', transitioned_at:t(2*H) },
            { id:'3', work_order_id:'w', from_node_id:'a',
              to_node_id:'z', person_id:'p9', transitioned_at:t(0)   },
        ],
        roleMemberSetByRoleId: new Map([['r1', new Set(['p1'])]]),
        personNameById: new Map([['p1','Alex'], ['p9','Zed']]),
        roleNameById:   new Map([['r1','Reviewer']]),
    };
    const m = buildFlowStats(input);
    const a = m.nodes.find(n => n.id === 'a')!;
    assert.equal(a.topProducer!.name, 'Zed');
    assert.equal(a.topProducer!.inCurrentClan, false);
});

test('model-assigned node carries modelName, no clan, no producer', () => {
    const f = makeFixture();
    const nodes = f.nodes.map(n =>
        n.id === 'a'
            ? { ...n, crew: { kind: 'model' as const, modelId: 'm1' } }
            : n);
    const input: FlowStatsInput = { ...f, nodes,
        modelNameById: new Map([['m1', 'Claude Opus']]),
    };
    const m = buildFlowStats(input);
    const a = m.nodes.find(n => n.id === 'a')!;
    assert.equal(a.modelName, 'Claude Opus');
    assert.equal(a.clanSize, 0);
    assert.equal(a.topProducer, null);
    assert.equal(a.assignmentLabel, 'Model: Claude Opus');
});
```

- [ ] **Step 2: Run and watch it fail**

```
node --test --strip-types tests/flow-stats-aggregate.test.ts
```

Expected: FAIL — `topProducer` null everywhere, labels wrong.

- [ ] **Step 3: Extend `buildFlowStats`**

Add a clan resolver and an OUT-transition aggregator above the stats map:

```typescript
const USER_PRIVATE_PREFIX = 'user-private:';

function resolveClan(
    n: GraphNode,
    input: FlowStatsInput,
): { ids: ReadonlySet<string>; label: string;
     modelName: string | null } {
    const c = n.crew;
    switch (c.kind) {
        case 'unassigned':
            return { ids: new Set(), label: 'Unassigned',
                     modelName: null };
        case 'role': {
            if (c.roleId.startsWith(USER_PRIVATE_PREFIX)) {
                const pid = c.roleId.slice(USER_PRIVATE_PREFIX.length);
                return { ids: new Set([pid]),
                         label: 'Role: ' +
                             (input.personNameById.get(pid) ?? '—'),
                         modelName: null };
            }
            return {
                ids: input.roleMemberSetByRoleId.get(c.roleId)
                     ?? new Set(),
                label: 'Role: ' +
                    (input.roleNameById.get(c.roleId) ?? '—'),
                modelName: null };
        }
        case 'crew':
            return {
                ids: input.crewMemberSetByCrewId.get(c.crewId)
                     ?? new Set(),
                label: 'Crew: ' +
                    (input.crewNameById.get(c.crewId) ?? '—'),
                modelName: null };
        case 'model': {
            const mn = input.modelNameById.get(c.modelId) ?? null;
            return { ids: new Set(),
                     label: 'Model: ' + (mn ?? '—'),
                     modelName: mn };
        }
    }
}

const outByNode = new Map<string, Map<string, number>>();
for (const t of input.transitions) {
    if (t.from_node_id === '') continue;
    if (!nodeById.has(t.from_node_id)) continue;
    const ms = Date.parse(t.transitioned_at);
    if (ms < winLo || ms > winHi) continue;
    const inner = outByNode.get(t.from_node_id)
                  ?? new Map<string, number>();
    inner.set(t.person_id, (inner.get(t.person_id) ?? 0) + 1);
    outByNode.set(t.from_node_id, inner);
}
```

Extend the per-node `stats.map` body further:

```typescript
const clan = resolveClan(n, input);
const outMap   = outByNode.get(n.id) ?? new Map<string, number>();
const totalOut = Array.from(outMap.values())
                      .reduce((s, v) => s + v, 0);
let topProducer: NodeStat['topProducer'] = null;
if (totalOut > 0) {
    const sorted = Array.from(outMap.entries()).sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        const na = input.personNameById.get(a[0]) ?? a[0];
        const nb = input.personNameById.get(b[0]) ?? b[0];
        if (na !== nb) return na.localeCompare(nb);
        return a[0].localeCompare(b[0]);
    });
    const [pid, count] = sorted[0]!;
    topProducer = {
        name: input.personNameById.get(pid) ?? pid,
        sharePct: Math.round((count / totalOut) * 100),
        vsClanAvgPct: clan.ids.size > 0
            ? Math.round((count / (totalOut / clan.ids.size)) * 100)
            : null,
        inCurrentClan: clan.ids.has(pid),
    };
}
// merge into the returned NodeStat: clanSize, activeProducerCount,
// topProducer, modelName, assignmentLabel:
return { ...emptyNodeStat(n), heatPct, heatT,
    /* …percentile/visit fields from Task 5… */
    clanSize:            clan.ids.size,
    activeProducerCount: outMap.size,
    topProducer,
    modelName:        clan.modelName,
    assignmentLabel:  clan.label,
};
```

- [ ] **Step 4: Run and watch it pass**

```
node --test --strip-types tests/flow-stats-aggregate.test.ts
./validate
```

- [ ] **Step 5: Commit**

```bash
git add web-app/app/flow-stats-aggregate.ts tests/flow-stats-aggregate.test.ts
git commit -m "resolve clan and pick the top producer" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Branch split and hazard signal per node

For nodes with >1 outgoing edge in the current graph, computes `branchSplit` — `{edgeId, label, toNodeId, pct}` per outgoing edge, sorted desc. Linear nodes get an empty array. `outgoingEdgeIds` set for every node. `hasHazard = true` on non-special, non-model nodes whose resolved clan is empty (covers unassigned + zero-member role + zero-member crew; user-private roles always size 1 and never hazard; model nodes never hazard).

**Files:**
- Modify: `web-app/app/flow-stats-aggregate.ts`
- Modify: `tests/flow-stats-aggregate.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
test('branch split distributes outgoing transitions across edges', () => {
    const f = makeFixture();
    const t = (msAgo: number) => tBefore(f, msAgo);
    const H = 3600 * 1000;
    // b has two outgoing edges (e3 approve→z, e4 revise→a).
    // 8 OUT from b: 6 to z, 2 to a.
    const enters = Array.from({ length: 8 }, (_, i) => ({
        id:'in'+i, work_order_id:'w'+i,
        from_node_id:'a', to_node_id:'b', person_id:'p1',
        transitioned_at:t((20-i) * H),
    }));
    const outs = [
        { id:'o1', work_order_id:'w0', from_node_id:'b',
          to_node_id:'z', person_id:'p1', transitioned_at:t(0) },
        { id:'o2', work_order_id:'w1', from_node_id:'b',
          to_node_id:'z', person_id:'p1', transitioned_at:t(1*H) },
        { id:'o3', work_order_id:'w2', from_node_id:'b',
          to_node_id:'z', person_id:'p1', transitioned_at:t(2*H) },
        { id:'o4', work_order_id:'w3', from_node_id:'b',
          to_node_id:'z', person_id:'p1', transitioned_at:t(3*H) },
        { id:'o5', work_order_id:'w4', from_node_id:'b',
          to_node_id:'z', person_id:'p1', transitioned_at:t(4*H) },
        { id:'o6', work_order_id:'w5', from_node_id:'b',
          to_node_id:'z', person_id:'p1', transitioned_at:t(5*H) },
        { id:'o7', work_order_id:'w6', from_node_id:'b',
          to_node_id:'a', person_id:'p1', transitioned_at:t(6*H) },
        { id:'o8', work_order_id:'w7', from_node_id:'b',
          to_node_id:'a', person_id:'p1', transitioned_at:t(7*H) },
    ];
    const input: FlowStatsInput = { ...f,
        workOrders: Array.from({length:8}, (_, i) =>
            emptyWO('w' + i, t(20 * H))),
        transitions: [...enters, ...outs],
    };
    const m = buildFlowStats(input);
    const b = m.nodes.find(n => n.id === 'b')!;
    assert.equal(b.branchSplit.length, 2);
    assert.equal(b.branchSplit[0]!.label, 'approve');
    assert.equal(b.branchSplit[0]!.pct, 75);
    assert.equal(b.branchSplit[1]!.label, 'revise');
    assert.equal(b.branchSplit[1]!.pct, 25);
});

test('branchSplit empty on linear (single-out) nodes', () => {
    const m = buildFlowStats(makeFixture());
    assert.equal(
        m.nodes.find(n => n.id === 'a')!.branchSplit.length, 0);
});

test('hasHazard fires on unassigned non-special nodes', () => {
    const m = buildFlowStats(makeFixture());
    assert.equal(m.nodes.find(n => n.id === 'a')!.hasHazard, true);
    assert.equal(m.nodes.find(n => n.id === 'b')!.hasHazard, true);
    assert.equal(m.nodes.find(n => n.id === 'c')!.hasHazard, false);
    assert.equal(m.nodes.find(n => n.id === 'z')!.hasHazard, false);
});

test('hasHazard fires on empty-role and empty-crew assignments', () => {
    const f = makeFixture();
    const nodes = f.nodes.map(n =>
        n.id === 'a'
            ? { ...n, crew: { kind:'role' as const, roleId:'empty' } }
        : n.id === 'b'
            ? { ...n, crew: { kind:'crew' as const, crewId:'empty' } }
        : n);
    const m = buildFlowStats({ ...f, nodes });
    assert.equal(m.nodes.find(n => n.id === 'a')!.hasHazard, true);
    assert.equal(m.nodes.find(n => n.id === 'b')!.hasHazard, true);
});

test('user-private role and model nodes never hazard', () => {
    const f = makeFixture();
    const nodes = f.nodes.map(n =>
        n.id === 'a'
            ? { ...n, crew: { kind:'role' as const,
                              roleId:'user-private:p7' } }
        : n.id === 'b'
            ? { ...n, crew: { kind:'model' as const, modelId:'m1' } }
        : n);
    const m = buildFlowStats({ ...f, nodes });
    assert.equal(m.nodes.find(n => n.id === 'a')!.hasHazard, false);
    assert.equal(m.nodes.find(n => n.id === 'b')!.hasHazard, false);
});
```

- [ ] **Step 2: Run and watch it fail**

```
node --test --strip-types tests/flow-stats-aggregate.test.ts
```

Expected: FAIL — branchSplit empty and hasHazard false everywhere.

- [ ] **Step 3: Extend `buildFlowStats`**

Precompute outgoing edges:

```typescript
const outgoingEdgesByNode = new Map<string, GraphEdge[]>();
for (const e of input.edges) {
    const arr = outgoingEdgesByNode.get(e.fromNodeId) ?? [];
    arr.push(e);
    outgoingEdgesByNode.set(e.fromNodeId, arr);
}
```

Inside the per-node `stats.map` (right after computing `topProducer`):

```typescript
const outEdges = outgoingEdgesByNode.get(n.id) ?? [];
let branchSplit: NodeStat['branchSplit'] = [];
if (outEdges.length > 1) {
    const perTarget = new Map<string, number>();
    for (const t of input.transitions) {
        if (t.from_node_id !== n.id) continue;
        const ms = Date.parse(t.transitioned_at);
        if (ms < winLo || ms > winHi) continue;
        perTarget.set(t.to_node_id,
            (perTarget.get(t.to_node_id) ?? 0) + 1);
    }
    const total = Array.from(perTarget.values())
                       .reduce((s, v) => s + v, 0);
    branchSplit = outEdges.map(e => ({
        edgeId: e.id,
        label: e.name !== ''
            ? e.name
            : (nodeById.get(e.toNodeId)?.name ?? e.toNodeId),
        toNodeId: e.toNodeId,
        pct: total > 0
            ? Math.round(((perTarget.get(e.toNodeId) ?? 0) / total)
                         * 100)
            : 0,
    })).sort((a, b) => b.pct - a.pct);
}

const hasHazard =
    !n.isStart && !n.isComplete
    && n.crew.kind !== 'model'
    && clan.ids.size === 0;

return { ...emptyNodeStat(n), heatPct, heatT,
    /* …percentile + visit + clan fields… */
    outgoingEdgeIds: outEdges.map(e => e.id),
    branchSplit,
    hasHazard,
};
```

- [ ] **Step 4: Run and watch it pass**

```
node --test --strip-types tests/flow-stats-aggregate.test.ts
./validate
```

- [ ] **Step 5: Commit**

```bash
git add web-app/app/flow-stats-aggregate.ts tests/flow-stats-aggregate.test.ts
git commit -m "compute branch split and hazard signal per node" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Distill distinct paths with a rest bucket

For each completed WO, computes its full path (ordered node IDs with dropped steps elided) and corresponding edge IDs (consecutive node pairs matched against `input.edges`; unmatched pairs simply absent from `edgeIds`). Groups identical paths, sorts by frequency desc, keeps the top 8 as `{kind:'path'}` entries; any remainder collapses to one `{kind:'rest', count, combinedSharePct}` entry that the stepper can select to highlight nothing.

**Files:**
- Modify: `web-app/app/flow-stats-aggregate.ts`
- Modify: `tests/flow-stats-aggregate.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import type { FlowPath } from '../web-app/app/flow-stats-aggregate.ts';

test('groups completed paths and sorts by frequency desc', () => {
    const f = makeFixture();
    const t = (msAgo: number) => tBefore(f, msAgo);
    const H = 3600 * 1000;
    function happyTrans(woId: string, startMs: number) {
        return [
            { id:woId+'A', work_order_id:woId, from_node_id:'',
              to_node_id:'c', person_id:'p1',
              transitioned_at:t(startMs) },
            { id:woId+'B', work_order_id:woId, from_node_id:'c',
              to_node_id:'a', person_id:'p1',
              transitioned_at:t(startMs) },
            { id:woId+'C', work_order_id:woId, from_node_id:'a',
              to_node_id:'b', person_id:'p1',
              transitioned_at:t(startMs - 1*H) },
            { id:woId+'D', work_order_id:woId, from_node_id:'b',
              to_node_id:'z', person_id:'p1',
              transitioned_at:t(startMs - 2*H) },
        ];
    }
    const loopTrans = [
        { id:'lA', work_order_id:'wl', from_node_id:'',
          to_node_id:'c', person_id:'p1', transitioned_at:t(10*H) },
        { id:'lB', work_order_id:'wl', from_node_id:'c',
          to_node_id:'a', person_id:'p1', transitioned_at:t(10*H) },
        { id:'lC', work_order_id:'wl', from_node_id:'a',
          to_node_id:'b', person_id:'p1', transitioned_at:t(9*H) },
        { id:'lD', work_order_id:'wl', from_node_id:'b',
          to_node_id:'a', person_id:'p1', transitioned_at:t(8*H) },
        { id:'lE', work_order_id:'wl', from_node_id:'a',
          to_node_id:'b', person_id:'p1', transitioned_at:t(7*H) },
        { id:'lF', work_order_id:'wl', from_node_id:'b',
          to_node_id:'z', person_id:'p1', transitioned_at:t(6*H) },
    ];
    const input: FlowStatsInput = { ...f,
        workOrders: [
            emptyWO('w1', t(10*H)), emptyWO('w2', t(9*H)),
            emptyWO('w3', t(8*H)), emptyWO('wl', t(10*H)),
        ],
        transitions: [
            ...happyTrans('w1', 10 * H),
            ...happyTrans('w2',  9 * H),
            ...happyTrans('w3',  8 * H),
            ...loopTrans,
        ],
    };
    const m = buildFlowStats(input);
    assert.equal(m.pathEntries.length, 2);
    const top = m.pathEntries[0]! as
        { kind: 'path'; path: FlowPath };
    assert.deepEqual(top.path.nodeIds, ['c','a','b','z']);
    assert.equal(top.path.workOrderCount, 3);
    assert.equal(top.path.sharePct, 75);
    assert.deepEqual(top.path.edgeIds, ['e1','e2','e3']);
    const second = m.pathEntries[1]! as
        { kind: 'path'; path: FlowPath };
    assert.deepEqual(second.path.nodeIds,
        ['c','a','b','a','b','z']);
    assert.equal(second.path.workOrderCount, 1);
    assert.equal(second.path.sharePct, 25);
});

test('collapses long tail into a rest bucket', () => {
    const f = makeFixture();
    const t = (msAgo: number) => tBefore(f, msAgo);
    const H = 3600 * 1000;
    const workOrders: WorkOrderEntity[] = [];
    const transitions: WorkOrderTransitionEntity[] = [];
    for (let i = 0; i < 10; i++) {
        const woId = 'w' + i;
        workOrders.push(emptyWO(woId, t(50 * H)));
        let step = 0;
        let nowAgoH = 50;
        const push = (from: string, to: string) =>
            transitions.push({
                id: woId + '-' + (step++),
                work_order_id: woId,
                from_node_id: from, to_node_id: to,
                person_id: 'p1',
                transitioned_at: t(nowAgoH-- * H),
            });
        push('', 'c');
        push('c', 'a');
        for (let k = 0; k < i; k++) {
            push('a', 'b');
            push('b', 'a');
        }
        push('a', 'b');
        push('b', 'z');
    }
    const m = buildFlowStats({ ...f, workOrders, transitions });
    assert.equal(m.pathEntries.length, 9);
    assert.equal(m.pathEntries[8]!.kind, 'rest');
    const rest = m.pathEntries[8]! as
        { kind: 'rest'; count: number; combinedSharePct: number };
    assert.equal(rest.count, 2);
    assert.equal(rest.combinedSharePct, 20);
});
```

- [ ] **Step 2: Run and watch it fail**

```
node --test --strip-types tests/flow-stats-aggregate.test.ts
```

Expected: FAIL — `pathEntries` empty.

- [ ] **Step 3: Extend `buildFlowStats`**

Index edges by node-pair, group completed runs by their path key, and build the entry list:

```typescript
const MAX_VISIBLE_PATHS = 8;

const edgeIdByPair = new Map<string, string>();
for (const e of input.edges) {
    edgeIdByPair.set(e.fromNodeId + '\0' + e.toNodeId, e.id);
}

interface PathBucket {
    nodeIds: string[];
    edgeIds: string[];
    count: number;
}
const byKey = new Map<string, PathBucket>();
for (const run of runs) {
    if (!run.completed) continue;
    const ids = run.pathNodeIds.slice();
    const key = JSON.stringify(ids);
    const cur = byKey.get(key);
    if (cur) { cur.count++; continue; }
    const edgeIds: string[] = [];
    for (let i = 0; i + 1 < ids.length; i++) {
        const eid = edgeIdByPair.get(ids[i]! + '\0' + ids[i + 1]!);
        if (eid !== undefined) edgeIds.push(eid);
    }
    byKey.set(key, { nodeIds: ids, edgeIds, count: 1 });
}
const sorted = Array.from(byKey.values())
                    .sort((a, b) => b.count - a.count);
const totalCompleted = sorted.reduce((s, b) => s + b.count, 0);
const visible = sorted.slice(0, MAX_VISIBLE_PATHS);
const rest    = sorted.slice(MAX_VISIBLE_PATHS);
const pathEntries: PathEntry[] = visible.map(b => ({
    kind: 'path',
    path: {
        nodeIds: b.nodeIds, edgeIds: b.edgeIds,
        workOrderCount: b.count,
        sharePct: totalCompleted > 0
            ? Math.round((b.count / totalCompleted) * 100) : 0,
    },
}));
if (rest.length > 0) {
    const restCount = rest.reduce((s, b) => s + b.count, 0);
    pathEntries.push({ kind: 'rest', count: restCount,
        combinedSharePct: totalCompleted > 0
            ? Math.round((restCount / totalCompleted) * 100) : 0,
    });
}
```

Use `pathEntries` in the returned `FlowStatsModel` (replace the previous `[]`).

- [ ] **Step 4: Run and watch it pass**

```
node --test --strip-types tests/flow-stats-aggregate.test.ts
./validate
```

- [ ] **Step 5: Commit**

```bash
git add web-app/app/flow-stats-aggregate.ts tests/flow-stats-aggregate.test.ts
git commit -m "distill distinct completed paths with rest bucket" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Fetch flow-work-order join rows

Adds `getFlowWorkOrderRows(ctx)` — a one-liner sibling to existing `getWorkOrderRows` etc. The stats adapter uses it to filter work orders to a single flow via the relational truth (the `flow-work-orders` join table), not the frozen `flow_graph.flowId`. Before editing, verify the convention by reading the existing fetchers and confirm `FlowWorkOrderEntity` exists in `api/types.ts`.

**Files:**
- Modify: `web-app/app/adapters/work-orders-queries.ts`
- Modify: `tests/adapters-work-orders.test.ts` (assertion added; do NOT create a new file if this one exists — check first; otherwise create `tests/adapters-flow-stats.test.ts` and put the assertion there, dovetailing with Task 10)

- [ ] **Step 1: Confirm prerequisites and write the failing test**

```
grep -n "FlowWorkOrderEntity" api/types.ts | head -5
grep -n "getFlowWorkOrderRows\|getWorkOrderRows" \
    web-app/app/adapters/work-orders-queries.ts | head -10
```

Expected: `FlowWorkOrderEntity` is defined in `api/types.ts`; `getWorkOrderRows` exists; `getFlowWorkOrderRows` does NOT.

Append (or create) the test:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { createFetchContext } from '../web-app/app/adapters/init.ts';
import { getFlowWorkOrderRows }
    from '../web-app/app/adapters/work-orders-queries.ts';

test('getFlowWorkOrderRows returns seeded flow-work-order rows', async () => {
    const db = new MemoryDbAdapter();
    await db.put('flow-work-orders', 'fwo1',
        { id: 'fwo1', flow_id: 'flow1', work_order_id: 'wo1' });
    await db.put('flow-work-orders', 'fwo2',
        { id: 'fwo2', flow_id: 'flow2', work_order_id: 'wo2' });
    const ctx = createFetchContext(db);
    const rows = await getFlowWorkOrderRows(ctx);
    assert.equal(rows.length, 2);
    assert.ok(rows.some(r => r.work_order_id === 'wo1'));
    assert.ok(rows.some(r => r.work_order_id === 'wo2'));
});
```

(Adjust the import path of `MemoryDbAdapter` if its actual export site differs — confirm with `grep -rn "export.*MemoryDbAdapter" api/` first.)

- [ ] **Step 2: Run and watch it fail**

```
node --test --strip-types tests/adapters-work-orders.test.ts
```

Expected: FAIL — `getFlowWorkOrderRows` not exported.

- [ ] **Step 3: Implement the fetcher**

In `web-app/app/adapters/work-orders-queries.ts`, mirroring the existing `getWorkOrderRows` / `getWorkOrderTransitionRows` style:

```typescript
import type { FlowWorkOrderEntity } from '../../../api/types.ts';
// …
export async function getFlowWorkOrderRows(
    ctx: FetchContext,
): Promise<readonly FlowWorkOrderEntity[]> {
    return ctx.GET('flow-work-orders');
}
```

Confirm by re-reading the file that the `FetchContext` import + the `async`/`Promise<readonly …[]>` shape match the surrounding fetchers; match their voice exactly (Commandment III).

- [ ] **Step 4: Run and watch it pass**

```
node --test --strip-types tests/adapters-work-orders.test.ts
./validate
```

- [ ] **Step 5: Commit**

```bash
git add web-app/app/adapters/work-orders-queries.ts tests/adapters-work-orders.test.ts
git commit -m "fetch flow-work-order join rows" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Assemble `getFlowStats(ctx, flowId)` adapter

Gathers the current flow graph, the flow's work orders (via the join table from Task 9), their transitions, all role/crew memberships and name maps, builds the clan member sets (mirroring `workbox/index.ts buildVisibilityScope()`), and calls `buildFlowStats(...)`. Returns `{ model, graph }` so the page can compute the canvas viewBox from the graph's node positions.

**Files:**
- Create: `web-app/app/adapters/flow-stats.ts`
- Modify: `web-app/app/adapters/index.ts` (barrel re-export)
- Create: `tests/adapters-flow-stats.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/adapters-flow-stats.test.ts`. Confirm imports against the codebase (`getFlowGraph`, `getPersonMap`, etc. may live in differently-named files). Then:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { createFetchContext } from '../web-app/app/adapters/init.ts';
import { getFlowStats } from '../web-app/app/adapters/flow-stats.ts';

async function seedFlowAndPeople(db: MemoryDbAdapter) {
    await db.put('flows', 'f1', {
        id: 'f1', name: 'Onboarding', description: '',
        lock_timeout_seconds: 3600,
        graph: {
            nodes: [
                { id:'c', name:'Create', description:'',
                  positionX:0, positionY:0,
                  isStart:true, isComplete:false,
                  crew:{kind:'unassigned'}, fields:[] },
                { id:'a', name:'Capture', description:'',
                  positionX:200, positionY:0,
                  isStart:false, isComplete:false,
                  crew:{kind:'unassigned'}, fields:[] },
                { id:'z', name:'Archive', description:'',
                  positionX:400, positionY:0,
                  isStart:false, isComplete:true,
                  crew:{kind:'unassigned'}, fields:[] },
            ],
            edges: [
                { id:'e1', name:'', description:'',
                  fromNodeId:'c', toNodeId:'a' },
                { id:'e2', name:'', description:'',
                  fromNodeId:'a', toNodeId:'z' },
            ],
        },
        created_at: '2025-01-01T00:00:00.000Z',
    });
}

test('getFlowStats only includes this flow\'s work orders', async () => {
    const db = new MemoryDbAdapter();
    await seedFlowAndPeople(db);
    // Two work orders — one on f1, one on a different flow.
    await db.put('work-orders', 'wo1', {
        id:'wo1', display_id:'wo1',
        flow_graph: { id:'fg', value:{} as any },
        position:0, created_at:'2026-04-10T00:00:00.000Z' });
    await db.put('work-orders', 'wo2', {
        id:'wo2', display_id:'wo2',
        flow_graph: { id:'fg', value:{} as any },
        position:1, created_at:'2026-04-10T00:00:00.000Z' });
    await db.put('flow-work-orders', 'fwo1',
        { id:'fwo1', flow_id:'f1',     work_order_id:'wo1' });
    await db.put('flow-work-orders', 'fwo2',
        { id:'fwo2', flow_id:'OTHER',  work_order_id:'wo2' });
    await db.put('work-order-transitions', 'tr1', {
        id:'tr1', work_order_id:'wo1', from_node_id:'',
        to_node_id:'c', person_id:'p1',
        transitioned_at:'2026-04-10T00:00:00.000Z' });
    await db.put('work-order-transitions', 'tr2', {
        id:'tr2', work_order_id:'wo1', from_node_id:'c',
        to_node_id:'a', person_id:'p1',
        transitioned_at:'2026-04-10T00:00:00.000Z' });
    await db.put('work-order-transitions', 'tr3', {
        id:'tr3', work_order_id:'wo1', from_node_id:'a',
        to_node_id:'z', person_id:'p1',
        transitioned_at:'2026-05-09T00:00:00.000Z' });
    // wo2 has its own transitions — must NOT appear in f1 stats.
    await db.put('work-order-transitions', 'tr4', {
        id:'tr4', work_order_id:'wo2', from_node_id:'',
        to_node_id:'c', person_id:'p1',
        transitioned_at:'2026-04-10T00:00:00.000Z' });

    const ctx = createFetchContext(db);
    const { model, graph } = await getFlowStats(ctx, 'f1');
    assert.equal(graph.name, 'Onboarding');
    assert.equal(model.completedWorkOrderCount,  1);
    assert.equal(model.incompleteWorkOrderCount, 0);
    // f1's node 'a' must show heat from wo1 only.
    const a = model.nodes.find(n => n.id === 'a')!;
    assert.ok(a.heatPct > 0);
});

test('unknown flowId propagates the underlying error', async () => {
    const db = new MemoryDbAdapter();
    const ctx = createFetchContext(db);
    await assert.rejects(() => getFlowStats(ctx, 'nope'));
});
```

(If `getFlowGraph` resolves the graph from an existing row reader, the assertions match; otherwise adapt the seed rows to whatever shape `flows` rows take in this codebase — confirm with `grep -n "validateFlowEntity\|getFlowGraph" web-app/app/adapters/`.)

- [ ] **Step 2: Run and watch it fail**

```
node --test --strip-types tests/adapters-flow-stats.test.ts
```

Expected: FAIL — adapter module missing.

- [ ] **Step 3: Implement the adapter**

Create `web-app/app/adapters/flow-stats.ts`. Mirror `workbox/index.ts buildVisibilityScope()` for clan resolution (~30 lines, with a comment naming the precedent). Imports use the codebase's conventional `FetchContext`/ctx-first shape.

```typescript
import type { FlowGraph, Id } from '../../../api/types.ts';
import type { FetchContext } from './init.ts';
import {
    buildFlowStats,
    type FlowStatsInput,
    type FlowStatsModel,
} from '../flow-stats-aggregate.ts';
import { getFlowGraph } from './flow-queries.ts';
import {
    getWorkOrderRows,
    getWorkOrderTransitionRows,
    getFlowWorkOrderRows,
} from './work-orders-queries.ts';
import { getPersonMap } from './people.ts';
import { getRoleMap, getRoleMembershipRows } from './roles.ts';
import { getCrewMap, getMembersOfCrew } from './crews.ts';
import { getModelMap } from './models.ts';

export async function getFlowStats(
    ctx: FetchContext,
    flowId: string,
): Promise<{ model: FlowStatsModel; graph: FlowGraph }> {
    const [graph, allWorkOrders, allTransitions, fwoRows,
           personMap, roleMap, crewMap, modelMap, roleMemRows] =
        await Promise.all([
            getFlowGraph(ctx, flowId),
            getWorkOrderRows(ctx),
            getWorkOrderTransitionRows(ctx),
            getFlowWorkOrderRows(ctx),
            getPersonMap(ctx),
            getRoleMap(ctx),
            getCrewMap(ctx),
            getModelMap(ctx),
            getRoleMembershipRows(ctx),
        ]);

    const woIds = new Set(
        fwoRows.filter(r => r.flow_id === flowId)
               .map(r => r.work_order_id));
    const workOrders  = allWorkOrders .filter(w => woIds.has(w.id));
    const transitions = allTransitions.filter(t =>
        woIds.has(t.work_order_id));

    // Mirrors workbox/index.ts buildVisibilityScope().
    const roleMemberSetByRoleId = new Map<Id, Set<Id>>();
    for (const m of roleMemRows) {
        const s = roleMemberSetByRoleId.get(m.role_id) ?? new Set();
        s.add(m.person_id);
        roleMemberSetByRoleId.set(m.role_id, s);
    }
    const crewMemberSetByCrewId = new Map<Id, Set<Id>>();
    for (const crewId of crewMap.keys()) {
        crewMemberSetByCrewId.set(crewId,
            new Set(await getMembersOfCrew(ctx, crewId)));
    }

    const personNameById = new Map<Id, string>();
    for (const [id, p] of personMap) {
        personNameById.set(id, p.fullName());
    }
    const modelNameById = new Map<Id, string>();
    for (const [id, m] of modelMap) modelNameById.set(id, m.nameText());
    const roleNameById = new Map<Id, string>();
    for (const [id, r] of roleMap)  roleNameById.set(id, r.nameText());
    const crewNameById = new Map<Id, string>();
    for (const [id, c] of crewMap)  crewNameById.set(id, c.nameText());

    const input: FlowStatsInput = {
        nodes: graph.nodes, edges: graph.edges,
        workOrders, transitions,
        nowMs: Date.now(), windowDays: 90,
        roleMemberSetByRoleId, crewMemberSetByCrewId,
        personNameById, modelNameById, roleNameById, crewNameById,
    };
    return { model: buildFlowStats(input), graph };
}
```

(`fullName()`/`nameText()` are the codebase's existing entity-instance accessors — verify by reading one of `people.ts`/`roles.ts` for the actual method names and substitute if they differ.)

Then re-export from the barrel `web-app/app/adapters/index.ts`:

```typescript
export * from './flow-stats.ts';
```

- [ ] **Step 4: Run and watch it pass**

```
node --test --strip-types tests/adapters-flow-stats.test.ts
./validate
```

- [ ] **Step 5: Commit**

```bash
git add web-app/app/adapters/flow-stats.ts \
        web-app/app/adapters/index.ts \
        tests/adapters-flow-stats.test.ts
git commit -m "assemble getFlowStats over current graph" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Render the static stats canvas SVG

Adds `buildStatsGraphSvg(model, viewBox, highlight)` — a pure `SafeHtml` builder. Renders an `<svg role="img">` containing a dotted grid, edge `<path>`s as simple cubic Béziers (`perimeterPoint`/`whichEdge`/`controlOffset` from `flow-graph.ts`), and node `<g>`s with `style="--heat-t:${heatT}"`, `data-special?="start|archive"`, a name `<text>`, a face `<text>` showing `formatMinAscending(avgSeconds)` or `'—'`, and an `iconAlertTriangle` adornment when `hasHazard`. NO ports, NO `role="button"`, NO `tabindex`, NO `data-connect-port`, NO `<animate>` — every absence is asserted in the test.

This task does NOT yet implement path highlighting (`data-on-path`/`data-dim`); the `highlight` parameter is accepted but ignored. Task 12 wires it.

**Files:**
- Create: `web-app/app/flow-stats-graph.ts`
- Create: `tests/presenter-flow-stats.test.ts` (presenter tests share this file with Tasks 13–14; we start it here with renderer assertions)
- Possibly Modify: `web-app/app/flow-graph.ts` (to export `bezierAt` if you use it; if not, skip)

- [ ] **Step 1: Confirm what is already exported from `flow-graph.ts`**

```
grep -n "^export " web-app/app/flow-graph.ts
```

Expected: `NODE_WIDTH`, `NODE_HEIGHT`, `NODE_RADIUS`, `GRID_CELL`, `perimeterPoint`, `whichEdge`, `controlOffset`, `shouldShowHazard`, `START_NODE_DEFAULT_NAME`, `END_NODE_DEFAULT_NAME` are exported (or live in `api/types.ts`). If `bezierAt` (or whatever helper you need for edge label placement) is NOT exported and you want it, add a `export` keyword in a separate `git mv`-style refactor commit BEFORE this task (Office of the Commit: never move/rename + change content in one commit).

- [ ] **Step 2: Write the failing test**

Create `tests/presenter-flow-stats.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStatsGraphSvg }
    from '../web-app/app/flow-stats-graph.ts';
import type {
    FlowStatsModel, NodeStat,
} from '../web-app/app/flow-stats-aggregate.ts';

function model(): FlowStatsModel {
    const node = (over: Partial<NodeStat> & { id: string }): NodeStat =>
        ({
            id: over.id, displayName: over.id.toUpperCase(),
            isStart: false, isComplete: false,
            positionX: 0, positionY: 0,
            outgoingEdgeIds: [], heatPct: 0, heatT: 0,
            avgSeconds: null, medianSeconds: null, p90Seconds: null,
            visitsInWindow: 0, distinctWorkOrders: 0,
            currentlyHere: 0, throughputPerWeek: 0, revisitRatePct: 0,
            clanSize: 0, activeProducerCount: 0, topProducer: null,
            modelName: null, assignmentLabel: 'Unassigned',
            hasHazard: false, branchSplit: [],
            ...over,
        });
    return {
        nodes: [
            node({ id:'c', displayName:'Create',  isStart:true,
                   positionX:0,   positionY:0 }),
            node({ id:'a', displayName:'A',
                   positionX:200, positionY:0,
                   heatT:0.32, heatPct:32,
                   avgSeconds: 510, hasHazard: true }),
            node({ id:'z', displayName:'Archive', isComplete:true,
                   positionX:400, positionY:0 }),
        ],
        edges: [
            { id:'e1', name:'', description:'',
              fromNodeId:'c', toNodeId:'a' },
            { id:'e2', name:'', description:'',
              fromNodeId:'a', toNodeId:'z' },
        ],
        pathEntries: [],
        completedWorkOrderCount: 0,
        incompleteWorkOrderCount: 0,
        windowDays: 90,
        droppedNodeIds: new Set(),
        pathsWithDroppedStepsCount: 0,
    };
}

const VB = { x: 0, y: 0, w: 600, h: 200 };

test('emits an svg with role=img and no editor affordances', () => {
    const html = buildStatsGraphSvg(model(), VB, null).toString();
    assert.match(html, /<svg[^>]*role="img"/);
    // The absence invariants — these are the doctrine in the renderer.
    assert.doesNotMatch(html, /role="button"/);
    assert.doesNotMatch(html, /\btabindex\b/);
    assert.doesNotMatch(html, /\bdata-connect-port\b/);
    assert.doesNotMatch(html, /\baria-current\b/);
    assert.doesNotMatch(html, /<animate\b/);
});

test('each node carries style="--heat-t:..." and no data-heat', () => {
    const html = buildStatsGraphSvg(model(), VB, null).toString();
    // Regular node 'a' has heatT 0.32.
    assert.match(html, /data-node-id="a"[^>]*style="[^"]*--heat-t:\s*0\.32[^"]*"/);
    // Start / archive nodes carry data-special.
    assert.match(html, /data-node-id="c"[^>]*data-special="start"/);
    assert.match(html, /data-node-id="z"[^>]*data-special="archive"/);
    // No data-heat attribute anywhere.
    assert.doesNotMatch(html, /\bdata-heat\b/);
});

test('regular nodes show avg-sojourn face; special nodes show —', () => {
    const html = buildStatsGraphSvg(model(), VB, null).toString();
    // Node 'a' avgSeconds=510 → '8.5m' via formatMinAscending.
    assert.match(html, />8\.5m</);
    // Start node 'c' face = —.
    assert.match(html,
        /data-node-id="c"[\s\S]*?flow-stats-node-face[^>]*>—</);
});

test('hazard glyph appears when hasHazard, not otherwise', () => {
    const html = buildStatsGraphSvg(model(), VB, null).toString();
    assert.match(html,
        /data-node-id="a"[\s\S]*?class="flow-stats-node-hazard"/);
    assert.doesNotMatch(html,
        /data-node-id="c"[\s\S]*?flow-stats-node-hazard/);
});

test('edges carry data-edge-id and no interactive attributes', () => {
    const html = buildStatsGraphSvg(model(), VB, null).toString();
    assert.match(html, /<g[^>]*data-edge-id="e1"/);
    assert.match(html, /<g[^>]*data-edge-id="e2"/);
});
```

- [ ] **Step 3: Run and watch it fail**

```
node --test --strip-types tests/presenter-flow-stats.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 4: Implement the renderer**

Create `web-app/app/flow-stats-graph.ts`. Reuse `flow-graph.ts` geometry + edge helpers; emit string-concatenated SVG following the file's house style (`+ '...'` line continuations, no inline styles except `--heat-t`).

```typescript
import {
    NODE_WIDTH, NODE_HEIGHT, NODE_RADIUS, GRID_CELL,
    perimeterPoint, whichEdge, controlOffset,
} from './flow-graph.ts';
import {
    START_NODE_DEFAULT_NAME, END_NODE_DEFAULT_NAME,
} from '../../api/types.ts';
import type { SafeHtml } from './safe-html.ts';
import { html, trusted, escapeForHtml } from './safe-html.ts';
import { iconAlertTriangle } from './icons.ts';
import { formatMinAscending } from './duration-units.ts';
import type {
    FlowStatsModel, NodeStat,
} from './flow-stats-aggregate.ts';
import type { GraphEdge } from '../../api/types.ts';

interface ViewBox { x: number; y: number; w: number; h: number; }
interface Highlight {
    nodeIds: ReadonlySet<string>;
    edgeIds: ReadonlySet<string>;
}

export function buildStatsGraphSvg(
    model: FlowStatsModel,
    viewBox: ViewBox,
    highlight: Highlight | null,
): SafeHtml {
    const vb = `${viewBox.x} ${viewBox.y} `
             + `${viewBox.w} ${viewBox.h}`;
    return html`<svg class="flow-stats-canvas" role="img"`
        + html` aria-label="Flow heat map"`
        + html` viewBox="${vb}"`
        + html` preserveAspectRatio="xMidYMid meet">`
        + buildDefs()
        + buildGrid(viewBox)
        + trusted(model.edges
            .map(e => buildEdge(model, e, highlight).toString())
            .join(''))
        + trusted(model.nodes
            .map(n => buildNode(n, highlight).toString())
            .join(''))
        + html`</svg>`;
}

function buildDefs(): SafeHtml {
    // Grid pattern + a static accent arrow marker.
    // (No animated filters; the path highlight uses stroke-width and
    // [data-dim], not <animate>.)
    return trusted(
        '<defs>'
      + `<pattern id="flow-stats-grid" x="0" y="0"`
      +   ` width="${GRID_CELL}" height="${GRID_CELL}"`
      +   ` patternUnits="userSpaceOnUse">`
      + `<circle cx="1" cy="1" r="0.7"`
      +   ` fill="hsl(var(--muted-foreground) / 0.25)" />`
      + '</pattern>'
      + '<marker id="flow-stats-arrow"'
      +   ' viewBox="0 0 10 10" refX="9" refY="5"'
      +   ' markerWidth="6" markerHeight="6" orient="auto">'
      +   '<path d="M0,0 L10,5 L0,10 z"'
      +     ' fill="hsl(var(--border-strong))" />'
      + '</marker>'
      + '<marker id="flow-stats-arrow-accent"'
      +   ' viewBox="0 0 10 10" refX="9" refY="5"'
      +   ' markerWidth="6" markerHeight="6" orient="auto">'
      +   '<path d="M0,0 L10,5 L0,10 z"'
      +     ' fill="hsl(var(--accent))" />'
      + '</marker>'
      + '</defs>');
}

function buildGrid(vb: ViewBox): SafeHtml {
    return trusted(
        `<rect class="flow-stats-grid-bg"`
      +   ` x="${vb.x}" y="${vb.y}"`
      +   ` width="${vb.w}" height="${vb.h}" />`
      + `<rect class="flow-stats-grid"`
      +   ` x="${vb.x}" y="${vb.y}"`
      +   ` width="${vb.w}" height="${vb.h}"`
      +   ` fill="url(#flow-stats-grid)" />`);
}

function buildEdge(
    model: FlowStatsModel,
    edge: GraphEdge,
    highlight: Highlight | null,
): SafeHtml {
    const from = model.nodes.find(n => n.id === edge.fromNodeId);
    const to   = model.nodes.find(n => n.id === edge.toNodeId);
    if (!from || !to) return trusted('');
    const fromBox = { x: from.positionX, y: from.positionY,
                      w: NODE_WIDTH, h: NODE_HEIGHT };
    const toBox   = { x: to.positionX,   y: to.positionY,
                      w: NODE_WIDTH, h: NODE_HEIGHT };
    const fromSide = whichEdge(fromBox, toBox);
    const toSide   = whichEdge(toBox,   fromBox);
    const p1 = perimeterPoint(fromBox, fromSide);
    const p2 = perimeterPoint(toBox,   toSide);
    const c1 = controlOffset(p1, fromSide);
    const c2 = controlOffset(p2, toSide);
    const d = `M ${p1.x} ${p1.y} `
            + `C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, `
            + `${p2.x} ${p2.y}`;
    const dim     = highlight && !highlight.edgeIds.has(edge.id);
    const onPath  = highlight &&  highlight.edgeIds.has(edge.id);
    return trusted(
        `<g class="flow-stats-edge" data-edge-id="${escapeForHtml(edge.id)}"`
      + (dim    ? ' data-dim="true"'     : '')
      + (onPath ? ' data-on-path="true"' : '')
      + '>'
      + `<path d="${d}" fill="none"`
      +   ` stroke="hsl(var(--border-strong))"`
      +   ` stroke-width="2"`
      +   ` marker-end="url(#flow-stats-arrow)" />`
      + '</g>');
}

function buildNode(
    n: NodeStat,
    highlight: Highlight | null,
): SafeHtml {
    const x = n.positionX;
    const y = n.positionY;
    const display = n.isStart    ? START_NODE_DEFAULT_NAME
                  : n.isComplete ? END_NODE_DEFAULT_NAME
                  : n.displayName;
    const face = (n.isStart || n.isComplete || n.avgSeconds === null)
        ? '—'
        : formatMinAscending(n.avgSeconds);
    const special = n.isStart    ? 'start'
                  : n.isComplete ? 'archive'
                  : null;
    const dim    = highlight && !highlight.nodeIds.has(n.id);
    const onPath = highlight &&  highlight.nodeIds.has(n.id);
    const heatT  = n.heatT.toFixed(2);
    let inner =
        `<rect class="flow-stats-node-rect"`
      +   ` x="0" y="0"`
      +   ` width="${NODE_WIDTH}" height="${NODE_HEIGHT}"`
      +   ` rx="${NODE_RADIUS}" ry="${NODE_RADIUS}" />`
      + `<text class="flow-stats-node-name"`
      +   ` x="${NODE_WIDTH / 2}" y="26"`
      +   ` text-anchor="middle">${escapeForHtml(display)}</text>`
      + `<text class="flow-stats-node-face"`
      +   ` x="${NODE_WIDTH / 2}" y="48"`
      +   ` text-anchor="middle">${escapeForHtml(face)}</text>`;
    if (n.hasHazard) {
        inner += '<g class="flow-stats-node-hazard"'
              +    ' transform="translate(6, 42)">'
              + '<title>No assignment for this node.</title>'
              + iconAlertTriangle(16, '').toString()
              + '</g>';
    }
    return trusted(
        `<g class="flow-stats-node" data-node-id="${escapeForHtml(n.id)}"`
      + ` style="--heat-t: ${heatT}"`
      + ` transform="translate(${x}, ${y})"`
      + (special ? ` data-special="${special}"`   : '')
      + (dim     ? ' data-dim="true"'              : '')
      + (onPath  ? ' data-on-path="true"'          : '')
      + '>'
      + inner
      + '</g>');
}
```

(`escapeForHtml`, `trusted`, and the `SafeHtml` type live in `safe-html.ts` — confirm the export names; substitute if the helpers are named differently in this codebase.)

- [ ] **Step 5: Run and watch it pass**

```
node --test --strip-types tests/presenter-flow-stats.test.ts
./validate
```

- [ ] **Step 6: Commit**

```bash
git add web-app/app/flow-stats-graph.ts tests/presenter-flow-stats.test.ts
git commit -m "render the static stats canvas svg" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Highlight nodes and edges along the selected path

Wires the `highlight` parameter into the existing renderer so off-path elements receive `data-dim="true"` and on-path elements receive `data-on-path="true"`. (Task 11 already accepts the parameter and threads it; the dim/on-path attributes are emitted. This task adds tests that prove the wiring is correct and confirms the absence of `data-dim`/`data-on-path` when no highlight is provided.)

**Files:**
- Modify: `tests/presenter-flow-stats.test.ts`
- (No production code change expected if Task 11 wired the attributes correctly; if any test fails, fix the renderer.)

- [ ] **Step 1: Write the failing test**

```typescript
test('highlight set marks on-path and dims off-path nodes/edges', () => {
    const m = model();
    const highlight = {
        nodeIds: new Set(['c', 'a']),
        edgeIds: new Set(['e1']),
    };
    const html = buildStatsGraphSvg(m, VB, highlight).toString();
    assert.match(html,
        /data-node-id="c"[^>]*data-on-path="true"/);
    assert.match(html,
        /data-node-id="a"[^>]*data-on-path="true"/);
    assert.match(html,
        /data-node-id="z"[^>]*data-dim="true"/);
    assert.match(html,
        /data-edge-id="e1"[^>]*data-on-path="true"/);
    assert.match(html,
        /data-edge-id="e2"[^>]*data-dim="true"/);
});

test('no highlight ⇒ no data-dim or data-on-path anywhere', () => {
    const html = buildStatsGraphSvg(model(), VB, null).toString();
    assert.doesNotMatch(html, /data-dim="true"/);
    assert.doesNotMatch(html, /data-on-path="true"/);
});
```

- [ ] **Step 2: Run**

```
node --test --strip-types tests/presenter-flow-stats.test.ts
```

If Task 11 wired the attributes correctly, these pass green on the first run. If they fail, fix `buildNode` / `buildEdge` to emit the attributes — they must NOT appear when `highlight === null`.

- [ ] **Step 3: Run `./validate`**

```
./validate
```

- [ ] **Step 4: Commit**

```bash
git add tests/presenter-flow-stats.test.ts \
        web-app/app/flow-stats-graph.ts
git commit -m "verify path highlight on the static canvas" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Presenter shell, stepper, legend, dropped footnote

Adds `FlowStatsPresenter(model, viewBox)` with: `buildShell()` (static skeleton SafeHtml — header w/ back button + flow name + window badge; canvas-area host + hidden card slot; stepper-bar; legend; optional dropped-nodes footnote), `buildStepperBar(ui)` (current path label `◀ Path i+1 of N · X% of M work orders ▶` or `+N rarer paths, combined Z%`; `disabled` at ends), `buildLegend()` (4-stop gradient bar with `0%`/`100%` end labels). DOM-touching `renderShell` / `renderUpdate` invoke these and `setHtml` into the right slots; `renderUpdate` also calls `buildStatsGraphSvg` with the highlight resolved from `ui.selectedPathIndex`.

**Files:**
- Create: `web-app/app/presenters/flow-stats.ts`
- Modify: `web-app/app/presenters/index.ts` (barrel re-export)
- Modify: `tests/presenter-flow-stats.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { FlowStatsPresenter }
    from '../web-app/app/presenters/flow-stats.ts';

function modelWithPaths(): FlowStatsModel {
    const m = model();
    return { ...m,
        completedWorkOrderCount: 12,
        incompleteWorkOrderCount: 3,
        pathEntries: [
            { kind: 'path',
              path: { nodeIds:['c','a','z'], edgeIds:['e1','e2'],
                      workOrderCount: 9, sharePct: 75 } },
            { kind: 'path',
              path: { nodeIds:['c','a'], edgeIds:['e1'],
                      workOrderCount: 2, sharePct: 17 } },
            { kind: 'rest', count: 1, combinedSharePct: 8 },
        ],
    };
}

test('shell contains back button, flow name slot, window badge', () => {
    const p = new FlowStatsPresenter(modelWithPaths(),
        { x:0, y:0, w:600, h:200 });
    const html = p.buildShell().toString();
    assert.match(html, /id="flow-stats-back"/);
    assert.match(html, /class="flow-stats-canvas-host"/);
    assert.match(html, /id="flow-stats-card"[^>]*class="[^"]*hidden/);
    assert.match(html, /Trailing 90 days/);
});

test('stepper label reads "Path i+1 of N · X%"', () => {
    const p = new FlowStatsPresenter(modelWithPaths(),
        { x:0, y:0, w:600, h:200 });
    const at0 = p.buildStepperBar({ selectedPathIndex: 0 }).toString();
    assert.match(at0, /Path\s+1\s+of\s+3/);
    assert.match(at0, /75%\s+of\s+12\s+work\s+orders/);
    assert.match(at0, /data-stepper="prev"[^>]*disabled/);
    const at1 = p.buildStepperBar({ selectedPathIndex: 1 }).toString();
    assert.doesNotMatch(at1, /data-stepper="prev"[^>]*disabled/);
});

test('stepper at a rest entry reads "+N rarer paths"', () => {
    const p = new FlowStatsPresenter(modelWithPaths(),
        { x:0, y:0, w:600, h:200 });
    const at2 = p.buildStepperBar({ selectedPathIndex: 2 }).toString();
    assert.match(at2, /\+\s*1\s+rarer paths/);
    assert.match(at2, /8%/);
    assert.match(at2, /data-stepper="next"[^>]*disabled/);
});

test('legend is a 4-stop gradient bar with 0% / 100% end labels', () => {
    const p = new FlowStatsPresenter(modelWithPaths(),
        { x:0, y:0, w:600, h:200 });
    const html = p.buildLegend().toString();
    assert.match(html, /class="flow-stats-legend"/);
    assert.match(html, /\b0%\b/);
    assert.match(html, /\b100%\b/);
    // Legend gradient is sourced from CSS — no inline gradient colors.
    assert.doesNotMatch(html, /linear-gradient\(/i);
});

test('dropped-nodes footnote appears iff droppedNodeIds non-empty', () => {
    const base = modelWithPaths();
    const without = new FlowStatsPresenter(base,
        { x:0, y:0, w:600, h:200 });
    assert.doesNotMatch(without.buildShell().toString(),
        /omitted from this view/i);
    const withDropped: FlowStatsModel = { ...base,
        droppedNodeIds: new Set(['ghost']),
        pathsWithDroppedStepsCount: 2 };
    const withFn = new FlowStatsPresenter(withDropped,
        { x:0, y:0, w:600, h:200 });
    assert.match(withFn.buildShell().toString(),
        /omitted from this view/i);
});
```

- [ ] **Step 2: Run and watch it fail**

```
node --test --strip-types tests/presenter-flow-stats.test.ts
```

Expected: FAIL — presenter module missing.

- [ ] **Step 3: Implement the presenter**

Create `web-app/app/presenters/flow-stats.ts`:

```typescript
import type {
    FlowStatsModel,
} from '../flow-stats-aggregate.ts';
import { html, trusted, setHtml,
         type SafeHtml } from '../safe-html.ts';
import { iconArrowLeft } from '../icons.ts';
import { buildStatsGraphSvg } from '../flow-stats-graph.ts';

interface ViewBox { x: number; y: number; w: number; h: number; }

export interface FlowStatsUi {
    selectedPathIndex: number;
    pinnedNodeId?:     string | null;
    hoveredNodeId?:    string | null;
}

export class FlowStatsPresenter {
    readonly #model:   FlowStatsModel;
    readonly #viewBox: ViewBox;

    constructor(model: FlowStatsModel, viewBox: ViewBox) {
        this.#model = model; this.#viewBox = viewBox;
    }

    buildShell(): SafeHtml {
        const dropped = this.#model.droppedNodeIds.size > 0
            ? html`<div class="flow-stats-footnote">`
              + html`${String(this.#model.pathsWithDroppedStepsCount)}`
              + html` work-order paths reference nodes omitted from `
              + html`this view.</div>`
            : trusted('');
        return html`<div class="flow-stats">`
            + html`<div class="flow-stats-header">`
            +   html`<button id="flow-stats-back"`
            +     html` class="btn btn-ghost btn-icon"`
            +     html` title="Designer"`
            +     html` aria-label="Back to Flow Designer">`
            +   trusted(iconArrowLeft(20, '').toString())
            +   html`</button>`
            +   html`<div class="flow-stats-title-block">`
            +     html`<h1 class="page-title flow-stats-flow-name">`
            +     html`</h1>`
            +     html`<p class="flow-stats-flow-desc"></p>`
            +   html`</div>`
            +   html`<div class="flow-stats-window-badge">`
            +     html`Trailing 90 days</div>`
            + html`</div>`
            + html`<div class="flow-stats-body">`
            +   html`<div class="flow-stats-canvas-area">`
            +     html`<div class="flow-stats-canvas-host"></div>`
            +     html`<div id="flow-stats-card"`
            +       html` class="flow-stats-card hidden"></div>`
            +   html`</div>`
            +   html`<div class="flow-stats-stepper-bar"></div>`
            + html`</div>`
            + this.buildLegend()
            + dropped
            + html`</div>`;
    }

    buildStepperBar(ui: { selectedPathIndex: number }): SafeHtml {
        const entries = this.#model.pathEntries;
        const total   = entries.length;
        const idx     = Math.max(0, Math.min(ui.selectedPathIndex,
                                             total - 1));
        const entry   = entries[idx];
        const prevDis = idx <= 0           ? ' disabled' : '';
        const nextDis = idx >= total - 1   ? ' disabled' : '';
        let label = '';
        if (!entry) {
            label = 'No completed work orders yet';
        } else if (entry.kind === 'path') {
            label = `Path ${idx + 1} of ${total} · `
                  + `${entry.path.sharePct}% of `
                  + `${this.#model.completedWorkOrderCount} `
                  + `work orders`;
        } else {
            label = `+ ${entry.count} rarer paths, `
                  + `combined ${entry.combinedSharePct}%`;
        }
        const inflight = this.#model.incompleteWorkOrderCount > 0
            ? html` · ${String(this.#model.incompleteWorkOrderCount)}`
              + html` in flight`
            : trusted('');
        return html`<div class="flow-stats-stepper">`
            + html`<button data-stepper="prev"`
            + trusted(prevDis)
            + html` class="btn btn-ghost btn-icon"`
            + html` aria-label="Previous path">◀</button>`
            + html`<span class="flow-stats-stepper-label">`
            + html`${label}`
            + inflight
            + html`</span>`
            + html`<button data-stepper="next"`
            + trusted(nextDis)
            + html` class="btn btn-ghost btn-icon"`
            + html` aria-label="Next path">▶</button>`
            + html`</div>`;
    }

    buildLegend(): SafeHtml {
        return html`<div class="flow-stats-legend">`
            + html`<span class="flow-stats-legend-end">0%</span>`
            + html`<span class="flow-stats-legend-bar"></span>`
            + html`<span class="flow-stats-legend-end">100%</span>`
            + html`<span class="flow-stats-legend-caption">`
            +   html`share of flow time, trailing 90 days</span>`
            + html`</div>`;
    }

    renderShell(container: HTMLElement): void {
        setHtml(container, this.buildShell());
        const name = container.querySelector(
            '.flow-stats-flow-name');
        const desc = container.querySelector(
            '.flow-stats-flow-desc');
        if (name) name.textContent = this.#flowName();
        if (desc) desc.textContent = this.#flowDesc();
    }

    renderUpdate(
        container: HTMLElement,
        ui: FlowStatsUi,
    ): void {
        const highlight = this.#highlightFor(ui.selectedPathIndex);
        const canvas = container.querySelector(
            '.flow-stats-canvas-host');
        if (canvas) {
            setHtml(canvas as HTMLElement,
                buildStatsGraphSvg(
                    this.#model, this.#viewBox, highlight));
        }
        const stepper = container.querySelector(
            '.flow-stats-stepper-bar');
        if (stepper) {
            setHtml(stepper as HTMLElement,
                this.buildStepperBar(
                    { selectedPathIndex: ui.selectedPathIndex }));
        }
        // Card rendering is deferred to renderCard (Task 14).
    }

    #highlightFor(index: number):
        { nodeIds: ReadonlySet<string>;
          edgeIds: ReadonlySet<string> } | null {
        const entries = this.#model.pathEntries;
        const e = entries[index];
        if (!e || e.kind !== 'path') return null;
        return {
            nodeIds: new Set(e.path.nodeIds),
            edgeIds: new Set(e.path.edgeIds),
        };
    }

    #flowName(): string {
        // The aggregate does not carry flow-name; the adapter could
        // pass it in via the constructor instead. v1: leave blank and
        // let the page module set it directly from the FlowGraph it
        // already has. (See Task 18.)
        return '';
    }
    #flowDesc(): string { return ''; }
}
```

Note the comment about `#flowName`/`#flowDesc`: the spec lists `flowName`/`flowDescription` as fields on the model. To keep `buildFlowStats` flow-name-agnostic (pure, fewer params), the page module (Task 18) reads them from the `FlowGraph` returned alongside the model and writes them into the DOM after `renderShell`. If you prefer the spec's wording — passing them through the constructor — refactor here and adjust Task 18.

Re-export from the barrel `web-app/app/presenters/index.ts`:

```typescript
export { FlowStatsPresenter } from './flow-stats.ts';
```

- [ ] **Step 4: Run and watch it pass**

```
node --test --strip-types tests/presenter-flow-stats.test.ts
./validate
```

- [ ] **Step 5: Commit**

```bash
git add web-app/app/presenters/flow-stats.ts \
        web-app/app/presenters/index.ts \
        tests/presenter-flow-stats.test.ts
git commit -m "present shell, stepper, and legend for stats" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Build the rich read-only stat card

Adds `buildCard(nodeStat)` returning the Rich card SafeHtml (`<dl>` with `% of flow time`, `avg/median/p90` via `formatMinAscending`/`DISPLAY_ABSENT`, `visits/distinct/WIP`, `~N/wk` throughput, loop-back rate; for regular non-model nodes: clan size, active producers, top producer w/ vsClanAvg + share + optional "(not in current clan)"; for model nodes: model name; for branch nodes: `next → A x% · B y%`). Adds `renderCard(container, nodeId|null)` — card-only update that toggles `.hidden` on `#flow-stats-card` and rewrites its contents. Special nodes (start/archive) get a lean card without clan/producer/branch sections.

**Files:**
- Modify: `web-app/app/presenters/flow-stats.ts`
- Modify: `tests/presenter-flow-stats.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
function nodeStat(over: Partial<NodeStat> & { id: string }): NodeStat {
    return {
        id: over.id, displayName: over.id.toUpperCase(),
        isStart: false, isComplete: false,
        positionX: 0, positionY: 0,
        outgoingEdgeIds: [], heatPct: 0, heatT: 0,
        avgSeconds: null, medianSeconds: null, p90Seconds: null,
        visitsInWindow: 0, distinctWorkOrders: 0,
        currentlyHere: 0, throughputPerWeek: 0, revisitRatePct: 0,
        clanSize: 0, activeProducerCount: 0, topProducer: null,
        modelName: null, assignmentLabel: 'Unassigned',
        hasHazard: false, branchSplit: [],
        ...over,
    };
}

test('rich card renders all stat blocks for a regular node', () => {
    const p = new FlowStatsPresenter(modelWithPaths(),
        { x:0, y:0, w:600, h:200 });
    const s = nodeStat({
        id: 'a', displayName: 'Review',
        heatPct: 58, heatT: 0.58,
        avgSeconds: 414720, medianSeconds: 259200,
        p90Seconds: 777600,
        visitsInWindow: 138, distinctWorkOrders: 124,
        currentlyHere: 12, throughputPerWeek: 11,
        revisitRatePct: 18, clanSize: 5, activeProducerCount: 3,
        topProducer: { name: 'Lee', vsClanAvgPct: 140,
                       sharePct: 31, inCurrentClan: true },
        assignmentLabel: 'Crew: Design',
        branchSplit: [
            { edgeId:'e3', label:'approve', toNodeId:'z', pct:81 },
            { edgeId:'e4', label:'revise',  toNodeId:'a', pct:19 },
        ],
    });
    const html = p.buildCard(s).toString();
    assert.match(html, />\s*58%\s*</);          // % of flow time
    assert.match(html, /4\.8d/);                 // avg
    assert.match(html, /3d/);                    // median
    assert.match(html, /9d/);                    // p90
    assert.match(html, />\s*138\s*</);          // visits
    assert.match(html, />\s*124\s*</);          // distinct WOs
    assert.match(html, />\s*12\s*</);            // WIP
    assert.match(html, />\s*~11\/wk\s*</);
    assert.match(html, />\s*18%\s*</);          // loop-back
    assert.match(html, />\s*5\s*</);             // clan size
    assert.match(html, />\s*3\s*</);             // active producers
    assert.match(html, /Lee/);
    assert.match(html, /140%/);
    assert.match(html, /31%/);
    assert.doesNotMatch(html, /not in current clan/);
    assert.match(html, /Crew:\s*Design/);
    assert.match(html, /approve\s+81%/);
    assert.match(html, /revise\s+19%/);
});

test('top producer not in clan is flagged', () => {
    const p = new FlowStatsPresenter(modelWithPaths(),
        { x:0, y:0, w:600, h:200 });
    const s = nodeStat({
        id: 'a',
        topProducer: { name: 'Zed', vsClanAvgPct: 400,
                       sharePct: 100, inCurrentClan: false },
    });
    const html = p.buildCard(s).toString();
    assert.match(html, /Zed/);
    assert.match(html, /not in current clan/);
});

test('model node card shows model name, no clan or producer', () => {
    const p = new FlowStatsPresenter(modelWithPaths(),
        { x:0, y:0, w:600, h:200 });
    const s = nodeStat({ id: 'a', modelName: 'Claude Opus',
                          assignmentLabel: 'Model: Claude Opus' });
    const html = p.buildCard(s).toString();
    assert.match(html, /Claude Opus/);
    assert.doesNotMatch(html, /Clan size/);
    assert.doesNotMatch(html, /Top producer/);
});

test('special-node card is lean (no clan/producer/branch sections)', () => {
    const p = new FlowStatsPresenter(modelWithPaths(),
        { x:0, y:0, w:600, h:200 });
    const start = nodeStat({ id: 'c', isStart: true,
                              displayName: 'Create' });
    const html = p.buildCard(start).toString();
    assert.doesNotMatch(html, /Top producer/);
    assert.doesNotMatch(html, /Clan size/);
    assert.match(html, /—/); // face is em-dash for special nodes
});

test('renderCard hides the slot when nodeId is null', () => {
    const p = new FlowStatsPresenter(modelWithPaths(),
        { x:0, y:0, w:600, h:200 });
    // Minimal DOM stub: a container with a #flow-stats-card child.
    const cardEl: any = { classList: new Set<string>(),
        innerHTML: '<previous>' };
    cardEl.classList.add = (c: string) => cardEl.classList.add(c);
    const container: any = {
        querySelector: (sel: string) =>
            sel === '#flow-stats-card' ? cardEl : null,
    };
    p.renderCard(container as HTMLElement, null);
    assert.ok(cardEl.classList.has('hidden'));
});
```

(If the codebase's existing presenter tests use a fuller DOM stub or jsdom-lite, prefer that pattern over the inline shim above; check `tests/presenter-misc.test.ts`.)

- [ ] **Step 2: Run and watch it fail**

```
node --test --strip-types tests/presenter-flow-stats.test.ts
```

Expected: FAIL — `buildCard` / `renderCard` missing.

- [ ] **Step 3: Extend the presenter**

Add to `web-app/app/presenters/flow-stats.ts`:

```typescript
import type { NodeStat } from '../flow-stats-aggregate.ts';
import { formatMinAscending } from '../duration-units.ts';
import { DISPLAY_ABSENT } from '../format.ts';

const DASH = DISPLAY_ABSENT;

function fmtDur(sec: number | null): string {
    return sec === null || sec === 0 ? DASH : formatMinAscending(sec);
}

function fmtThroughput(n: number): string {
    if (n < 1) return '<1/wk';
    return `~${Math.round(n)}/wk`;
}

// (inside the class)

buildCard(s: NodeStat): SafeHtml {
    const special = s.isStart || s.isComplete;
    const header = html`<div class="flow-stats-card-title">`
        + html`${s.displayName}`
        + html`<span class="flow-stats-card-sub">`
        +   html`${s.assignmentLabel}</span>`
        + html`</div>`;
    const time = html`<dl class="flow-stats-card-grid">`
        + html`<div><dt>% of flow time</dt>`
        +   html`<dd>${String(Math.round(s.heatPct))}%</dd></div>`
        + html`<div><dt>Avg</dt>`
        +   html`<dd>${fmtDur(s.avgSeconds)}</dd></div>`
        + html`<div><dt>Median</dt>`
        +   html`<dd>${fmtDur(s.medianSeconds)}</dd></div>`
        + html`<div><dt>p90</dt>`
        +   html`<dd>${fmtDur(s.p90Seconds)}</dd></div>`
        + html`<div><dt>Visits (90d)</dt>`
        +   html`<dd>${String(s.visitsInWindow)}</dd></div>`
        + html`<div><dt>Distinct WOs</dt>`
        +   html`<dd>${String(s.distinctWorkOrders)}</dd></div>`
        + html`<div><dt>Here now</dt>`
        +   html`<dd>${String(s.currentlyHere)}</dd></div>`
        + html`<div><dt>Throughput</dt>`
        +   html`<dd>${fmtThroughput(s.throughputPerWeek)}</dd></div>`
        + html`<div><dt>Loop-back</dt>`
        +   html`<dd>${String(s.revisitRatePct)}%</dd></div>`;
    const peopleBlock = special ? trusted('')
        : s.modelName !== null
            ? html`<div class="flow-stats-card-wide">`
              + html`<dt>Model</dt><dd>${s.modelName}</dd></div>`
        : html`<div><dt>Clan size</dt>`
              + html`<dd>${String(s.clanSize)}</dd></div>`
            + html`<div><dt>Active producers</dt>`
              + html`<dd>${String(s.activeProducerCount)}</dd></div>`
            + (s.topProducer !== null
                ? html`<div class="flow-stats-card-wide">`
                  + html`<dt>Top producer</dt><dd>`
                  +   html`${s.topProducer.name}`
                  +   (s.topProducer.vsClanAvgPct !== null
                      ? html` · ${String(s.topProducer.vsClanAvgPct)}%`
                        + html` of clan avg` : trusted(''))
                  +   (s.topProducer.sharePct !== null
                      ? html` · ${String(s.topProducer.sharePct)}%`
                        + html` of node's work` : trusted(''))
                  +   (!s.topProducer.inCurrentClan
                      ? html` (not in current clan)` : trusted(''))
                  + html`</dd></div>`
                : trusted(''));
    const branchBlock = (!special && s.branchSplit.length > 0)
        ? html`<div class="flow-stats-card-wide">`
          + html`<dt>Next</dt><dd>`
          + trusted(s.branchSplit
              .map(b => `${escape(b.label)} ${b.pct}%`)
              .join(' · '))
          + html`</dd></div>`
        : trusted('');
    return html`<div class="flow-stats-card-inner">`
        + header + time + peopleBlock + branchBlock
        + html`</dl></div>`;
}

renderCard(container: HTMLElement, nodeId: string | null): void {
    const cardEl = container.querySelector(
        '#flow-stats-card') as HTMLElement | null;
    if (!cardEl) return;
    if (nodeId === null) {
        cardEl.classList.add('hidden');
        return;
    }
    const s = this.#model.nodes.find(n => n.id === nodeId);
    if (!s) { cardEl.classList.add('hidden'); return; }
    setHtml(cardEl, this.buildCard(s));
    cardEl.classList.remove('hidden');
}
```

(`escape` above is a placeholder for whatever the codebase's HTML-attribute escape is called in `safe-html.ts` — substitute the real name; `escapeForHtml` is one possibility.)

- [ ] **Step 4: Run and watch it pass**

```
node --test --strip-types tests/presenter-flow-stats.test.ts
./validate
```

- [ ] **Step 5: Commit**

```bash
git add web-app/app/presenters/flow-stats.ts \
        tests/presenter-flow-stats.test.ts
git commit -m "render rich read-only stat card per node" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Define heat-stop tokens in light and dark modes

Adds four `--heat-stop-*` tokens (low / mid / high / peak — blue, green, yellow, red) to `light-mode.css` and `dark-mode.css`. CSS-only change; no tests. Verify via `./validate` (the 78-char lint) and the visual smoke later in Task 26.

**Files:**
- Modify: `web-app/app/styles/light-mode.css`
- Modify: `web-app/app/styles/dark-mode.css`

- [ ] **Step 1: Locate the existing token block to mirror**

```
grep -n "^:root\|^\[data-theme=\"dark\"\]\|^--" \
    web-app/app/styles/light-mode.css \
    web-app/app/styles/dark-mode.css | head -20
```

Confirm the token-definition style (each file declares a long list of `--token-name: H S% L%;` triples on `:root` or `[data-theme="dark"]`). Match that voice exactly.

- [ ] **Step 2: Add the heat-stop tokens**

In `web-app/app/styles/light-mode.css` (inside the existing `:root` block):

```css
/* Heat-map ramp (flow-stats page). Four stops; non-uniform        */
/* positions: blue @0% → green @50% → yellow @75% → red @100%.     */
--heat-stop-low:  210 85% 55%;
--heat-stop-mid:  145 65% 50%;
--heat-stop-high:  48 95% 55%;
--heat-stop-peak:   0 80% 55%;
```

In `web-app/app/styles/dark-mode.css` (mirroring the existing dark-mode token block):

```css
/* Heat-map ramp — desaturated and lifted for dark surfaces.       */
--heat-stop-low:  210 60% 60%;
--heat-stop-mid:  145 50% 55%;
--heat-stop-high:  48 80% 60%;
--heat-stop-peak:   0 65% 60%;
```

- [ ] **Step 3: Verify**

```
./validate
```

Expected: clean (no 78-char overrun, no syntax errors).

- [ ] **Step 4: Commit**

```bash
git add web-app/app/styles/light-mode.css \
        web-app/app/styles/dark-mode.css
git commit -m "introduce heat-ramp design tokens" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Add the flow-stats section to `pages.css`

Adds the `/* ===== N. FLOW STATS ===== */` section: a full-height block keyed by `html[data-page="flow-stats"]` (parallel to the existing `flow-detail` block), the layout for `.flow-stats*`, the **4-stop non-uniform heat ramp** as three chained `color-mix(in oklch, …)` rules driven by `--heat-t`, the path-highlight + dim styles, the floating card with `--card-x`/`--card-y` anchors and a `<768px` bottom-sheet fallback, the stepper bar, and the `linear-gradient` legend bar.

**Files:**
- Modify: `web-app/app/styles/pages.css`

- [ ] **Step 1: Locate the `flow-detail` block to mirror**

```
grep -n "data-page=\"flow-detail\"\|FLOW DESIGNER\|FLOW-DETAIL" \
    web-app/app/styles/pages.css | head -10
```

Note the section number and structure; the new section gets the next available section number.

- [ ] **Step 2: Add the flow-stats CSS section**

Append (or insert in the natural order) a section equivalent to:

```css
/* ===== N. FLOW STATS ===========================================
 * Read-only diagram, 4-stop heat ramp driven by --heat-t (0..1):
 *   blue @0  →  green @0.5  →  yellow @0.75  →  red @1
 * Three chained color-mix invocations, one per segment; each
 * segment's fraction is clamped to its t-range with clamp/calc.
 * ============================================================== */
html[data-page="flow-stats"],
html[data-page="flow-stats"] body {
    height: 100vh; margin: 0; overflow: hidden;
}
html[data-page="flow-stats"] #page-root {
    display: flex; flex-direction: column;
}
html[data-page="flow-stats"] .sidebar-layout { height: 100vh; }
html[data-page="flow-stats"] .main-content   { min-height: 0; }
html[data-page="flow-stats"] .page-content {
    display: flex; flex-direction: column;
    min-height: 0; overflow: hidden;
}

.flow-stats {
    display: flex; flex-direction: column;
    flex: 1; min-height: 0;
}
.flow-stats-header {
    display: flex; align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid hsl(var(--border));
}
.flow-stats-title-block { flex: 1; min-width: 0; }
.flow-stats-flow-name { margin: 0; }
.flow-stats-flow-desc {
    margin: 0; font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
}
.flow-stats-window-badge {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    padding: var(--space-1) var(--space-2);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
}

.flow-stats-body {
    display: flex; flex-direction: column;
    flex: 1; min-height: 0;
}
.flow-stats-canvas-area {
    position: relative; flex: 1; min-height: 0; overflow: hidden;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    margin: var(--space-3);
}
.flow-stats-canvas-host { width: 100%; height: 100%; }
svg.flow-stats-canvas { width: 100%; height: 100%; display: block; }
.flow-stats-grid-bg { fill: hsl(var(--color-surface, var(--card))); }

/* Heat fill — the doctrine. Read top to bottom: */
svg.flow-stats-canvas .flow-stats-node-rect {
    --seg1: clamp(0%, calc(var(--heat-t, 0) / 0.5 * 100%), 100%);
    --seg2: clamp(
        0%,
        calc((var(--heat-t, 0) - 0.5) / 0.25 * 100%),
        100%);
    --seg3: clamp(
        0%,
        calc((var(--heat-t, 0) - 0.75) / 0.25 * 100%),
        100%);
    --c01: color-mix(
        in oklch,
        hsl(var(--heat-stop-low)),
        hsl(var(--heat-stop-mid)) var(--seg1));
    --c012: color-mix(
        in oklch,
        var(--c01),
        hsl(var(--heat-stop-high)) var(--seg2));
    fill: color-mix(
        in oklch,
        var(--c012),
        hsl(var(--heat-stop-peak)) var(--seg3));
    stroke: hsl(var(--border-strong));
    stroke-width: 2;
}
svg.flow-stats-canvas
    [data-special="start"] .flow-stats-node-rect {
    stroke: hsl(var(--success));
    stroke-width: 2.5;
}
svg.flow-stats-canvas
    [data-special="archive"] .flow-stats-node-rect {
    stroke: hsl(var(--error));
    stroke-width: 3;
}

.flow-stats-node-name {
    fill: hsl(var(--foreground));
    font-size: 13px; font-weight: 600;
    pointer-events: none;
}
.flow-stats-node-face {
    fill: hsl(var(--muted-foreground));
    font-size: 11px;
    pointer-events: none;
}
.flow-stats-node-hazard { color: hsl(var(--warning)); }
.flow-stats-node { cursor: pointer; }
.flow-stats-node:hover .flow-stats-node-rect {
    stroke-width: 2.5;
}

[data-dim="true"] { opacity: 0.28; }
[data-on-path="true"] .flow-stats-node-rect {
    stroke: hsl(var(--accent));
    stroke-width: 4;
}
[data-on-path="true"] path[marker-end] {
    stroke: hsl(var(--accent));
    stroke-width: 4;
    marker-end: url(#flow-stats-arrow-accent);
}

.flow-stats-card {
    position: absolute; z-index: 20;
    max-width: 22rem;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: var(--space-3);
    /* Anchor: page module sets --card-x / --card-y in px. */
    left: clamp(0px,
        calc(var(--card-x, 0) * 1px),
        calc(100% - 22rem));
    top:  clamp(0px,
        calc(var(--card-y, 0) * 1px - 50%),
        calc(100% - 8rem));
}
.flow-stats-card.hidden { display: none; }
.flow-stats-card-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: var(--space-1) var(--space-3);
    margin: 0;
}
.flow-stats-card-grid dt {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
}
.flow-stats-card-grid dd {
    margin: 0; font-weight: var(--font-weight-semibold);
}
.flow-stats-card-wide { grid-column: 1 / -1; }

.flow-stats-stepper-bar {
    display: flex; align-items: center; gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
}
.flow-stats-stepper {
    display: flex; align-items: center; gap: var(--space-2);
}
.flow-stats-stepper-label {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
}

.flow-stats-legend {
    display: flex; align-items: center; gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-xs);
}
.flow-stats-legend-end {
    color: hsl(var(--muted-foreground));
}
.flow-stats-legend-bar {
    display: inline-block; height: 0.75rem; flex: 1;
    border-radius: 2px;
    background: linear-gradient(
        to right,
        hsl(var(--heat-stop-low))  0%,
        hsl(var(--heat-stop-mid)) 50%,
        hsl(var(--heat-stop-high)) 75%,
        hsl(var(--heat-stop-peak)) 100%);
}
.flow-stats-legend-caption {
    color: hsl(var(--muted-foreground));
    margin-left: var(--space-3);
}
.flow-stats-footnote {
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    border-top: 1px solid hsl(var(--border));
}

@media (max-width: 767px) {
    .flow-stats-card {
        position: fixed; left: 0; right: 0; bottom: 0;
        top: auto; max-width: none;
        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    }
}
```

Wrap every line at ≤78 characters (the lint will fail otherwise). The CSS above is already wrapped; keep it that way.

- [ ] **Step 3: Verify**

```
./validate
```

Expected: clean (78-char lint + tsc + tests).

- [ ] **Step 4: Smoke-check visually (optional, but worth it)**

```
TMPDIR=/tmp/claude ./serve 8080
# Open http://localhost:8080/flows/index.html — the chart icon and
# stats page don't exist yet (Tasks 17–18 add them), so this smoke
# is essentially confirming /no/ regression of the existing pages
# under the new tokens.  Real visual smoke is Task 26.
```

- [ ] **Step 5: Commit**

```bash
git add web-app/app/styles/pages.css
git commit -m "style the flow-stats canvas and card" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: Register the `flow-stats` page and prove its URL

Adds the one-line `flows/stats.html` page-content file, a `'flow-stats'` entry to `PAGE_REGISTRY`, and navigation-test assertions for the page's URL shape. Also verifies (and if absent, adds) `iconBarChart` to `icons.ts`.

**Files:**
- Create: `web-app/flows/stats.html`
- Modify: `web-app/app/page-registry.ts`
- Modify: `web-app/app/icons.ts` (only if `iconBarChart` is missing)
- Modify: `tests/navigation.test.ts`

- [ ] **Step 1: Check for `iconBarChart`**

```
grep -n "iconBarChart" web-app/app/icons.ts | head -3
```

If absent, add a `iconBarChart(size: number, classes: string): SafeHtml` function next to the other icons. Use a simple bar-chart SVG (three rising bars). Keep within the existing icon-function voice (lines ≤78 chars; pure SVG string returned via `trusted(...)`).

This icon addition, if needed, is its own preceding commit (Office of the Commit: one change per commit):

```bash
git add web-app/app/icons.ts
git commit -m "add bar-chart icon for stats entry points" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 2: Write the failing navigation test**

Append to `tests/navigation.test.ts`:

```typescript
test('buildPageUrl resolves flow-stats correctly', () => {
    assert.equal(buildPageUrl('flow-stats'),
        '../flows/stats.html');
    assert.equal(
        buildPageUrl('flow-stats', { flowId: 'f1' }),
        '../flows/stats.html?flowId=f1');
});

test('navigateTo flow-stats sets the expected URL', () => {
    const seen: string[] = [];
    // Mirror the existing navigation tests' fakeLocation pattern;
    // confirm the actual setup by reading `tests/navigation.test.ts`.
    setLocation = (url: string) => seen.push(url);
    navigateTo('flow-stats', { flowId: 'x' });
    assert.equal(seen[0], '../flows/stats.html?flowId=x');
});
```

(Adapt to the existing test file's actual setup of `setLocation`/`navigateTo`.)

- [ ] **Step 3: Run and watch it fail**

```
node --test --strip-types tests/navigation.test.ts
```

Expected: FAIL — `Unknown page: "flow-stats"`.

- [ ] **Step 4: Create the page-content file and registry entry**

Create `web-app/flows/stats.html`:

```html
<div id="flow-stats"></div>
```

In `web-app/app/page-registry.ts`, add `iconBarChart` to the icon imports and a registry entry next to `flow-detail`:

```typescript
'flow-stats': {
    title: 'Flow Statistics',
    layout: 'sidebar',
    sidebarKey: 'flows',
    sourceDir: 'flows',
    sourceFile: 'stats',
    icon: iconBarChart,
    searchable: false,
    loader: () => import('../flows/stats'),
},
```

- [ ] **Step 5: Run and watch it pass**

```
node --test --strip-types tests/navigation.test.ts
./validate
```

- [ ] **Step 6: Commit**

```bash
git add web-app/flows/stats.html \
        web-app/app/page-registry.ts \
        tests/navigation.test.ts
git commit -m "register the flow-stats page" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: Wire the page module — init, fetch, render, events

Adds the `flows/stats.ts` page module. `init(params)` reads `params.flowId` (redirects to flows index if absent), fetches via `getFlowStats`, computes a viewBox from the graph's node positions (a tiny `boundingViewBox` helper), instantiates the presenter, calls `renderShell` + `renderUpdate`, sets the flow name + description into the header (since the presenter is name-agnostic per Task 13), and binds delegated events for hover/click on `[data-node-id]`, click on `[data-stepper="prev|next"]`, click on `#flow-stats-back`, and click on empty canvas (unpin). All events use a single `AbortController`.

**Files:**
- Create: `web-app/flows/stats.ts`

(No unit test in this codebase's pattern for page modules — they're DOM-bound. Smoke-tested in Task 26.)

- [ ] **Step 1: Implement the page module**

Create `web-app/flows/stats.ts`:

```typescript
import { $ } from '../app/dom.ts';
import { setHtml } from '../app/safe-html.ts';
import { navigateTo } from '../app/core.ts';
import { createRequestContext } from '../app/adapters/init.ts';
import { getFlowStats } from '../app/adapters/flow-stats.ts';
import { FlowStatsPresenter } from '../app/presenters';
import { buildSkeleton, withLoadingState }
    from '../app/loading-states.ts';
import { getRequiredAttribute } from '../app/dom.ts';
import type { GraphNode } from '../../api/types.ts';

interface ViewBox { x: number; y: number; w: number; h: number; }

function boundingViewBox(
    nodes: readonly GraphNode[],
    padding: number,
): ViewBox {
    if (nodes.length === 0)
        return { x: 0, y: 0, w: 200, h: 200 };
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
        minX = Math.min(minX, n.positionX);
        minY = Math.min(minY, n.positionY);
        maxX = Math.max(maxX, n.positionX + 160);
        maxY = Math.max(maxY, n.positionY + 64);
    }
    return {
        x: minX - padding, y: minY - padding,
        w: maxX - minX + padding * 2,
        h: maxY - minY + padding * 2,
    };
}

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const flowId   = params?.flowId;
    const projectId = params?.projectId;
    if (!flowId) { navigateTo('flows'); return; }
    const host = $('#flow-stats');
    if (!host) return;

    await withLoadingState(host, async () => {
        const ctx = createRequestContext();
        const { model, graph } = await getFlowStats(ctx, flowId);
        const viewBox = boundingViewBox(graph.nodes, 40);
        const presenter =
            new FlowStatsPresenter(model, viewBox);

        presenter.renderShell(host);
        // Presenter is flow-name-agnostic (Task 13); set the labels
        // from the FlowGraph we already have:
        const nameEl = host.querySelector(
            '.flow-stats-flow-name');
        const descEl = host.querySelector(
            '.flow-stats-flow-desc');
        if (nameEl) nameEl.textContent = graph.name;
        if (descEl) descEl.textContent = graph.description;

        const ui = {
            selectedPathIndex: 0,
            pinnedNodeId:  null as string | null,
            hoveredNodeId: null as string | null,
        };
        presenter.renderUpdate(host, ui);

        const ctrl   = new AbortController();
        const signal = ctrl.signal;

        const onNodeOver = (e: Event) => {
            const t = e.target as HTMLElement;
            const g = t.closest('[data-node-id]') as
                SVGGraphicsElement | null;
            if (!g) return;
            ui.hoveredNodeId = getRequiredAttribute(g, 'data-node-id');
            anchorCardTo(g);
            presenter.renderCard(host,
                ui.pinnedNodeId ?? ui.hoveredNodeId);
        };
        const onNodeOut = () => {
            ui.hoveredNodeId = null;
            presenter.renderCard(host, ui.pinnedNodeId);
        };
        const onClick = (e: Event) => {
            const t = e.target as HTMLElement;
            const stepper = t.closest('[data-stepper]') as
                HTMLElement | null;
            if (stepper) {
                const dir = stepper.dataset['stepper'];
                if (dir === 'next') ui.selectedPathIndex++;
                if (dir === 'prev') ui.selectedPathIndex--;
                const total =
                    model.pathEntries.length || 1;
                ui.selectedPathIndex = Math.max(0,
                    Math.min(total - 1,
                        ui.selectedPathIndex));
                presenter.renderUpdate(host, ui);
                return;
            }
            const back = t.closest('#flow-stats-back');
            if (back) {
                const params: Record<string, string> = { flowId };
                if (projectId) params['projectId'] = projectId;
                navigateTo('flow-detail', params);
                return;
            }
            const node = t.closest('[data-node-id]') as
                SVGGraphicsElement | null;
            if (node) {
                const nid = getRequiredAttribute(
                    node, 'data-node-id');
                ui.pinnedNodeId =
                    ui.pinnedNodeId === nid ? null : nid;
                presenter.renderCard(host,
                    ui.pinnedNodeId ?? ui.hoveredNodeId);
                return;
            }
            // Click on empty canvas — unpin.
            const area = t.closest('.flow-stats-canvas-area');
            if (area && !node && !back && !stepper) {
                ui.pinnedNodeId = null;
                presenter.renderCard(host, null);
            }
        };

        host.addEventListener('mouseover', onNodeOver, { signal });
        host.addEventListener('mouseout',  onNodeOut,  { signal });
        host.addEventListener('click',     onClick,    { signal });

        function anchorCardTo(g: SVGGraphicsElement): void {
            const area = host!.querySelector(
                '.flow-stats-canvas-area');
            const card = host!.querySelector(
                '#flow-stats-card') as HTMLElement | null;
            if (!area || !card) return;
            const ar = (area as Element).getBoundingClientRect();
            const nr = g.getBoundingClientRect();
            const x  = nr.left + nr.width / 2 - ar.left;
            const y  = nr.top  + nr.height / 2 - ar.top;
            card.style.setProperty('--card-x', String(Math.round(x)));
            card.style.setProperty('--card-y', String(Math.round(y)));
        }
    }, { kind: 'skeleton', skeleton: buildSkeleton('detail', 1) });
}
```

(Confirm `getRequiredAttribute` is exported from `dom.ts` per the codebase; substitute if it lives elsewhere. The `withLoadingState` invocation shape may need tweaking — read the existing call sites in other page modules for the actual options object.)

- [ ] **Step 2: Verify**

```
./validate
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web-app/flows/stats.ts
git commit -m "wire the flow-stats page module" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: Add entry-point buttons on the detail header and list cards

Two entry points: a "Stats" button in the `flow-detail` header (rendered by `FlowDesignerPresenter.renderShell`, click-bound in `flows/detail.ts`); a chart-icon button on each flow card in `flows/index` (rendered by `FlowPresenter`, click-handled in `flows/index.ts`). Both navigate to `flow-stats` with the `flowId` in params.

**Files:**
- Modify: `web-app/app/flow-designer.ts` (or wherever `FlowDesignerPresenter.renderShell` lives)
- Modify: `web-app/flows/detail.ts`
- Modify: `web-app/app/presenters/flow.ts`
- Modify: `web-app/flows/index.ts`

- [ ] **Step 1: Locate the existing header markup and card markup**

```
grep -n "renderShell\b\|flow-back-btn\|iconArrowLeft" \
    web-app/app/flow-designer.ts | head -10
grep -n "flow-card\|iconChevronRight" \
    web-app/app/presenters/flow.ts | head -10
```

- [ ] **Step 2: Add the Stats button to the detail header**

In `FlowDesignerPresenter.renderShell`, near the back button, insert:

```typescript
+ html`<button id="flow-stats-btn"`
+   html` class="btn btn-ghost btn-icon"`
+   html` title="Stats" aria-label="Flow statistics">`
+ trusted(iconBarChart(20, '').toString())
+ html`</button>`
```

Import `iconBarChart` at the top of the file. In `flows/detail.ts`, bind the click (mirroring the existing `bindBackButton`-style helper):

```typescript
function bindStatsButton(
    container: HTMLElement,
    flowId: string,
    projectId: string | undefined,
    signal: AbortSignal,
): void {
    $('#flow-stats-btn', container)?.addEventListener('click', () => {
        const params: Record<string, string> = { flowId };
        if (projectId) params['projectId'] = projectId;
        navigateTo('flow-stats', params);
    }, { signal });
}
```

Call `bindStatsButton(container, flowId, projectId, signal)` from the existing `init` wiring (where the other `bind*` helpers are invoked).

- [ ] **Step 3: Add the chart icon to flow cards**

In `FlowPresenter.render()` (or whatever method composes each card), next to the existing chevron, insert:

```typescript
+ html`<button class="btn btn-ghost btn-icon flow-card-stats-btn"`
+   html` data-flow-stats="${f.id}"`
+   html` title="Stats" aria-label="Flow statistics">`
+ trusted(iconBarChart(16, '').toString())
+ html`</button>`
```

Import `iconBarChart`. In `flows/index.ts`'s `listEl` click handler, BEFORE the `[data-flow-card]` branch:

```typescript
const stats = (e.target as HTMLElement).closest(
    '[data-flow-stats]');
if (stats) {
    navigateTo('flow-stats', {
        flowId: getRequiredAttribute(stats, 'data-flow-stats'),
    });
    return;
}
```

- [ ] **Step 4: Verify**

```
./validate
```

Optional visual smoke: `TMPDIR=/tmp/claude ./serve 8080`, open `flows/index`, click a card's chart icon. With Tasks 17/18 already merged this should navigate to a (mostly-empty) stats page; full visual smoke is Task 26 once mock data is in.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/flow-designer.ts web-app/flows/detail.ts \
        web-app/app/presenters/flow.ts web-app/flows/index.ts
git commit -m "add stats entry points to the flow surfaces" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 20: Seed the flagship flow with 35–40 work orders

Hand-authors literal `WorkOrderEntity` rows, matching `FlowWorkOrderEntity` rows, and ordered `WorkOrderTransitionEntity` chains for ~35–40 work orders on `mockFlows[0]` ('Customer Onboarding': Create → Data Capture → Review → Archive, with Review→Data Capture as the "needs revision" loop; Data Capture assigned to `crew_design`). Every new row must pass `validators.ts` (`./test` runs `tests/mock-data-valid.test.ts` automatically). The literal shape matches the existing single work order in the file; the differences are *only*: distinct `id`/`display_id` values, varied `created_at` across the trailing ~120 days (some outside the 90-day window to exercise clipping), varied sojourn lengths (Data Capture is the hot node — fat right tail), varied OUT-transition `person_id` values spread across `crew_design`'s members (1–2 by an out-of-clan person), and a mix of completion patterns: most archive cleanly, ~5–7 loop Review→Data Capture once, ~3–5 are still in-flight at Data Capture or Review.

**Files:**
- Modify: `api/mock-data.ts`

- [ ] **Step 1: Locate the existing single work order and its shape**

```
grep -n "a7c3e1f9\|work_orders\b\|work-order-transitions\b\|flow-work-orders\b" \
    api/mock-data.ts | head -20
```

Read the block — the literal-object voice (indentation, comma style, comment headers) is the template. Match it exactly (Commandment III, Uniformity).

- [ ] **Step 2: Add work orders, transitions, and flow-work-order rows**

For each new work order, add three things:

```typescript
// (one example — replicate ~35 times with distinct ids and tunings)
{
    id: id(), display_id: 'b3f1c280',
    flow_graph: { id: id(),
        value: JSON.parse(JSON.stringify(mockFlows[0].graph)) },
    position: 1,
    created_at: dt(73, 9, 30),
},
```

```typescript
// flow-work-order join row, same id() pair count:
{ id: id(), flow_id: mockFlows[0].id, work_order_id: '<above wo id>' },
```

```typescript
// transitions, strictly increasing transitioned_at:
{ id: id(), work_order_id: '<wo id>', from_node_id: '',
  to_node_id: '<create node id>', person_id: '<p>',
  transitioned_at: dt(73, 9, 30) },
{ id: id(), work_order_id: '<wo id>',
  from_node_id: '<create id>', to_node_id: '<data-capture id>',
  person_id: '<p>', transitioned_at: dt(73, 9, 30) },
{ id: id(), work_order_id: '<wo id>',
  from_node_id: '<data-capture id>', to_node_id: '<review id>',
  person_id: '<p in crew_design>', transitioned_at: dt(70, 14, 0) },
{ id: id(), work_order_id: '<wo id>',
  from_node_id: '<review id>', to_node_id: '<archive id>',
  person_id: '<p>', transitioned_at: dt(68, 9, 0) },
```

Use the same `id()` and `dt(days, h, m)` helpers the file already defines. Tune each chain:
- ~22 happy-path runs (Create → Data Capture → Review → Archive), sojourn in Data Capture varying from 1–9 days.
- ~6 "needs revision" runs (insert Review → Data Capture → Review before the final → Archive), exercising revisit-rate + branch split.
- ~5 in-flight runs (last transition into Data Capture or Review, no Archive).
- 1–2 with OUT-transition `person_id` outside `crew_design`'s members (exercises `inCurrentClan:false`).
- 2 created ~100 days ago to exercise window clipping.

Total ~35 work orders; total transitions ≈ 180–220; flow-work-order rows = 35.

(If you find the literal-object voice favors a small generator helper like `dt(...)`, follow the file's lead — but you said hand-authored, so the helper stays simple; no procedural generation of work orders.)

- [ ] **Step 3: Verify**

```
node --test --strip-types tests/mock-data-valid.test.ts
./validate
```

Expected: all mock-data validity tests pass. If any fail, fix the offending row (`validators.ts` will name the field).

- [ ] **Step 4: Commit**

```bash
git add api/mock-data.ts
git commit -m "seed onboarding flow with realistic work orders" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 21: Seed a second flow with a handful of work orders

Same pattern as Task 20 on a second flow (`mockFlows[1]` — pick whichever flow is non-trivial in shape; if all remaining flows are large/unassigned-everywhere, that's fine — the second flow just demonstrates the page on more than one flow). ~5–8 work orders. Most happy-path; one in-flight; one with a single revisit. No need for the heavy distribution work that Task 20 exercises — the second flow's stats page is a "yes it works on this one too" demo.

**Files:**
- Modify: `api/mock-data.ts`

- [ ] **Step 1: Identify the second flow and its node IDs**

```
grep -n "mockFlows" api/mock-data.ts | head -10
```

Confirm `mockFlows[1]` is suitable; if not, use whichever index points to a flow with a Start→middle→Archive shape.

- [ ] **Step 2: Add ~5–8 work orders, the same way as Task 20**

Match the file's voice exactly. Vary sojourn lengths modestly; one in-flight; one with a revisit through any branch the flow offers.

- [ ] **Step 3: Verify**

```
node --test --strip-types tests/mock-data-valid.test.ts
./validate
```

- [ ] **Step 4: Commit**

```bash
git add api/mock-data.ts
git commit -m "seed second flow with a handful of work orders" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 22: Document manual stats cases (FS1–FS9) in TEST-PLAN.md

Adds nine manual cases under a new `## FS — Flow Statistics` section (placed under Agent-F2's domain since the page reads work orders + transitions, which Agent-F2 seeds). Also adds a note about the new mock-data baseline so the existing Workbox cases (WB1–WB19) re-baseline against the parallel-protocol's "≥ N" tolerance.

**Files:**
- Modify: `TEST-PLAN.md`

- [ ] **Step 1: Locate the existing section structure**

```
grep -n "^## \|^### " TEST-PLAN.md | head -40
```

Match the heading and numbering style.

- [ ] **Step 2: Append the FS section**

```markdown
## FS — Flow Statistics (Agent-F2 read-only domain)

- [ ] **FS1** — From `flows/index`, click a flow card's chart icon →
  lands on `flows/stats.html?flowId=<id>`. The page renders the heat-
  tinted SVG canvas, a path stepper, and a legend gradient bar. No
  left toolbar, no slide-in props panel, no connection ports, no
  marquee. The cursor over a node is `pointer` (clicking is allowed);
  no port-drag affordance appears.
- [ ] **FS2** — From `flows/detail`, click the Stats button in the
  header → same stats page. The "← Designer" button returns to
  `flows/detail.html?flowId=<id>` (and preserves `projectId` if set).
- [ ] **FS3** — Node tints span the full ramp on the flagship flow:
  Data Capture is yellow/red (hot), Review is warm, Create/Archive
  carry the cool (or no-data) tint. Node faces show `—` on Create
  and Archive and a value like `8.5m` / `2.1d` on regular nodes.
- [ ] **FS4** — Hover a node → a read-only stat card pops near it
  with: % of flow time, avg/median/p90 durations, visits / distinct
  WOs / WIP, ~N/wk throughput, loop-back rate, clan size + active
  producers, top producer (name + % of clan avg + % of node's work
  with "(not in current clan)" iff applicable). For a branch node,
  `next → A x% · B y%` appears. The card has NO inputs and NO Save
  button. Mouse-out → card hides.
- [ ] **FS5** — Click a node → the card pins (stays open on mouse-
  out). Click empty canvas → unpins. Click another node → re-pins
  to it.
- [ ] **FS6** — Model-assigned node's card shows `Model: <name>`
  and no clan / producer rows; the node displays no hazard.
  Unassigned non-special node displays the hazard triangle.
  Zero-member-role or zero-member-crew node also hazards.
- [ ] **FS7** — Path stepper: `◀ Path 1 of M · X% of N work orders ▶`.
  Clicking ▶ advances; the selected path's nodes + edges get an
  accent stroke and off-path elements dim to ~28% opacity. The
  highlight does NOT pulse or animate (deliberately distinct from
  the editor's selection glow). At the last visible path, ▶ is
  disabled (or, if there's a rest bucket, advances to "+N rarer
  paths, combined Z%" which highlights nothing).
- [ ] **FS8** — Dark-mode toggle persists across navigation to the
  stats page; the heat tints and the card remain legible in both
  themes. The face number text contrasts adequately at all heat
  levels.
- [ ] **FS9** — Data-shape regression: heat fractions sum to ≈100%
  across non-special nodes on the flagship flow. WIP counts in the
  card match the WOs currently sitting in each node (cross-check
  against the Workbox). Direct navigation to `flows/stats.html`
  with no `flowId` redirects to `flows/index.html`.

**MCP note:** hover/click on SVG `<g>` works with synthetic events
on this page (no pointer-capture FSM, unlike `flows/detail`), so
FS4 / FS5 / FS7 are directly drivable.

**Mock-data blast radius:** Tasks 20 + 21 add ~40–48 new work orders
across two flows. Workbox cases (WB1–WB19) and dashboard counts
(C1–C7) re-baseline against the parallel-protocol's "≥ N" tolerance;
expected counts in those sections are now lower bounds, not equals.
```

- [ ] **Step 3: Verify (read-only)**

Open `TEST-PLAN.md` and confirm the new section renders cleanly under your editor's markdown preview. No automated check.

- [ ] **Step 4: Commit**

```bash
git add TEST-PLAN.md
git commit -m "document manual cases for flow statistics" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 23: Update CLAUDE.md with the flow-stats feature

CLAUDE.md is the agent-facing project map; a new top-level page + four new source modules + a new SVG-rendering pattern + new design tokens all belong in it. This task adds short, targeted entries in the existing sections — no large rewrites, just the new facts woven in at the right places.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Inventory the sections that need touches**

Sections currently present (read them first, then edit only what changes):

```
grep -n "^## \|^### " CLAUDE.md
```

The expected touch points:

- **`## Architecture` → `### Key Layers`** — list `flows/stats.html` alongside `flows/detail.html` in the page roster.
- **`### Flow Canvas`** — add a paragraph that names `flow-stats` as the read-only sibling, points at `flow-stats-graph.ts` as the sibling-not-parametrization renderer (per Commandment IX), and lists the absence invariants (no `<animate>`, no `role="button"`, no ports, no `tabindex`, no `data-connect-port`).
- **`### Page Module Pattern`** — mention `flow-stats` in the list of registered pages.
- **`### Presenter Pattern`** — mention `FlowStatsPresenter` (immutable; returns SafeHtml; never touches DOM) and note it exposes `build*` helpers in addition to `renderShell` / `renderUpdate` / `renderCard` for testability.
- **`### Adapter Conventions`** — note `getFlowStats(ctx, flowId)` as a read-only adapter that resolves the work-order set via the `flow-work-orders` join table (relational truth, not the frozen `flow_graph.flowId`).
- **`## UI & Styling` → `### CSS-first styling`** — add `--heat-t` (per-node 0..1 ramp position) to the documented dynamic-value-as-data exceptions, alongside `--progress-fill`.
- **`### Design System`** — note the four `--heat-stop-*` ramp tokens and that the page's heat fill is a chained `color-mix(in oklch, ...)` over those tokens (cross-reference DESIGN-SYSTEM.md once Task 24 lands).
- **`## Testing` → automated tests** — add the new files to the running list: `flow-stats-aggregate`, `adapters-flow-stats`, `presenter-flow-stats`, `duration-units`.

- [ ] **Step 2: Write the edits**

Below is the new prose in canonical form; insert each fragment at the matching section's natural ending. Wrap to 78 chars.

In `### Key Layers` (after the Source = Output Alignment bullet):

```markdown
- **Read-only siblings of editable pages**: `flow-stats.html` is a
  flat, non-editable rendering of one flow's diagram (heat-tinted by
  share of trailing-90-day flow time, with a hover/click stat card
  and a path stepper). It is a sibling, not an extension, of
  `flow-detail` — see `### Flow Canvas` for the renderer split.
```

In `### Flow Canvas`, append:

```markdown
The read-only stats variant (`flow-stats`) uses its own renderer
`flow-stats-graph.ts` and presenter `FlowStatsPresenter`, deliberately
*not* a parametrization of `flow-graph.ts`/`FlowDesignerPresenter`
(Commandment IX). It shares only the pure pieces: geometry constants
(`NODE_WIDTH/HEIGHT/RADIUS`, `GRID_CELL`), the layout math, the
already-exported edge-path helpers (`perimeterPoint`, `whichEdge`,
`controlOffset`), `iconAlertTriangle`, and the START/END display
constants. Its emitted SVG carries *none* of the editor's
interactivity tells: no `<animate>` element, no `role="button"`,
no `tabindex`, no connection ports, no `data-connect-port`,
no `aria-current`. Heat fill is a per-node `style="--heat-t:${t}"`
custom property; CSS computes the color via a 4-stop chained
`color-mix(in oklch, ...)` driven by `--heat-t`. Path selection
highlights via `data-on-path` / `data-dim` attributes, not a
filter (the editor uses an animated glow; the stats canvas does
not). The aggregate logic lives in the pure module
`flow-stats-aggregate.ts`; the I/O wrapper is
`adapters/flow-stats.ts getFlowStats(ctx, flowId)`.
```

In `### Page Module Pattern`, in the registry roster:

```markdown
- `flow-stats` → `web-app/flows/stats.ts` + `stats.html` (read-only
  flow heat map; sidebar layout; `searchable: false`).
```

In `### Presenter Pattern`, after the existing presenter list:

```markdown
`FlowStatsPresenter` (`web-app/app/presenters/flow-stats.ts`) is
the read-only counterpart to `FlowDesignerPresenter`. It exposes
pure `build*` helpers (`buildShell`, `buildStepperBar`,
`buildLegend`, `buildCard`) returning `SafeHtml` for testability,
plus DOM-touching `renderShell` / `renderUpdate` / `renderCard`.
It is flow-name-agnostic by design — the page module writes the
flow name and description into the header after `renderShell`,
keeping `buildFlowStats` independent of presentation strings.
```

In `### Adapter Conventions`, after the FetchContext bullet:

```markdown
- **`getFlowStats(ctx, flowId)`** — the stats adapter — resolves
  the work-order set for a flow through the `flow-work-orders`
  join table (relational truth per Codd), **not** through each
  work order's frozen `flow_graph.flowId`. It returns
  `{model, graph}` so the page can derive the canvas viewBox
  from the *current* flow graph's node positions.
```

In `### CSS-first styling` / the inline-style exceptions list:

```markdown
3. **Continuous-value heat ramp**: per-node
   `style="--heat-t:${0..1}"` on the stats canvas. CSS computes
   the fill via a chained `color-mix(in oklch, ...)` over four
   `--heat-stop-*` design tokens (blue → green → yellow → red at
   non-uniform stops 0 / 50 / 75 / 100). The number is data;
   the colors stay in the design system.
```

In `### Design System`:

```markdown
**Heat ramp** — see `DESIGN-SYSTEM.md`. Four `--heat-stop-*`
tokens (low / mid / high / peak) define the flow-stats fixed-scale
heat ramp; the per-node `--heat-t` (0..1) drives a 4-stop chained
`color-mix(in oklch, ...)` in `pages.css`.
```

In `## Testing` automated-tests list:

```markdown
The trailing list now includes `flow-stats-aggregate` (pure heat /
sojourn / path / clan math), `adapters-flow-stats` (the read-only
adapter via `MemoryDbAdapter`), `presenter-flow-stats` (SafeHtml
shape — including the *absence* of editor affordances), and
`duration-units` (the compact-duration formatter).
```

- [ ] **Step 3: Verify**

```
./validate
```

Confirm the 78-char lint stays clean on CLAUDE.md (it's a `.md` file but the validator may not lint it — confirm by reading `./validate`). Reading the rendered file is the actual check; ensure each new fragment lands in the right section.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "fold flow-stats into the project map" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 24: Update DESIGN-SYSTEM.md with the heat ramp

Adds a short "Heat ramp" subsection documenting the four `--heat-stop-*` tokens, the non-uniform stop positions, the `--heat-t` data-as-custom-property convention, and the chained-`color-mix` interpolation. Also notes the colorblind accessibility position (color is decoration over data; every node carries an avg-sojourn number and the card carries the exact percentage).

**Files:**
- Modify: `DESIGN-SYSTEM.md`

- [ ] **Step 1: Locate where token documentation lives**

```
grep -n "^## \|^### \|--\b" DESIGN-SYSTEM.md | head -30
```

Find the section that lists color tokens (or component tokens). The new content lands either as its own subsection or appended to the existing color-token list, matching the document's voice.

- [ ] **Step 2: Add the heat-ramp subsection**

```markdown
## Heat ramp (flow-stats)

A fixed-scale 4-stop linear gradient used by `flows/stats.html` to
visualize per-node share of trailing-90-day flow time. Stop positions
are non-uniform (the top quarter of the value range compresses
yellow → red, visually salient as a "bottleneck zone"):

| Token              | Position | Light          | Dark           |
|--------------------|----------|----------------|----------------|
| `--heat-stop-low`  | 0%       | `210 85% 55%`  | `210 60% 60%`  |
| `--heat-stop-mid`  | 50%      | `145 65% 50%`  | `145 50% 55%`  |
| `--heat-stop-high` | 75%      | `48 95% 55%`   | `48 80% 60%`   |
| `--heat-stop-peak` | 100%     | `0 80% 55%`    | `0 65% 60%`    |

**Mechanism.** Each node carries `style="--heat-t:${t}"` (a number
in `[0, 1]` — the raw share of flow time). The fill is computed in
CSS by three chained `color-mix(in oklch, ...)` invocations, one
per segment, with each segment's fraction expressed as
`clamp(0%, calc((var(--heat-t) - <lo>) / <span> * 100%), 100%)`
so the segment activates over its t-range and saturates outside it.
Result: the palette stays in design tokens, the per-element data
is a single number, dark mode follows automatically, and there is
*no* color math in TypeScript.

**Legend.** A plain CSS `linear-gradient(to right, ...)` referencing
the same four tokens at the same four positions; end labels read
`0%` and `100%`. The exact percentage of each node is always
available in its hover card.

**Accessibility.** Blue / green / yellow / red is a classic
colorblind-tricky palette, but on this page color is never the sole
information channel: every node carries its avg-sojourn number on
its face, and the hover card carries the exact percentage. The
gradient is decoration over data; the data path is colorblind-safe.
```

- [ ] **Step 3: Verify (visual)**

Open DESIGN-SYSTEM.md and confirm the new subsection renders cleanly.

- [ ] **Step 4: Commit**

```bash
git add DESIGN-SYSTEM.md
git commit -m "document the heat ramp design pattern" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 25: Verify the remaining .md docs and update if relevant

Three doc files remain: `SCHEMA.md`, `README.md`, `TT-GAP-ANALYSIS.md`. None *should* need substantive changes (the feature adds no new tables and does not change the app's high-level pitch), but verifying each is part of the discipline. One commit if all are clean; one commit per file if changes are needed.

**Files:**
- Maybe modify: `SCHEMA.md`
- Maybe modify: `README.md`
- Maybe modify: `TT-GAP-ANALYSIS.md`

- [ ] **Step 1: Read each file and check for relevance**

```
grep -nci "work[_-]\?order\|flow\|stats\|heat" SCHEMA.md README.md TT-GAP-ANALYSIS.md
```

- **SCHEMA.md** — the feature reads existing tables (`flows`,
  `work-orders`, `work-order-transitions`, `flow-work-orders`,
  `people`, `roles`, `role-memberships`, `crews`,
  `crew-role-memberships`, `models`). No new tables, no schema
  changes. If SCHEMA.md describes "consumers" or "views" of these
  tables, add `flows/stats` to that list; otherwise leave alone.
- **README.md** — the project's top-level pitch. If it enumerates
  pages or features, add a one-line mention of `flows/stats` as the
  read-only operational view of a flow. If README is purely setup
  or build instructions, leave alone.
- **TT-GAP-ANALYSIS.md** — unknown shape; read it. If it lists
  observability / analytics gaps, the new page likely closes one of
  them — mark that gap closed. Otherwise leave alone.

- [ ] **Step 2: Make any actual edits**

For each file that genuinely needs an update, edit minimally and
commit it on its own with a focused subject. Example:

```bash
git add README.md
git commit -m "mention flow stats in the feature list" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Record the verification**

If a file genuinely needs no change, do NOT make an empty commit for
it. Instead, when committing Task 26's final-validation work, note
in that subject (or in this task's prose) the files you confirmed.

- [ ] **Step 4: If no changes, this task contributes no commits**

That's fine — the verification was the work. Continue to Task 26.

---

## Task 26: Final validation and end-to-end smoke

The branch is feature-complete. Run the full validation, drive the
page end-to-end against the local server, fix anything that surfaces,
and commit any cleanups under a single focused subject if needed.

**Files:** any that surface lint / type / test failures.

- [ ] **Step 1: Full validation**

```
./validate
```

Expected: tsc clean, every test passes, 78-char lint clean.

- [ ] **Step 2: Full automated suite spot-check**

```
node --test --strip-types tests/*.test.ts 2>&1 | tail -40
```

Expected: every test green, including `mock-data-valid`,
`navigation`, `workbox-inbox` (which now sees ~40 work orders — its
"≥ N" assertions tolerate this; if it has *equals* assertions, fix
them in this task and commit as a separate refactor under
`re-baseline workbox counts for new mock data`).

- [ ] **Step 3: End-to-end smoke via `./serve`**

```
TMPDIR=/tmp/claude ./serve 8080
```

Then open `http://localhost:8080/flows/index.html`:

- Click a flow card's chart icon → lands on `flows/stats.html?flowId=...`.
- Heat tints visible on the canvas; non-special nodes carry an
  avg-sojourn face number; Create/Archive show `—`.
- Hover a node → read-only stat card pops near it, hides on
  mouse-out. Click → pins. Click empty canvas → unpins.
- Click `◀ / ▶` on the stepper → path highlight cycles; off-path
  elements dim; no pulse/animation.
- Toggle dark mode (via existing toggle) → tints + card stay
  legible.
- Click `← Designer` → returns to `flows/detail.html?flowId=...`.
- Direct-nav to `flows/stats.html` with no `flowId` → redirects
  to `flows/index.html`.

Drive with the `claude-in-chrome` MCP if running automated; hover
and click on SVG `<g>` work synthetically (no pointer-capture FSM).

- [ ] **Step 4: Fix any surfaced issues**

If anything fails — a 78-char overrun the linter caught only now, a
`noUncheckedIndexedAccess` violation, a presenter selector that
didn't find an element — fix it. Each fix gets its own commit with
the standard footer.

- [ ] **Step 5: Final commit (only if cleanups were needed)**

If Steps 1–3 were already green with no cleanup needed, this task
contributes no commit; the feature is done at Task 25.

If cleanups happened:

```bash
git add <only-the-touched-files>
git commit -m "<short focused subject for the cleanup>" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Confirm the linear history**

```
git log --oneline master..HEAD
```

Expected: ~26 commits, each on its own concern, each subject in the
"When applied, this commit will ___" form, each ~50 chars, no
mention of file names or paths, and every one of them green on this
branch. If anything looks off, rebase to clean it up before opening
a PR (`git rebase -i master`).

---

## Self-Review

Performed at plan-finalization time (now). Findings:

1. **Spec coverage.** Every section of the spec
   (`docs/superpowers/specs/2026-05-10-flow-stats-design.md`) maps
   to at least one task. The aggregate's eight concerns each map to
   a TDD cycle (Tasks 2–8). The adapter, renderer, presenter, page
   module, CSS, registry, mock data, manual cases, and three doc
   updates are each their own task.

2. **Placeholder scan.** None of "TBD", "fill in details",
   "implement appropriate error handling", or "Similar to Task N
   (repeat the code)" appears. Where a task references the spec
   (rather than repeating its text), the reference is exact and the
   spec is in the same repo.

3. **Type consistency.** `FlowStatsInput` / `FlowStatsModel` /
   `NodeStat` / `FlowPath` / `PathEntry` / `HeatLevel` (deleted)
   names are consistent across Tasks 2–14 and the presenter/renderer
   tests. `heatT` is `[0,1]`; `heatPct` is `[0,100]`; both are
   integers in display only. `formatMinAscending` is named the same
   way in Tasks 1, 11 (face), and 14 (card).

4. **Ambiguity check.** Two known soft spots, explicitly called out
   in the relevant tasks rather than left implicit:
   - Whether `bezierAt` (or similar) needs to be exported from
     `flow-graph.ts` — Task 11 Step 1 calls this out and instructs
     a separate prior commit if exporting is necessary.
   - Whether `getMembersOfCrew(ctx, crewId)` returns a `Set` or an
     iterable — Task 10 Step 3 adapts via `new Set(...)`.

5. **Scope.** Single feature, single branch. Mock data growth is
   acknowledged as side-effect (Task 22's blast-radius note).

No issues require restructuring; plan is finalized.

---

## Execution Handoff

Plan complete and saved to
`docs/superpowers/plans/2026-05-10-flow-stats.md`. Two execution
options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per
task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using
`superpowers:executing-plans`, batch execution with checkpoints for
review.

Which approach?

