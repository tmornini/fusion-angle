# Per-Objective Project Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Replace the project's single
`estimated_impact` / `actual_impact` integer fields with a
per-objective scoring model — CEO-authored organizational
objectives, bipolar [-100, +100] sliders gating project
approval and completion, append-only event-log scoring with
revision history for objective definitions, and a reworked
dashboard with a bipolar arc gauge plus per-objective
aggregates.

**Architecture:** Five new tables in localStorage
(`objectives`, `objective_revisions`, `deprecated_objectives`,
`project_objective_baseline_scores`,
`project_objective_actual_scores`). Three new adapter
modules (`objectives.ts`, `project-scoring.ts`,
`project-publish.ts`). Eight new presenters. Project impact
is derived (never stored). Objective name/description live
in an event log; score rows reference only `objective_id`.
Validator-gated transitions for approval and completion
mirror the existing `validateFlowForCreation` pattern.

**Tech Stack:** Vanilla TypeScript ES2024 strict mode with
`noUncheckedIndexedAccess`. Zero runtime dependencies.
`node:test` runner via
`node --test --strip-types tests/*.test.ts`. SafeHtml from
presenters via tagged template literals (`html\`...\``).
`RequestContext` as the single I/O surface; localStorage
via `DbAdapter` interface. 78-char max line width on `.ts`,
`.html`, `.css` files.

**Specification:**
`docs/superpowers/specs/2026-05-14-objectives-design.md`.
This plan implements that spec verbatim. When the plan says
"per the spec," consult that file for the authoritative
shape.

**Reference paths in the repo:**

- `api/types.ts` — row types
- `api/db.ts` — `TABLE_NAMES` + `DbAdapter` interface
- `api/db-memory.ts` — in-memory adapter for tests
- `api/validators.ts` — `assert*` entity validators
- `api/mock-data.ts` — `populateMockData`
- `web-app/app/adapters/shared.ts` — `RequestContext` +
  `commit(tx)`
- `web-app/app/adapters/flow-publish.ts` — the *existing*
  `validateFlowForCreation` pattern to mirror
- `web-app/app/adapters/workers-union.ts` — the *existing*
  `workerName(map, id)` throw-on-absent pattern to mirror
- `web-app/app/presenters/gauge.ts` — the *existing*
  `GaugePresenter` to slot beside (not modify)
- `web-app/app/styles/components.css` — shared 3+-call-site
  CSS
- `web-app/app/styles/pages.css` — page-scoped CSS

---

## Phase 1 — Foundation

This phase lands the schema, types, validators, and mock
data. The new automated tests written here exercise only
entity validators, the `DbAdapter` typed-property surface,
and mock-data seeding. Nothing is wired into pages yet.

Phase 1 deliberately leaves `tsc --noEmit` reporting
errors against the live presenters and adapters that
still reference the deleted `estimated_impact` /
`actual_impact` fields (and the deleted `Project`
methods). Those references get cleaned up in Phase 3
(presenters) and Phase 2 (`ProjectView`). Tests run via
`node --test --strip-types` and pass at every step;
`./validate` will report type errors until Phase 3
completes.

### Task 1.1: Add new row types to `api/types.ts`

**Files:**
- Modify: `api/types.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/types-objectives.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type {
    Objective,
    ObjectiveRevision,
    DeprecatedObjective,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from '../api/types.ts';

test('Objective shape compiles', () => {
    const v: Objective = { id: 'o1', position: 0 };
    assert.equal(v.id, 'o1');
    assert.equal(v.position, 0);
});

test('ObjectiveRevision shape compiles', () => {
    const v: ObjectiveRevision = {
        objective_id: 'o1',
        name: 'Revenue Growth',
        description: 'Drive top-line growth',
        revised_at: '2026-05-14T00:00:00.000Z',
    };
    assert.equal(v.objective_id, 'o1');
});

test('DeprecatedObjective shape compiles', () => {
    const v: DeprecatedObjective = {
        objective_id: 'o1',
        deprecated_at: '2026-05-14T00:00:00.000Z',
    };
    assert.equal(v.objective_id, 'o1');
});

test('ProjectObjectiveBaselineScore shape compiles', () => {
    const v: ProjectObjectiveBaselineScore = {
        project_id: 'p1',
        objective_id: 'o1',
        score: 42,
        scored_at: '2026-05-14T00:00:00.000Z',
    };
    assert.equal(v.score, 42);
});

test('ProjectObjectiveActualScore shape compiles', () => {
    const v: ProjectObjectiveActualScore = {
        project_id: 'p1',
        objective_id: 'o1',
        score: -10,
        scored_at: '2026-05-14T00:00:00.000Z',
    };
    assert.equal(v.score, -10);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/types-objectives.test.ts`

Expected: FAIL — the imports don't resolve because none of
the five interfaces exist in `api/types.ts` yet.

- [ ] **Step 3: Add the five new interfaces to `api/types.ts`**

Locate the section in `api/types.ts` that defines other row
types (search for `interface ProjectEntity`). Add **before**
that section:

```ts
export type ObjectiveId = string;

export interface Objective {
    id: ObjectiveId;
    position: number;
}

export interface ObjectiveRevision {
    objective_id: ObjectiveId;
    name: string;
    description: string;
    revised_at: string;
}

export interface DeprecatedObjective {
    objective_id: ObjectiveId;
    deprecated_at: string;
}

export interface ProjectObjectiveBaselineScore {
    project_id: Id;
    objective_id: ObjectiveId;
    score: number;
    scored_at: string;
}

export interface ProjectObjectiveActualScore {
    project_id: Id;
    objective_id: ObjectiveId;
    score: number;
    scored_at: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/types-objectives.test.ts`

Expected: PASS — all five interface shape tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/types.ts tests/types-objectives.test.ts
git commit -m "add objective and per-objective score row types"
```

### Task 1.2: Remove `estimated_impact` / `actual_impact` from `ProjectEntity`

**Files:**
- Modify: `api/types.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/types-objectives.test.ts`:

```ts
import type { ProjectEntity } from '../api/types.ts';

test('ProjectEntity no longer carries impact fields', () => {
    type ImpactKey =
        Extract<keyof ProjectEntity,
            'estimated_impact' | 'actual_impact'>;
    const noImpact: [ImpactKey] extends [never]
        ? true
        : false = true;
    assert.equal(noImpact, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/types-objectives.test.ts`

Expected: FAIL — the type assertion resolves to `false`
because `estimated_impact` and `actual_impact` still exist.

- [ ] **Step 3: Remove the fields from `ProjectEntity`**

In `api/types.ts`, locate `interface ProjectEntity`.
DELETE the two lines:

```ts
estimated_impact: number;
actual_impact: number;
```

Leave every other field untouched.

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/types-objectives.test.ts`

Expected: PASS — `ImpactKey` resolves to `never`, the
conditional resolves to `true`.

- [ ] **Step 5: Commit**

```bash
git add api/types.ts tests/types-objectives.test.ts
git commit -m "remove estimated_impact and actual_impact from ProjectEntity"
```

### Task 1.3: Wire five new tables through `DbAdapter`

The `DbAdapter` interface (`api/db.ts:73-135`) carries one
typed `EntityStore<T>` property per table — there is no
generic `db.put(tableName, ...)` API. Registering five new
table *names* without also wiring five new typed properties
through both adapter implementations would leave the new
tables unreachable. This task wires them end-to-end.

**Files:**
- Modify: `api/db.ts`
- Modify: `api/db-localstorage.ts`
- Modify: `api/db-memory.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/db-table-names.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { TABLE_NAMES } from '../api/db.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';

test('TABLE_NAMES includes the five new tables', () => {
    const expected = [
        'objectives',
        'objective_revisions',
        'deprecated_objectives',
        'project_objective_baseline_scores',
        'project_objective_actual_scores',
    ];
    for (const name of expected) {
        assert.ok(
            TABLE_NAMES.includes(name as never),
            `TABLE_NAMES missing ${name}`,
        );
    }
});

test('MemoryDbAdapter exposes the five new EntityStores',
    async () => {
        const db = new MemoryDbAdapter();
        await db.objectives.put('o1', { position: 0 });
        const all = await db.objectives.getAll();
        assert.equal(all.length, 1);
        assert.equal(all[0]!.id, 'o1');

        await db.objectiveRevisions.put('o1:t1', {
            objective_id: 'o1',
            name: 'Revenue',
            description: 'd',
            revised_at: '2026-05-14T00:00:00.000Z',
        });
        const revs =
            await db.objectiveRevisions.getAll();
        assert.equal(revs.length, 1);

        await db.deprecatedObjectives.put('o1', {
            objective_id: 'o1',
            deprecated_at: '2026-05-14T00:00:00.000Z',
        });
        const deps =
            await db.deprecatedObjectives.getAll();
        assert.equal(deps.length, 1);

        await db.projectObjectiveBaselineScores.put(
            'p1:o1:t1', {
                project_id: 'p1',
                objective_id: 'o1',
                score: 42,
                scored_at: '2026-05-14T00:00:00.000Z',
            },
        );
        const bs = await
            db.projectObjectiveBaselineScores.getAll();
        assert.equal(bs.length, 1);

        await db.projectObjectiveActualScores.put(
            'p1:o1:t2', {
                project_id: 'p1',
                objective_id: 'o1',
                score: -10,
                scored_at: '2026-05-15T00:00:00.000Z',
            },
        );
        const ac = await
            db.projectObjectiveActualScores.getAll();
        assert.equal(ac.length, 1);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --strip-types tests/db-table-names.test.ts`

Expected: FAIL — the new names are missing from
`TABLE_NAMES`, and `MemoryDbAdapter` carries no
`objectives` / `objectiveRevisions` / etc. property.

- [ ] **Step 3a: Add the five new names to `TABLE_NAMES`**

In `api/db.ts`, append to the `TABLE_NAMES` array:

```ts
export const TABLE_NAMES = [
    // ...existing entries unchanged...
    'objectives',
    'objective_revisions',
    'deprecated_objectives',
    'project_objective_baseline_scores',
    'project_objective_actual_scores',
];
```

- [ ] **Step 3b: Add five typed properties to
`interface DbAdapter`**

Still in `api/db.ts`, in the `DbAdapter` interface
(currently lines 73-135), add five typed properties
mirroring the existing pattern (e.g.,
`workers: EntityStore<HumanWorkerEntity>`):

```ts
objectives:
    EntityStore<Objective>;
objectiveRevisions:
    EntityStore<ObjectiveRevision>;
deprecatedObjectives:
    EntityStore<DeprecatedObjective>;
projectObjectiveBaselineScores:
    EntityStore<ProjectObjectiveBaselineScore>;
projectObjectiveActualScores:
    EntityStore<ProjectObjectiveActualScore>;
```

Add the five new row types to the top-of-file
`import type { ... }` block. The five entity types must
each carry an `id: string` field at the row level (see
`EntityStore<T extends { id: string }>` constraint at line
48). Task 1.1 already defines these — `Objective.id`
exists; the other four need an `id` field added in the
row-type definitions so they satisfy the constraint.
Update the four interfaces to include `id: string` if not
already present.

- [ ] **Step 3c: Wire localStorage adapter**

In `api/db-localstorage.ts`, in `createLocalStorageAdapter`
(near line 730), add five new property bindings using the
existing `createEntityStore<T>` factory:

```ts
objectives:
    createEntityStore<Objective>(
        'objectives', deletedStore,
    ),
objectiveRevisions:
    createHistoryEntityStore<ObjectiveRevision>(
        'objective_revisions',
    ),
deprecatedObjectives:
    createEntityStore<DeprecatedObjective>(
        'deprecated_objectives', deletedStore,
    ),
projectObjectiveBaselineScores:
    createHistoryEntityStore<
        ProjectObjectiveBaselineScore
    >('project_objective_baseline_scores'),
projectObjectiveActualScores:
    createHistoryEntityStore<
        ProjectObjectiveActualScore
    >('project_objective_actual_scores'),
```

Use `createHistoryEntityStore` (not the deleted-aware
variant) for the three event-log tables — revisions and
score events are append-only point-in-time facts and
never tombstone.

Import the five row types at the top of the file.

- [ ] **Step 3d: Wire MemoryDbAdapter**

In `api/db-memory.ts`:

1. Extend the `Tables` interface (line 148) with the five
   new `Map<string, T>` entries (camelCase keys matching
   the `DbAdapter` property names).
2. Extend the `MemoryDbAdapter` class (line 186) with the
   five new `readonly` property declarations.
3. In the constructor, instantiate each via
   `new MemEntityStore(tableName, t.<prop>, ds)`.
4. In `buildTables` (line 384), seed each with `new Map()`.

Use snake_case as the first `MemEntityStore` argument
(e.g. `'objectives'`, `'objective_revisions'`) — that
matches `TABLE_NAMES` and the localStorage key.

Import the five row types at the top of the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --strip-types tests/db-table-names.test.ts`

Expected: PASS — both tests pass; `adapter.objectives.put`
and `getAll` round-trip cleanly.

- [ ] **Step 5: Commit**

```bash
git add api/db.ts api/db-localstorage.ts api/db-memory.ts \
    tests/db-table-names.test.ts
git commit -m "wire five new objective and scoring tables"
```

### Task 1.4: Add five entity validators to `api/validators.ts`

The codebase has nine existing entity validators all named
`validate*Entity` (see `validateHumanWorkerEntity` at line
653, `validateAIWorkerEntity` at 707, `validateProjectEntity`
at 805, etc.). The shape helpers `asString` (line 105) and
`asNumber` (line 120) are the only sanctioned primitives;
introducing a parallel vocabulary of `assertNonEmptyString` /
`assertTimestamp` / `assertScoreValue` / `assertNonNegativeInt`
would be a Uniformity violation (Commandment III). Match the
existing voice.

**Files:**
- Modify: `api/validators.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/validators-objectives.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    validateObjectiveEntity,
    validateObjectiveRevisionEntity,
    validateDeprecatedObjectiveEntity,
    validateBaselineScoreEntity,
    validateActualScoreEntity,
} from '../api/validators.ts';

test('validateObjectiveEntity accepts valid', () => {
    const v = validateObjectiveEntity({ position: 0 });
    assert.equal(v.position, 0);
});

test('validateObjectiveEntity rejects non-integer position',
    () => {
        assert.throws(
            () => validateObjectiveEntity({ position: 1.5 }),
        );
    });

test('validateObjectiveEntity rejects negative position',
    () => {
        assert.throws(
            () => validateObjectiveEntity({ position: -1 }),
        );
    });

test('validateObjectiveRevisionEntity accepts valid', () => {
    const v = validateObjectiveRevisionEntity({
        objective_id: 'o1',
        name: 'Revenue',
        description: 'Top line',
        revised_at: '2026-05-14T00:00:00.000Z',
    });
    assert.equal(v.name, 'Revenue');
});

test('validateObjectiveRevisionEntity rejects empty name',
    () => {
        assert.throws(
            () => validateObjectiveRevisionEntity({
                objective_id: 'o1',
                name: '',
                description: 'd',
                revised_at: '2026-05-14T00:00:00.000Z',
            }),
        );
    });

test('validateDeprecatedObjectiveEntity accepts valid', () => {
    const v = validateDeprecatedObjectiveEntity({
        objective_id: 'o1',
        deprecated_at: '2026-05-14T00:00:00.000Z',
    });
    assert.equal(v.objective_id, 'o1');
});

test('validateBaselineScoreEntity accepts 0', () => {
    const v = validateBaselineScoreEntity({
        project_id: 'p1',
        objective_id: 'o1',
        score: 0,
        scored_at: '2026-05-14T00:00:00.000Z',
    });
    assert.equal(v.score, 0);
});

test('validateBaselineScoreEntity accepts -100 and +100',
    () => {
        assert.equal(
            validateBaselineScoreEntity({
                project_id: 'p1', objective_id: 'o1',
                score: -100,
                scored_at: '2026-05-14T00:00:00.000Z',
            }).score,
            -100,
        );
        assert.equal(
            validateBaselineScoreEntity({
                project_id: 'p1', objective_id: 'o1',
                score: 100,
                scored_at: '2026-05-14T00:00:00.000Z',
            }).score,
            100,
        );
    });

test('validateBaselineScoreEntity rejects out-of-range',
    () => {
        assert.throws(() => validateBaselineScoreEntity({
            project_id: 'p1', objective_id: 'o1',
            score: 101,
            scored_at: '2026-05-14T00:00:00.000Z',
        }));
        assert.throws(() => validateBaselineScoreEntity({
            project_id: 'p1', objective_id: 'o1',
            score: -101,
            scored_at: '2026-05-14T00:00:00.000Z',
        }));
    });

test('validateBaselineScoreEntity rejects non-integer',
    () => {
        assert.throws(() => validateBaselineScoreEntity({
            project_id: 'p1', objective_id: 'o1',
            score: 12.5,
            scored_at: '2026-05-14T00:00:00.000Z',
        }));
    });

test('validateActualScoreEntity has same rules as baseline',
    () => {
        const v = validateActualScoreEntity({
            project_id: 'p1', objective_id: 'o1',
            score: -50,
            scored_at: '2026-05-14T00:00:00.000Z',
        });
        assert.equal(v.score, -50);
        assert.throws(() => validateActualScoreEntity({
            project_id: 'p1', objective_id: 'o1',
            score: 200,
            scored_at: '2026-05-14T00:00:00.000Z',
        }));
    });
```

Note: the entity body validators take the body *without* the
`id` field (see how `validateProjectEntity` accepts `Omit<
ProjectEntity, 'id'>` at line 807) — `id` is the storage key,
stripped before validation in `db-localstorage.ts:73`. The
score-event tables use composite keys (`p1:o1:t1`) as `id`;
the body fields are `project_id`, `objective_id`, `score`,
`scored_at`.

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/validators-objectives.test.ts`

Expected: FAIL — none of the five validators exist yet.

- [ ] **Step 3: Add validators to `api/validators.ts`**

Read `validateProjectEntity` (line 805) and
`validateAIWorkerEntity` (line 707) for the exact voice —
`assertOnlyKeys` enumerates allowed body keys; each field
extracted via `pickString` / `pickNumber` (existing helpers
in `api/validators.ts`). Reuse those primitives.

One genuinely new primitive earns its place: the
`[-100, +100]` integer score check. Match the lower-camelCase
shape-helper convention (`asString` / `asNumber`):

```ts
// inside api/validators.ts, near asNumber

export function asScore(
    value: unknown,
    label: string,
): number {
    if (
        typeof value !== 'number'
        || !Number.isInteger(value)
        || value < -100
        || value > 100
    ) {
        throw new Error(
            'expected integer in [-100, +100] for '
                + label
                + ', got '
                + JSON.stringify(value),
        );
    }
    return value;
}

export function asNonNegativeInteger(
    value: unknown,
    label: string,
): number {
    const n = asNumber(value, label);
    if (!Number.isInteger(n) || n < 0) {
        throw new Error(
            'expected non-negative integer for '
                + label + ', got ' + String(n),
        );
    }
    return n;
}
```

(One genuinely new helper per genuinely new shape;
`asNonNegativeInteger` is also new because no existing
field type matches it — verify by grep before adding.)

Then add the five entity validators, matching the body-key
pattern of `validateProjectEntity` exactly:

```ts
const OBJECTIVE_BODY_KEYS: readonly string[] = [
    'position',
];

export function validateObjectiveEntity(
    body: Record<string, unknown>,
): Omit<Objective, 'id'> {
    assertOnlyKeys(
        body, OBJECTIVE_BODY_KEYS, 'Objective',
    );
    return {
        position: asNonNegativeInteger(
            body.position, 'Objective.position',
        ),
    };
}

const OBJECTIVE_REVISION_BODY_KEYS:
    readonly string[] = [
    'objective_id', 'name',
    'description', 'revised_at',
];

export function validateObjectiveRevisionEntity(
    body: Record<string, unknown>,
): Omit<ObjectiveRevision, 'id'> {
    assertOnlyKeys(
        body,
        OBJECTIVE_REVISION_BODY_KEYS,
        'ObjectiveRevision',
    );
    const name = pickString(body, 'name');
    if (name === '') {
        throw new Error(
            'ObjectiveRevision.name must be non-empty',
        );
    }
    return {
        objective_id: pickString(
            body, 'objective_id',
        ),
        name,
        description: pickString(
            body, 'description',
        ),
        revised_at: pickString(
            body, 'revised_at',
        ),
    };
}

const DEPRECATED_OBJECTIVE_BODY_KEYS:
    readonly string[] = [
    'objective_id', 'deprecated_at',
];

export function validateDeprecatedObjectiveEntity(
    body: Record<string, unknown>,
): Omit<DeprecatedObjective, 'id'> {
    assertOnlyKeys(
        body,
        DEPRECATED_OBJECTIVE_BODY_KEYS,
        'DeprecatedObjective',
    );
    return {
        objective_id: pickString(
            body, 'objective_id',
        ),
        deprecated_at: pickString(
            body, 'deprecated_at',
        ),
    };
}

const BASELINE_SCORE_BODY_KEYS:
    readonly string[] = [
    'project_id', 'objective_id',
    'score', 'scored_at',
];

export function validateBaselineScoreEntity(
    body: Record<string, unknown>,
): Omit<ProjectObjectiveBaselineScore, 'id'> {
    assertOnlyKeys(
        body,
        BASELINE_SCORE_BODY_KEYS,
        'BaselineScore',
    );
    return {
        project_id: pickString(
            body, 'project_id',
        ),
        objective_id: pickString(
            body, 'objective_id',
        ),
        score: asScore(
            body.score, 'BaselineScore.score',
        ),
        scored_at: pickString(
            body, 'scored_at',
        ),
    };
}

const ACTUAL_SCORE_BODY_KEYS:
    readonly string[] = [
    'project_id', 'objective_id',
    'score', 'scored_at',
];

export function validateActualScoreEntity(
    body: Record<string, unknown>,
): Omit<ProjectObjectiveActualScore, 'id'> {
    assertOnlyKeys(
        body,
        ACTUAL_SCORE_BODY_KEYS,
        'ActualScore',
    );
    return {
        project_id: pickString(
            body, 'project_id',
        ),
        objective_id: pickString(
            body, 'objective_id',
        ),
        score: asScore(
            body.score, 'ActualScore.score',
        ),
        scored_at: pickString(
            body, 'scored_at',
        ),
    };
}
```

Add the five row types to the top-of-file `import type`
block:

```ts
import type {
    // ...existing imports unchanged...
    Objective,
    ObjectiveRevision,
    DeprecatedObjective,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from './types.ts';
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/validators-objectives.test.ts`

Expected: PASS — all twelve test cases pass.

- [ ] **Step 5: Commit**

```bash
git add api/validators.ts tests/validators-objectives.test.ts
git commit -m "add validators for objective and score entities"
```

### Task 1.5: Drop obsolete fields from `validateProjectEntity`

**Files:**
- Modify: `api/validators.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/validators-objectives.test.ts`:

```ts
import {
    validateProjectEntity,
} from '../api/validators.ts';

test('validateProjectEntity ignores legacy impact fields',
    () => {
        const baseValid = {
            title: 't',
            description: 'd',
            status: 'submitted',
            progress: 0,
            start_date: '2026-05-14T00:00:00.000Z',
            target_end_date: '2026-05-14T00:00:00.000Z',
            estimated_duration: 0,
            actual_duration: 0,
            estimated_cost: 0,
            actual_cost: 0,
            position: 0,
            business_context: {},
            timeline_label: 'q1',
        };
        const v = validateProjectEntity(baseValid);
        assert.equal(
            'estimated_impact' in (v as object),
            false,
        );
        assert.equal(
            'actual_impact' in (v as object),
            false,
        );
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/validators-objectives.test.ts`

Expected: FAIL — current `validateProjectEntity`
(`api/validators.ts:805`) still extracts
`estimated_impact` and `actual_impact` and lists them in
`PROJECT_BODY_KEYS`, so the unknown-key path differs from
the new shape.

- [ ] **Step 3: Remove impact-field handling from
`validateProjectEntity`**

In `api/validators.ts`:
1. Delete `'estimated_impact'` and `'actual_impact'` from
   the `PROJECT_BODY_KEYS` array (line 795-803).
2. Delete the two `estimated_impact: pickNumber(...)` and
   `actual_impact: pickNumber(...)` lines from the return
   object inside `validateProjectEntity` (line 844-849).

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/validators-objectives.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/validators.ts tests/validators-objectives.test.ts
git commit -m "drop legacy impact field validation from project entity"
```

> **Note:** A SCHEMA_VERSION/bootstrap-wipe task was
> originally planned here and removed during plan
> revision (Premature Generalization, Internal Defense
> — see Church of Code Book of Abominations).
> Schema migration belongs with Postgres, not with the
> first localStorage change.

### Task 1.7: Seed objectives + revisions in `populateMockData`

The `DbAdapter` exposes typed `EntityStore` properties per
table; `populateMockData` writes via `adapter.workers.put(
id, fields)` etc. (see `api/mock-data.ts:674`). The body
passed to `put` is `Omit<T, 'id'>` — no `id` field — because
the storage key is the first argument. Match that voice.

**Files:**
- Modify: `api/mock-data.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/mock-data-objectives.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { populateMockData } from '../api/mock-data.ts';
import {
    validateObjectiveEntity,
    validateObjectiveRevisionEntity,
} from '../api/validators.ts';

test('populateMockData seeds 5 objectives', async () => {
    const db = new MemoryDbAdapter();
    await populateMockData(db);
    const rows = await db.objectives.getAll();
    assert.equal(rows.length, 5);
    for (const r of rows) {
        const { id: _id, ...body } = r;
        validateObjectiveEntity(body);
    }
});

test('populateMockData seeds one revision per objective',
    async () => {
        const db = new MemoryDbAdapter();
        await populateMockData(db);
        const revs =
            await db.objectiveRevisions.getAll();
        assert.equal(revs.length, 5);
        for (const r of revs) {
            const { id: _id, ...body } = r;
            validateObjectiveRevisionEntity(body);
        }
        const objs = await db.objectives.getAll();
        const objIds = new Set(objs.map(o => o.id));
        const revObjIds = new Set(
            revs.map(r => r.objective_id),
        );
        assert.deepEqual(revObjIds, objIds);
    });

test('populateMockData seeds zero deprecated objectives',
    async () => {
        const db = new MemoryDbAdapter();
        await populateMockData(db);
        const rows =
            await db.deprecatedObjectives.getAll();
        assert.equal(rows.length, 0);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/mock-data-objectives.test.ts`

Expected: FAIL — `populateMockData` does not yet seed
objectives.

- [ ] **Step 3: Add seeding logic to `populateMockData`**

In `api/mock-data.ts`, add near the `workers.put` block (see
line 673):

```ts
const OBJECTIVE_SEEDS: Array<{
    id: string;
    position: number;
    name: string;
    description: string;
}> = [
    { id: 'obj-revenue', position: 0,
      name: 'Revenue Growth',
      description: 'Drive sustainable top-line growth' },
    { id: 'obj-cost', position: 1,
      name: 'Cost Reduction',
      description: 'Minimize operational waste' },
    { id: 'obj-customer', position: 2,
      name: 'Customer Satisfaction',
      description: 'Improve user-perceived value' },
    { id: 'obj-team', position: 3,
      name: 'Team Wellbeing',
      description: 'Sustainable, energizing work' },
    { id: 'obj-ops', position: 4,
      name: 'Operational Efficiency',
      description: 'Reduce friction in delivery' },
];

const MOCK_SEED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

for (const seed of OBJECTIVE_SEEDS) {
    await adapter.objectives.put(seed.id, {
        position: seed.position,
    });
    await adapter.objectiveRevisions.put(
        `${seed.id}:${MOCK_SEED_TIMESTAMP}`,
        {
            objective_id: seed.id,
            name: seed.name,
            description: seed.description,
            revised_at: MOCK_SEED_TIMESTAMP,
        },
    );
}
```

(The `Omit<T, 'id'>` body shape mirrors how
`adapter.workers.put` is called at line 674 — the id is
the first arg, the body is the second.)

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/mock-data-objectives.test.ts`

Expected: PASS — all three test cases pass.

- [ ] **Step 5: Commit**

```bash
git add api/mock-data.ts tests/mock-data-objectives.test.ts
git commit -m "seed 5 mock objectives with initial revisions"
```

### Task 1.8: Seed baseline + actual scores per project status

**Files:**
- Modify: `api/mock-data.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/mock-data-objectives.test.ts`:

```ts
test('approved projects have full baseline coverage',
    async () => {
        const db = new MemoryDbAdapter();
        await populateMockData(db);
        const projects = await db.projects.getAll();
        const approved = projects.filter(
            p => p.status === 'approved',
        );
        const objCount =
            (await db.objectives.getAll()).length;
        const allBaselines = await
            db.projectObjectiveBaselineScores.getAll();
        for (const p of approved) {
            const pairs = new Set(
                allBaselines
                    .filter(b => b.project_id === p.id)
                    .map(b => b.objective_id),
            );
            assert.equal(
                pairs.size,
                objCount,
                `project ${p.id} missing coverage`,
            );
        }
    });

test('completed projects have at least one actual per pair',
    async () => {
        const db = new MemoryDbAdapter();
        await populateMockData(db);
        const projects = await db.projects.getAll();
        const completed = projects.filter(
            p => p.status === 'completed',
        );
        const allBaselines = await
            db.projectObjectiveBaselineScores.getAll();
        const allActuals = await
            db.projectObjectiveActualScores.getAll();
        for (const p of completed) {
            const pairs = new Set(
                allBaselines
                    .filter(b => b.project_id === p.id)
                    .map(b => b.objective_id),
            );
            const actualPairs = new Set(
                allActuals
                    .filter(a => a.project_id === p.id)
                    .map(a => a.objective_id),
            );
            for (const pair of pairs) {
                assert.ok(
                    actualPairs.has(pair),
                    `project ${p.id} missing `
                        + `actual for ${pair}`,
                );
            }
        }
    });

test('submitted projects have zero scores', async () => {
    const db = new MemoryDbAdapter();
    await populateMockData(db);
    const projects = await db.projects.getAll();
    const submitted = projects.filter(
        p => p.status === 'submitted',
    );
    const allBaselines = await
        db.projectObjectiveBaselineScores.getAll();
    for (const p of submitted) {
        const baselines = allBaselines.filter(
            b => b.project_id === p.id,
        );
        assert.equal(baselines.length, 0);
    }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/mock-data-objectives.test.ts`

Expected: FAIL — `populateMockData` does not yet seed any
score rows.

- [ ] **Step 3: Add score-seeding logic**

In `api/mock-data.ts`, after the existing project loop, add:

```ts
const allProjects = await adapter.projects.getAll();

function deterministicScore(
    seed: string,
    min: number,
    max: number,
): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
    const range = max - min + 1;
    const wrapped = ((hash % range) + range) % range;
    return min + wrapped;
}

for (const p of allProjects) {
    if (
        p.status === 'submitted'
        || p.status === 'declined'
        || p.status === 'deleted'
    ) {
        continue;
    }

    const baselineCoverage =
        p.status === 'approved'
        || p.status === 'completed'
        ? OBJECTIVE_SEEDS.length
        : Math.max(
            0,
            deterministicScore(
                p.id + ':coverage',
                0,
                OBJECTIVE_SEEDS.length - 1,
            ),
        );

    const baselineStart =
        new Date(p.start_date).getTime();
    for (let i = 0; i < baselineCoverage; i++) {
        const obj = OBJECTIVE_SEEDS[i]!;
        const score = deterministicScore(
            `${p.id}:${obj.id}:baseline`,
            -100,
            100,
        );
        const scoredAt = new Date(
            baselineStart + i * 1000,
        ).toISOString();
        await adapter
            .projectObjectiveBaselineScores
            .put(
                `${p.id}:${obj.id}:${scoredAt}`,
                {
                    project_id: p.id,
                    objective_id: obj.id,
                    score,
                    scored_at: scoredAt,
                },
            );
    }

    if (
        p.status === 'approved'
        || p.status === 'completed'
    ) {
        const minActuals =
            p.status === 'completed' ? 1 : 0;
        const baseActualTime =
            baselineStart + 86400000;
        for (
            let i = 0; i < OBJECTIVE_SEEDS.length; i++
        ) {
            const obj = OBJECTIVE_SEEDS[i]!;
            const nActuals =
                minActuals
                + deterministicScore(
                    `${p.id}:${obj.id}:nactual`,
                    0,
                    2,
                );
            for (let k = 0; k < nActuals; k++) {
                const score = deterministicScore(
                    `${p.id}:${obj.id}:actual:${k}`,
                    -100,
                    100,
                );
                const scoredAt = new Date(
                    baseActualTime
                        + (i * 10 + k) * 1000,
                ).toISOString();
                await adapter
                    .projectObjectiveActualScores
                    .put(
                        `${p.id}:${obj.id}:${scoredAt}`,
                        {
                            project_id: p.id,
                            objective_id: obj.id,
                            score,
                            scored_at: scoredAt,
                        },
                    );
            }
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/mock-data-objectives.test.ts`

Expected: PASS — all six test cases pass.

- [ ] **Step 5: Commit**

```bash
git add api/mock-data.ts tests/mock-data-objectives.test.ts
git commit -m "seed baseline and actual score events for mock projects"
```

---

## Phase 2 — Adapters (part 1: validation + objectives)

### Task 2.1: Create `adapters/validation.ts` with `ValidationResult<P>`

**Files:**
- Create: `web-app/app/adapters/validation.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/adapter-validation.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { ValidationResult } from
    '../web-app/app/adapters/validation.ts';

test('ValidationResult shape compiles', () => {
    type P = { kind: 'x'; id: string };
    const v: ValidationResult<P> = {
        ready: false,
        problems: [{ kind: 'x', id: '1' }],
    };
    assert.equal(v.ready, false);
    assert.equal(v.problems.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/adapter-validation.test.ts`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the module**

```ts
// web-app/app/adapters/validation.ts

export type ValidationResult<P> = {
    ready: boolean;
    problems: P[];
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/adapter-validation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/adapters/validation.ts tests/adapter-validation.test.ts
git commit -m "add ValidationResult generic for gate predicates"
```

### Task 2.2: `adapters/objectives.ts` — read primitives

The codebase routing scheme exposes only `GET /<noun>` and
`GET /<noun>/<id>` (see `api/api.ts:113-310`). Query
parameters are not parsed. Filtered reads use the fetch-all
+ filter-in-adapter pattern — see
`adapters/work-orders-queries.ts:150-159` for the canonical
example. Notification channels are per-adapter, created via
`createSubscriptionChannel(['table_name'])`, mirroring the
existing pattern at `adapters/projects.ts:14-28`.

**Files:**
- Create: `web-app/app/adapters/objectives.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/adapters-objectives.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import {
    getObjective,
    getObjectives,
    getDeprecatedObjectiveIds,
    getObjectiveRevisions,
} from '../web-app/app/adapters/objectives.ts';

function ctxFor(db: MemoryDbAdapter) {
    return createRequestContext(db);
}

test('getObjective returns a single row', async () => {
    const db = new MemoryDbAdapter();
    await db.objectives.put('o1', { position: 0 });
    const ctx = ctxFor(db);
    const v = await getObjective(ctx, 'o1');
    assert.equal(v.id, 'o1');
    assert.equal(v.position, 0);
});

test('getObjectives returns all', async () => {
    const db = new MemoryDbAdapter();
    await db.objectives.put('o1', { position: 0 });
    await db.objectives.put('o2', { position: 1 });
    const ctx = ctxFor(db);
    const rows = await getObjectives(ctx);
    assert.equal(rows.length, 2);
});

test('getDeprecatedObjectiveIds returns a Set', async () => {
    const db = new MemoryDbAdapter();
    await db.deprecatedObjectives.put('o1', {
        objective_id: 'o1',
        deprecated_at: '2026-05-14T00:00:00.000Z',
    });
    const ctx = ctxFor(db);
    const ids = await getDeprecatedObjectiveIds(ctx);
    assert.ok(ids.has('o1'));
    assert.equal(ids.size, 1);
});

test('getObjectiveRevisions returns all for an objective',
    async () => {
        const db = new MemoryDbAdapter();
        await db.objectiveRevisions.put(
            'o1:2026-05-14T00:00:00.000Z',
            {
                objective_id: 'o1',
                name: 'Revenue',
                description: 'd',
                revised_at: '2026-05-14T00:00:00.000Z',
            },
        );
        await db.objectiveRevisions.put(
            'o1:2026-05-15T00:00:00.000Z',
            {
                objective_id: 'o1',
                name: 'Revenue Growth',
                description: 'd2',
                revised_at: '2026-05-15T00:00:00.000Z',
            },
        );
        await db.objectiveRevisions.put(
            'o2:2026-05-14T00:00:00.000Z',
            {
                objective_id: 'o2',
                name: 'Cost',
                description: 'd',
                revised_at: '2026-05-14T00:00:00.000Z',
            },
        );
        const ctx = ctxFor(db);
        const revs = await getObjectiveRevisions(ctx, 'o1');
        assert.equal(revs.length, 2);
        for (const r of revs) {
            assert.equal(r.objective_id, 'o1');
        }
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/adapters-objectives.test.ts`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the module**

Reads go through `ctx.GET<T>(resource)` exactly as
`adapters/work-orders-queries.ts` does:

```ts
// web-app/app/adapters/objectives.ts

import type {
    Objective,
    ObjectiveId,
    ObjectiveRevision,
    DeprecatedObjective,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';

const objectiveChanges =
    createSubscriptionChannel([
        'objectives',
        'objective_revisions',
        'deprecated_objectives',
    ]);

export function subscribeObjectiveChanges(
    fn: () => void,
): () => void {
    return objectiveChanges.subscribe(fn);
}

export function notifyObjectiveChange(): void {
    objectiveChanges.notify();
}

export async function getObjective(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<Objective> {
    return ctx.GET<Objective>(
        `objectives/${id}`,
    );
}

export async function getObjectives(
    ctx: RequestContext,
): Promise<Objective[]> {
    return ctx.GET<Objective[]>('objectives');
}

export async function getDeprecatedObjectiveIds(
    ctx: RequestContext,
): Promise<Set<ObjectiveId>> {
    const rows = await ctx.GET<DeprecatedObjective[]>(
        'deprecated_objectives',
    );
    return new Set(rows.map(r => r.objective_id));
}

export async function getObjectiveRevisions(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<ObjectiveRevision[]> {
    const all = await ctx.GET<ObjectiveRevision[]>(
        'objective_revisions',
    );
    return all.filter(
        r => r.objective_id === id,
    );
}
```

The adapter trusts the `ctx.GET` payload's row shape —
validation happens at the DB write boundary
(`db-localstorage.ts` runs the entity validator before each
`put`), not on read. This matches how every other adapter
in the codebase handles reads (e.g.,
`adapters/work-orders-queries.ts`).

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/adapters-objectives.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/adapters/objectives.ts \
    tests/adapters-objectives.test.ts
git commit -m "add objective read primitives and channel"
```

### Task 2.3: `objectives.ts` — active retrieval + definition resolution

**Files:**
- Modify: `web-app/app/adapters/objectives.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/adapters-objectives.test.ts`:

```ts
import {
    postActiveObjectivesRetrieval,
    postCurrentObjectiveDefinition,
    postObjectiveDefinitionAtTime,
} from '../web-app/app/adapters/objectives.ts';

test('postActiveObjectivesRetrieval filters deprecated',
    async () => {
        const db = new MemoryDbAdapter();
        await db.objectives.put('o1', { position: 0 });
        await db.objectives.put('o2', { position: 1 });
        await db.deprecatedObjectives.put('o2', {
            objective_id: 'o2',
            deprecated_at: '2026-05-14T00:00:00.000Z',
        });
        const ctx = ctxFor(db);
        const active = await postActiveObjectivesRetrieval(
            ctx,
        );
        assert.equal(active.length, 1);
        assert.equal(active[0]!.id, 'o1');
    });

test('postCurrentObjectiveDefinition returns latest revision',
    async () => {
        const db = new MemoryDbAdapter();
        await db.objectiveRevisions.put(
            'o1:2026-05-14T00:00:00.000Z',
            {
                objective_id: 'o1', name: 'Old',
                description: 'd1',
                revised_at: '2026-05-14T00:00:00.000Z',
            },
        );
        await db.objectiveRevisions.put(
            'o1:2026-05-15T00:00:00.000Z',
            {
                objective_id: 'o1', name: 'New',
                description: 'd2',
                revised_at: '2026-05-15T00:00:00.000Z',
            },
        );
        const ctx = ctxFor(db);
        const def = await postCurrentObjectiveDefinition(
            ctx, 'o1',
        );
        assert.equal(def.name, 'New');
        assert.equal(def.description, 'd2');
    });

test('postObjectiveDefinitionAtTime returns historical name',
    async () => {
        const db = new MemoryDbAdapter();
        await db.objectiveRevisions.put(
            'o1:2026-05-14T00:00:00.000Z',
            {
                objective_id: 'o1', name: 'Old',
                description: 'd1',
                revised_at: '2026-05-14T00:00:00.000Z',
            },
        );
        await db.objectiveRevisions.put(
            'o1:2026-05-15T00:00:00.000Z',
            {
                objective_id: 'o1', name: 'New',
                description: 'd2',
                revised_at: '2026-05-15T00:00:00.000Z',
            },
        );
        const ctx = ctxFor(db);
        const histDef = await postObjectiveDefinitionAtTime(
            ctx, 'o1', '2026-05-14T12:00:00.000Z',
        );
        assert.equal(histDef.name, 'Old');
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/adapters-objectives.test.ts`

Expected: FAIL — the three new operations don't exist.

- [ ] **Step 3: Add operations to `objectives.ts`**

Append:

```ts
export async function postActiveObjectivesRetrieval(
    ctx: RequestContext,
): Promise<Objective[]> {
    const [all, deprecated] = await Promise.all([
        getObjectives(ctx),
        getDeprecatedObjectiveIds(ctx),
    ]);
    return all
        .filter(o => !deprecated.has(o.id))
        .sort((a, b) => a.position - b.position);
}

export async function postCurrentObjectiveDefinition(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<{ name: string; description: string }> {
    const revs = await getObjectiveRevisions(ctx, id);
    if (revs.length === 0) {
        throw new Error('no revisions for objective ' + id);
    }
    revs.sort((a, b) =>
        b.revised_at.localeCompare(a.revised_at),
    );
    const latest = revs[0]!;
    return {
        name: latest.name,
        description: latest.description,
    };
}

export async function postObjectiveDefinitionAtTime(
    ctx: RequestContext,
    id: ObjectiveId,
    atTime: string,
): Promise<{ name: string; description: string }> {
    const revs = await getObjectiveRevisions(ctx, id);
    const eligible = revs.filter(
        r => r.revised_at <= atTime,
    );
    if (eligible.length === 0) {
        throw new Error(
            'no revision of ' + id
            + ' at or before ' + atTime,
        );
    }
    eligible.sort((a, b) =>
        b.revised_at.localeCompare(a.revised_at),
    );
    const latest = eligible[0]!;
    return {
        name: latest.name,
        description: latest.description,
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/adapters-objectives.test.ts`

Expected: PASS — all three new test cases pass.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/adapters/objectives.ts tests/adapters-objectives.test.ts
git commit -m "add active retrieval and temporal definition resolution"
```

### Task 2.4: `objectives.ts` — write operations

The `ctx.commit` signature (`adapters/shared.ts:34-37`)
carries `notifyChannels?: readonly Channel<void>[]` —
Channel objects, not strings. The existing pattern is to
call `ctx.commit({ ops })` then call the local notify
helper (see `adapters/flow-mutations.ts:69-103` for the
canonical example: `await ctx.commit({ ops: [...] });
flowChanges.notify();`). Match that voice.

**Files:**
- Modify: `web-app/app/adapters/objectives.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/adapters-objectives.test.ts`:

```ts
import {
    postObjectiveCreation,
    postObjectiveRevision,
    postObjectiveDeprecation,
    postObjectiveReactivation,
    postObjectiveReordering,
} from '../web-app/app/adapters/objectives.ts';

test('postObjectiveCreation writes objective + revision',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'Revenue', 'Top line', 0,
        );
        const o = await db.objectives.getById('o1');
        assert.equal(o.id, 'o1');
        const revs = await db.objectiveRevisions.getAll();
        assert.equal(revs.length, 1);
        assert.equal(revs[0]!.name, 'Revenue');
    });

test('postObjectiveRevision appends a revision row',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'Revenue', 'd1', 0,
        );
        await postObjectiveRevision(
            ctx, 'o1', 'Revenue Growth', 'd2',
        );
        const revs = await db.objectiveRevisions.getAll();
        assert.equal(revs.length, 2);
    });

test('postObjectiveDeprecation tombstones an objective',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'Revenue', 'd', 0,
        );
        await postObjectiveDeprecation(ctx, 'o1');
        const tombstones =
            await db.deprecatedObjectives.getAll();
        assert.equal(tombstones.length, 1);
        assert.equal(tombstones[0]!.objective_id, 'o1');
    });

test('postObjectiveReactivation removes tombstone',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'Rev', 'd', 0,
        );
        await postObjectiveDeprecation(ctx, 'o1');
        await postObjectiveReactivation(ctx, 'o1');
        const tombstones =
            await db.deprecatedObjectives.getAll();
        assert.equal(tombstones.length, 0);
    });

test('postObjectiveReordering updates positions',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'A', 'd', 0,
        );
        await postObjectiveCreation(
            ctx, 'o2', 'B', 'd', 1,
        );
        await postObjectiveCreation(
            ctx, 'o3', 'C', 'd', 2,
        );
        await postObjectiveReordering(
            ctx, ['o3', 'o1', 'o2'],
        );
        const all = await db.objectives.getAll();
        const map = new Map(
            all.map(o => [o.id, o.position]),
        );
        assert.equal(map.get('o3'), 0);
        assert.equal(map.get('o1'), 1);
        assert.equal(map.get('o2'), 2);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/adapters-objectives.test.ts`

Expected: FAIL — five new operations are missing.

- [ ] **Step 3: Add write operations**

Append to `web-app/app/adapters/objectives.ts`. Each write
calls `ctx.commit({ ops })`, then `notifyObjectiveChange()`
(the local helper added in Task 2.2). Template literals
for resource paths match the existing voice (see
`adapters/flow-mutations.ts:73`):

```ts
import { nowUtc } from '../../../api/types.ts';

export async function postObjectiveCreation(
    ctx: RequestContext,
    id: ObjectiveId,
    name: string,
    description: string,
    position: number,
): Promise<void> {
    const revisedAt = nowUtc();
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource: `objectives/${id}`,
                body: { position },
            },
            {
                method: 'put',
                resource:
                    `objective_revisions/`
                    + `${id}:${revisedAt}`,
                body: {
                    objective_id: id,
                    name,
                    description,
                    revised_at: revisedAt,
                },
            },
        ],
    });
    notifyObjectiveChange();
}

export async function postObjectiveRevision(
    ctx: RequestContext,
    id: ObjectiveId,
    name: string,
    description: string,
): Promise<void> {
    const revisedAt = nowUtc();
    await ctx.commit({
        ops: [{
            method: 'put',
            resource:
                `objective_revisions/`
                + `${id}:${revisedAt}`,
            body: {
                objective_id: id,
                name,
                description,
                revised_at: revisedAt,
            },
        }],
    });
    notifyObjectiveChange();
}

export async function postObjectiveDeprecation(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<void> {
    await ctx.commit({
        ops: [{
            method: 'put',
            resource: `deprecated_objectives/${id}`,
            body: {
                objective_id: id,
                deprecated_at: nowUtc(),
            },
        }],
    });
    notifyObjectiveChange();
}

export async function postObjectiveReactivation(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<void> {
    await ctx.commit({
        ops: [{
            method: 'delete',
            resource: `deprecated_objectives/${id}`,
        }],
    });
    notifyObjectiveChange();
}

export async function postObjectiveReordering(
    ctx: RequestContext,
    idsInOrder: ObjectiveId[],
): Promise<void> {
    const ops = idsInOrder.map((id, i) => ({
        method: 'put' as const,
        resource: `objectives/${id}`,
        body: { position: i },
    }));
    await ctx.commit({ ops });
    notifyObjectiveChange();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/adapters-objectives.test.ts`

Expected: PASS — five new test cases pass.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/adapters/objectives.ts \
    tests/adapters-objectives.test.ts
git commit -m "add objective write operations"
```

---

## Phase 2 — Adapters (part 2: scoring + publish)

### Task 2.5: `adapters/project-scoring.ts` — read primitives

The score event-log tables are read via `ctx.GET<T[]>(
'project_objective_baseline_scores')` (no query parameters
— see `api/api.ts:113-310`) and filtered in the adapter,
matching the pattern in `adapters/work-orders-queries.ts:
150-159`. The adapter creates its own
`createSubscriptionChannel(['...'])` exactly as
`adapters/projects.ts:14-28` does.

**Files:**
- Create: `web-app/app/adapters/project-scoring.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/adapters-project-scoring.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import {
    getBaselineScoresForProject,
    getActualScoresForProject,
} from '../web-app/app/adapters/project-scoring.ts';

test('getBaselineScoresForProject returns project rows',
    async () => {
        const db = new MemoryDbAdapter();
        await db.projectObjectiveBaselineScores.put(
            'p1:o1:t1',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 50,
                scored_at: '2026-05-14T00:00:00.000Z',
            },
        );
        await db.projectObjectiveBaselineScores.put(
            'p2:o1:t1',
            {
                project_id: 'p2', objective_id: 'o1',
                score: -20,
                scored_at: '2026-05-14T00:00:00.000Z',
            },
        );
        const ctx = createRequestContext(db);
        const rows = await getBaselineScoresForProject(
            ctx, 'p1',
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.score, 50);
    });

test('getActualScoresForProject returns project rows',
    async () => {
        const db = new MemoryDbAdapter();
        await db.projectObjectiveActualScores.put(
            'p1:o1:t1',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 33,
                scored_at: '2026-05-14T00:00:00.000Z',
            },
        );
        const ctx = createRequestContext(db);
        const rows = await getActualScoresForProject(
            ctx, 'p1',
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.score, 33);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/adapters-project-scoring.test.ts`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the module with channel + primitives**

```ts
// web-app/app/adapters/project-scoring.ts

import type {
    Id,
    ObjectiveId,
    ProjectEntity,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';

const projectScoreChanges =
    createSubscriptionChannel([
        'project_objective_baseline_scores',
        'project_objective_actual_scores',
    ]);

export function subscribeProjectScoreChanges(
    fn: () => void,
): () => void {
    return projectScoreChanges.subscribe(fn);
}

export function notifyProjectScoreChange(): void {
    projectScoreChanges.notify();
}

export async function getBaselineScoresForProject(
    ctx: RequestContext,
    projectId: Id,
): Promise<ProjectObjectiveBaselineScore[]> {
    const all = await ctx.GET<
        ProjectObjectiveBaselineScore[]
    >('project_objective_baseline_scores');
    return all.filter(
        r => r.project_id === projectId,
    );
}

export async function getActualScoresForProject(
    ctx: RequestContext,
    projectId: Id,
): Promise<ProjectObjectiveActualScore[]> {
    const all = await ctx.GET<
        ProjectObjectiveActualScore[]
    >('project_objective_actual_scores');
    return all.filter(
        r => r.project_id === projectId,
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/adapters-project-scoring.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/adapters/project-scoring.ts tests/adapters-project-scoring.test.ts
git commit -m "add per-project score read primitives"
```

### Task 2.6: `project-scoring.ts` — `postProjectScoringRetrieval`

**Files:**
- Modify: `web-app/app/adapters/project-scoring.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/adapters-project-scoring.test.ts`:

```ts
import { postProjectScoringRetrieval } from
    '../web-app/app/adapters/project-scoring.ts';

test('postProjectScoringRetrieval returns both lists',
    async () => {
        const db = new MemoryDbAdapter();
        await db.projectObjectiveBaselineScores.put(
            'p1:o1:t1',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 50,
                scored_at: '2026-05-14T00:00:00.000Z',
            },
        );
        await db.projectObjectiveActualScores.put(
            'p1:o1:t2',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 33,
                scored_at: '2026-05-15T00:00:00.000Z',
            },
        );
        const ctx = createRequestContext(db);
        const r = await postProjectScoringRetrieval(
            ctx, 'p1',
        );
        assert.equal(r.baseline.length, 1);
        assert.equal(r.actual.length, 1);
        assert.equal(r.baseline[0]!.score, 50);
        assert.equal(r.actual[0]!.score, 33);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/adapters-project-scoring.test.ts`

Expected: FAIL — function does not exist.

- [ ] **Step 3: Add the function**

```ts
export async function postProjectScoringRetrieval(
    ctx: RequestContext,
    projectId: Id,
): Promise<{
    baseline: ProjectObjectiveBaselineScore[];
    actual: ProjectObjectiveActualScore[];
}> {
    const [baseline, actual] = await Promise.all([
        getBaselineScoresForProject(ctx, projectId),
        getActualScoresForProject(ctx, projectId),
    ]);
    return { baseline, actual };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/adapters-project-scoring.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/adapters/project-scoring.ts tests/adapters-project-scoring.test.ts
git commit -m "bundle baseline and actual fetch into one operation"
```

### Task 2.7: `project-scoring.ts` — aggregates

**Files:**
- Modify: `web-app/app/adapters/project-scoring.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/adapters-project-scoring.test.ts`:

```ts
import {
    postPortfolioImpactSummary,
    postObjectiveAggregates,
    postProjectsScoreColumn,
} from '../web-app/app/adapters/project-scoring.ts';

async function seedTwoApprovedProjects(
    db: MemoryDbAdapter,
): Promise<void> {
    const projectBody = {
        description: 'd', progress: 0,
        start_date: '2026-05-14T00:00:00.000Z',
        target_end_date: '2026-05-14T00:00:00.000Z',
        estimated_duration: 0, actual_duration: 0,
        estimated_cost: 0, actual_cost: 0,
        business_context: '{}',
        timeline_label: 'q1',
    };
    await db.projects.put('p1', {
        ...projectBody,
        status: 'approved' as const,
        title: 't1', position: 0,
    });
    await db.projects.put('p2', {
        ...projectBody,
        status: 'approved' as const,
        title: 't2', position: 1,
    });
    await db.objectives.put('o1', { position: 0 });
    await db.objectiveRevisions.put('o1:t0', {
        objective_id: 'o1', name: 'O', description: 'd',
        revised_at: '2026-05-14T00:00:00.000Z',
    });
    await db.projectObjectiveBaselineScores.put(
        'p1:o1:t1',
        {
            project_id: 'p1', objective_id: 'o1',
            score: 60,
            scored_at: '2026-05-14T00:00:00.000Z',
        },
    );
    await db.projectObjectiveBaselineScores.put(
        'p2:o1:t1',
        {
            project_id: 'p2', objective_id: 'o1',
            score: -20,
            scored_at: '2026-05-14T00:00:00.000Z',
        },
    );
}

test('postPortfolioImpactSummary averages project averages',
    async () => {
        const db = new MemoryDbAdapter();
        await seedTwoApprovedProjects(db);
        const ctx = createRequestContext(db);
        const r = await postPortfolioImpactSummary(ctx);
        assert.equal(r.projectCount, 2);
        assert.equal(r.baselineMean, 20); // (60 + -20) / 2
    });

test('postObjectiveAggregates returns per-objective rows',
    async () => {
        const db = new MemoryDbAdapter();
        await seedTwoApprovedProjects(db);
        const ctx = createRequestContext(db);
        const rows = await postObjectiveAggregates(ctx);
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.objectiveId, 'o1');
        assert.equal(rows[0]!.baselineMean, 20);
        assert.equal(rows[0]!.projectsBaselineScored, 2);
    });

test('postProjectsScoreColumn returns per-project rollup',
    async () => {
        const db = new MemoryDbAdapter();
        await seedTwoApprovedProjects(db);
        const ctx = createRequestContext(db);
        const rows = await postProjectsScoreColumn(ctx);
        const byId = new Map(
            rows.map(r => [r.projectId, r]),
        );
        assert.equal(byId.get('p1')!.baselineAvg, 60);
        assert.equal(byId.get('p2')!.baselineAvg, -20);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/adapters-project-scoring.test.ts`

Expected: FAIL — three new aggregates don't exist.

- [ ] **Step 3: Add aggregate operations**

The implementation does argmax-per-pair on the event log
then averages. Pseudocode:

Imports `latestPerPair` from the shared module added in
Task 2.13 (do not redefine inline):

```ts
import {
    postActiveObjectivesRetrieval,
    getDeprecatedObjectiveIds,
} from './objectives.ts';
import { latestPerPair } from '../scoring-format.ts';

function meanOrUndefined(xs: number[]): number | undefined {
    if (xs.length === 0) return undefined;
    const sum = xs.reduce((a, b) => a + b, 0);
    return Math.round(sum / xs.length);
}

export async function postPortfolioImpactSummary(
    ctx: RequestContext,
): Promise<{
    baselineMean: number | undefined;
    actualMean: number | undefined;
    projectCount: number;
    actualCount: number;
}> {
    const projectRows = await ctx.GET<ProjectEntity[]>(
        'projects',
    );
    const approved = projectRows.filter(
        p => p.status === 'approved',
    );

    const baselineMeansPerProject: number[] = [];
    const actualMeansPerProject: number[] = [];

    for (const p of approved) {
        const { baseline, actual } =
            await postProjectScoringRetrieval(ctx, p.id);
        const latestB = latestPerPair(baseline);
        if (latestB.length > 0) {
            const m = meanOrUndefined(
                latestB.map(r => r.score),
            );
            if (m !== undefined) {
                baselineMeansPerProject.push(m);
            }
        }
        const latestA = latestPerPair(actual);
        const baselinedObjs = new Set(
            latestB.map(r => r.objective_id),
        );
        const actualedObjs = new Set(
            latestA.map(r => r.objective_id),
        );
        const fullyActualed = latestB.every(b =>
            actualedObjs.has(b.objective_id),
        );
        if (fullyActualed && latestB.length > 0) {
            const aMap = new Map(
                latestA.map(a => [a.objective_id, a.score]),
            );
            const xs = latestB.map(
                b => aMap.get(b.objective_id),
            ).filter((x): x is number => typeof x === 'number');
            const am = meanOrUndefined(xs);
            if (am !== undefined) {
                actualMeansPerProject.push(am);
            }
        }
    }

    return {
        baselineMean: meanOrUndefined(
            baselineMeansPerProject,
        ),
        actualMean: meanOrUndefined(
            actualMeansPerProject,
        ),
        projectCount: baselineMeansPerProject.length,
        actualCount: actualMeansPerProject.length,
    };
}

export async function postObjectiveAggregates(
    ctx: RequestContext,
): Promise<Array<{
    objectiveId: ObjectiveId;
    baselineMean: number | undefined;
    latestActualMean: number | undefined;
    projectsBaselineScored: number;
    projectsActualScored: number;
}>> {
    const [activeObjs, projectRows] = await Promise.all([
        postActiveObjectivesRetrieval(ctx),
        ctx.GET<ProjectEntity[]>('projects'),
    ]);
    const approved = projectRows.filter(
        p => p.status === 'approved',
    );

    const result = [];
    for (const obj of activeObjs) {
        const baselineScores: number[] = [];
        const actualScores: number[] = [];

        for (const p of approved) {
            const { baseline, actual } =
                await postProjectScoringRetrieval(ctx, p.id);
            const latestB = latestPerPair(baseline);
            const latestA = latestPerPair(actual);
            const bForObj = latestB.find(
                r => r.objective_id === obj.id,
            );
            if (bForObj) {
                baselineScores.push(bForObj.score);
            }
            const aForObj = latestA.find(
                r => r.objective_id === obj.id,
            );
            if (aForObj) {
                actualScores.push(aForObj.score);
            }
        }

        result.push({
            objectiveId: obj.id,
            baselineMean: meanOrUndefined(baselineScores),
            latestActualMean: meanOrUndefined(actualScores),
            projectsBaselineScored: baselineScores.length,
            projectsActualScored: actualScores.length,
        });
    }
    return result;
}

export async function postProjectsScoreColumn(
    ctx: RequestContext,
): Promise<Array<{
    projectId: Id;
    baselineAvg: number | undefined;
    latestActualAvg: number | undefined;
    baselineCount: number;
    totalActiveObjectives: number;
}>> {
    const [activeObjs, projectRows] = await Promise.all([
        postActiveObjectivesRetrieval(ctx),
        ctx.GET<ProjectEntity[]>('projects'),
    ]);
    const totalActive = activeObjs.length;

    const out = [];
    for (const p of projectRows) {
        const { baseline, actual } =
            await postProjectScoringRetrieval(ctx, p.id);
        const latestB = latestPerPair(baseline);
        const latestA = latestPerPair(actual);
        out.push({
            projectId: p.id,
            baselineAvg: meanOrUndefined(
                latestB.map(b => b.score),
            ),
            latestActualAvg: meanOrUndefined(
                latestA.map(a => a.score),
            ),
            baselineCount: latestB.length,
            totalActiveObjectives: totalActive,
        });
    }
    return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/adapters-project-scoring.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/adapters/project-scoring.ts tests/adapters-project-scoring.test.ts
git commit -m "add scoring aggregate operations"
```

### Task 2.8: `project-scoring.ts` — write operations

**Files:**
- Modify: `web-app/app/adapters/project-scoring.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/adapters-project-scoring.test.ts`:

```ts
import {
    postProjectBaselineScoring,
    postProjectActualMeasurement,
} from '../web-app/app/adapters/project-scoring.ts';

test('postProjectBaselineScoring appends event rows',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = createRequestContext(db);
        await postProjectBaselineScoring(ctx, 'p1', [
            { objectiveId: 'o1', score: 50 },
            { objectiveId: 'o2', score: -30 },
        ]);
        const rows =
            await db.projectObjectiveBaselineScores.getAll();
        assert.equal(rows.length, 2);
    });

test('postProjectActualMeasurement appends actual rows',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = createRequestContext(db);
        await postProjectActualMeasurement(ctx, 'p1', [
            { objectiveId: 'o1', score: 33 },
        ]);
        const rows =
            await db.projectObjectiveActualScores.getAll();
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.score, 33);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/adapters-project-scoring.test.ts`

Expected: FAIL — write operations don't exist.

- [ ] **Step 3: Add the write operations**

Each write calls `ctx.commit({ ops })` then
`notifyProjectScoreChange()` (the local helper added in
Task 2.5). Match the post-commit notify voice of
`adapters/flow-mutations.ts:69-103`:

```ts
import { nowUtc } from '../../../api/types.ts';

export async function postProjectBaselineScoring(
    ctx: RequestContext,
    projectId: Id,
    scores: Array<{
        objectiveId: ObjectiveId;
        score: number;
    }>,
): Promise<void> {
    const scoredAt = nowUtc();
    const ops = scores.map(s => ({
        method: 'put' as const,
        resource:
            `project_objective_baseline_scores/`
            + `${projectId}:${s.objectiveId}`
            + `:${scoredAt}`,
        body: {
            project_id: projectId,
            objective_id: s.objectiveId,
            score: s.score,
            scored_at: scoredAt,
        },
    }));
    await ctx.commit({ ops });
    notifyProjectScoreChange();
}

export async function postProjectActualMeasurement(
    ctx: RequestContext,
    projectId: Id,
    scores: Array<{
        objectiveId: ObjectiveId;
        score: number;
    }>,
): Promise<void> {
    const scoredAt = nowUtc();
    const ops = scores.map(s => ({
        method: 'put' as const,
        resource:
            `project_objective_actual_scores/`
            + `${projectId}:${s.objectiveId}`
            + `:${scoredAt}`,
        body: {
            project_id: projectId,
            objective_id: s.objectiveId,
            score: s.score,
            scored_at: scoredAt,
        },
    }));
    await ctx.commit({ ops });
    notifyProjectScoreChange();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/adapters-project-scoring.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/adapters/project-scoring.ts tests/adapters-project-scoring.test.ts
git commit -m "add project scoring write operations"
```

### Task 2.9: `adapters/project-publish.ts` — validators + transitions

**Files:**
- Create: `web-app/app/adapters/project-publish.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/adapters-project-publish.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import {
    validateProjectForApproval,
    validateProjectForCompletion,
    postProjectApproval,
    postProjectCompletion,
} from '../web-app/app/adapters/project-publish.ts';

const SAMPLE_PROJECT_BODY = {
    title: 't',
    description: 'd', progress: 0,
    start_date: '2026-05-14T00:00:00.000Z',
    target_end_date: '2026-05-14T00:00:00.000Z',
    estimated_duration: 0, actual_duration: 0,
    estimated_cost: 0, actual_cost: 0,
    position: 0, business_context: '{}',
    timeline_label: 'q1',
    status: 'under-review' as const,
};

const SAMPLE_PROJECT = { id: 'p1', ...SAMPLE_PROJECT_BODY };

test('validator: not ready when objectives unscored',
    () => {
        const r = validateProjectForApproval(
            SAMPLE_PROJECT,
            [{ id: 'o1', position: 0 },
             { id: 'o2', position: 1 }],
            [],
        );
        assert.equal(r.ready, false);
        assert.equal(r.problems.length, 2);
    });

test('validator: ready when all scored', () => {
    const r = validateProjectForApproval(
        SAMPLE_PROJECT,
        [{ id: 'o1', position: 0 }],
        [{ project_id: 'p1', objective_id: 'o1',
           score: 50,
           scored_at: '2026-05-14T00:00:00.000Z' }],
    );
    assert.equal(r.ready, true);
    assert.equal(r.problems.length, 0);
});

test('completion validator: not ready when actuals missing',
    () => {
        const r = validateProjectForCompletion(
            { ...SAMPLE_PROJECT, status: 'approved' },
            [{ project_id: 'p1', objective_id: 'o1',
               score: 50,
               scored_at: '2026-05-14T00:00:00.000Z' }],
            [],
        );
        assert.equal(r.ready, false);
        assert.equal(r.problems[0]!.kind, 'actual_unscored');
    });

test('postProjectApproval flips status', async () => {
    const db = new MemoryDbAdapter();
    await db.projects.put('p1', SAMPLE_PROJECT_BODY);
    await db.objectives.put('o1', { position: 0 });
    await db.projectObjectiveBaselineScores.put(
        'p1:o1:t1',
        { project_id: 'p1', objective_id: 'o1', score: 50,
          scored_at: '2026-05-14T00:00:00.000Z' },
    );
    const ctx = createRequestContext(db);
    await postProjectApproval(ctx, 'p1');
    const p = await db.projects.getById('p1');
    assert.equal(p.status, 'approved');
});

test('postProjectApproval throws when not ready',
    async () => {
        const db = new MemoryDbAdapter();
        await db.projects.put('p1', SAMPLE_PROJECT_BODY);
        await db.objectives.put('o1', { position: 0 });
        const ctx = createRequestContext(db);
        await assert.rejects(
            () => postProjectApproval(ctx, 'p1'),
            /not ready|unscored/i,
        );
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/adapters-project-publish.test.ts`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the module**

```ts
// web-app/app/adapters/project-publish.ts

import type {
    ProjectEntity,
    Id,
    Objective,
    ObjectiveId,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import type { ValidationResult } from './validation.ts';
import { postActiveObjectivesRetrieval } from
    './objectives.ts';
import { postProjectScoringRetrieval } from
    './project-scoring.ts';
import { notifyProjectChange } from './projects.ts';

export type ProjectProblem =
    | { kind: 'baseline_unscored';
        objectiveId: ObjectiveId }
    | { kind: 'actual_unscored';
        objectiveId: ObjectiveId };

function latestPerObjective(
    rows: Array<{ objective_id: ObjectiveId;
                  scored_at: string }>,
): Set<ObjectiveId> {
    const map = new Map<ObjectiveId, string>();
    for (const r of rows) {
        const prev = map.get(r.objective_id);
        if (!prev || r.scored_at > prev) {
            map.set(r.objective_id, r.scored_at);
        }
    }
    return new Set(map.keys());
}

export function validateProjectForApproval(
    project: ProjectEntity,
    activeObjectives: Objective[],
    baselineScores: ProjectObjectiveBaselineScore[],
): ValidationResult<ProjectProblem> {
    const scored = latestPerObjective(baselineScores);
    const problems: ProjectProblem[] = [];
    for (const obj of activeObjectives) {
        if (!scored.has(obj.id)) {
            problems.push({
                kind: 'baseline_unscored',
                objectiveId: obj.id,
            });
        }
    }
    return {
        ready: problems.length === 0,
        problems,
    };
}

export function validateProjectForCompletion(
    project: ProjectEntity,
    baselineScores: ProjectObjectiveBaselineScore[],
    actualScores: ProjectObjectiveActualScore[],
): ValidationResult<ProjectProblem> {
    const baselined =
        latestPerObjective(baselineScores);
    const actualed = latestPerObjective(actualScores);
    const problems: ProjectProblem[] = [];
    for (const objId of baselined) {
        if (!actualed.has(objId)) {
            problems.push({
                kind: 'actual_unscored',
                objectiveId: objId,
            });
        }
    }
    return {
        ready: problems.length === 0,
        problems,
    };
}

export class ProjectNotReadyError extends Error {
    constructor(
        public problems: ProjectProblem[],
    ) {
        super('project not ready: '
            + problems.map(p => p.kind).join(', '));
    }
}

export async function postProjectApproval(
    ctx: RequestContext,
    projectId: Id,
): Promise<void> {
    const project = await ctx.GET<ProjectEntity>(
        `projects/${projectId}`,
    );
    const [active, scoring] = await Promise.all([
        postActiveObjectivesRetrieval(ctx),
        postProjectScoringRetrieval(ctx, projectId),
    ]);
    const v = validateProjectForApproval(
        project, active, scoring.baseline,
    );
    if (!v.ready) {
        throw new ProjectNotReadyError(v.problems);
    }
    const { id: _id, ...body } = project;
    await ctx.commit({
        ops: [{
            method: 'put',
            resource: `projects/${projectId}`,
            body: { ...body, status: 'approved' },
        }],
    });
    notifyProjectChange();
}

export async function postProjectCompletion(
    ctx: RequestContext,
    projectId: Id,
): Promise<void> {
    const project = await ctx.GET<ProjectEntity>(
        `projects/${projectId}`,
    );
    const scoring = await postProjectScoringRetrieval(
        ctx, projectId,
    );
    const v = validateProjectForCompletion(
        project, scoring.baseline, scoring.actual,
    );
    if (!v.ready) {
        throw new ProjectNotReadyError(v.problems);
    }
    const { id: _id, ...body } = project;
    await ctx.commit({
        ops: [{
            method: 'put',
            resource: `projects/${projectId}`,
            body: { ...body, status: 'completed' },
        }],
    });
    notifyProjectChange();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/adapters-project-publish.test.ts`

Expected: PASS — all five test cases pass.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/adapters/project-publish.ts tests/adapters-project-publish.test.ts
git commit -m "add project approval and completion gates"
```

> **Note:** A "shared changes.ts" task was originally
> planned here and removed during plan revision. The
> codebase uses per-adapter `createSubscriptionChannel`
> (see `adapters/projects.ts:14-28` for the pattern); each
> adapter task below (2.2, 2.5) creates its own channel
> inline.

### Task 2.11: Add per-objective derived methods to `ProjectView`

The `Project` class no longer owns `estimatedImpactScore()`
or `actualImpactScore()` — those were removed in commit
`d44eae1`. The derived shape belongs on `ProjectView`
(`adapters/projects.ts:54-153`), which already exposes
view-helper methods like `impactBaseline()` (line 144) and
`impactCurrent()` (line 149) — both currently delegating to
the deleted `Project` methods, so they will need to be
replaced too. `ProjectView` is the adapter-side view-helper
seam; the domain entity stays free of presentation
concerns.

The new methods take a `ProjectScoringSummary` shape from
`postProjectScoringRetrieval` (Task 2.6). Each method is a
tell-don't-ask — no nullable returns, throws on missing
preconditions.

**Files:**
- Modify: `web-app/app/adapters/projects.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/project-view-derived.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    Project,
    ProjectView,
} from '../web-app/app/adapters/projects.ts';
import type {
    Objective,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from '../api/types.ts';

function makeView(): ProjectView {
    return new ProjectView(new Project({
        id: 'p1', status: 'approved', title: 't',
        description: 'd', progress: 0,
        start_date: '2026-05-14T00:00:00.000Z',
        target_end_date: '2026-05-14T00:00:00.000Z',
        estimated_duration: 0, actual_duration: 0,
        estimated_cost: 0, actual_cost: 0,
        position: 0, business_context: '{}',
        timeline_label: 'q1',
    }));
}

const T1 = '2026-05-14T00:00:00.000Z';
const T2 = '2026-05-15T00:00:00.000Z';

const activeOne: Objective[] = [
    { id: 'o1', position: 0 },
];
const activeTwo: Objective[] = [
    { id: 'o1', position: 0 },
    { id: 'o2', position: 1 },
];
const baselineO1: ProjectObjectiveBaselineScore[] = [
    { project_id: 'p1', objective_id: 'o1',
      score: 50, scored_at: T1 },
];

test('isBaselineScored true when every active obj has row',
    () => {
        const v = makeView();
        assert.equal(
            v.isBaselineScored(activeOne, baselineO1),
            true,
        );
    });

test('isBaselineScored false when missing one', () => {
    const v = makeView();
    assert.equal(
        v.isBaselineScored(activeTwo, baselineO1),
        false,
    );
});

test('baselineTotal averages latest per pair', () => {
    const v = makeView();
    const score = v.baselineTotal([
        { project_id: 'p1', objective_id: 'o1',
          score: 50, scored_at: T1 },
        { project_id: 'p1', objective_id: 'o1',
          score: 60, scored_at: T2 },
        { project_id: 'p1', objective_id: 'o2',
          score: -20, scored_at: T1 },
    ]);
    assert.equal(score, 20); // (60 + -20) / 2
});

test('baselineTotal throws when no rows', () => {
    const v = makeView();
    assert.throws(() => v.baselineTotal([]));
});

test('actualTotal throws when not fully actual-scored',
    () => {
        const v = makeView();
        assert.throws(
            () => v.actualTotal(baselineO1, []),
        );
    });

test('actualTotal averages over baselined objectives',
    () => {
        const v = makeView();
        const score = v.actualTotal(
            baselineO1,
            [{
                project_id: 'p1', objective_id: 'o1',
                score: 40, scored_at: T2,
            }],
        );
        assert.equal(score, 40);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/project-view-derived.test.ts`

Expected: FAIL — the methods don't exist on `ProjectView`,
and `impactBaseline` / `impactCurrent` still delegate to
deleted `Project` methods so the existing file fails to
compile under `--strip-types` when those calls are
exercised.

- [ ] **Step 3: Update `ProjectView`**

In `web-app/app/adapters/projects.ts`:

1. Import the new row types at the top:

```ts
import type {
    Objective,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from '../../../api/types.ts';
```

2. Delete `impactBaseline()` and `impactCurrent()` (lines
   144-152) — the old delegators are gone; nothing else in
   the codebase calls them once Phase 3 / Task 3.9 strips
   them out of the presenters.

3. Add the four per-objective derived methods. The local
   `#latestPerPair` is private to this class because it
   operates on this project's score rows specifically; the
   shared portfolio-level `latestPerPair` lives in
   `scoring-format.ts` (Task 2.13).

```ts
// inside class ProjectView { ... }

isBaselineScored(
    activeObjectives: Objective[],
    baselineScores: ProjectObjectiveBaselineScore[],
): boolean {
    const scored = this.#objectiveSet(baselineScores);
    return activeObjectives.every(
        o => scored.has(o.id),
    );
}

isActualScored(
    baselineScores: ProjectObjectiveBaselineScore[],
    actualScores: ProjectObjectiveActualScore[],
): boolean {
    const baselined =
        this.#objectiveSet(baselineScores);
    const actualed =
        this.#objectiveSet(actualScores);
    for (const id of baselined) {
        if (!actualed.has(id)) return false;
    }
    return true;
}

baselineTotal(
    baselineScores: ProjectObjectiveBaselineScore[],
): number {
    const latest = this.#latestPerObjective(
        baselineScores,
    );
    if (latest.length === 0) {
        throw new Error(
            'project '
            + this.#project.idForLink()
            + ' has no baseline scores',
        );
    }
    const sum = latest.reduce(
        (acc, r) => acc + r.score, 0,
    );
    return Math.round(sum / latest.length);
}

actualTotal(
    baselineScores: ProjectObjectiveBaselineScore[],
    actualScores: ProjectObjectiveActualScore[],
): number {
    if (
        !this.isActualScored(
            baselineScores, actualScores,
        )
    ) {
        throw new Error(
            'project '
            + this.#project.idForLink()
            + ' not fully actual-scored',
        );
    }
    const baselined = this.#latestPerObjective(
        baselineScores,
    );
    const actualMap = new Map(
        this.#latestPerObjective(actualScores)
            .map(r => [r.objective_id, r.score]),
    );
    const xs = baselined
        .map(b => actualMap.get(b.objective_id))
        .filter(
            (x): x is number => typeof x === 'number',
        );
    const sum = xs.reduce((a, b) => a + b, 0);
    return Math.round(sum / xs.length);
}

#latestPerObjective<T extends {
    objective_id: string;
    scored_at: string;
}>(rows: T[]): T[] {
    const map = new Map<string, T>();
    for (const r of rows) {
        const prev = map.get(r.objective_id);
        if (!prev || r.scored_at > prev.scored_at) {
            map.set(r.objective_id, r);
        }
    }
    return Array.from(map.values());
}

#objectiveSet(
    rows: Array<{ objective_id: string }>,
): Set<string> {
    return new Set(
        this.#latestPerObjective(
            rows as { objective_id: string;
                scored_at: string }[],
        ).map(r => r.objective_id),
    );
}
```

(The `#latestPerObjective` private helper exists because
`ProjectView` operates on this project's rows; the
portfolio-wide `latestPerPair` lives in `scoring-format.ts`
per Task 2.13. Two scopes, two helpers — Uniformity within
each, no false unification.)

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/project-view-derived.test.ts`

Expected: PASS — all six test cases pass.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/adapters/projects.ts \
    tests/project-view-derived.test.ts
git commit -m "add per-objective derived methods to ProjectView"
```

### Task 2.12: Remove old Impact gauge from dashboard adapter

**Files:**
- Modify: `web-app/app/adapters/dashboard.ts`

- [ ] **Step 1: Locate the impact gauge entry**

Read `web-app/app/adapters/dashboard.ts`. Find the section
that defines the third gauge entry (the one with theme
`'amber'` per the exploration findings).

- [ ] **Step 2: Write the failing test**

Update or create `tests/adapter-dashboard.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import { getDashboardGauges } from
    '../web-app/app/adapters/dashboard.ts';

test('getDashboardGauges returns exactly two gauges', async () => {
    const db = new MemoryDbAdapter();
    const ctx = createRequestContext(db);
    const gauges = await getDashboardGauges(ctx);
    assert.equal(gauges.length, 2);
    const titles = gauges.map(g => g.title.toLowerCase());
    assert.ok(titles.some(t => t.includes('time')));
    assert.ok(titles.some(t => t.includes('cost')));
    assert.ok(
        !titles.some(t => t.includes('impact')),
        'old impact gauge still present',
    );
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:
`node --test --strip-types tests/adapter-dashboard.test.ts`

Expected: FAIL — three gauges still returned, including
"Impact."

- [ ] **Step 4: Remove the impact gauge entry**

Delete the entry from `getDashboardGauges` (the one that
builds an impact gauge from
`sumEstimatedImpact` / `sumActualImpact`). Also remove any
imports it pulls that are now unused.

- [ ] **Step 5: Run test to verify it passes**

Run:
`node --test --strip-types tests/adapter-dashboard.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web-app/app/adapters/dashboard.ts tests/adapter-dashboard.test.ts
git commit -m "remove old impact gauge from dashboard adapter"
```

### Task 2.13: Extract shared scoring-format helpers

The pure helpers `latestPerPair`, `formatSigned`, and
`toneForScore` appear inline in 5-7 presenter/adapter
sites (verified by audit). Commandment IX threshold:
three is pattern; below three duplicate without shame;
at three the abstraction begins to speak. Extract before
Phase 3, so each presenter imports one shared helper
rather than copy-pasting an inline definition.

**Files:**
- Create: `web-app/app/scoring-format.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/scoring-format.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    latestPerPair,
    formatSigned,
    toneForScore,
} from '../web-app/app/scoring-format.ts';

test('latestPerPair keeps the latest by scored_at',
    () => {
        const rows = [
            { project_id: 'p1', objective_id: 'o1',
              score: 50,
              scored_at: '2026-05-14T00:00:00.000Z' },
            { project_id: 'p1', objective_id: 'o1',
              score: 60,
              scored_at: '2026-05-15T00:00:00.000Z' },
            { project_id: 'p1', objective_id: 'o2',
              score: -20,
              scored_at: '2026-05-14T00:00:00.000Z' },
            { project_id: 'p2', objective_id: 'o1',
              score: 10,
              scored_at: '2026-05-14T00:00:00.000Z' },
        ];
        const latest = latestPerPair(rows);
        assert.equal(latest.length, 3);
        const byKey = new Map(
            latest.map(r =>
                [r.project_id + ':'
                    + r.objective_id, r.score]),
        );
        assert.equal(byKey.get('p1:o1'), 60);
        assert.equal(byKey.get('p1:o2'), -20);
        assert.equal(byKey.get('p2:o1'), 10);
    });

test('formatSigned emits + for positive', () => {
    assert.equal(formatSigned(42), '+42');
});

test('formatSigned emits − for negative (U+2212)', () => {
    assert.equal(formatSigned(-10), '−10');
});

test('formatSigned emits 0 for zero', () => {
    assert.equal(formatSigned(0), '0');
});

test('toneForScore positive/negative/neutral', () => {
    assert.equal(toneForScore(1), 'positive');
    assert.equal(toneForScore(-1), 'negative');
    assert.equal(toneForScore(0), 'neutral');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --strip-types tests/scoring-format.test.ts`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `web-app/app/scoring-format.ts`**

```ts
// Shared, pure helpers used by adapters and presenters
// that need to dedupe score-event rows or format scores.

export type Tone = 'positive' | 'negative' | 'neutral';

export function latestPerPair<T extends {
    project_id: string;
    objective_id: string;
    scored_at: string;
}>(rows: readonly T[]): T[] {
    const map = new Map<string, T>();
    for (const r of rows) {
        const key =
            `${r.project_id}:${r.objective_id}`;
        const prev = map.get(key);
        if (!prev || r.scored_at > prev.scored_at) {
            map.set(key, r);
        }
    }
    return Array.from(map.values());
}

// U+2212 (true minus) for negative values; '+' for
// positive; '0' for zero. Avoids the ASCII hyphen so
// the rendered score reads as a typographic numeral,
// not an inline subtraction.
export function formatSigned(score: number): string {
    if (score > 0) return `+${score}`;
    if (score < 0) return `−${Math.abs(score)}`;
    return '0';
}

export function toneForScore(score: number): Tone {
    if (score > 0) return 'positive';
    if (score < 0) return 'negative';
    return 'neutral';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --strip-types tests/scoring-format.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/scoring-format.ts \
    tests/scoring-format.test.ts
git commit -m "extract shared scoring-format helpers"
```

Subsequent Phase 3 tasks (3.4, 3.5, 3.7, 3.8) and the
Phase 2 aggregate task (2.7) import these three helpers
instead of redefining them inline. Each task's "Step 3:
Create the presenter" code block uses:

```ts
import {
    latestPerPair,
    formatSigned,
    toneForScore,
} from '../scoring-format.ts';
```

(or `'../../scoring-format.ts'` from `adapters/`).

---

## Phase 3 — Presenters (part 1: Org box + action bar + modals)

Presenters are immutable view objects. Constructor takes the
full data shape; public methods return `SafeHtml`. Never
touch the DOM; never fetch. Read existing presenters
(`presenters/idea.ts`, `presenters/project-detail.ts`,
`presenters/workbox-detail.ts`) for the codebase voice
before starting.

### Task 3.1: `OrganizationObjectivesPresenter`

**Files:**
- Create: `web-app/app/presenters/organization-objectives.ts`

- [ ] **Step 1: Write the failing test**

Create
`tests/presenter-organization-objectives.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { OrganizationObjectivesPresenter } from
    '../web-app/app/presenters/organization-objectives.ts';

const activeObjs = [
    { id: 'o1', position: 0 },
    { id: 'o2', position: 1 },
];
const deprecatedObjs = [
    { id: 'o3', position: 99 },
];
const defs = new Map([
    ['o1', { name: 'Revenue Growth', description: 'd1' }],
    ['o2', { name: 'Cost Reduction', description: 'd2' }],
    ['o3', { name: 'Old Quarterly', description: 'd3' }],
]);
const deprecatedAt = new Map([
    ['o3', '2026-03-15T00:00:00.000Z'],
]);

test('renders active section with each active objective',
    () => {
        const p = new OrganizationObjectivesPresenter(
            activeObjs, deprecatedObjs, defs, deprecatedAt,
        );
        const html = p.buildBox().toString();
        assert.ok(html.includes('Revenue Growth'));
        assert.ok(html.includes('Cost Reduction'));
        assert.ok(html.includes('data-objective-id="o1"'));
        assert.ok(html.includes('data-objective-id="o2"'));
    });

test('renders deprecated section under active', () => {
    const p = new OrganizationObjectivesPresenter(
        activeObjs, deprecatedObjs, defs, deprecatedAt,
    );
    const html = p.buildBox().toString();
    assert.ok(html.includes('Old Quarterly'));
    assert.ok(html.includes('Deprecated'));
});

test('renders add-objective affordance', () => {
    const p = new OrganizationObjectivesPresenter(
        activeObjs, deprecatedObjs, defs, deprecatedAt,
    );
    const html = p.buildBox().toString();
    assert.ok(html.includes('data-action="add-objective"'));
});

test('empty state when no objectives', () => {
    const p = new OrganizationObjectivesPresenter(
        [], [], new Map(), new Map(),
    );
    const html = p.buildBox().toString();
    assert.ok(html.toLowerCase().includes('no objectives'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/presenter-organization-objectives.test.ts`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the presenter**

```ts
// web-app/app/presenters/organization-objectives.ts

import { html, SafeHtml } from '../safe-html.ts';
import type {
    Objective,
    ObjectiveId,
} from '../../../api/types.ts';
import { iconPencil, iconTrash, iconPlus }
    from '../icons.ts';

interface Definition {
    name: string;
    description: string;
}

export class OrganizationObjectivesPresenter {
    constructor(
        private readonly active: Objective[],
        private readonly deprecated: Objective[],
        private readonly defs: Map<ObjectiveId, Definition>,
        private readonly deprecatedAt:
            Map<ObjectiveId, string>,
    ) {}

    buildBox(): SafeHtml {
        return html`
            <section class="org-objectives-box">
                ${this.#buildHeader()}
                ${this.#buildActiveList()}
                ${this.#buildDeprecatedList()}
            </section>
        `;
    }

    #buildHeader(): SafeHtml {
        return html`
            <header class="org-objectives-header">
                <h3>Objectives</h3>
                <button
                    type="button"
                    data-action="add-objective"
                    class="btn btn-primary">
                    ${iconPlus(16, '')} Add objective
                </button>
            </header>
        `;
    }

    #buildActiveList(): SafeHtml {
        if (this.active.length === 0
            && this.deprecated.length === 0) {
            return html`
                <p class="empty-state">
                    No objectives yet. Add one to get started.
                </p>
            `;
        }
        return html`
            <ul class="objective-list">
                ${this.active.map(o => this.#row(o, false))}
            </ul>
        `;
    }

    #buildDeprecatedList(): SafeHtml {
        if (this.deprecated.length === 0) return html``;
        return html`
            <h4 class="objective-list-divider">
                Deprecated
            </h4>
            <ul class="objective-list">
                ${this.deprecated.map(
                    o => this.#row(o, true),
                )}
            </ul>
        `;
    }

    #row(o: Objective, isDeprecated: boolean): SafeHtml {
        const def = this.defs.get(o.id);
        if (!def) {
            throw new Error(
                `objective definition missing for ${o.id}`,
            );
        }
        const date = this.deprecatedAt.get(o.id);
        return html`
            <li class="objective-list-item"
                data-objective-id="${o.id}"
                data-deprecated="${isDeprecated}">
                <span class="drag-handle"
                    aria-label="Drag to reorder">⋮⋮</span>
                <div class="objective-text">
                    <strong>${def.name}</strong>
                    <span class="objective-desc">
                        ${def.description}
                    </span>
                    ${isDeprecated && date
                        ? html`<span class="meta">
                            Deprecated ${date.slice(0, 10)}
                          </span>`
                        : html``}
                </div>
                <div class="objective-actions">
                    ${isDeprecated
                        ? html`<button
                            data-action="reactivate"
                            data-objective-id="${o.id}">
                            Reactivate
                          </button>`
                        : html`
                            <button
                                data-action="edit"
                                data-objective-id="${o.id}">
                                ${iconPencil(14, '')} Edit
                            </button>
                            <button
                                data-action="deprecate"
                                data-objective-id="${o.id}">
                                ${iconTrash(14, '')}
                                Deprecate
                            </button>
                        `}
                </div>
            </li>
        `;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/presenter-organization-objectives.test.ts`

Expected: PASS — all four test cases pass.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/presenters/organization-objectives.ts tests/presenter-organization-objectives.test.ts
git commit -m "add OrganizationObjectivesPresenter"
```

### Task 3.2: `ProjectActionBarPresenter`

**Files:**
- Create: `web-app/app/presenters/project-action-bar.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/presenter-project-action-bar.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ProjectActionBarPresenter } from
    '../web-app/app/presenters/project-action-bar.ts';

const baseProject = {
    id: 'p1', status: 'under-review', title: 't',
    description: 'd', progress: 0,
    start_date: '2026-05-14T00:00:00.000Z',
    target_end_date: '2026-05-14T00:00:00.000Z',
    estimated_duration: 0, actual_duration: 0,
    estimated_cost: 0, actual_cost: 0,
    position: 0, business_context: {},
    timeline_label: 'q1',
};

Presenters take fully-shaped data and emit `SafeHtml` —
they never compute via adapter calls. The page module
(Task 5.2) runs `validateProjectForApproval` /
`validateProjectForCompletion` and passes the
`{ ready, problems }` results to the constructor.

```ts
const approvalCheck = validateProjectForApproval(
    project, active, scoring.baseline,
);
const completionCheck = validateProjectForCompletion(
    project, scoring.baseline, scoring.actual,
);
const bar = new ProjectActionBarPresenter(
    project, approvalCheck, completionCheck,
);
```

```ts
test('under-review with no scores: Approve disabled',
    () => {
        const p = new ProjectActionBarPresenter(
            baseProject,
            {
                ready: false,
                problems: [
                    { kind: 'baseline_unscored',
                      objectiveId: 'o1' },
                ],
            },
            { ready: true, problems: [] },
        );
        const html = p.buildBar().toString();
        assert.ok(html.includes('data-action="score"'));
        assert.ok(
            html.includes(
                'data-action="approve" disabled',
            ),
        );
    });

test('under-review with full scoring: Approve enabled',
    () => {
        const p = new ProjectActionBarPresenter(
            baseProject,
            { ready: true, problems: [] },
            { ready: true, problems: [] },
        );
        const html = p.buildBar().toString();
        const approveDisabled = html.includes(
            'data-action="approve" disabled',
        );
        assert.equal(approveDisabled, false);
    });

test('approved project: Log measurement + Complete shown',
    () => {
        const p = new ProjectActionBarPresenter(
            { ...baseProject, status: 'approved' },
            { ready: true, problems: [] },
            {
                ready: false,
                problems: [
                    { kind: 'actual_unscored',
                      objectiveId: 'o1' },
                ],
            },
        );
        const html = p.buildBar().toString();
        assert.ok(html.includes(
            'data-action="log-measurement"',
        ));
        assert.ok(html.includes(
            'data-action="complete"',
        ));
    });

test('approved with full actuals: Complete enabled',
    () => {
        const p = new ProjectActionBarPresenter(
            { ...baseProject, status: 'approved' },
            { ready: true, problems: [] },
            { ready: true, problems: [] },
        );
        const html = p.buildBar().toString();
        const completeDisabled = html.includes(
            'data-action="complete" disabled',
        );
        assert.equal(completeDisabled, false);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/presenter-project-action-bar.test.ts`

Expected: FAIL.

- [ ] **Step 3: Create the presenter**

```ts
// web-app/app/presenters/project-action-bar.ts

import { html, SafeHtml } from '../safe-html.ts';
import type {
    ProjectEntity,
} from '../../../api/types.ts';
import type {
    ProjectProblem,
} from '../adapters/project-publish.ts';
import type {
    ValidationResult,
} from '../adapters/validation.ts';

type Check = ValidationResult<ProjectProblem>;

export class ProjectActionBarPresenter {
    constructor(
        private readonly project: ProjectEntity,
        private readonly approvalCheck: Check,
        private readonly completionCheck: Check,
    ) {}

    buildBar(): SafeHtml {
        const status = this.project.status;
        const isReview = status === 'submitted'
            || status === 'under-review'
            || status === 'sent-back';

        return html`
            <div class="action-bar"
                data-project-id="${this.project.id}">
                ${isReview
                    ? this.#reviewActions()
                    : html``}
                ${status === 'approved'
                    ? this.#approvedActions()
                    : html``}
                ${status === 'approved'
                    || status === 'completed'
                    ? html`<button
                        data-action="view-history">
                        View history
                      </button>`
                    : html``}
            </div>
        `;
    }

    #reviewActions(): SafeHtml {
        const check = this.approvalCheck;
        const tooltip = check.ready
            ? ''
            : `${check.problems.length}`
                + ' objectives unscored';
        return html`
            <button data-action="score">
                Score
            </button>
            <button data-action="approve"
                ${check.ready ? '' : 'disabled'}
                title="${tooltip}">
                Approve
            </button>
            <button data-action="decline">Decline</button>
            <button data-action="send-back">Send back</button>
        `;
    }

    #approvedActions(): SafeHtml {
        const check = this.completionCheck;
        const tooltip = check.ready
            ? ''
            : `${check.problems.length}`
                + ' objectives lack actual measurements';
        return html`
            <button data-action="log-measurement">
                Log measurement
            </button>
            <button data-action="complete"
                ${check.ready ? '' : 'disabled'}
                title="${tooltip}">
                Complete
            </button>
        `;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/presenter-project-action-bar.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/presenters/project-action-bar.ts tests/presenter-project-action-bar.test.ts
git commit -m "add ProjectActionBarPresenter"
```

### Task 3.3: `ScoreModalPresenter`

**Files:**
- Create: `web-app/app/presenters/score-modal.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/presenter-score-modal.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ScoreModalPresenter } from
    '../web-app/app/presenters/score-modal.ts';

const project = {
    id: 'p1', status: 'under-review', title: 'Q1',
    description: 'd', progress: 0,
    start_date: '2026-05-14T00:00:00.000Z',
    target_end_date: '2026-05-14T00:00:00.000Z',
    estimated_duration: 0, actual_duration: 0,
    estimated_cost: 0, actual_cost: 0,
    position: 0, business_context: {},
    timeline_label: 'q1',
};

const activeObjs = [
    { id: 'o1', position: 0 },
    { id: 'o2', position: 1 },
];
const defs = new Map([
    ['o1', { name: 'Revenue', description: 'd1' }],
    ['o2', { name: 'Cost', description: 'd2' }],
]);

test('renders one slider per objective', () => {
    const p = new ScoreModalPresenter(
        project, activeObjs, defs, [],
    );
    const html = p.buildBody().toString();
    const sliderCount = (
        html.match(/type="range"/g) || []
    ).length;
    assert.equal(sliderCount, 2);
});

test('slider pre-fills from latest baseline', () => {
    const p = new ScoreModalPresenter(
        project, activeObjs, defs,
        [{ project_id: 'p1', objective_id: 'o1',
           score: 50,
           scored_at: '2026-05-14T00:00:00.000Z' }],
    );
    const html = p.buildBody().toString();
    assert.ok(html.includes(
        'data-objective-id="o1"'
    ));
    assert.ok(html.includes('value="50"'));
});

test('unset slider gets Score required hint', () => {
    const p = new ScoreModalPresenter(
        project, activeObjs, defs, [],
    );
    const html = p.buildBody().toString();
    assert.ok(html.toLowerCase()
        .includes('score required'));
});

test('slider range is [-100, +100] step 1', () => {
    const p = new ScoreModalPresenter(
        project, activeObjs, defs, [],
    );
    const html = p.buildBody().toString();
    assert.ok(html.includes('min="-100"'));
    assert.ok(html.includes('max="100"'));
    assert.ok(html.includes('step="1"'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/presenter-score-modal.test.ts`

Expected: FAIL.

- [ ] **Step 3: Create the presenter**

```ts
// web-app/app/presenters/score-modal.ts

import { html, SafeHtml } from '../safe-html.ts';
import type {
    ProjectEntity,
    Objective,
    ObjectiveId,
    ProjectObjectiveBaselineScore,
} from '../../../api/types.ts';

interface Definition {
    name: string;
    description: string;
}

export class ScoreModalPresenter {
    constructor(
        private readonly project: ProjectEntity,
        private readonly activeObjectives: Objective[],
        private readonly defs: Map<ObjectiveId, Definition>,
        private readonly latestBaselines:
            ProjectObjectiveBaselineScore[],
    ) {}

    buildBody(): SafeHtml {
        const baselineMap = this.#latestBaselineMap();
        return html`
            <div class="score-modal-body">
                <h3>Score baselines: ${this.project.title}</h3>
                <p class="modal-subtitle">
                    Drag each slider to score this project
                    against the objective. Range: −100 to +100.
                </p>
                ${this.activeObjectives.map(o =>
                    this.#sliderRow(o, baselineMap.get(o.id)))
                }
                <div class="modal-actions">
                    <button data-action="cancel">Cancel</button>
                    <button data-action="save-baselines"
                        class="btn-primary">
                        Save baselines
                    </button>
                </div>
            </div>
        `;
    }

    #latestBaselineMap(): Map<ObjectiveId, number> {
        const map = new Map<ObjectiveId,
            { score: number; scored_at: string }>();
        for (const b of this.latestBaselines) {
            const prev = map.get(b.objective_id);
            if (!prev || b.scored_at > prev.scored_at) {
                map.set(b.objective_id, b);
            }
        }
        const scores = new Map<ObjectiveId, number>();
        for (const [k, v] of map) scores.set(k, v.score);
        return scores;
    }

    #sliderRow(
        obj: Objective,
        preFill: number | undefined,
    ): SafeHtml {
        const def = this.defs.get(obj.id);
        if (!def) {
            throw new Error(
                `objective definition missing for ${obj.id}`,
            );
        }
        const isUnset = preFill === undefined;
        const value = preFill ?? 0;
        return html`
            <div class="score-slider-row"
                data-objective-id="${obj.id}"
                data-unset="${isUnset}"
                data-initial-value="${value}">
                <label class="score-slider-label">
                    <strong>${def.name}</strong>
                    <span class="score-slider-desc">
                        ${def.description}
                    </span>
                </label>
                <input type="range" min="-100" max="100"
                    step="1" value="${value}"
                    data-objective-id="${obj.id}"
                    class="score-slider${
                        isUnset ? ' unset' : ''
                    }">
                <span class="score-value">
                    ${isUnset ? '—' : value}
                </span>
                ${isUnset
                    ? html`<span class="score-hint">
                        Score required
                      </span>`
                    : html``}
            </div>
        `;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/presenter-score-modal.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/presenters/score-modal.ts tests/presenter-score-modal.test.ts
git commit -m "add ScoreModalPresenter"
```

### Task 3.4: `MeasurementModalPresenter`

**Files:**
- Create: `web-app/app/presenters/measurement-modal.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/presenter-measurement-modal.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MeasurementModalPresenter } from
    '../web-app/app/presenters/measurement-modal.ts';

const project = {
    id: 'p1', status: 'approved', title: 'Q1',
    description: 'd', progress: 0,
    start_date: '2026-05-14T00:00:00.000Z',
    target_end_date: '2026-05-14T00:00:00.000Z',
    estimated_duration: 0, actual_duration: 0,
    estimated_cost: 0, actual_cost: 0,
    position: 0, business_context: {},
    timeline_label: 'q1',
};

const defs = new Map([
    ['o1', { name: 'Revenue', description: 'd1' }],
]);

test('renders one slider per baseline-scored objective',
    () => {
        const p = new MeasurementModalPresenter(
            project, defs,
            [{ project_id: 'p1', objective_id: 'o1',
               score: 50,
               scored_at: '2026-05-14T00:00:00.000Z' }],
            [],
        );
        const html = p.buildBody().toString();
        const n = (html.match(/type="range"/g) || []).length;
        assert.equal(n, 1);
    });

test('pre-fills with latest actual when present', () => {
    const p = new MeasurementModalPresenter(
        project, defs,
        [{ project_id: 'p1', objective_id: 'o1',
           score: 50,
           scored_at: '2026-05-14T00:00:00.000Z' }],
        [{ project_id: 'p1', objective_id: 'o1',
           score: 35,
           scored_at: '2026-05-15T00:00:00.000Z' }],
    );
    const html = p.buildBody().toString();
    assert.ok(html.includes('value="35"'));
});

test('pre-fills with baseline when no actuals yet', () => {
    const p = new MeasurementModalPresenter(
        project, defs,
        [{ project_id: 'p1', objective_id: 'o1',
           score: 50,
           scored_at: '2026-05-14T00:00:00.000Z' }],
        [],
    );
    const html = p.buildBody().toString();
    assert.ok(html.includes('value="50"'));
});

test('caption shows baseline reference', () => {
    const p = new MeasurementModalPresenter(
        project, defs,
        [{ project_id: 'p1', objective_id: 'o1',
           score: 50,
           scored_at: '2026-05-14T00:00:00.000Z' }],
        [],
    );
    const html = p.buildBody().toString();
    assert.ok(html.includes('Baseline'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/presenter-measurement-modal.test.ts`

Expected: FAIL.

- [ ] **Step 3: Create the presenter**

```ts
// web-app/app/presenters/measurement-modal.ts

import { html, SafeHtml } from '../safe-html.ts';
import type {
    ProjectEntity,
    ObjectiveId,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from '../../../api/types.ts';

interface Definition {
    name: string;
    description: string;
}

interface RowData {
    objectiveId: ObjectiveId;
    name: string;
    description: string;
    baselineScore: number;
    latestActualScore: number | undefined;
    latestActualAt: string | undefined;
    preFillValue: number;
}

export class MeasurementModalPresenter {
    constructor(
        private readonly project: ProjectEntity,
        private readonly defs: Map<ObjectiveId, Definition>,
        private readonly latestBaselines:
            ProjectObjectiveBaselineScore[],
        private readonly latestActuals:
            ProjectObjectiveActualScore[],
    ) {}

    buildBody(): SafeHtml {
        const rows = this.#buildRows();
        return html`
            <div class="measurement-modal-body">
                <h3>Log measurement: ${this.project.title}</h3>
                <p class="modal-subtitle">
                    Record current actual scores. Untouched
                    sliders are not recorded.
                </p>
                ${rows.map(r => this.#row(r))}
                <div class="modal-actions">
                    <button data-action="cancel">Cancel</button>
                    <button data-action="save-measurement"
                        class="btn-primary">
                        Save measurement
                    </button>
                </div>
            </div>
        `;
    }

    #buildRows(): RowData[] {
        const latestBaselineMap =
            this.#latestPerPair(this.latestBaselines);
        const latestActualMap =
            this.#latestPerPair(this.latestActuals);
        const rows: RowData[] = [];
        for (const [objId, b] of latestBaselineMap) {
            const a = latestActualMap.get(objId);
            const def = this.defs.get(objId);
            if (!def) {
                throw new Error(
                    `objective definition missing for ${objId}`,
                );
            }
            rows.push({
                objectiveId: objId,
                name: def.name,
                description: def.description,
                baselineScore: b.score,
                latestActualScore:
                    a ? a.score : undefined,
                latestActualAt:
                    a ? a.scored_at : undefined,
                preFillValue:
                    a ? a.score : b.score,
            });
        }
        return rows;
    }

    #latestPerPair<T extends { objective_id: ObjectiveId;
        score: number; scored_at: string }>(
        rows: T[],
    ): Map<ObjectiveId, T> {
        const map = new Map<ObjectiveId, T>();
        for (const r of rows) {
            const prev = map.get(r.objective_id);
            if (!prev || r.scored_at > prev.scored_at) {
                map.set(r.objective_id, r);
            }
        }
        return map;
    }

    #row(r: RowData): SafeHtml {
        const actualText = r.latestActualScore !== undefined
            ? r.latestActualScore + ' ('
                + (r.latestActualAt
                    ? r.latestActualAt.slice(0, 10)
                    : '')
                + ')'
            : 'none yet';
        return html`
            <div class="measurement-slider-row"
                data-objective-id="${r.objectiveId}"
                data-initial-value="${r.preFillValue}">
                <label>
                    <strong>${r.name}</strong>
                    <span class="meta">${r.description}</span>
                </label>
                <input type="range" min="-100" max="100"
                    step="1" value="${r.preFillValue}"
                    data-objective-id="${r.objectiveId}">
                <span class="measurement-value">
                    ${r.preFillValue}
                </span>
                <small class="measurement-caption">
                    Baseline: ${r.baselineScore} ·
                    Last actual: ${actualText}
                </small>
            </div>
        `;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/presenter-measurement-modal.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/presenters/measurement-modal.ts tests/presenter-measurement-modal.test.ts
git commit -m "add MeasurementModalPresenter"
```

---

## Phase 3 — Presenters (part 2: project view + history + dashboard cards)

### Task 3.5: `ProjectObjectivesPresenter`

**Files:**
- Create: `web-app/app/presenters/project-objectives.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/presenter-project-objectives.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ProjectObjectivesPresenter } from
    '../web-app/app/presenters/project-objectives.ts';

const activeObjs = [
    { id: 'o1', position: 0 },
    { id: 'o2', position: 1 },
];
const defs = new Map([
    ['o1', { name: 'Revenue', description: 'd1' }],
    ['o2', { name: 'Cost', description: 'd2' }],
]);

test('renders one row per baseline-scored objective', () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ project_id: 'p1', objective_id: 'o1',
           score: 50,
           scored_at: '2026-05-14T00:00:00.000Z' }],
        [],
    );
    const html = p.buildSection().toString();
    assert.ok(html.includes('Revenue'));
    assert.ok(html.includes('+50'));
});

test('shows "no measurements yet" when no actuals', () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ project_id: 'p1', objective_id: 'o1',
           score: 50,
           scored_at: '2026-05-14T00:00:00.000Z' }],
        [],
    );
    const html = p.buildSection().toString();
    assert.ok(html.toLowerCase()
        .includes('no measurements yet'));
});

test('shows latest actual with sign', () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ project_id: 'p1', objective_id: 'o1',
           score: 50,
           scored_at: '2026-05-14T00:00:00.000Z' }],
        [{ project_id: 'p1', objective_id: 'o1',
           score: -10,
           scored_at: '2026-05-15T00:00:00.000Z' }],
    );
    const html = p.buildSection().toString();
    assert.ok(html.includes('−10') || html.includes('-10'));
});

test('renders View history button', () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ project_id: 'p1', objective_id: 'o1',
           score: 50,
           scored_at: '2026-05-14T00:00:00.000Z' }],
        [],
    );
    const html = p.buildSection().toString();
    assert.ok(html.includes(
        'data-action="view-history"',
    ));
});

test('empty section when no baselines scored', () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs, [], [],
    );
    const html = p.buildSection().toString();
    assert.ok(html.toLowerCase()
        .includes('not yet scored'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/presenter-project-objectives.test.ts`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the presenter**

```ts
// web-app/app/presenters/project-objectives.ts

import { html, SafeHtml } from '../safe-html.ts';
import type {
    Objective,
    ObjectiveId,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from '../../../api/types.ts';
import {
    latestPerPair,
    formatSigned,
    toneForScore,
} from '../scoring-format.ts';

interface Definition {
    name: string;
    description: string;
}

function indexByObjective<T extends {
    objective_id: ObjectiveId;
    project_id: string;
    scored_at: string;
}>(rows: readonly T[]): Map<ObjectiveId, T> {
    const map = new Map<ObjectiveId, T>();
    for (const r of latestPerPair(rows)) {
        map.set(r.objective_id, r);
    }
    return map;
}

export class ProjectObjectivesPresenter {
    constructor(
        private readonly activeObjectives: Objective[],
        private readonly defs: Map<ObjectiveId, Definition>,
        private readonly latestBaselines:
            ProjectObjectiveBaselineScore[],
        private readonly latestActuals:
            ProjectObjectiveActualScore[],
    ) {}

    buildSection(): SafeHtml {
        const baseMap = indexByObjective(this.latestBaselines);
        const actualMap = indexByObjective(this.latestActuals);

        if (baseMap.size === 0) {
            return html`
                <section class="project-objectives-section">
                    <header>
                        <h3>Objectives</h3>
                    </header>
                    <p class="empty-state">
                        Project not yet scored.
                    </p>
                </section>
            `;
        }

        return html`
            <section class="project-objectives-section">
                <header>
                    <h3>Objectives</h3>
                    <button data-action="view-history">
                        View history
                    </button>
                </header>
                <ul class="project-objectives-list">
                    ${this.activeObjectives.map(o => {
                        const b = baseMap.get(o.id);
                        if (!b) return html``;
                        return this.#row(
                            o, b.score,
                            actualMap.get(o.id),
                        );
                    })}
                </ul>
            </section>
        `;
    }

    #row(
        obj: Objective,
        baselineScore: number,
        actual: ProjectObjectiveActualScore | undefined,
    ): SafeHtml {
        const def = this.defs.get(obj.id);
        if (!def) {
            throw new Error(
                `objective definition missing for ${obj.id}`,
            );
        }
        // CSS custom properties carry numeric data only.
        // When --actual is absent, omit the property and
        // let CSS's [data-has-actual='false'] selector
        // handle the missing-value case — never inject
        // 'none' (an English word) into a numeric var.
        const hasActual = actual !== undefined;
        const barStyle = hasActual
            ? `--baseline:${baselineScore};`
                + `--actual:${actual.score}`
            : `--baseline:${baselineScore}`;
        return html`
            <li class="score-row"
                data-objective-id="${obj.id}">
                <span class="score-row-label">${def.name}</span>
                <span class="bipolar-bar"
                    data-tone="${toneForScore(baselineScore)}"
                    data-has-actual="${hasActual}"
                    style="${barStyle}">
                </span>
                <strong class="score-row-baseline"
                    data-tone="${toneForScore(baselineScore)}">
                    ${formatSigned(baselineScore)}
                </strong>
                <strong class="score-row-actual"
                    data-tone="${actual
                        ? toneForScore(actual.score)
                        : 'neutral'}">
                    ${actual
                        ? formatSigned(actual.score)
                        : 'no measurements yet'}
                </strong>
            </li>
        `;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/presenter-project-objectives.test.ts`

Expected: PASS — all five test cases pass.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/presenters/project-objectives.ts tests/presenter-project-objectives.test.ts
git commit -m "add ProjectObjectivesPresenter"
```

### Task 3.6: `ProjectScoreHistoryPresenter`

**Files:**
- Create: `web-app/app/presenters/project-score-history.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/presenter-project-score-history.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ProjectScoreHistoryPresenter } from
    '../web-app/app/presenters/project-score-history.ts';

const baselines = [
    { project_id: 'p1', objective_id: 'o1',
      score: 50, scored_at: '2026-03-01T14:23:00.000Z' },
    { project_id: 'p1', objective_id: 'o1',
      score: 40, scored_at: '2026-03-05T09:10:00.000Z' },
];
const actuals = [
    { project_id: 'p1', objective_id: 'o1',
      score: 45, scored_at: '2026-04-01T16:45:00.000Z' },
];
const revisions = [
    { objective_id: 'o1', name: 'Increase Revenue',
      description: 'd1',
      revised_at: '2026-02-01T00:00:00.000Z' },
    { objective_id: 'o1', name: 'Drive Growth',
      description: 'd2',
      revised_at: '2026-03-18T11:02:00.000Z' },
];
const deprecations = [];

function resolver(objId: string, atTime: string) {
    const eligible = revisions
        .filter(r => r.revised_at <= atTime);
    if (eligible.length === 0) return undefined;
    eligible.sort((a, b) =>
        b.revised_at.localeCompare(a.revised_at));
    return {
        name: eligible[0].name,
        description: eligible[0].description,
    };
}

test('merges all four streams chronologically', () => {
    const p = new ProjectScoreHistoryPresenter(
        baselines, actuals, revisions, deprecations,
        resolver,
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
        assert.ok(positions[i] > positions[i - 1],
            'events out of order at index ' + i);
    }
});

test('resolves historical objective name at each event',
    () => {
        const p = new ProjectScoreHistoryPresenter(
            baselines, actuals, revisions, deprecations,
            resolver,
        );
        const html = p.buildBody().toString();
        const marchOnePos = html.indexOf('2026-03-01');
        const aprilOnePos = html.indexOf('2026-04-01');
        const incrRevPos = html.indexOf('Increase Revenue');
        const driveGrowthPos = html.indexOf('Drive Growth');
        assert.ok(incrRevPos > marchOnePos
            && incrRevPos < aprilOnePos,
            'March score should render under "Increase Revenue"');
        assert.ok(driveGrowthPos > aprilOnePos,
            'April score should render under "Drive Growth"');
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/presenter-project-score-history.test.ts`

Expected: FAIL.

- [ ] **Step 3: Create the presenter**

```ts
// web-app/app/presenters/project-score-history.ts

import { html, SafeHtml } from '../safe-html.ts';
import type {
    ObjectiveId,
    ObjectiveRevision,
    DeprecatedObjective,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from '../../../api/types.ts';
import { formatSigned } from '../scoring-format.ts';
import { formatDateTime } from '../core.ts';

export type DefinitionResolver = (
    objectiveId: ObjectiveId,
    atTime: string,
) => { name: string; description: string } | undefined;

type Event =
    | { kind: 'baseline'; at: string;
        objectiveId: ObjectiveId; score: number }
    | { kind: 'actual'; at: string;
        objectiveId: ObjectiveId; score: number }
    | { kind: 'revision'; at: string;
        objectiveId: ObjectiveId; name: string }
    | { kind: 'deprecation'; at: string;
        objectiveId: ObjectiveId };

export class ProjectScoreHistoryPresenter {
    constructor(
        private readonly baselines:
            ProjectObjectiveBaselineScore[],
        private readonly actuals:
            ProjectObjectiveActualScore[],
        private readonly revisions: ObjectiveRevision[],
        private readonly deprecations: DeprecatedObjective[],
        private readonly resolver: DefinitionResolver,
    ) {}

    buildBody(): SafeHtml {
        const events = this.#mergedEvents();
        return html`
            <div class="score-history-body">
                <h3>Scoring history</h3>
                <table class="score-history-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Event</th>
                            <th>Objective</th>
                            <th>Detail</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${events.map(e => this.#row(e))}
                    </tbody>
                </table>
            </div>
        `;
    }

    #mergedEvents(): Event[] {
        const events: Event[] = [];
        for (const b of this.baselines) {
            events.push({
                kind: 'baseline',
                at: b.scored_at,
                objectiveId: b.objective_id,
                score: b.score,
            });
        }
        for (const a of this.actuals) {
            events.push({
                kind: 'actual',
                at: a.scored_at,
                objectiveId: a.objective_id,
                score: a.score,
            });
        }
        for (const r of this.revisions) {
            events.push({
                kind: 'revision',
                at: r.revised_at,
                objectiveId: r.objective_id,
                name: r.name,
            });
        }
        for (const d of this.deprecations) {
            events.push({
                kind: 'deprecation',
                at: d.deprecated_at,
                objectiveId: d.objective_id,
            });
        }
        events.sort((a, b) => a.at.localeCompare(b.at));
        return events;
    }

    #row(e: Event): SafeHtml {
        const def = this.resolver(e.objectiveId, e.at);
        if (!def) {
            throw new Error(
                `objective definition missing for `
                + `${e.objectiveId} at ${e.at}`,
            );
        }
        const name = def.name;
        const dateLabel = formatDateTime(e.at);
        switch (e.kind) {
            case 'baseline':
                return html`<tr>
                    <td>${dateLabel}</td>
                    <td>Baseline scored</td>
                    <td>${name}</td>
                    <td>${formatSigned(e.score)}</td>
                </tr>`;
            case 'actual':
                return html`<tr>
                    <td>${dateLabel}</td>
                    <td>Actual measured</td>
                    <td>${name}</td>
                    <td>${formatSigned(e.score)}</td>
                </tr>`;
            case 'revision':
                return html`<tr>
                    <td>${dateLabel}</td>
                    <td>Objective revised</td>
                    <td>${name}</td>
                    <td>renamed/edited</td>
                </tr>`;
            case 'deprecation':
                return html`<tr>
                    <td>${dateLabel}</td>
                    <td>Objective deprecated</td>
                    <td>${name}</td>
                    <td>—</td>
                </tr>`;
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/presenter-project-score-history.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/presenters/project-score-history.ts tests/presenter-project-score-history.test.ts
git commit -m "add ProjectScoreHistoryPresenter"
```

### Task 3.7: `PortfolioImpactPresenter`

**Files:**
- Create: `web-app/app/presenters/portfolio-impact.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/presenter-portfolio-impact.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PortfolioImpactPresenter } from
    '../web-app/app/presenters/portfolio-impact.ts';

test('renders both arc segments when both means present',
    () => {
        const p = new PortfolioImpactPresenter({
            baselineMean: 19,
            actualMean: 12,
            projectCount: 5,
            actualCount: 3,
        });
        const html = p.buildCard().toString();
        assert.ok(html.includes('+19'));
        assert.ok(html.includes('+12'));
        assert.ok(html.includes('portfolio-impact-arc-outer'));
        assert.ok(html.includes('portfolio-impact-arc-inner'));
    });

test('renders no value arcs when both means undefined',
    () => {
        const p = new PortfolioImpactPresenter({
            baselineMean: undefined,
            actualMean: undefined,
            projectCount: 0,
            actualCount: 0,
        });
        const html = p.buildCard().toString();
        assert.ok(!html.includes(
            'class="portfolio-impact-arc-outer"',
        ));
        assert.ok(html.includes('—'));
    });

test('positive baseline → data-tone="positive"', () => {
    const p = new PortfolioImpactPresenter({
        baselineMean: 30, actualMean: 20,
        projectCount: 1, actualCount: 1,
    });
    const html = p.buildCard().toString();
    assert.ok(html.includes('data-tone="positive"'));
});

test('negative baseline → data-tone="negative"', () => {
    const p = new PortfolioImpactPresenter({
        baselineMean: -30, actualMean: -20,
        projectCount: 1, actualCount: 1,
    });
    const html = p.buildCard().toString();
    assert.ok(html.includes('data-tone="negative"'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/presenter-portfolio-impact.test.ts`

Expected: FAIL.

- [ ] **Step 3: Create the presenter**

The math: angle from TDC = (V/100) · 90°. SVG center at
(90, 85), radii 65 outer / 45 inner. Positive sweeps right
with sweep-flag 1; negative sweeps left with sweep-flag 0.

```ts
// web-app/app/presenters/portfolio-impact.ts

import { html, SafeHtml } from '../safe-html.ts';
import { iconZap } from '../icons.ts';
import {
    formatSigned,
    toneForScore,
} from '../scoring-format.ts';
import { DISPLAY_ABSENT } from '../format.ts';

interface Summary {
    baselineMean: number | undefined;
    actualMean: number | undefined;
    projectCount: number;
    actualCount: number;
}

const CENTER_X = 90;
const CENTER_Y = 85;
const OUTER_R = 65;
const INNER_R = 45;
const DEG_TO_RAD = Math.PI / 180;

function arcEndpoint(
    value: number,
    radius: number,
): { x: number; y: number; sweep: 0 | 1 } {
    const sign = value >= 0 ? 1 : -1;
    const alphaDeg = (Math.abs(value) / 100) * 90;
    const svgAngleDeg = 270 + sign * alphaDeg;
    const rad = svgAngleDeg * DEG_TO_RAD;
    return {
        x: CENTER_X + radius * Math.cos(rad),
        y: CENTER_Y + radius * Math.sin(rad),
        sweep: sign > 0 ? 1 : 0,
    };
}

// Tone + display for the summary's possibly-undefined
// fields — the shared helpers take definite numbers, so
// the presenter handles the undefined case at the seam.
function toneFor(v: number | undefined): string {
    return v === undefined
        ? 'neutral'
        : toneForScore(v);
}

function displaySigned(v: number | undefined): string {
    return v === undefined
        ? DISPLAY_ABSENT
        : formatSigned(v);
}

export class PortfolioImpactPresenter {
    constructor(private readonly s: Summary) {}

    buildCard(): SafeHtml {
        const tone = toneFor(this.s.baselineMean);
        return html`
            <section class="portfolio-impact-card"
                data-tone="${tone}">
                <header class="portfolio-impact-header">
                    <div class="icon-box" data-tone="${tone}">
                        ${iconZap(20, '')}
                    </div>
                    <h3>Portfolio Impact</h3>
                </header>
                ${this.#renderSvg()}
                ${this.#renderLegend()}
            </section>
        `;
    }

    #renderSvg(): SafeHtml {
        const tdcX = CENTER_X;
        const outerTdcY = CENTER_Y - OUTER_R;
        const innerTdcY = CENTER_Y - INNER_R;

        const baselineArc = this.s.baselineMean !== undefined
            ? this.#arcPath(
                this.s.baselineMean, OUTER_R,
                tdcX, outerTdcY,
            )
            : '';
        const actualArc = this.s.actualMean !== undefined
            ? this.#arcPath(
                this.s.actualMean, INNER_R,
                tdcX, innerTdcY,
            )
            : '';
        const baselineTone = toneFor(this.s.baselineMean);
        const actualTone = toneFor(this.s.actualMean);

        return html`
            <svg viewBox="0 0 180 95" width="180" height="95"
                class="portfolio-impact-svg">
                <path
                    d="M 25 85 A 65 65 0 0 1 155 85"
                    class="portfolio-impact-bg-outer"
                    fill="none" stroke-linecap="round"/>
                <path
                    d="M 45 85 A 45 45 0 0 1 135 85"
                    class="portfolio-impact-bg-inner"
                    fill="none" stroke-linecap="round"/>
                <line x1="90" y1="14" x2="90" y2="24"
                    class="portfolio-impact-tdc"/>
                ${baselineArc
                    ? html`<path d="${baselineArc}"
                        class="portfolio-impact-arc-outer"
                        data-tone="${baselineTone}"
                        fill="none" stroke-linecap="round"/>`
                    : html``}
                ${actualArc
                    ? html`<path d="${actualArc}"
                        class="portfolio-impact-arc-inner"
                        data-tone="${actualTone}"
                        fill="none" stroke-linecap="round"/>`
                    : html``}
            </svg>
        `;
    }

    #arcPath(
        value: number,
        radius: number,
        tdcX: number,
        tdcY: number,
    ): string {
        const ep = arcEndpoint(value, radius);
        return 'M ' + tdcX + ' ' + tdcY
            + ' A ' + radius + ' ' + radius
            + ' 0 0 ' + ep.sweep
            + ' ' + ep.x.toFixed(2)
            + ' ' + ep.y.toFixed(2);
    }

    #renderLegend(): SafeHtml {
        return html`
            <div class="portfolio-impact-legend">
                <div class="legend-cell">
                    <div class="legend-dot"
                        data-tone="${toneFor(
                            this.s.actualMean,
                        )}"></div>
                    <span>Actual</span>
                    <strong>${displaySigned(
                        this.s.actualMean,
                    )}</strong>
                </div>
                <div class="legend-cell">
                    <div class="legend-dot"
                        data-tone="${toneFor(
                            this.s.baselineMean,
                        )}"></div>
                    <span>Baseline</span>
                    <strong>${displaySigned(
                        this.s.baselineMean,
                    )}</strong>
                </div>
            </div>
        `;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/presenter-portfolio-impact.test.ts`

Expected: PASS — all four test cases pass.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/presenters/portfolio-impact.ts tests/presenter-portfolio-impact.test.ts
git commit -m "add PortfolioImpactPresenter (bipolar arc gauge)"
```

### Task 3.8: `DashboardObjectiveAggregatesPresenter`

**Files:**
- Create: `web-app/app/presenters/dashboard-objective-aggregates.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/presenter-dashboard-objective-aggregates.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DashboardObjectiveAggregatesPresenter } from
    '../web-app/app/presenters/dashboard-objective-aggregates.ts';

const activeObjs = [
    { id: 'o1', position: 0 },
    { id: 'o2', position: 1 },
];
const defs = new Map([
    ['o1', { name: 'Revenue Growth', description: 'd1' }],
    ['o2', { name: 'Cost Reduction', description: 'd2' }],
]);
const aggregates = [
    { objectiveId: 'o1',
      baselineMean: 32, latestActualMean: 25,
      projectsBaselineScored: 12, projectsActualScored: 8 },
    { objectiveId: 'o2',
      baselineMean: undefined, latestActualMean: undefined,
      projectsBaselineScored: 0, projectsActualScored: 0 },
];

test('renders one row per active objective', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates,
    );
    const html = p.buildCard().toString();
    assert.ok(html.includes('Revenue Growth'));
    assert.ok(html.includes('Cost Reduction'));
});

test('row with contributors shows means and counts', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates,
    );
    const html = p.buildCard().toString();
    assert.ok(html.includes('+32'));
    assert.ok(html.includes('+25'));
    assert.ok(html.includes('12 projects'));
});

test('zero-contributor row renders dimmed', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates,
    );
    const html = p.buildCard().toString();
    assert.ok(html.includes('0 projects'));
    assert.ok(html.includes('data-empty="true"'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/presenter-dashboard-objective-aggregates.test.ts`

Expected: FAIL.

- [ ] **Step 3: Create the presenter**

```ts
// web-app/app/presenters/dashboard-objective-aggregates.ts

import { html, SafeHtml } from '../safe-html.ts';
import type {
    Objective,
    ObjectiveId,
} from '../../../api/types.ts';
import {
    formatSigned,
    toneForScore,
} from '../scoring-format.ts';
import { DISPLAY_ABSENT } from '../format.ts';

interface Definition {
    name: string;
    description: string;
}

interface Aggregate {
    objectiveId: ObjectiveId;
    baselineMean: number | undefined;
    latestActualMean: number | undefined;
    projectsBaselineScored: number;
    projectsActualScored: number;
}

// Wrap the shared definite-number helpers to handle the
// possibly-undefined aggregate fields at this seam.
function toneFor(v: number | undefined): string {
    return v === undefined
        ? 'neutral'
        : toneForScore(v);
}

function displaySigned(v: number | undefined): string {
    return v === undefined
        ? DISPLAY_ABSENT
        : formatSigned(v);
}

export class DashboardObjectiveAggregatesPresenter {
    constructor(
        private readonly activeObjectives: Objective[],
        private readonly defs: Map<ObjectiveId, Definition>,
        private readonly aggregates: Aggregate[],
    ) {}

    buildCard(): SafeHtml {
        const aggMap = new Map(
            this.aggregates.map(a => [a.objectiveId, a]),
        );
        return html`
            <section class="objective-aggregates-card">
                <header>
                    <h3>Active project impact by objective</h3>
                </header>
                <ul class="objective-aggregates-rows">
                    ${this.activeObjectives.map(o =>
                        this.#row(o, aggMap.get(o.id)))
                    }
                </ul>
            </section>
        `;
    }

    #row(o: Objective, agg: Aggregate | undefined): SafeHtml {
        const def = this.defs.get(o.id);
        if (!def) {
            throw new Error(
                `objective definition missing for ${o.id}`,
            );
        }
        const empty = !agg
            || agg.projectsBaselineScored === 0;
        const baseline = agg
            ? agg.baselineMean : undefined;
        const actual = agg
            ? agg.latestActualMean : undefined;
        // CSS custom properties hold numeric data only;
        // omit them when the value is undefined and let
        // [data-has-baseline] / [data-has-actual] drive
        // the missing-value rendering in CSS.
        const hasBaseline = baseline !== undefined;
        const hasActual = actual !== undefined;
        const styleParts: string[] = [];
        if (hasBaseline) {
            styleParts.push(`--baseline:${baseline}`);
        }
        if (hasActual) {
            styleParts.push(`--actual:${actual}`);
        }
        const barStyle = styleParts.join(';');
        return html`
            <li class="score-row"
                data-objective-id="${o.id}"
                data-empty="${empty}">
                <span class="score-row-label">${def.name}</span>
                <span class="bipolar-bar"
                    data-tone="${toneFor(baseline)}"
                    data-has-baseline="${hasBaseline}"
                    data-has-actual="${hasActual}"
                    style="${barStyle}">
                </span>
                <strong class="score-row-baseline"
                    data-tone="${toneFor(baseline)}">
                    ${displaySigned(baseline)}
                </strong>
                <strong class="score-row-actual"
                    data-tone="${toneFor(actual)}">
                    ${displaySigned(actual)}
                </strong>
                <span class="score-row-count">
                    ${agg
                        ? agg.projectsBaselineScored
                        : 0} projects
                </span>
            </li>
        `;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/presenter-dashboard-objective-aggregates.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/presenters/dashboard-objective-aggregates.ts tests/presenter-dashboard-objective-aggregates.test.ts
git commit -m "add DashboardObjectiveAggregatesPresenter"
```

### Task 3.9: Remove inline impact display from existing presenters

**Files:**
- Modify: `web-app/app/presenters/project.ts`
- Modify: `web-app/app/presenters/project-detail.ts`

- [ ] **Step 1: Write the failing test**

Append to (or create) `tests/presenter-project-impact-removed.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

test('project.ts no longer references impact pts', () => {
    const src = readFileSync(
        'web-app/app/presenters/project.ts', 'utf8',
    );
    assert.ok(!src.includes('impactBaseline'));
    assert.ok(!src.includes('impactCurrent'));
    assert.ok(!src.toLowerCase().includes(' pts'));
});

test('project-detail.ts no longer references impact metric',
    () => {
        const src = readFileSync(
            'web-app/app/presenters/project-detail.ts',
            'utf8',
        );
        assert.ok(!src.includes('impactBaseline'));
        assert.ok(!src.includes('impactCurrent'));
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/presenter-project-impact-removed.test.ts`

Expected: FAIL — current files still reference the old
impact identifiers.

- [ ] **Step 3: Remove the impact code paths**

In `presenters/project.ts`: delete the line(s) that emit
the "impact: X / Y pts" treatment in the list card.

In `presenters/project-detail.ts`: delete the Impact
MetricArgs block (around lines 618–627 per exploration)
from both `ProjectDetailPresenter` and
`ProjectDetailEditPresenter`. Remove the now-orphan
`view.impactBaseline()` / `view.impactCurrent()` calls.

If the metric grid loops over an array of MetricArgs,
remove the impact entry; if it's hard-coded, delete the
two `buildMetricCell` calls for impact.

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/presenter-project-impact-removed.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/presenters/project.ts web-app/app/presenters/project-detail.ts tests/presenter-project-impact-removed.test.ts
git commit -m "remove inline impact display from project presenters"
```

### Task 3.10: Update `presenters/index.ts` barrel

**Files:**
- Modify: `web-app/app/presenters/index.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/presenter-barrel.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as P from '../web-app/app/presenters/index.ts';

test('barrel exports all new presenters', () => {
    const expected = [
        'OrganizationObjectivesPresenter',
        'ProjectActionBarPresenter',
        'ScoreModalPresenter',
        'MeasurementModalPresenter',
        'ProjectObjectivesPresenter',
        'ProjectScoreHistoryPresenter',
        'PortfolioImpactPresenter',
        'DashboardObjectiveAggregatesPresenter',
    ];
    for (const name of expected) {
        assert.ok(
            name in P,
            'barrel missing export: ' + name,
        );
    }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`node --test --strip-types tests/presenter-barrel.test.ts`

Expected: FAIL — none of the eight new exports are present.

- [ ] **Step 3: Add the exports**

Append to `web-app/app/presenters/index.ts`:

```ts
export { OrganizationObjectivesPresenter }
    from './organization-objectives.ts';
export { ProjectActionBarPresenter }
    from './project-action-bar.ts';
export { ScoreModalPresenter }
    from './score-modal.ts';
export { MeasurementModalPresenter }
    from './measurement-modal.ts';
export { ProjectObjectivesPresenter }
    from './project-objectives.ts';
export { ProjectScoreHistoryPresenter }
    from './project-score-history.ts';
export { PortfolioImpactPresenter }
    from './portfolio-impact.ts';
export { DashboardObjectiveAggregatesPresenter }
    from './dashboard-objective-aggregates.ts';
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test --strip-types tests/presenter-barrel.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/presenters/index.ts tests/presenter-barrel.test.ts
git commit -m "export new presenters from barrel"
```

---

## Phase 4 — CSS

All colors via `data-tone` attribute + design tokens. Never
raw hex. Three new shared classes go in `components.css`
(reused in 3+ sites per Commandment IX); single-site
classes go in `pages.css`.

### Task 4.1: Shared bipolar-bar + score-row + objective-list-item

**Files:**
- Modify: `web-app/app/styles/components.css`

- [ ] **Step 1: Pick a unique anchor**

Open `web-app/app/styles/components.css`. Pick the last line
of an existing component section as your insertion anchor.
Call it `<ANCHOR>`.

- [ ] **Step 2: Add the three classes after `<ANCHOR>`**

```css
/* Bipolar bar — zero-centered, used by ProjectObjectives,
   DashboardObjectiveAggregates, and history previews */
.bipolar-bar {
    --bar-width: 240px;
    --bar-height: 18px;
    position: relative;
    width: var(--bar-width);
    height: var(--bar-height);
    background: hsl(var(--muted) / 0.10);
    border-radius: 3px;
}

.bipolar-bar::before {
    /* TDC center marker */
    content: '';
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 1px;
    background: hsl(var(--foreground) / 0.35);
    transform: translateX(-0.5px);
}

.bipolar-bar::after {
    /* Baseline area — width scales with abs(--baseline) */
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    background: hsl(var(--tone-current));
    opacity: 0.55;
    width: calc(
        abs(var(--baseline)) / 100 * (var(--bar-width) / 2)
    );
}

.bipolar-bar[data-tone='positive']::after {
    --tone-current: var(--success);
    left: 50%;
    border-radius: 0 3px 3px 0;
}

.bipolar-bar[data-tone='negative']::after {
    --tone-current: var(--destructive);
    right: 50%;
    border-radius: 3px 0 0 3px;
}

.bipolar-bar[data-tone='neutral']::after {
    display: none;
}

/* Actual tick — only rendered when the presenter sets
   data-has-actual="true" (CSS custom property --actual
   carries a numeric value; missing-value rows omit both
   the data attribute and the CSS var). */
.bipolar-bar[data-has-actual='true']
    > .bipolar-actual-tick {
    /* the tick is rendered as a child element */
}

/* Score row — used by ProjectObjectives and
   DashboardObjectiveAggregates */
.score-row {
    display: grid;
    grid-template-columns:
        140px var(--bar-width) 50px 50px auto;
    align-items: center;
    gap: 0.8em;
    padding: 0.4em 0;
}

.score-row[data-empty='true'] {
    opacity: 0.55;
}

.score-row-label {
    text-align: right;
    font-size: 0.92em;
}

.score-row-baseline[data-tone='positive'],
.score-row-actual[data-tone='positive'] {
    color: hsl(var(--success));
}

.score-row-baseline[data-tone='negative'],
.score-row-actual[data-tone='negative'] {
    color: hsl(var(--destructive));
}

.score-row-count {
    opacity: 0.6;
    font-size: 0.85em;
}

/* Objective list item — used by Organization Objectives box */
.objective-list-item {
    display: flex;
    align-items: flex-start;
    gap: 0.8em;
    padding: 0.6em;
    border-radius: 6px;
    background: hsl(var(--muted) / 0.05);
    margin-bottom: 0.4em;
}

.objective-list-item .drag-handle {
    cursor: grab;
    opacity: 0.5;
    user-select: none;
}

.objective-list-item[data-deprecated='true'] {
    opacity: 0.7;
}

.objective-list-item[data-deprecated='true']
    .objective-text strong {
    text-decoration: line-through;
}

.objective-text {
    flex: 1;
}

.objective-desc {
    display: block;
    opacity: 0.7;
    font-size: 0.9em;
}

.objective-actions {
    display: flex;
    gap: 0.4em;
}
```

The `--success`, `--destructive`, `--warning` tokens (and
their `-foreground`, `-soft`, `-border`, `-text`, `-hover`
variants) already exist in
`web-app/app/styles/light-mode.css` (lines 41-62) and
`dark-mode.css` (lines 36-53). No new token introduction
needed. The CSS uses `abs()` — supported in all evergreen
browsers as of 2024, consistent with the ES2024 target.

- [ ] **Step 3: Manual verification**

Open `localhost:8080/projects/detail.html?id=<any-id>` in a
browser after a `./serve 8080` run. Confirm:
- The bipolar-bar widget renders with red on the left half,
  green on the right half, centered at 0.
- A row with `data-tone="positive"` shows a green-tinted
  bar extending right of center.
- A row with `data-tone="negative"` shows a red-tinted bar
  extending left of center.

(This is visual; no automated test. Confirm visually before
committing.)

- [ ] **Step 4: Commit**

```bash
git add web-app/app/styles/components.css
git commit -m "add bipolar-bar, score-row, objective-list-item shared classes"
```

### Task 4.2: Portfolio Impact gauge + Score modal styles

**Files:**
- Modify: `web-app/app/styles/pages.css`

- [ ] **Step 1: Pick a unique anchor**

Open `web-app/app/styles/pages.css`. Find a clear section
break (e.g., an existing comment like `/* ===== dashboard
===== */`) for the insertion anchor.

- [ ] **Step 2: Add the styles**

```css
/* ===== Portfolio Impact gauge ===== */

.portfolio-impact-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1.2em 1em;
}

.portfolio-impact-header {
    display: flex;
    align-items: center;
    gap: 0.6em;
    align-self: flex-start;
    margin-bottom: 0.8em;
}

.portfolio-impact-header .icon-box {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.portfolio-impact-header .icon-box[data-tone='positive'] {
    background: hsl(var(--success) / 0.12);
    color: hsl(var(--success));
}

.portfolio-impact-header .icon-box[data-tone='negative'] {
    background: hsl(var(--destructive) / 0.12);
    color: hsl(var(--destructive));
}

.portfolio-impact-header .icon-box[data-tone='neutral'] {
    background: hsl(var(--muted) / 0.10);
    opacity: 0.6;
}

.portfolio-impact-svg .portfolio-impact-bg-outer,
.portfolio-impact-svg .portfolio-impact-bg-inner {
    stroke: hsl(var(--foreground) / 0.10);
    stroke-width: 14;
}

.portfolio-impact-svg .portfolio-impact-tdc {
    stroke: hsl(var(--foreground) / 0.55);
    stroke-width: 1.5;
}

.portfolio-impact-arc-outer,
.portfolio-impact-arc-inner {
    stroke-width: 14;
}

.portfolio-impact-arc-outer[data-tone='positive'],
.portfolio-impact-arc-inner[data-tone='positive'] {
    stroke: hsl(var(--success));
}

.portfolio-impact-arc-outer[data-tone='negative'],
.portfolio-impact-arc-inner[data-tone='negative'] {
    stroke: hsl(var(--destructive));
}

.portfolio-impact-legend {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.8em;
    margin-top: 0.6em;
    text-align: center;
    width: 100%;
}

.legend-dot[data-tone='positive'] {
    background: hsl(var(--success));
}

.legend-dot[data-tone='negative'] {
    background: hsl(var(--destructive));
}

.legend-dot[data-tone='neutral'] {
    background: hsl(var(--muted));
}

/* ===== Score / Measurement modal ===== */

.score-modal-body,
.measurement-modal-body {
    padding: 1.2em;
    min-width: 480px;
}

.score-slider-row,
.measurement-slider-row {
    display: grid;
    grid-template-columns: 200px 1fr 60px;
    align-items: center;
    gap: 0.6em;
    padding: 0.6em 0;
    border-bottom: 1px solid hsl(var(--border));
}

.score-slider-row:last-of-type,
.measurement-slider-row:last-of-type {
    border-bottom: none;
}

.score-slider-label strong {
    display: block;
}

.score-slider-desc,
.measurement-caption {
    display: block;
    font-size: 0.85em;
    opacity: 0.7;
}

.score-slider {
    width: 100%;
}

.score-slider.unset {
    opacity: 0.4;
}

.score-hint {
    grid-column: 1 / -1;
    font-size: 0.85em;
    color: hsl(var(--warning));
    margin-top: 0.2em;
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6em;
    margin-top: 1em;
}

/* ===== Org Objectives box ===== */

.org-objectives-box {
    padding: 1em;
}

.org-objectives-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.8em;
}

.objective-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.objective-list-divider {
    margin: 1em 0 0.4em;
    font-size: 0.85em;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.6;
}

/* ===== Project history modal ===== */

.score-history-table {
    width: 100%;
    border-collapse: collapse;
}

.score-history-table th,
.score-history-table td {
    text-align: left;
    padding: 0.4em 0.6em;
    border-bottom: 1px solid hsl(var(--border));
}
```

- [ ] **Step 3: Manual visual verification**

After `./serve 8080`:
- Open the dashboard; confirm the Portfolio Impact card
  renders with the bipolar arc + legend.
- Open a project's detail page; confirm the Score modal
  styles look correct when opened.
- Open the Organization page; confirm the Objectives box
  renders with rows.

- [ ] **Step 4: Commit**

```bash
git add web-app/app/styles/pages.css
git commit -m "add Portfolio Impact gauge and modal styles"
```

---

## Phase 5 — Page modules

This phase wires everything together. Pages fetch via
adapters, instantiate presenters, render into DOM, and
subscribe to notification channels.

### Task 5.1: Wire the Organization Objectives box

**Files:**
- Modify: `web-app/organization/index.html`
- Modify: `web-app/organization/index.ts`

- [ ] **Step 1: Update the HTML**

Add to `organization/index.html` (after the existing
overview/usage/admin card placeholders):

```html
<div id="objectives-box"></div>

<!-- Add Objective dialog -->
<div id="add-objective-backdrop"
    class="dialog-backdrop hidden"></div>
<div id="add-objective-dialog"
    class="dialog hidden" aria-hidden="true">
    <h3>Add objective</h3>
    <label>Name<input id="add-obj-name" type="text"></label>
    <label>Description<textarea
        id="add-obj-description"></textarea></label>
    <div class="dialog-actions">
        <button data-action="cancel-add-objective">
            Cancel
        </button>
        <button data-action="confirm-add-objective"
            class="btn-primary">Add</button>
    </div>
</div>

<!-- Edit Objective dialog -->
<div id="edit-objective-backdrop"
    class="dialog-backdrop hidden"></div>
<div id="edit-objective-dialog"
    class="dialog hidden" aria-hidden="true">
    <h3>Edit objective</h3>
    <input id="edit-obj-id" type="hidden">
    <label>Name<input id="edit-obj-name" type="text"></label>
    <label>Description<textarea
        id="edit-obj-description"></textarea></label>
    <div class="dialog-actions">
        <button data-action="cancel-edit-objective">
            Cancel
        </button>
        <button data-action="confirm-edit-objective"
            class="btn-primary">Save</button>
    </div>
</div>

<!-- Confirm-deprecate dialog (replaces native confirm()) -->
<div id="confirm-deprecate-backdrop"
    class="dialog-backdrop hidden"></div>
<div id="confirm-deprecate-dialog"
    class="dialog hidden" aria-hidden="true">
    <h3>Deprecate objective?</h3>
    <input id="confirm-deprecate-id" type="hidden">
    <p>The objective stops appearing in active rosters
        but its historical scores remain visible.</p>
    <div class="dialog-actions">
        <button data-action="cancel-confirm-deprecate">
            Cancel
        </button>
        <button data-action="confirm-deprecate"
            class="btn-primary">Deprecate</button>
    </div>
</div>
```

- [ ] **Step 2: Update `organization/index.ts`**

Add to the top of the file:

```ts
import {
    postActiveObjectivesRetrieval,
    getObjectives,
    getDeprecatedObjectiveIds,
    postCurrentObjectiveDefinition,
    postObjectiveCreation,
    postObjectiveRevision,
    postObjectiveDeprecation,
    postObjectiveReactivation,
    postObjectiveReordering,
    subscribeObjectiveChanges,
} from '../app/adapters/objectives.ts';
import { OrganizationObjectivesPresenter }
    from '../app/presenters';
import {
    openDialog, closeDialog,
} from '../app/core';
import { $, setHtml } from '../app/dom';
import {
    generateCryptoSafeBase62,
} from '../app/adapters/crypto-safe-base62.ts';
```

Note: the `subscribeObjectiveChanges` helper added in Task
2.2 is the per-adapter subscribe channel — there is no
shared `changes.ts` module.

Add to `init()`:

```ts
async function renderObjectives(): Promise<void> {
    const ctx = createRequestContext();
    const [active, allObjs, deprecatedIds] =
        await Promise.all([
            postActiveObjectivesRetrieval(ctx),
            getObjectives(ctx),
            getDeprecatedObjectiveIds(ctx),
        ]);
    const deprecated = allObjs.filter(
        o => deprecatedIds.has(o.id),
    );
    const defs = new Map();
    for (const o of [...active, ...deprecated]) {
        defs.set(o.id,
            await postCurrentObjectiveDefinition(ctx, o.id));
    }
    const deprecatedAt = new Map();
    // (optional: fetch deprecated_at via additional GET)
    const presenter = new OrganizationObjectivesPresenter(
        active, deprecated, defs, deprecatedAt,
    );
    setHtml($('#objectives-box'), presenter.buildBox());
}

subscribeObjectiveChanges(renderObjectives);
await renderObjectives();

// Click delegation for dialog opens, edit, deprecate, etc.
$('#objectives-box').addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const action = target
        .closest('[data-action]')
        ?.getAttribute('data-action');
    const objectiveId = target
        .closest('[data-objective-id]')
        ?.getAttribute('data-objective-id');
    const ctx = createRequestContext();
    if (action === 'add-objective') {
        openDialog('add-objective');
    } else if (action === 'edit' && objectiveId) {
        const def = await postCurrentObjectiveDefinition(
            ctx, objectiveId);
        ($('#edit-obj-id') as HTMLInputElement).value =
            objectiveId;
        ($('#edit-obj-name') as HTMLInputElement).value =
            def.name;
        ($('#edit-obj-description')
            as HTMLTextAreaElement).value = def.description;
        openDialog('edit-objective');
    } else if (action === 'deprecate' && objectiveId) {
        // Open the confirm-deprecate dialog and stash the
        // target id; confirmation handler reads it back.
        ($('#confirm-deprecate-id') as HTMLInputElement)
            .value = objectiveId;
        openDialog('confirm-deprecate');
    } else if (action === 'reactivate' && objectiveId) {
        await postObjectiveReactivation(ctx, objectiveId);
    }
});

// Add-Objective dialog wiring
$('[data-action="cancel-add-objective"]')
    .addEventListener('click',
        () => closeDialog('add-objective'));
$('[data-action="confirm-add-objective"]')
    .addEventListener('click', async () => {
        const name = ($('#add-obj-name')
            as HTMLInputElement).value;
        const desc = ($('#add-obj-description')
            as HTMLTextAreaElement).value;
        const ctx = createRequestContext();
        const objs = await getObjectives(ctx);
        const newId = generateCryptoSafeBase62();
        await postObjectiveCreation(
            ctx, newId, name, desc, objs.length);
        closeDialog('add-objective');
    });

// Edit-Objective dialog wiring
$('[data-action="cancel-edit-objective"]')
    .addEventListener('click',
        () => closeDialog('edit-objective'));
$('[data-action="confirm-edit-objective"]')
    .addEventListener('click', async () => {
        const id = ($('#edit-obj-id')
            as HTMLInputElement).value;
        const name = ($('#edit-obj-name')
            as HTMLInputElement).value;
        const desc = ($('#edit-obj-description')
            as HTMLTextAreaElement).value;
        const ctx = createRequestContext();
        await postObjectiveRevision(ctx, id, name, desc);
        closeDialog('edit-objective');
    });

// Confirm-deprecate dialog wiring
$('[data-action="cancel-confirm-deprecate"]')
    .addEventListener('click',
        () => closeDialog('confirm-deprecate'));
$('[data-action="confirm-deprecate"]')
    .addEventListener('click', async () => {
        const id = ($('#confirm-deprecate-id')
            as HTMLInputElement).value;
        const ctx = createRequestContext();
        await postObjectiveDeprecation(ctx, id);
        closeDialog('confirm-deprecate');
    });
```

(Adapt to the codebase's actual conventions for
`createRequestContext` import, `$` dom helper, etc. Read
`organization/index.ts` first for the existing voice.)

- [ ] **Step 3: Manual verification**

After `./serve 8080`:
- Open `organization/index.html`
- Confirm 5 seeded objectives appear in the new box
- Click `+ Add objective`; add one; confirm it appears in
  the list
- Click `Edit` on an objective; change the name; confirm
  the list updates and the historical project history
  (open any project's history modal later) still shows
  the OLD name for events that predate the edit
- Click `Deprecate`; confirm the objective moves to the
  deprecated section
- Click `Reactivate`; confirm it moves back

- [ ] **Step 4: Commit**

```bash
git add web-app/organization/index.html web-app/organization/index.ts
git commit -m "wire organization Objectives box"
```

### Task 5.2: Wire the project-detail action bar and modals

**Files:**
- Modify: `web-app/projects/detail.html`
- Modify: `web-app/projects/detail.ts`

- [ ] **Step 1: Update the HTML**

Add to `projects/detail.html`:

```html
<div id="project-action-bar"></div>
<div id="project-objectives-section"></div>

<!-- Score modal -->
<div id="score-backdrop"
    class="dialog-backdrop hidden"></div>
<div id="score-dialog"
    class="dialog hidden" aria-hidden="true">
    <div id="score-modal-body"></div>
</div>

<!-- Log measurement modal -->
<div id="measurement-backdrop"
    class="dialog-backdrop hidden"></div>
<div id="measurement-dialog"
    class="dialog hidden" aria-hidden="true">
    <div id="measurement-modal-body"></div>
</div>

<!-- Approve confirmation -->
<div id="approve-backdrop"
    class="dialog-backdrop hidden"></div>
<div id="approve-dialog"
    class="dialog hidden" aria-hidden="true">
    <h3>Confirm approval</h3>
    <p id="approve-message"></p>
    <div class="dialog-actions">
        <button data-action="cancel-approve">Cancel</button>
        <button data-action="confirm-approve"
            class="btn-primary">Approve</button>
    </div>
</div>

<!-- Complete confirmation -->
<div id="complete-backdrop"
    class="dialog-backdrop hidden"></div>
<div id="complete-dialog"
    class="dialog hidden" aria-hidden="true">
    <h3>Confirm completion</h3>
    <p id="complete-message"></p>
    <div class="dialog-actions">
        <button data-action="cancel-complete">Cancel</button>
        <button data-action="confirm-complete"
            class="btn-primary">Complete</button>
    </div>
</div>

<!-- Score history modal -->
<div id="history-backdrop"
    class="dialog-backdrop hidden"></div>
<div id="history-dialog"
    class="dialog hidden" aria-hidden="true">
    <div id="history-modal-body"></div>
</div>
```

- [ ] **Step 2: Update `projects/detail.ts`**

Add imports:

```ts
import {
    postProjectScoringRetrieval,
    postProjectBaselineScoring,
    postProjectActualMeasurement,
    subscribeProjectScoreChanges,
} from '../app/adapters/project-scoring.ts';
import {
    postProjectApproval,
    postProjectCompletion,
    validateProjectForApproval,
    validateProjectForCompletion,
} from '../app/adapters/project-publish.ts';
import {
    postActiveObjectivesRetrieval,
    postCurrentObjectiveDefinition,
    getDeprecatedObjectiveIds,
    getObjectives,
    getObjectiveRevisions,
    subscribeObjectiveChanges,
} from '../app/adapters/objectives.ts';
import {
    subscribeProjectChanges,
} from '../app/adapters/projects.ts';
import {
    ProjectActionBarPresenter,
    ProjectObjectivesPresenter,
    ScoreModalPresenter,
    MeasurementModalPresenter,
    ProjectScoreHistoryPresenter,
} from '../app/presenters';
import { latestPerPair } from '../app/scoring-format.ts';
import { showToast } from '../app/toast.ts';
```

Add the orchestration function and click delegation. Code
sample for the main render and a few handler examples:

```ts
async function renderActionBarAndObjectives(): Promise<void> {
    const ctx = createRequestContext();
    const projectId = getProjectIdFromUrl();
    const [project, active, scoring] = await Promise.all([
        ctx.GET<ProjectEntity>(`projects/${projectId}`),
        postActiveObjectivesRetrieval(ctx),
        postProjectScoringRetrieval(ctx, projectId),
    ]);
    const defs = new Map();
    for (const o of active) {
        defs.set(o.id,
            await postCurrentObjectiveDefinition(ctx, o.id));
    }
    const latestBaselines = latestPerPair(scoring.baseline);
    const latestActuals = latestPerPair(scoring.actual);

    const approvalCheck = validateProjectForApproval(
        project, active, latestBaselines,
    );
    const completionCheck = validateProjectForCompletion(
        project, latestBaselines, latestActuals,
    );

    const actionBar = new ProjectActionBarPresenter(
        project, approvalCheck, completionCheck,
    );
    setHtml($('#project-action-bar'), actionBar.buildBar());

    const objSection = new ProjectObjectivesPresenter(
        active, defs, latestBaselines, latestActuals,
    );
    setHtml($('#project-objectives-section'),
        objSection.buildSection());
}

subscribeProjectScoreChanges(renderActionBarAndObjectives);
subscribeObjectiveChanges(renderActionBarAndObjectives);
subscribeProjectChanges(renderActionBarAndObjectives);

await renderActionBarAndObjectives();

// Click delegation
$('#project-action-bar').addEventListener('click',
    async (e) => {
        const action = (e.target as HTMLElement)
            .closest('[data-action]')
            ?.getAttribute('data-action');
        const ctx = createRequestContext();
        const projectId = getProjectIdFromUrl();
        if (action === 'score') {
            await openScoreModal(ctx, projectId);
        } else if (action === 'approve') {
            openApproveConfirmation(projectId);
        } else if (action === 'log-measurement') {
            await openMeasurementModal(ctx, projectId);
        } else if (action === 'complete') {
            openCompleteConfirmation(projectId);
        } else if (action === 'view-history') {
            await openHistoryModal(ctx, projectId);
        }
    });

async function openScoreModal(
    ctx: RequestContext, projectId: string,
): Promise<void> {
    const project = await ctx.GET<ProjectEntity>(
        `projects/${projectId}`,
    );
    const active = await postActiveObjectivesRetrieval(ctx);
    const scoring = await postProjectScoringRetrieval(
        ctx, projectId,
    );
    const defs = new Map();
    for (const o of active) {
        defs.set(o.id,
            await postCurrentObjectiveDefinition(ctx, o.id));
    }
    const presenter = new ScoreModalPresenter(
        project, active, defs, scoring.baseline,
    );
    setHtml($('#score-modal-body'), presenter.buildBody());

    // Scope the touched-tracker to the dialog element so
    // the listener is torn down with the dialog and never
    // leaks across page lifetimes.
    const dialog = $('#score-dialog');
    const onInput = (e: Event) => {
        const t = e.target as HTMLElement;
        if (t.matches('input[type="range"]')) {
            (t as HTMLElement & { dataset: DOMStringMap })
                .dataset.touched = 'true';
        }
    };
    dialog.addEventListener('input', onInput);

    // Remove the listener when the dialog closes — the
    // body is re-rendered on each open, so retaining the
    // listener across opens leaks the closure.
    const cleanupOnClose = () =>
        dialog.removeEventListener('input', onInput);
    dialog.addEventListener('close', cleanupOnClose,
        { once: true });

    openDialog('score');
}

// Save baselines — collect moved sliders only
$('#score-dialog').addEventListener('click', async (e) => {
    const action = (e.target as HTMLElement)
        .closest('[data-action]')
        ?.getAttribute('data-action');
    if (action === 'cancel') {
        closeDialog('score');
    } else if (action === 'save-baselines') {
        const ctx = createRequestContext();
        const projectId = getProjectIdFromUrl();
        const moved: { objectiveId: string;
            score: number }[] = [];
        const rows = document.querySelectorAll(
            '#score-modal-body .score-slider-row');
        rows.forEach(row => {
            const initial = Number(row
                .getAttribute('data-initial-value'));
            const unset = row.getAttribute('data-unset')
                === 'true';
            const objectiveId = row
                .getAttribute('data-objective-id')!;
            const slider = row.querySelector(
                'input[type="range"]') as HTMLInputElement;
            const value = Number(slider.value);
            const touched = (slider as HTMLElement & {
                dataset: DOMStringMap
            }).dataset.touched === 'true';
            if (value !== initial || (unset && touched)) {
                moved.push({ objectiveId, score: value });
            }
        });
        if (moved.length > 0) {
            await postProjectBaselineScoring(
                ctx, projectId, moved);
        }
        closeDialog('score');
    }
});

// Measurement modal — opens with sliders pre-filled from
// latest actual (or baseline if none).
async function openMeasurementModal(
    ctx: RequestContext, projectId: string,
): Promise<void> {
    const project = await ctx.GET<ProjectEntity>(
        `projects/${projectId}`,
    );
    const scoring = await postProjectScoringRetrieval(
        ctx, projectId,
    );
    const defs = new Map();
    const baselineObjIds = new Set(
        latestPerPair(scoring.baseline)
            .map(b => b.objective_id),
    );
    for (const objId of baselineObjIds) {
        defs.set(
            objId,
            await postCurrentObjectiveDefinition(
                ctx, objId,
            ),
        );
    }
    const presenter = new MeasurementModalPresenter(
        project, defs, scoring.baseline, scoring.actual,
    );
    setHtml($('#measurement-modal-body'),
        presenter.buildBody());
    openDialog('measurement');
}

// Save measurement — collect moved sliders only
$('#measurement-dialog').addEventListener('click',
    async (e) => {
        const action = (e.target as HTMLElement)
            .closest('[data-action]')
            ?.getAttribute('data-action');
        if (action === 'cancel') {
            closeDialog('measurement');
        } else if (action === 'save-measurement') {
            const ctx = createRequestContext();
            const projectId = getProjectIdFromUrl();
            const moved: { objectiveId: string;
                score: number }[] = [];
            const rows = document.querySelectorAll(
                '#measurement-modal-body '
                + '.measurement-slider-row');
            rows.forEach(row => {
                const initial = Number(row
                    .getAttribute('data-initial-value'));
                const objectiveId = row
                    .getAttribute('data-objective-id')!;
                const slider = row.querySelector(
                    'input[type="range"]')
                    as HTMLInputElement;
                const value = Number(slider.value);
                if (value !== initial) {
                    moved.push({
                        objectiveId, score: value,
                    });
                }
            });
            if (moved.length > 0) {
                await postProjectActualMeasurement(
                    ctx, projectId, moved);
            }
            closeDialog('measurement');
        }
    });

// Approve confirmation
function openApproveConfirmation(projectId: string): void {
    ($('#approve-message') as HTMLElement).textContent =
        'Approve this project? This action records the '
        + 'baseline scores as final and marks the project '
        + 'as approved.';
    openDialog('approve');
}

$('#approve-dialog').addEventListener('click', async (e) => {
    const action = (e.target as HTMLElement)
        .closest('[data-action]')
        ?.getAttribute('data-action');
    if (action === 'cancel-approve') {
        closeDialog('approve');
    } else if (action === 'confirm-approve') {
        const ctx = createRequestContext();
        const projectId = getProjectIdFromUrl();
        try {
            await postProjectApproval(ctx, projectId);
            closeDialog('approve');
        } catch (err) {
            // Validator threw — surface the message via
            // toast so the user can see why approval was
            // blocked. Re-throw so the global error
            // handler still records it.
            const message = err instanceof Error
                ? err.message
                : String(err);
            showToast(message);
            closeDialog('approve');
            throw err;
        }
    }
});

// Complete confirmation
function openCompleteConfirmation(projectId: string): void {
    ($('#complete-message') as HTMLElement).textContent =
        'Mark this project as completed? Every '
        + 'baseline-scored objective must have at least '
        + 'one actual measurement.';
    openDialog('complete');
}

$('#complete-dialog').addEventListener('click',
    async (e) => {
        const action = (e.target as HTMLElement)
            .closest('[data-action]')
            ?.getAttribute('data-action');
        if (action === 'cancel-complete') {
            closeDialog('complete');
        } else if (action === 'confirm-complete') {
            const ctx = createRequestContext();
            const projectId = getProjectIdFromUrl();
            try {
                await postProjectCompletion(
                    ctx, projectId,
                );
                closeDialog('complete');
            } catch (err) {
                const message = err instanceof Error
                    ? err.message
                    : String(err);
                showToast(message);
                closeDialog('complete');
                throw err;
            }
        }
    });

// History modal
async function openHistoryModal(
    ctx: RequestContext, projectId: string,
): Promise<void> {
    const scoring = await postProjectScoringRetrieval(
        ctx, projectId);
    const baselineObjIds = new Set(
        scoring.baseline.map(b => b.objective_id));
    for (const a of scoring.actual) {
        baselineObjIds.add(a.objective_id);
    }
    const revisions: ObjectiveRevision[] = [];
    const deprecations: DeprecatedObjective[] = [];
    for (const objId of baselineObjIds) {
        const revs = await getObjectiveRevisions(
            ctx, objId);
        revisions.push(...revs);
        const deprecatedIds =
            await getDeprecatedObjectiveIds(ctx);
        if (deprecatedIds.has(objId)) {
            // Fetch the tombstone row to get deprecated_at
            const t = await ctx.GET(
                'deprecated_objectives/' + objId);
            deprecations.push(t as DeprecatedObjective);
        }
    }
    // Build a closure-style resolver from the fetched revs
    const revsByObj = new Map<string, ObjectiveRevision[]>();
    for (const r of revisions) {
        const arr = revsByObj.get(r.objective_id) ?? [];
        arr.push(r);
        revsByObj.set(r.objective_id, arr);
    }
    const resolver = (objId: string, atTime: string) => {
        const arr = revsByObj.get(objId) ?? [];
        const eligible = arr.filter(
            r => r.revised_at <= atTime);
        if (eligible.length === 0) return undefined;
        eligible.sort((a, b) =>
            b.revised_at.localeCompare(a.revised_at));
        return {
            name: eligible[0].name,
            description: eligible[0].description,
        };
    };
    const presenter = new ProjectScoreHistoryPresenter(
        scoring.baseline, scoring.actual,
        revisions, deprecations, resolver);
    setHtml($('#history-modal-body'),
        presenter.buildBody());
    openDialog('history');
}

// History modal close (no save action)
$('#history-backdrop').addEventListener('click',
    () => closeDialog('history'));
```

- [ ] **Step 3: Manual verification**

After `./serve 8080`:
- Open a `submitted` project's detail page; transition
  status to `under-review` via the existing edit form.
- Click `Score`; confirm modal opens with sliders for all
  active objectives.
- Drag a few sliders; click `Save baselines`; confirm the
  modal closes and the read-only Objectives section now
  shows scored objectives.
- Click `Approve`; confirm the confirmation dialog opens.
- Confirm; project status flips to `approved`.
- Click `Log measurement`; adjust sliders; save; confirm
  the history modal shows the new event.
- Click `Complete`; confirm gated behavior matches the
  validator.

- [ ] **Step 4: Commit**

```bash
git add web-app/projects/detail.html web-app/projects/detail.ts
git commit -m "wire project-detail action bar, modals, and history"
```

### Task 5.3: Wire the projects-list new column

**Files:**
- Modify: `web-app/projects/index.ts`
- Modify: the projects-list presenter (likely
  `web-app/app/presenters/projects-list.ts` or wherever the
  list cells live)

- [ ] **Step 1: Identify the list presenter**

Run:
`grep -l "buildList\\|projects.map" web-app/app/presenters/`

Note the path — call it `<LIST_PRESENTER>`.

- [ ] **Step 2: Write a failing test**

Create `tests/presenter-projects-list-column.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
// Replace the import path with <LIST_PRESENTER>
import { ProjectsListPresenter } from
    '../web-app/app/presenters/projects-list.ts';

test('projected impact column renders for each project',
    () => {
        const projects = [
            { id: 'p1', status: 'under-review', title: 't',
              /* ...minimum required fields... */ },
        ];
        const scoreMap = new Map([
            ['p1', {
                baselineAvg: 47,
                latestActualAvg: undefined,
                baselineCount: 3,
                totalActiveObjectives: 3,
            }],
        ]);
        const p = new ProjectsListPresenter(
            projects, scoreMap);
        const html = p.render().toString();
        assert.ok(html.includes('+47'));
        assert.ok(html.includes(
            'data-score-present="true"',
        ));
        assert.ok(html.includes(
            'data-score-value="47"',
        ));
    });

test('missing score renders absent and sorts last',
    () => {
        const projects = [
            { id: 'p1', status: 'under-review', title: 't' },
        ];
        const scoreMap = new Map([
            ['p1', {
                baselineAvg: undefined,
                latestActualAvg: undefined,
                baselineCount: 0,
                totalActiveObjectives: 3,
            }],
        ]);
        const p = new ProjectsListPresenter(
            projects, scoreMap,
        );
        const html = p.render().toString();
        assert.ok(html.includes(
            'data-score-present="false"',
        ));
    });
```

- [ ] **Step 3: Run test to verify it fails**

Run:
`node --test --strip-types tests/presenter-projects-list-column.test.ts`

Expected: FAIL — the list presenter doesn't accept a
scoreMap yet.

- [ ] **Step 4: Add the column to the list presenter**

In `<LIST_PRESENTER>`, accept a second constructor arg —
the score map. The cell carries two data attributes so
the sort logic doesn't need a magic-value sentinel
(`-9999` collides with real scores). Sort by presence
first, value second.

```ts
import {
    formatSigned,
    toneForScore,
} from '../scoring-format.ts';
import { DISPLAY_ABSENT } from '../format.ts';

// In the row markup:
const score = scoreMap.get(project.id);
const projected = score?.baselineAvg;
const hasScore = projected !== undefined;
const tone = hasScore
    ? toneForScore(projected)
    : 'neutral';
const display = hasScore
    ? formatSigned(projected)
    : DISPLAY_ABSENT;
const cell = html`
    <td class="projected-impact-cell"
        data-score-present="${hasScore}"
        data-score-value="${hasScore ? projected : ''}">
        <strong data-tone="${tone}">
            ${display}
        </strong>
        ${score
            ? html`<span class="meta">${
                score.baselineCount}/${
                score.totalActiveObjectives}</span>`
            : html``}
    </td>
`;
```

The sort layer reads `data-score-present` first
(present rows ahead of absent), then `data-score-value`
as a numeric secondary key.

- [ ] **Step 5: Update `web-app/projects/index.ts`**

```ts
import {
    postProjectsScoreColumn,
    subscribeProjectScoreChanges,
} from '../app/adapters/project-scoring.ts';
import {
    subscribeObjectiveChanges,
} from '../app/adapters/objectives.ts';
import {
    subscribeProjectChanges,
} from '../app/adapters/projects.ts';

async function renderList(): Promise<void> {
    const ctx = createRequestContext();
    const [projects, scoreColumn] = await Promise.all([
        ctx.GET<ProjectEntity[]>('projects'),
        postProjectsScoreColumn(ctx),
    ]);
    const scoreMap = new Map(
        scoreColumn.map(s => [s.projectId, s]),
    );
    const presenter = new ProjectsListPresenter(
        projects, scoreMap,
    );
    setHtml($('#project-list'), presenter.render());
}

subscribeProjectScoreChanges(renderList);
subscribeObjectiveChanges(renderList);
subscribeProjectChanges(renderList);

await renderList();
```

- [ ] **Step 6: Run test to verify it passes**

Run:
`node --test --strip-types tests/presenter-projects-list-column.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web-app/projects/index.ts web-app/app/presenters/projects-list.ts tests/presenter-projects-list-column.test.ts
git commit -m "add Projected Impact column to projects list"
```

### Task 5.4: Wire the dashboard

**Files:**
- Modify: `web-app/dashboard/index.html`
- Modify: `web-app/dashboard/index.ts`

- [ ] **Step 1: Update the HTML**

Add to `dashboard/index.html`:

```html
<div id="portfolio-impact-card"></div>
<div id="objective-aggregates-card"></div>
```

- [ ] **Step 2: Update `dashboard/index.ts`**

```ts
import {
    postPortfolioImpactSummary,
    postObjectiveAggregates,
    subscribeProjectScoreChanges,
} from '../app/adapters/project-scoring.ts';
import {
    postActiveObjectivesRetrieval,
    postCurrentObjectiveDefinition,
    subscribeObjectiveChanges,
} from '../app/adapters/objectives.ts';
import {
    subscribeProjectChanges,
} from '../app/adapters/projects.ts';
import {
    PortfolioImpactPresenter,
    DashboardObjectiveAggregatesPresenter,
} from '../app/presenters';

async function renderImpactSurfaces(): Promise<void> {
    const ctx = createRequestContext();
    const [summary, active, aggregates] =
        await Promise.all([
            postPortfolioImpactSummary(ctx),
            postActiveObjectivesRetrieval(ctx),
            postObjectiveAggregates(ctx),
        ]);
    const defs = new Map();
    for (const o of active) {
        defs.set(o.id,
            await postCurrentObjectiveDefinition(ctx, o.id));
    }

    setHtml($('#portfolio-impact-card'),
        new PortfolioImpactPresenter(summary).buildCard());
    setHtml($('#objective-aggregates-card'),
        new DashboardObjectiveAggregatesPresenter(
            active, defs, aggregates,
        ).buildCard());
}

subscribeProjectScoreChanges(renderImpactSurfaces);
subscribeObjectiveChanges(renderImpactSurfaces);
subscribeProjectChanges(renderImpactSurfaces);

await renderImpactSurfaces();
```

- [ ] **Step 3: Manual verification**

After `./serve 8080`:
- Open `dashboard/index.html`
- Confirm the Portfolio Impact card renders next to the
  existing Time and Cost gauges
- Confirm the per-objective aggregates card renders below
- Edit an approved project's scores via the project-detail
  Log measurement modal; verify the dashboard updates in
  near-real-time (via `scoreChanges` channel)

- [ ] **Step 4: Commit**

```bash
git add web-app/dashboard/index.html web-app/dashboard/index.ts
git commit -m "wire dashboard Portfolio Impact and aggregates cards"
```

---

## Phase 6 — Manual TEST-PLAN.md additions

### Task 6.1: Add Section K to `TEST-PLAN.md`

**Files:**
- Modify: `TEST-PLAN.md`

- [ ] **Step 1: Pick a unique anchor**

Open `TEST-PLAN.md`. Find the end of the current last
section (likely Section J — Teardown). Add Section K
**before** the Teardown section if J is teardown; else
**at the end** of the file.

- [ ] **Step 2: Add Section K**

```markdown
## K. Objectives & Scoring

Owner agents: Agent-G (K1–K8), Agent-E (K9–K23 + K30),
Agent-CH (K27–K29). Mutation domain delta:

- Agent-G adds: `objectives`, `objective_revisions`,
  `deprecated_objectives`
- Agent-E adds: `project_objective_baseline_scores`,
  `project_objective_actual_scores`
- Agent-CH stays read-only

### K1–K8 — Organization Objectives box (Agent-G)

**K1.** Open Organization page; confirm Objectives box
renders below the existing Overview/Usage/Admin cards with
5 seeded active objectives in position order. PASS if all
5 names display.

**K2.** Click `+ Add objective`; confirm modal opens. Enter
name "Test Objective" and description "Test desc"; click
Add. PASS if the new objective appears at the bottom of the
active list.

**K3.** Click `Edit` on an active objective; confirm modal
opens pre-filled. Change the name; click Save. PASS if the
list re-renders with the new name.

**K4.** Click `Deprecate` on an active objective; confirm
dialog opens. Confirm. PASS if the objective moves from
active to the Deprecated sub-section, with strikethrough.

**K5.** Click `Reactivate` on a deprecated objective; PASS
if it returns to the active list.

**K6.** Drag an objective to a new position. PASS if the
new position persists across a page reload.

**K7.** Open an existing project's history modal (created
in K30). PASS if events that predate a K3 edit display the
OLD name, not the new one (temporal name resolution).

**K8.** Empty state: wipe localStorage via DevTools
(Application > Local Storage > Clear All), then navigate
to the Organization page. PASS if the empty-state copy
"No objectives yet. Add one to get started." renders
(or the bootstrap redirects to the snapshots page per the
existing missing-schema rule). Restore via mock data
afterward.

### K9–K18 — Project detail action bar + Score + Approve (Agent-E)

**K9.** Open a `submitted` project; confirm action bar shows
the existing buttons (no Score yet — until status is
under-review).

**K10.** Transition status to `under-review` via the edit
form. PASS if `Score` button appears in the action bar.

**K11.** Click `Approve`; PASS if disabled with tooltip
"N objectives unscored" (matching the count of active
objectives).

**K12.** Click `Score`; PASS if modal opens with one slider
per active objective, all rendering visibly unset with
"Score required" hint.

**K13.** Drag two of the sliders to non-zero values; click
Save baselines. PASS if modal closes and the read-only
Objectives section on the page shows two baseline-scored
rows; Approve button **still** disabled because remaining
objectives unscored.

**K14.** Reopen Score modal; PASS if previously-set sliders
are pre-filled with their values; un-set sliders remain
visibly unset.

**K15.** Drag remaining sliders; save. PASS if Approve
button enables.

**K16.** Click Approve; confirm dialog opens. Confirm. PASS
if project status flips to `approved` and the action bar
re-renders with `Log measurement` / `Complete` / `View
history` buttons.

**K17.** Verify negative-score path: open a different
under-review project; in Score modal, drag one slider to
the far left (-100). Save. PASS if the project history
modal (open via View history later, once approved) shows
the negative score in red.

**K18.** Verify "no-payload" save: open Score modal on a
fully-scored project; don't move any slider; click Save
baselines. PASS if no new event rows are written (verify
via console: `localStorage.getItem(
'fusion-ai:project_objective_baseline_scores')` count
unchanged).

### K19–K23 — Log measurement + Complete (Agent-E)

**K19.** Open an `approved` project; click `Log measurement`;
PASS if modal opens with sliders pre-filled with baseline
values (no prior actuals) and a caption "Baseline: X · Last
actual: none yet."

**K20.** Drag one slider; click Save measurement. PASS if
the modal closes and the read-only Objectives section's
actual column updates for that objective.

**K21.** Click Log measurement again; PASS if the moved
slider now pre-fills with its latest actual value, caption
shows "Last actual: ... (date)."

**K22.** Click Complete on an approved project that lacks
actuals for some objectives; PASS if button is disabled
with tooltip listing missing objectives.

**K23.** Log measurements for every objective; click
Complete; confirm. PASS if status flips to `completed`.

### K24–K26 — Projects list Projected Impact column (Agent-E)

**K24.** Open Projects list; PASS if new column "Projected
Impact" renders for each row. Pre-approval projects with
no scores show "—"; scored projects show signed value.

**K25.** Sort by Projected Impact descending; PASS if rows
re-order accordingly (most-positive first).

**K26.** Filter to `under-review` status + sort by Projected
Impact descending; PASS if the result is the "review queue
ranked by impact" workflow we designed.

### K27–K29 — Dashboard Portfolio Impact + Aggregates (Agent-CH)

**K27.** Open dashboard; PASS if four cards render: Time,
Cost, Portfolio Impact (new bipolar arc), Aggregate
Objectives box (new full-width row below).

**K28.** Inspect the Portfolio Impact gauge. PASS if:
- The arc has muted background visible at all values
- For a net-positive portfolio, value arcs sweep right and
  use green tones
- For a net-negative portfolio, value arcs sweep left and
  use red tones
- The "actual" tick is visually distinct from the baseline
  area (thinner / different opacity)

**K29.** From another tab, log a measurement on an approved
project. PASS if the dashboard cards update within ~1
second (StorageEvent + scoreChanges propagation).

### K30 — Project history modal (Agent-E)

**K30.** Open an approved project's View history modal.
PASS if:
- Events render in chronological order
- Each row shows date, event kind, objective name (as it
  was at the event's moment), and detail
- After an objective rename (K3), historical events still
  display the OLD name; events after the rename show the
  NEW name
- Baseline revisions appear as their own event rows (not
  collapsed)
```

- [ ] **Step 3: Commit**

```bash
git add TEST-PLAN.md
git commit -m "add Section K (Objectives & Scoring) to TEST-PLAN"
```

---

## Phase 7 — Final verification

### Task 7.1: Run the full automated suite

- [ ] **Step 1: Validate**

Run: `./validate`

Expected: type-check passes; **all ~800 automated tests
pass**; lint passes (78-char line width on all touched
`.ts`, `.html`, `.css` files).

If any failure: fix root cause, do NOT loosen the test.
Re-run.

- [ ] **Step 2: Build**

Run: `./build --no-zip /tmp/build-objectives`

Expected: build completes; bundle output in
`/tmp/build-objectives`. No build-time TypeScript errors.

- [ ] **Step 3: Serve and smoke-test**

Run: `TMPDIR=/tmp/claude ./serve 8080`

Open `http://localhost:8080/landing/index.html`. Sign in.
Run the golden-path smoke test from the spec
(docs/superpowers/specs/2026-05-14-objectives-design.md
section "Verification" item 4) end to end.

- [ ] **Step 4: Confirm** the file manifest matches the spec

Run:
`git diff --stat origin/master..HEAD`

Compare against the spec's File Manifest section. Every
file listed there should appear in the diff stat (modified
or new). If a file in the manifest doesn't appear in the
diff, that file's task was missed — go back and complete
it.

- [ ] **Step 5: Final commit (if any clean-up changes)**

```bash
git status
# If anything is dirty, address it:
# - whitespace, unused imports, stale TODO comments
git add -p
git commit -m "polish: ..."
```

---

## Self-review

After completing the plan above, run through this checklist
before declaring done:

**1. Spec coverage:** Walk each section of
`docs/superpowers/specs/2026-05-14-objectives-design.md`
and confirm there's at least one task that implements it.

| Spec section | Plan task(s) |
|---|---|
| Schema — 5 new tables (typed EntityStore) | 1.3 |
| Schema — row types | 1.1 |
| Schema — ProjectEntity changes | 1.2 |
| ProjectView — per-objective derived methods | 2.11 |
| Validators — entity validators (`validate*Entity`) | 1.4 |
| Validators — `validateProjectEntity` delta | 1.5 |
| Validators — ValidationResult<P> | 2.1 |
| Validators — approval/completion validators | 2.9 |
| Adapter — objectives.ts (+ subscribe channel) | 2.2, 2.3, 2.4 |
| Adapter — project-scoring.ts (+ subscribe channel) | 2.5–2.8 |
| Adapter — project-publish.ts | 2.9 |
| Adapter — projects.ts ProjectView | 2.11 |
| Adapter — dashboard.ts updates | 2.12 |
| Shared scoring-format helpers | 2.13 |
| Presenters — 8 new | 3.1–3.8 |
| Presenters — existing updates | 3.9 |
| Presenters — barrel | 3.10 |
| CSS — components.css | 4.1 |
| CSS — pages.css | 4.2 |
| Page — organization | 5.1 |
| Page — projects/detail | 5.2 |
| Page — projects/index list column | 5.3 |
| Page — dashboard | 5.4 |
| Mock data | 1.7, 1.8 |
| TEST-PLAN.md additions | 6.1 |
| Verification | 7.1 |

Two original tasks were dropped during plan revision:
- **1.6** (SCHEMA_VERSION + bootstrap wipe) — Premature
  Generalization + Internal Defense. Schema migration
  belongs with Postgres, not the first localStorage change.
- **2.10** (shared `changes.ts`) — invented module; the
  codebase uses per-adapter `createSubscriptionChannel`
  (see `adapters/projects.ts:14-28`).

If any spec requirement has no task, ADD the task before
declaring done.

**2. Placeholder scan:** Search the plan for "TODO",
"TBD", "fill in", "similar to", "implement later", "add
appropriate". Should find zero matches except (1) inside
this paragraph and (2) inside the "Out of scope" section
of the spec (which is intentional). If found, replace with
actual content.

**3. Type consistency:** Confirm the same method/function
name renders identically across the tasks where it appears:
- `postProjectScoringRetrieval` (Tasks 2.6, 2.9, 5.2)
- `postProjectBaselineScoring` (Tasks 2.8, 5.2)
- `postProjectActualMeasurement` (Tasks 2.8, 5.2)
- `validateProjectForApproval` (Tasks 2.9, 3.2, 5.2)
- `validateProjectForCompletion` (Tasks 2.9, 3.2, 5.2)
- `postActiveObjectivesRetrieval` (Tasks 2.3, 2.9, 5.1,
  5.2, 5.4)
- `postCurrentObjectiveDefinition` (Tasks 2.3, 5.1, 5.2,
  5.4)
- `postObjectiveDefinitionAtTime` (Task 2.3 + used by
  history modal in 5.2)
- `subscribeObjectiveChanges` (Tasks 2.2, 5.1, 5.2, 5.3,
  5.4)
- `subscribeProjectScoreChanges` (Tasks 2.5, 5.2, 5.3,
  5.4)
- `subscribeProjectChanges` (Tasks 5.2, 5.3, 5.4; exists
  in `adapters/projects.ts:20`)
- `ProjectView.baselineTotal` / `actualTotal` /
  `isBaselineScored` / `isActualScored` (defined 2.11;
  presenters consume score arrays directly via the
  shared `latestPerPair` from `scoring-format.ts` —
  Task 2.13)
- `latestPerPair` / `formatSigned` / `toneForScore` —
  shared module added in Task 2.13, imported by Tasks
  2.7, 3.4, 3.5, 3.7, 3.8, 5.2, 5.3

No name drift detected.

**4. Test-failure / passing direction:** Every Step 2
("Run to verify it fails") names a specific failure mode.
Every Step 4 ("Run to verify it passes") names PASS.

---

## Done

When every task above is `- [x]` checked off and the
self-review passes, this plan is complete. The work is then
ready for either:

- A user-driven `./validate && ./build` cycle producing a
  shippable ZIP, OR
- The manual TEST-PLAN.md Phase 1–5 protocol run, with
  Section K cases exercised on top of the existing
  protocol.

Neither is part of this plan itself.
