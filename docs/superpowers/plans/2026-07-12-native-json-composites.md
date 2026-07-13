# Native JSON Composites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Every dispatched subagent prompt MUST begin with
> the literal phrase `Go to Medium Church!` (see Global
> Constraints).

**Goal:** Every composite value in an entity body — arrays and
objects — rides the wire and lands in storage as native nested
JSON, never as a JSON-encoded string; the snapshot schema
version concept is eliminated entirely.

**Architecture:** The canonical HTTP-message codec
(`shared/http-message/json-codec.ts`) already stores JSON
bodies inline as native JSON — the double encoding lives only
in the application layer, where six fields are minted through
`jsonArrayField()` / `jsonObjectField()` (branded strings) and
re-parsed at every read. The migration flips one family at a
time — members, record-attributes, flows, work-orders — each
flip converting the family's mint sites, validator gates,
derive/parse sites, seed data, and tests together so every
commit is green. The existing structural validators
(`asArray`, `asObject`, `asStoredGraph`, …) already operate on
`unknown`; going native means deleting the `parseOrThrow`
string step in front of them, not writing new validation. The
graph fields keep their exact inner key shape (the stored
tongue: `positionX`, `fromNodeId`, `attribute_id`,
`isRequired`) — this plan un-strings the fields; it does not
re-key their contents.

**Tech Stack:** Vanilla TypeScript (ES2024, strict,
`noUncheckedIndexedAccess`), zero runtime dependencies, Node
`node:test` via `./test`, full gate via `./validate`.

## Global Constraints

- Subagent prompts MUST begin with `Go to Medium Church!`
  then state: 78-char max line length; 4-space indent; commit
  subjects ≈50 chars, present-tense imperative, no body; the
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  trailer plus the `Claude-Session:` trailer the harness
  mandates; RequestContext as first adapter argument;
  snake_case storage keys / camelCase domain; validators at
  the gate, never downstream (no Internal Defense); no
  untyped `any`; tests assert behavior, never implementation.
- `./validate` must pass before every commit (tsc + tests +
  78-char lint). Run it — do not assume.
- One concern per commit. Linear history. Never merge.
- Scope: un-string the six branded fields + delete the
  snapshot version gate. Do NOT re-key graph internals
  (`attribute_id` stays `attribute_id` inside graph
  `attributes`), do NOT touch the canonical message codec,
  do NOT introduce compatibility shims or dual-read paths —
  old persisted data is explicitly not a concern.
- Explicit non-goals (candidate follow-ups, not this plan):
  unifying the stored graph tongue with the domain shape;
  any change to `message`/`message_hash` (the stored
  canonical message stays a string column — it IS the HTTP
  message, and the hash covenant needs stable bytes).
- The six fields, for reference everywhere below:
  `human_members.strengths`, `human_members.team_dimensions`,
  `record_attributes.options`, `record_attributes.constraints`,
  `flows.graph` (document body + `FlowWithGraph`),
  `work_orders.flow_graph`.

---

### Task 1: Retire the snapshot schema version concept

The user has ruled: no version bump, no version gate — the
concept dies. Exports stop stamping `__schema_version__`;
imports stop checking it. Elimination is strictly permissive:
`parseAndValidateSnapshot` already ignores unknown top-level
keys, so old exports that still carry the key import cleanly.

**Files:**
- Modify: `api/db.ts:271-322` (comment block + two constants)
- Modify: `api/snapshot-validator.ts:1-10,43-69,96-109`
- Modify: `api/db-backed.ts:1-10,105-125`
- Modify: `web-app/app/adapters/snapshots.ts:1-10,180-186`
- Modify: `tests/snapshot-import-validation.test.ts`
- Modify: `tests/snapshot-import-identity-validation.test.ts`
- Modify: `tests/snapshot-wipe-on-fail.test.ts`
- Modify: `tests/adapters-snapshots.test.ts`
- Modify: `tests/db-localstorage-compression.test.ts`
- Modify: `CLAUDE.md` (§ Gotchas "Snapshot version gate"
  bullet), `SCHEMA.md:32-40`, `ARCHITECTURE.md:660-690`
  version mentions, `API.md:450-470`, `API-TREE.md:34,64,71`
  annotations, `TEST-PLAN.md:2759` (L7 sentence)
- Leave untouched: dated archives under
  `docs/superpowers/specs/` and `docs/superpowers/plans/`
  (historical record).

**Interfaces:**
- Consumes: nothing from other tasks (run first).
- Produces: `parseAndValidateSnapshot(json: string)` with no
  version check; `DbBacked.getSnapshot()` output without the
  `__schema_version__` key. `SnapshotVersionMismatchError`,
  `SNAPSHOT_SCHEMA_VERSION`, `SNAPSHOT_SCHEMA_VERSION_KEY` no
  longer exist — later tasks must not reference them.

- [ ] **Step 1: Flip the covenant tests first**

In each of the five test files, `grep -n
"SNAPSHOT_SCHEMA_VERSION\|SnapshotVersionMismatch\|__schema_version__"`
and apply exactly two moves:

1. Fixtures that stamp the key so an import passes the gate —
   delete the stamp line(s) and the now-unused imports. The
   fixture then represents a version-free snapshot, which
   must import cleanly.
2. Cases that assert rejection (`SnapshotVersionMismatchError`
   or a version-mismatch message) on an otherwise-valid
   snapshot — delete the whole case. The covenant they pinned
   no longer exists. Cases where the version stamp is
   incidental to a DIFFERENT rejection (bad row, retired
   table) keep the case, minus the stamp.

- [ ] **Step 2: Run tests to verify the flip fails**

Run: `./test 2>&1 | tail -20`
Expected: FAIL — imports of now-version-free fixtures are
rejected by the still-present gate
(`SnapshotVersionMismatchError: Snapshot schema version is
missing`).

- [ ] **Step 3: Remove the gate from source**

`api/snapshot-validator.ts` — delete the two imports, the
whole `SnapshotVersionMismatchError` class (lines 43-69), and
the gate block (lines 96-109). The import block becomes:

```ts
import { TABLE_NAMES } from './db.ts';
```

`api/db.ts` — delete both constants and the entire doctrine
comment block above them (the paragraph beginning "// snapshot-
validator.ts) before any table is read." through line 322 —
everything that documents the version scheme, including the
ASYMMETRY and MID-SEQUENCE WINDOW notes). Keep the
`__schema__` marker-store material — that is IndexedDB
plumbing, not the snapshot version.

`api/db-backed.ts` — delete the two imports, the comment at
line ~109 referencing the key, and the stamp:

```ts
        obj[SNAPSHOT_SCHEMA_VERSION_KEY] =
            SNAPSHOT_SCHEMA_VERSION;
```

along with the "Stamped OUTSIDE the tx…" comment above it.

`web-app/app/adapters/snapshots.ts` — delete the two imports
and the version finding inside `scanForRetiredKeys`:

```ts
    if (
        snap[SNAPSHOT_SCHEMA_VERSION_KEY]
            !== SNAPSHOT_SCHEMA_VERSION
    ) {
        findings.push(SNAPSHOT_SCHEMA_VERSION_KEY);
    }
```

plus the sentence in the comment above it that promises the
server-side version guarantee ("Same no-default rule here: an
absent or mismatched marker is a finding, never silently
accepted." and the reference to the version equality in the
function-header comment at line ~87).

- [ ] **Step 4: Run tests to verify they pass**

Run: `./test 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 5: Purge the concept from live docs**

- `CLAUDE.md`: delete the whole "**Snapshot version gate.**"
  gotcha bullet; in the automated-tests paragraph delete the
  words "/ v2-reject / v3 round-trip" from the snapshot list
  if those cases were deleted in Step 1 (keep whatever still
  exists).
- `SCHEMA.md:32-40`: delete the paragraph describing
  `SNAPSHOT_SCHEMA_VERSION` and its bump history.
- `ARCHITECTURE.md`: rewrite the two narrative sentences at
  ~662 and ~683-686 to drop the version-bump clauses (keep
  the surrounding phase history).
- `API.md:450-470`: delete the `__schema_version__` bullet
  content — state instead that a snapshot is the table-keyed
  row export with no version marker, and that an import
  carries no schema version: an incompatible body shape
  fails at use (derive/read), never at an import-time
  version check.
- `API-TREE.md`: in the three annotations (lines ~34, ~64,
  ~71) delete the parenthetical `SNAPSHOT_SCHEMA_VERSION …`
  clauses; keep the rest of each annotation.
- `TEST-PLAN.md:2759`: in L7, delete the sentence "A real
  pre-Final v2 snapshot REJECTS with
  `SnapshotVersionMismatchError`."

- [ ] **Step 6: Validate and commit**

Run: `./validate`
Expected: PASS (type-check, tests, line lint, schema-svg).

```bash
git add -A
git commit -m "retire the snapshot schema version gate" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_01MiYUGSJsWiUhoLxsbjjJPn"
```

---

### Task 2: Members family — strengths and team_dimensions

**Files:**
- Modify: `api/types.ts:701-702` (entity), `714-735`
  (HumanMember fields/ctor), `786-801` (accessors)
- Modify: `api/validators.ts` — add `pickStringArray` /
  `pickStringNumberRecord` beside the pick helpers (~line
  608); rewrite gates at `1145-1180` and `1211-1245`; delete
  `validateStringNumberRecordJson` (235-251)
- Modify: `web-app/app/presenters/human-member-detail.ts:117`
- Modify: `web-app/members/index.ts:454-462`
- Modify: `api/mock-data/seed-message-pairs.ts:653-655,
  1228-1240`
- Test: `tests/validators.test.ts` (new covenant cases PLUS
  the existing member cases — `validHumanMember` at 28-33
  mints strings; the structural rejects at 101-127 pin the
  old `HumanMemberEntity.`-prefixed labels — see Step 4),
  `tests/member-fixtures.ts:45-46`,
  `tests/adapters-members.test.ts:32-33`,
  `tests/adapters-members-union.test.ts:341-342`,
  `tests/api-human-members.test.ts:40-41`,
  `tests/api-pii-hard-delete.test.ts:59-60`,
  `tests/drift-phase15-cores-parity.test.ts:539-540,597-598`,
  `tests/presenter-member-detail.test.ts:110-111`,
  `tests/command-palette-search.test.ts:78-79`,
  `tests/drift-identities.test.ts:131-132,924-925,947-948`,
  `tests/drift-roster.test.ts:329-330,348-349`,
  `tests/api-member-documents.test.ts:101-102` (fixture
  mints)

**Interfaces:**
- Consumes: existing `asArray`, `asString`, `asObject`,
  `asNumber` (api/validators.ts).
- Produces:
  `HumanMemberEntity.strengths: string[]`,
  `HumanMemberEntity.team_dimensions: Record<string, number>`;
  `pickStringArray(body: Record<string, unknown>, key: string):
  string[]`;
  `pickStringNumberRecord(body: Record<string, unknown>,
  key: string): Record<string, number>`;
  `HumanMember.strengths(): readonly string[]` (renamed from
  `parsedStrengths()`);
  `HumanMember.teamDimensions(): Readonly<Record<string,
  number>>` (renamed from `parsedTeamDimensions()`).
  Task 3 reuses `pickStringArray`.

- [ ] **Step 1: Write the failing covenant tests**

Append to `tests/validators.test.ts` (imports at top of file
already include `validateHumanMemberEntity`; extend as
needed):

```ts
test(
    'validateHumanMemberEntity accepts native'
    + ' strengths and team_dimensions',
    () => {
        const entity = validateHumanMemberEntity({
            title: 'Engineer',
            department: 'R&D',
            strengths: ['systems', 'mentoring'],
            team_dimensions: { driver: 60, amiable: 40 },
        });
        assert.deepEqual(
            entity.strengths,
            ['systems', 'mentoring'],
        );
        assert.deepEqual(
            entity.team_dimensions,
            { driver: 60, amiable: 40 },
        );
    },
);

test(
    'validateHumanMemberEntity rejects a'
    + ' JSON-encoded strengths string',
    () => {
        assert.throws(
            () => validateHumanMemberEntity({
                title: 'Engineer',
                department: 'R&D',
                strengths: '["systems"]',
                team_dimensions: { driver: 60 },
            }),
            /expected array for strengths/,
        );
    },
);

test(
    'validateHumanMemberEntity rejects a'
    + ' JSON-encoded team_dimensions string',
    () => {
        assert.throws(
            () => validateHumanMemberEntity({
                title: 'Engineer',
                department: 'R&D',
                strengths: [],
                team_dimensions: '{"driver":60}',
            }),
            /expected object for team_dimensions/,
        );
    },
);
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test --strip-types tests/validators.test.ts \
2>&1 | tail -15`
Expected: FAIL — native array currently rejected by
`asJsonArrayField` with "expected string for strengths".

- [ ] **Step 3: Implement the native gates and types**

`api/validators.ts` — add beside the pick helpers (after
`pickBoolean`, ~line 594):

```ts
export function pickStringArray(
    body: Record<string, unknown>,
    key: string,
): string[] {
    const arr = asArray(body[key], key);
    return arr.map((item, i) =>
        asString(item, key + '[' + i + ']'),
    );
}

export function pickStringNumberRecord(
    body: Record<string, unknown>,
    key: string,
): Record<string, number> {
    const obj = asObject(body[key], key);
    const out: Record<string, number> = {};
    for (
        const [k, v] of Object.entries(obj)
    ) {
        out[k] = asNumber(v, key + '.' + k);
    }
    return out;
}
```

Rewrite both member gates. `validateHumanMemberEntity`
(1145-1180) — the two composite blocks become:

```ts
    const strengths = pickStringArray(
        body, 'strengths',
    );
    const teamDimensions =
        pickStringNumberRecord(
            body, 'team_dimensions',
        );
```

(delete the separate `validateStringArrayJson` /
`validateStringNumberRecordJson` calls and the "Structural
gate: the columns store raw JSON strings…" comment — the pick
IS the structural gate now). `validateHumanMemberDocumentBody`
(1211-1245): same two-block replacement; update its doc
comment sentence that names
`validateStringArrayJson/validateStringNumberRecordJson` to
name `pickStringArray/pickStringNumberRecord`.

Delete `validateStringNumberRecordJson` (lines 235-251) —
members were its only caller.

`api/types.ts`:

```ts
export interface HumanMemberEntity {
    id: MemberId;
    title: string;
    department: string;
    strengths: string[];
    team_dimensions: Record<string, number>;
}
```

`HumanMember`: fields become

```ts
    readonly #strengths: readonly string[];
    readonly #teamDimensions:
        Readonly<Record<string, number>>;
```

(constructor assignments unchanged in shape). Accessors —
rename and simplify; the gate validated at the edge, so the
walls trust (delete the `validateStringArrayJson` /
`validateStringNumberRecordJson` imports from types.ts if
present — they are imported in validators only; the accessors
today live in types.ts and call validators — remove those
imports from `api/types.ts`):

```ts
    strengths(): readonly string[] {
        return this.#strengths;
    }

    teamDimensions():
        Readonly<Record<string, number>> {
        return this.#teamDimensions;
    }
```

Then `grep -rn "parsedStrengths\|parsedTeamDimensions"
web-app tests api` and rename every call site to
`strengths()` / `teamDimensions()`.

`web-app/app/presenters/human-member-detail.ts:117`:

```ts
        strengths: [...draft.strengths],
```

(drop the `jsonArrayField` wrap and its import.
`HumanMemberDraft` is `Omit<HumanMemberEntity, 'id'> & {…}`
(`adapters/members.ts:49`) — it tracks the entity flip with
no edit of its own, and `HumanMemberDraftFields.strengths`
is already `readonly string[]`).

`web-app/members/index.ts:454-462` — the creation body:

```ts
                strengths: [],
                team_dimensions: {
                    driver: DEFAULT_DIM,
                    analytical: DEFAULT_DIM,
                    expressive: DEFAULT_DIM,
                    amiable: DEFAULT_DIM,
                },
```

(drop both wraps and their imports; `trimStrings` only
touches string values, so the composites pass through
untouched).

`api/mock-data/seed-message-pairs.ts:653-655`:

```ts
            strengths,
            team_dimensions,
```

and at 1228-1240, the literal arrays/objects lose their
wraps:

```ts
            strengths: [
                // …same literal items…
            ],
            team_dimensions: {
                // …same literal entries…
            },
```

- [ ] **Step 4: Flip the family's test fixtures**

The branded-mint unwraps first — in
`tests/presenter-member-detail.test.ts:110-111`,
`tests/command-palette-search.test.ts:78-79`,
`tests/drift-identities.test.ts:131-132,924-925,947-948`,
`tests/drift-roster.test.ts:329-330,348-349`, and any member
fixture in `tests/api-member-documents.test.ts`: unwrap the
mints —

```ts
            strengths: ['Leadership'],
            team_dimensions: { driver: 80 },
```

(pattern: `jsonArrayField(X)` → `X`; `jsonObjectField(X)` →
`X`; drop unused imports). Rename any `parsedStrengths()` /
`parsedTeamDimensions()` assertion calls.

Then the RAW STRING mints — fixtures that never used the
branded constructors, so the `jsonArrayField` grep cannot
see them. Mandatory inventory:

```bash
grep -rn -e "strengths: '" -e "team_dimensions: '" \
  tests/ api/ web-app/
```

Known sites (the grep is authoritative if lines have
moved): `tests/member-fixtures.ts:45-46`,
`tests/api-human-members.test.ts:40-41`,
`tests/api-pii-hard-delete.test.ts:59-60`,
`tests/api-member-documents.test.ts:101-102`,
`tests/drift-phase15-cores-parity.test.ts:539-540,597-598`
— `strengths: '[]'` → `strengths: []`,
`team_dimensions: '{}'` → `team_dimensions: {}` — plus the
cast variants `'[]' as never` / `'{}' as never` at
`tests/adapters-members.test.ts:32-33` and
`tests/adapters-members-union.test.ts:341-342` (the casts
go — native literals type-check without them).

Finally `tests/validators.test.ts`'s own member cases:

- `validHumanMember` (28-33) goes native:
  `strengths: ['analytical']`,
  `team_dimensions: { driver: 0.5 }`.
- The two structural rejects (101-127) feed JSON-encoded
  bad shapes and pin the old `HumanMemberEntity.`-prefixed
  labels. Rewrite both to native bad shapes with the
  pick-convention labels the new gate emits (the label IS
  the key): `strengths: [1, 2]` expecting
  `/expected string for strengths\[0\]/`, and
  `team_dimensions: { driver: 'high' }` expecting
  `/expected finite number for team_dimensions\.driver/`.

- [ ] **Step 5: Run the full suite, validate, commit**

Run: `./validate`
Expected: PASS.

```bash
git add -A
git commit -m "carry member composites as native JSON" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_01MiYUGSJsWiUhoLxsbjjJPn"
```

---

### Task 3: Record-attributes family — options and constraints

**Files:**
- Modify: `api/types.ts:1349-1350` (entity fields)
- Modify: `api/validators.ts` — rewrite both gates
  (2606-2684 and 2721-2790); delete
  `validateStringArrayJson` (207-219),
  `validateConstraintArrayJson` (221-233),
  `pickJsonArrayField` (596-601), `asJsonArrayField`
  (547-555)
- Modify: `api/types.ts:160-162,168-174` — delete the
  `JsonArrayField` brand and `jsonArrayField()` constructor
  ONLY (zero references remain after this task); the
  `JsonObjectField` brand at 164-166 and `jsonObjectField()`
  at 176-182 survive until Task 5
- Modify: `web-app/app/adapters/record-attributes.ts:40-58`
- Modify: `web-app/records/detail.ts:645-695`
- Modify: `api/mock-data/records.ts` (every
  `jsonArrayField(` site — lines 74-209, ~30 sites)
- Test: `tests/validators-records.test.ts` (covenant cases +
  fixture unwraps at 128-410),
  `tests/validators.test.ts:866-986` (`validSelectAttribute`
  + its cases — raw string mints + the
  `RecordAttributeEntity.options[0]` label pin — see Step 4),
  `tests/api-records-write.test.ts` (49-395),
  `tests/api-records.test.ts:115-143`,
  `tests/adapters-records.test.ts:76-165`,
  `tests/adapters-record-attributes.test.ts:21-22`,
  `tests/adapters-record-transitions.test.ts:204-205`,
  `tests/drift-records.test.ts:182-183`,
  `tests/api-record-attribute-document.test.ts:41-98`,
  `tests/shadow-ledger-invariants.test.ts:266-267`,
  `tests/api-record-attribute-restrict.test.ts:61-62,248-249`
  (its `flow_graph` mints at 282,485 stay for Task 5),
  `tests/drift-state-field-values.test.ts:75`,
  `tests/api-work-order-transition.test.ts:102-103,311-312`,
  `tests/drift-phase15-cores-parity.test.ts:1010-1011,
  1171-1172,1353-1354,1666-1667`,
  `tests/mock-data-records.test.ts:184` (drops its
  `parseOrThrow` — constraints arrive native)

**Interfaces:**
- Consumes: `pickStringArray` from Task 2; existing
  `asConstraint`, `assertConstraintAppliesTo`, `asArray`.
- Produces: `RecordAttributeEntity.options: string[]`,
  `RecordAttributeEntity.constraints: Constraint[]`. The
  wire JSON for a constraint is the `Constraint` union shape
  itself (`{ kind: 'regex', pattern: '…' }`, …).

- [ ] **Step 1: Write the failing covenant tests**

Append to `tests/validators-records.test.ts`:

```ts
test(
    'validateRecordAttributeEntity accepts native'
    + ' options and constraints',
    () => {
        const entity =
            validateRecordAttributeEntity({
                organization_id: 'org-1',
                record_id: 'rec-1',
                name: 'Severity',
                attribute_type: 'select',
                sort_order: 0,
                options: ['low', 'high'],
                constraints: [],
            });
        assert.deepEqual(
            entity.options, ['low', 'high'],
        );
        assert.deepEqual(entity.constraints, []);
    },
);

test(
    'validateRecordAttributeEntity rejects'
    + ' JSON-encoded options',
    () => {
        assert.throws(
            () => validateRecordAttributeEntity({
                organization_id: 'org-1',
                record_id: 'rec-1',
                name: 'Severity',
                attribute_type: 'select',
                sort_order: 0,
                options: '["low"]',
                constraints: [],
            }),
            /expected array for options/,
        );
    },
);
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test --strip-types \
tests/validators-records.test.ts 2>&1 | tail -10`
Expected: FAIL — "expected string for options".

- [ ] **Step 3: Implement**

`api/types.ts:1349-1350`:

```ts
    options: string[];
    constraints: Constraint[];
```

`api/validators.ts` — in BOTH gates
(`validateRecordAttributeEntity`,
`validateRecordAttributeDocumentBody`) replace the
constraints block (pick + parseOrThrow + asArray + loop) and
the options block (pick + validateStringArrayJson) with:

```ts
    const constraintsArr = asArray(
        body['constraints'], 'constraints',
    );
    const constraints = constraintsArr.map(
        (item, i) => {
            const constraint = asConstraint(
                item,
                'constraints[' + i + ']',
            );
            assertConstraintAppliesTo(
                constraint.kind,
                attributeType,
                'constraints[' + i + ']',
            );
            return constraint;
        },
    );
    const options = pickStringArray(
        body, 'options',
    );
    if (
        (attributeType === 'select'
            || attributeType === 'radio')
        && options.length === 0
    ) {
        throw new ValidationError(
            'RecordAttributeEntity.options'
            + ' must list at least one option'
            + " for attribute_type '"
            + attributeType + "'",
        );
    }
```

(structural labels follow the pick convention — the label IS
the key; only the hand-rolled select/radio ValidationError
keeps its full prefix, `RecordAttributeEntity.options` in the
entity gate and `RecordAttributeDocumentBody.options` in the
document gate, matching today). The return objects carry
`options` and `constraints` (the typed values, not
`optionsField`/`constraintsField`).

Delete `validateStringArrayJson`,
`validateConstraintArrayJson`, `pickJsonArrayField`,
`asJsonArrayField`. In `api/types.ts` delete `JsonArrayField`
and `jsonArrayField()`. Fix all now-dangling imports (tsc
enumerates them).

`web-app/app/adapters/record-attributes.ts` —
`toRecordAttribute` trusts the gate:

```ts
        options: entity.options,
        constraints: entity.constraints,
```

(drop the two `validate…Json` calls and imports).

`web-app/records/detail.ts` — `draftToEntities`:

```ts
            options: a.options,
            constraints: a.constraints
                .filter(isValidConstraint),
```

and the dirty check compares values, not minted strings. Add
one helper beside `draftAttributesDifferFromOriginal`:

```ts
function sameJson(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}
```

and replace the two comparison lines:

```ts
            || !sameJson(o.options, d.options)
            || !sameJson(o.constraints, d.constraints)
```

(this is an in-memory comparison idiom — the same posture as
`flow-stats-aggregate.ts`'s Map keys — not wire
serialization; key-order sensitivity is accepted: both sides
are gate- or UI-built in stable order, and a false "dirty"
merely enables the save button). Drop the `jsonArrayField`
import.

`api/mock-data/records.ts` — every site: `jsonArrayField(X)`
→ `X`, e.g.

```ts
            options: [],
            constraints: [],
```

- [ ] **Step 4: Flip the family's test fixtures**

Same unwrap pattern (`jsonArrayField(X)` → `X`) at every
listed site; drop unused imports. Enumerate with:

```bash
grep -rn "jsonArrayField" tests/
```

Expected after this step: zero hits repo-wide for
`jsonArrayField\|JsonArrayField`.

Then the RAW STRING mints the branded grep cannot see.
Mandatory inventory:

```bash
grep -rn -e "options: '" -e "constraints: '" \
  tests/ api/ web-app/
```

Known sites (the grep is authoritative if lines have
moved): `tests/validators.test.ts:866-986` —
`validSelectAttribute` and every case spreading it:
`options: '["High","Low"]'` → `options: ['High', 'Low']`,
constraint JSON strings → native `Constraint` literals; the
`options: '[3]'` reject becomes `options: [3]` expecting
`/expected string for options\[0\]/` (the
`RecordAttributeEntity.` label prefix drops with the pick
convention — only the hand-rolled select/radio error keeps
it) — then
`tests/api-record-attribute-restrict.test.ts:61-62,248-249`
(leave its `flow_graph` mints at 282,485 — Task 5),
`tests/drift-state-field-values.test.ts:75`,
`tests/api-work-order-transition.test.ts:102-103,311-312`,
`tests/drift-phase15-cores-parity.test.ts:1010-1011,
1171-1172,1353-1354,1666-1667`. In
`tests/mock-data-records.test.ts:184` the constraint-kinds
sweep drops its `parseOrThrow` + `Array.isArray`
scaffolding and iterates `attr.constraints` directly — the
seed now carries native arrays.

- [ ] **Step 5: Run the full suite, validate, commit**

Run: `./validate`
Expected: PASS.

```bash
git add -A
git commit -m "carry record attribute composites as native JSON" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_01MiYUGSJsWiUhoLxsbjjJPn"
```

---

### Task 4: Flows family — the graph document field

The flow document body already carries `graphDelta` and
`revivals` as native composites; this task brings `graph`
into line. The wire value is exactly what `storedGraph()`
returns today (the stored tongue), minus the stringify.

**Files:**
- Modify: `api/types.ts:1144-1160` (`FlowWithGraph`),
  `1296-1300` (delete `storedGraphField`), `1129-1133`
  (stale comment)
- Modify: `api/validators.ts:496-502` (delete
  `validateStoredGraphJson`), `1634-1720`
  (`FlowDocumentBody` + gate)
- Modify: `api/flow-graph-relations.ts:169-179`
- Modify: `api/derive-flows.ts:8,106-108`
- Modify: `api/routes.ts:93-98,139,1311-1313,1447-1453,1481`
- Modify: `web-app/app/adapters/flow-queries.ts:41-45`
- Modify: `web-app/app/adapters/flow-mutations.ts:23,
  402-404,421-424`
- Modify: `web-app/app/adapters/flow-publish.ts:7,22-24`
- Modify: `web-app/app/adapters/flow-export.ts:25,262-264,
  311-313` (BOTH `validateStoredGraphJson` sites — backup
  build and ZIP export)
- Modify: `web-app/app/adapters/work-orders-mutations.ts:
  12,97-100` — the freeze path validates the FLOW's graph
  (`validateStoredGraphJson(flow.graph, 'flow.graph')` →
  `asStoredGraph(flow.graph, 'flow.graph')`); a Task 4 site
  even though this file's WO-side mints (146,310) flip in
  Task 5
- Modify: `api/mock-data/flows.ts:52,246,648,1034,1067`
- Modify: `api/mock-data/seed-message-pairs.ts:888`
- Test: `tests/validators.test.ts` (covenant cases),
  `tests/adapters-flow-publish.test.ts:83`,
  `tests/drift-phase14-cores-parity.test.ts:175`,
  `tests/drift-phase15-cores-parity.test.ts:98,1092,1248`,
  `tests/flow-graph-roundtrip.test.ts` (flow half),
  `tests/api-flows-get-reassembly.test.ts:35`
  (`storedGraphField` import),
  `tests/mock-data-flow-relations.test.ts:7,48,54`,
  `tests/api-flow-document.test.ts`, `tests/drift-flows.test.ts`
  (fixture mints — enumerate per Step 4)
- The Files list is orientation; Step 4's grep is the
  authoritative checklist.

**Interfaces:**
- Consumes: existing `asStoredGraph(value: unknown, label:
  string): StoredGraph`, `storedGraph(graph: StoredGraph):
  Record<string, unknown>`, `asObject`, `byIdAscending`.
- Produces: `FlowWithGraph.graph: Record<string, unknown>`;
  `FlowDocumentBody.graph: Record<string, unknown>`;
  `normalizedStoredGraph(value: unknown):
  Record<string, unknown>` (renamed from
  `normalizedStoredGraphField`) in
  `api/flow-graph-relations.ts`. Work-order Task 5 does NOT
  depend on these — the families are independent.

- [ ] **Step 1: Write the failing covenant tests**

Append to `tests/validators.test.ts`:

```ts
test(
    'validateFlowDocumentBody accepts a native'
    + ' graph object',
    () => {
        const body = validateFlowDocumentBody({
            name: 'Onboarding',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout: 28800,
            state: 'active',
            state_at: '2026-07-12T00:00:00.000Z',
            state_event_id: 'evt-1',
            graph: { nodes: [], edges: [] },
            graphDelta: {
                nodes: [], edges: [],
                deletions: [],
                memberEvents: [],
                attributeEvents: [],
            },
            revivals: [],
        });
        assert.deepEqual(
            body.graph, { nodes: [], edges: [] },
        );
    },
);

test(
    'validateFlowDocumentBody rejects a'
    + ' JSON-encoded graph string',
    () => {
        assert.throws(
            () => validateFlowDocumentBody({
                name: 'Onboarding',
                is_locked: false,
                is_auto_layout: true,
                is_auto_fit: true,
                lock_timeout: 28800,
                state: 'active',
                state_at:
                    '2026-07-12T00:00:00.000Z',
                state_event_id: 'evt-1',
                graph: '{"nodes":[],"edges":[]}',
                graphDelta: {
                    nodes: [], edges: [],
                    deletions: [],
                    memberEvents: [],
                    attributeEvents: [],
                },
                revivals: [],
            }),
            /expected object for FlowDocumentBody\.graph/,
        );
    },
);
```

(If `validateFlowDocumentBody` requires exact `graphDelta`
sub-shape beyond this, mirror the minimal delta the file's
existing fixtures use.)

- [ ] **Step 2: Run to verify they fail**

Run: `node --test --strip-types tests/validators.test.ts \
2>&1 | tail -10`
Expected: FAIL — native object rejected with "expected string
for graph".

- [ ] **Step 3: Implement**

`api/validators.ts` — `FlowDocumentBody`:

```ts
    // The FULL reduced graph in EXACTLY the wire form GET
    // /flows/:id emits — a NATIVE nested object (the stored
    // tongue: storedGraph()'s shape); validated via
    // asStoredGraph and carried verbatim — the op never
    // re-serializes it.
    readonly graph: Record<string, unknown>;
```

and in the gate:

```ts
    const graph = asObject(
        body['graph'], 'FlowDocumentBody.graph',
    );
    asStoredGraph(graph, 'FlowDocumentBody.graph');
```

Delete `validateStoredGraphJson` (496-502).

`api/types.ts` — `FlowWithGraph`:

```ts
export type FlowWithGraph = FlowEntity & {
    graph: Record<string, unknown>;
    hasUndoHistory: boolean;
};
```

Delete `storedGraphField` (1296-1300). Rewrite the stale
comment at 1129-1133 to say the live graph rides the flow
document body's `graph` field as native JSON and the frozen
plane (`work_orders.flow_graph`) keeps its own copy.

`api/flow-graph-relations.ts:169-179`:

```ts
export function normalizedStoredGraph(
    value: unknown,
): Record<string, unknown> {
    const parsed = asStoredGraph(
        value, 'normalizedStoredGraph.graph',
    );
    return storedGraph({
        nodes: [...parsed.nodes].sort(byIdAscending),
        edges: [...parsed.edges].sort(byIdAscending),
    });
}
```

(imports: `asStoredGraph` from validators, `storedGraph`
from types; drop `validateStoredGraphJson`,
`storedGraphField`, `JsonObjectField`. Trim the long H7
comment's "JsonObjectField" wording to "graph value".)

`api/derive-flows.ts:106-108`:

```ts
        graph: normalizedStoredGraph(body['graph']),
```

(drop `pickJsonObjectField` from the import at line 8;
rename the imported normalizer).

`api/routes.ts`:
- 1311: `graph: storedGraph(reduceCreateGraphDelta(b.graphDelta)),`
- 1447-1453:

```ts
    const currentGraph = asStoredGraph(
        current.body['graph'],
        'flows/:id/undo current.graph',
    );
    const targetGraph = asStoredGraph(
        target.body['graph'],
        'flows/:id/undo target.graph',
    );
```

- 1481: `graph: asObject(target.body['graph'],
  'flows/:id/undo target.graph'),`
- imports (93-98; the `storedGraphField` import sits at
  139): swap `storedGraphField` → `storedGraph`,
  `validateStoredGraphJson` → `asStoredGraph`; add `asObject`
  if not present; keep `pickJsonObjectField` only if other
  routes still use it (work-orders does until Task 5 — check
  with grep before deleting the import).

`web-app/app/adapters/flow-queries.ts:41-45`:

```ts
function parseGraph(
    value: unknown,
): StoredGraph {
    return asStoredGraph(value, 'flow.graph');
}
```

(import `asStoredGraph`; call sites `parseGraph(f.graph)`
compile unchanged).

`web-app/app/adapters/flow-mutations.ts` — 402:
`asStoredGraph(current.graph, 'flow.graph')`; 421:

```ts
            graph: storedGraph({
                nodes: save.nodes,
                edges: save.edges,
            }),
```

(imports swap accordingly).

`web-app/app/adapters/flow-publish.ts:22` and
`web-app/app/adapters/flow-export.ts:262`:
`asStoredGraph(flow.graph, 'flow.graph')` (imports swap;
export keeps its `storedGraph(backup.flow.graph)` emission —
unchanged, the backup file format does not move).

`api/mock-data/flows.ts` — the four `graph:
jsonObjectField({…})` mints lose the wrap (`graph: {…}`);
1067: `asStoredGraph(flow.graph, 'seed flow ' + flow.id +
' graph')`. `api/mock-data/seed-message-pairs.ts:888`:
`graph: { nodes: [], edges: [] },`.

- [ ] **Step 4: Flip the family's test fixtures**

Enumerate remaining flow-graph mints:

```bash
grep -rn "jsonObjectField\|storedGraphField\|validateStoredGraphJson" \
  tests/ api/ web-app/
```

The grep is the checklist; the Files list is orientation.
For every FLOW site (a `graph:` field, a flow-document
fixture, or a read of `flow.graph` off a `FlowWithGraph` —
including the work-order FREEZE path at
`work-orders-mutations.ts:98`, which reads the flow's
graph): `jsonObjectField(X)` → `X`,
`storedGraphField(X)` → `storedGraph(X)`,
`validateStoredGraphJson(V, L)` → `asStoredGraph(V, L)`.
Work-order-PLANE sites (`flow_graph:` fields, `woGraph`,
`workOrderFlowGraph` helpers) stay branded — they flip in
Task 5. In `tests/flow-graph-roundtrip.test.ts`, the flow
case becomes: parse the native object with `asStoredGraph`,
re-emit with `storedGraph`, and `assert.deepEqual` the
emission against the original object (key-for-key identity —
the same covenant, no strings).

- [ ] **Step 5: Run the full suite, validate, commit**

Run: `./validate`
Expected: PASS.

```bash
git add -A
git commit -m "carry the flow graph as native JSON" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_01MiYUGSJsWiUhoLxsbjjJPn"
```

---

### Task 5: Work-orders family — flow_graph, then retire the machinery

Two commits: the family flip, then the now-dead branded
machinery removed.

**Files (commit A — the flip):**
- Modify: `api/types.ts:1302-1319`
  (`storedWorkOrderFlowGraphField` →
  `storedWorkOrderFlowGraph`; `WorkOrderEntity.flow_graph`)
- Modify: `api/validators.ts:504-542`
  (`validateWorkOrderFlowGraphJson` →
  `asWorkOrderFlowGraph`), `1844-1921` (both WO gates)
- Modify: `api/derive-states.ts:14,969-972,1686-1688`
- Modify: `api/record-attribute-refs.ts:3-4,124-129`
- Modify: `api/routes.ts:93,2079-2083`
- Modify: `web-app/app/adapters/work-orders-mutations.ts:
  146,310`
- Modify: `web-app/app/adapters/work-orders-queries.ts:
  95-120`
- Modify: `api/mock-data/work-orders.ts:50-120`,
  `api/mock-data/flow-workload.ts:94-99`
- Test: `tests/validators.test.ts` (covenant cases) plus
  every `flow_graph` fixture (enumerate per Step 4):
  `tests/api-work-order-history.test.ts:92`,
  `tests/api-work-order-document.test.ts:77`,
  `tests/api-work-orders-create.test.ts:68`,
  `tests/derive-states-work-orders.test.ts:153`,
  `tests/derive-work-order-lifecycle-for.test.ts:80`,
  `tests/api-organization-isolation.test.ts:259`,
  `tests/api-record-attribute-restrict.test.ts:282,485`,
  `tests/adapters-flow-stats.test.ts:167,175,255`,
  `tests/drift-work-orders.test.ts:120`,
  `tests/drift-states.test.ts:242`,
  `tests/drift-records.test.ts:1181`,
  `tests/drift-phase15-cores-parity.test.ts:1716`,
  `tests/shadow-ledger-invariants.test.ts:132`,
  `tests/flow-graph-roundtrip.test.ts:127` (WO half),
  `tests/mock-data-valid.test.ts` (if it names the field)

**Files (commit B — the retirement):**
- Modify: `api/types.ts:164-182` (delete `JsonObjectField`
  brand + `jsonObjectField()`)
- Modify: `api/validators.ts` (delete `asJsonObjectField` +
  `pickJsonObjectField`; `parseOrThrow` STAYS — flow-export's
  file-text imports call it)

**Interfaces:**
- Consumes: existing `asGraphNode`, `asGraphEdge`,
  `asObject`, `asString`, `asNumber`; `storedGraphNode`,
  `storedGraphEdge` (types.ts internals).
- Produces:
  `WorkOrderEntity.flow_graph: Record<string, unknown>`;
  `asWorkOrderFlowGraph(value: unknown, label: string):
  WorkOrderFlowGraph` (validators.ts);
  `storedWorkOrderFlowGraph(graph: WorkOrderFlowGraph):
  Record<string, unknown>` (types.ts).

- [ ] **Step 1: Write the failing covenant tests**

Append to `tests/validators.test.ts`:

```ts
test(
    'validateWorkOrderEntity accepts a native'
    + ' flow_graph object',
    () => {
        const entity = validateWorkOrderEntity({
            organization_id: 'org-1',
            display_id: 'a7c3e1f9',
            flow_graph: {
                name: 'Onboarding',
                lockTimeout: 28800,
                nodes: [],
                edges: [],
            },
            position: 1,
        });
        assert.deepEqual(
            entity.flow_graph,
            {
                name: 'Onboarding',
                lockTimeout: 28800,
                nodes: [],
                edges: [],
            },
        );
    },
);

test(
    'validateWorkOrderEntity rejects a'
    + ' JSON-encoded flow_graph string',
    () => {
        assert.throws(
            () => validateWorkOrderEntity({
                organization_id: 'org-1',
                display_id: 'a7c3e1f9',
                flow_graph:
                    '{"name":"x","lockTimeout":1,'
                    + '"nodes":[],"edges":[]}',
                position: 1,
            }),
            /expected object for flow_graph/,
        );
    },
);
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test --strip-types tests/validators.test.ts \
2>&1 | tail -10`
Expected: FAIL — native object rejected with "expected string
for flow_graph".

- [ ] **Step 3: Implement the flip (commit A)**

`api/validators.ts:504-542` — rename and drop the parse:

```ts
export function asWorkOrderFlowGraph(
    value: unknown,
    label: string,
): WorkOrderFlowGraph {
    const obj = asObject(value, label);
    // …body unchanged from
    // validateWorkOrderFlowGraphJson: name,
    // lockTimeout, nodes[], edges[] via
    // asString / asNumber / asGraphNode /
    // asGraphEdge…
}
```

(the only change is the signature and deleting the
`parseOrThrow` line; everything from `const obj =` down is
today's code verbatim).

Both WO gates (1850-1873, 1903-1921):

```ts
    const flowGraph = asObject(
        body['flow_graph'], 'flow_graph',
    );
    asWorkOrderFlowGraph(
        flowGraph, 'WorkOrderEntity.flow_graph',
    );
```

(DocumentBody variant labels
`WorkOrderDocumentBody.flow_graph`; return `flow_graph:
flowGraph`).

`api/types.ts`:

```ts
export function storedWorkOrderFlowGraph(
    graph: WorkOrderFlowGraph,
): Record<string, unknown> {
    return {
        name: graph.name,
        lockTimeout: graph.lockTimeout,
        nodes: graph.nodes.map(storedGraphNode),
        edges: graph.edges.map(storedGraphEdge),
    };
}

export interface WorkOrderEntity {
    id: Id;
    organization_id: Id;
    display_id: string;
    flow_graph: Record<string, unknown>;
    position: number;
}
```

Call-site flips (tsc enumerates; the complete list):
- `api/derive-states.ts:969-972`:

```ts
    return asWorkOrderFlowGraph(
        head.body['flow_graph'],
        'work-order lifecycle document head flow_graph',
    ).lockTimeout;
```

- `api/derive-states.ts:1686-1688`:

```ts
        flow_graph: asObject(
            head.body['flow_graph'], 'flow_graph',
        ),
```

- `api/record-attribute-refs.ts:124-129`:

```ts
            graph: asWorkOrderFlowGraph(
                doc.body['flow_graph'],
                'work_orders.flow_graph',
            ),
```

- `api/routes.ts:2079-2083`: `asWorkOrderFlowGraph(
  wo.flow_graph, 'work_orders.flow_graph')`.
- `web-app/app/adapters/work-orders-mutations.ts:146,310`:
  `storedWorkOrderFlowGraph(…)`.
- `web-app/app/adapters/work-orders-queries.ts:~116`:
  `asWorkOrderFlowGraph(entity.flow_graph, …)` — update the
  comment at 95-98 that says "never the JsonObjectField
  string the datastore" to "never the raw body value".
- `api/mock-data/work-orders.ts`: `woGraph()`/`prcGraph()`
  return the object literal (drop `jsonObjectField(` wrap and
  the `JsonObjectField` return type — type them
  `Record<string, unknown>`); the `JSON.parse(woFlowGraph)` /
  `JSON.parse(prcFlowGraph)` pre-parses collapse — after Task
  4 `mockFlows[n]!.graph` is already a native object, so use
  it directly (`const prcGraphParsed = prcFlowGraph` typed as
  `{ nodes: unknown; edges: unknown }` via a single
  `asObject`-style cast, or reuse the object as-is); every
  `flow_graph: jsonObjectField({…})` in `buildWorkOrders()`
  drops its wrap.
- `api/mock-data/flow-workload.ts:94-99`:

```ts
    const frozenFlowGraph = {
        name: flow.name,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: flow.nodes,
        edges: flow.edges,
    };
```

- Imports: everywhere `validateWorkOrderFlowGraphJson` /
  `storedWorkOrderFlowGraphField` / `pickJsonObjectField` /
  `jsonObjectField` were imported for WO purposes, swap to
  the new names or delete.

- [ ] **Step 4: Flip the family's test fixtures**

Enumerate:

```bash
grep -rn "jsonObjectField\|storedWorkOrderFlowGraphField\|validateWorkOrderFlowGraphJson" \
  tests/ api/ web-app/
```

Every remaining hit is work-order family (flows flipped in
Task 4): unwrap `jsonObjectField(X)` → `X`, rename
`storedWorkOrderFlowGraphField` → `storedWorkOrderFlowGraph`,
`validateWorkOrderFlowGraphJson(V, L)` →
`asWorkOrderFlowGraph(V, L)`. In
`tests/flow-graph-roundtrip.test.ts` the WO case parses the
native object and `assert.deepEqual`s the
`storedWorkOrderFlowGraph` re-emission against the original.
In `tests/drift-states.test.ts:242` the helper's return type
becomes `Record<string, unknown>`.

- [ ] **Step 5: Run the full suite, validate, commit A**

Run: `./validate`
Expected: PASS.

```bash
git add -A
git commit -m "carry work-order graphs as native JSON" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_01MiYUGSJsWiUhoLxsbjjJPn"
```

- [ ] **Step 6: Retire the dead machinery (commit B)**

Verify the brand is reference-free, then delete:

```bash
grep -rn "JsonObjectField\|jsonObjectField\|asJsonObjectField\|pickJsonObjectField" \
  api/ web-app/ shared/ tests/
grep -rn "parseOrThrow" api/ web-app/ shared/ tests/
```

Expected: the FIRST grep hits only at the definitions. The
SECOND keeps live callers by design:
`web-app/app/adapters/flow-export.ts:377,956` parse raw
backup/sidecar FILE text — outside-world JSON text, exactly
the gate duty that survives this migration
(`tests/mock-data-records.test.ts`'s call collapsed in
Task 3). Delete from `api/types.ts`: the `JsonObjectField`
brand (164-166) and `jsonObjectField()` (176-182). Delete
from `api/validators.ts`: `asJsonObjectField` and
`pickJsonObjectField`. Do NOT delete `parseOrThrow` (74-87)
— it remains the file-text parse gate. Also delete the
"── JSON field helpers ────" section banner if the section
is empty.

Run: `./validate`
Expected: PASS.

```bash
git add -A
git commit -m "retire the branded JSON field machinery" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_01MiYUGSJsWiUhoLxsbjjJPn"
```

---

### Task 6: Documentation sweep and end-to-end verification

**Files:**
- Modify: `SCHEMA.md` (§ Flow graph ~294-298 and any prose
  describing composite body fields as encoded strings)
- Modify: `ARCHITECTURE.md` (grep hits below)
- Modify: `CLAUDE.md` (only if a grep hit names the branded
  types or stringified composites — as of planning, none do)
- Verify only: no source changes in this task beyond docs.

**Interfaces:**
- Consumes: the finished migration (Tasks 1-5).
- Produces: documentation that matches the shipped wire.

- [ ] **Step 1: Sweep the docs**

```bash
grep -rn "JsonObjectField\|JsonArrayField\|JSON-encoded\|JSON string\|jsonObjectField\|jsonArrayField" \
  *.md docs/ --include="*.md" | grep -v "docs/superpowers"
```

Rewrite every live-doc hit to describe native nested JSON
(dated files under `docs/superpowers/` are historical record —
leave them). In `SCHEMA.md` § Flow graph, state: the live
graph rides the flow document body's `graph` field as a
native nested object (nodes/edges in the stored tongue);
`graphDelta`/`revivals` are native sidecars; a work order
freezes `flow_graph` as the same native shape plus
`name`/`lockTimeout`.

- [ ] **Step 2: Full gate**

Run: `./validate`
Expected: PASS.

- [ ] **Step 3: Drive the app end-to-end (verify skill)**

```bash
TMPDIR=/tmp/claude ./serve 8080
```

Then, via the Chrome MCP against
`http://localhost:8080/landing/index.html` (seed mock data
first if the recovery page appears — old string-shaped
IndexedDB pairs from a pre-migration session will fail
derives loudly; reseed via the organization page's mock-data
control, which is the accepted dev-tier posture):

1. Members: open a human member, edit strengths and the team
   dimension sliders, save, reload — values persist.
2. Records: open a record's attributes, add a select option
   and a constraint, save, reload — values persist.
3. Flows: open the designer, move a node, save, undo, export
   the backup file, re-import it — graph round-trips.
4. Work orders: create a work order from a flow, claim, fill
   a field value, transition — the frozen graph drives the
   board; history folds field values inline.
5. Evidence: confirm the network tab shows `graph`,
   `strengths`, `options`, `flow_graph` as nested JSON in
   request/response bodies (no `"{\"` escaping).

- [ ] **Step 4: Commit docs; optional measure milestone**

```bash
git add -A
git commit -m "document native composite bodies" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_01MiYUGSJsWiUhoLxsbjjJPn"
```

Optionally record the migration milestone (clean tree
required):

```bash
TMPDIR=/tmp/claude ./measure --record
```

---

## Sequencing invariants (why each commit stays green)

- Families are independent covenants: members, record
  attributes, flows, and work orders never validate each
  other's composite fields. Each task flips writer + gate +
  derive + seed + tests together.
- The seed suite (`mock-data-valid`, `mock-data-pairs`,
  1506-pair pin) runs the whole seed through every gate on
  every task: flipped families are native end-to-end,
  unflipped families still speak strings to string gates.
  The pair COUNT never changes — only body shapes.
- `message_hash` / `etag` values are computed at seed/write
  time, never pinned in fixtures — body reshaping is
  invisible to them.
- Work-orders (Task 5) runs AFTER flows (Task 4) because
  `api/mock-data/work-orders.ts` builds its frozen graphs by
  reading `mockFlows[n].graph` — native after Task 4, which
  lets the `JSON.parse` pre-parse scaffolding collapse in the
  same commit that touches the file. The live freeze path
  (`work-orders-mutations.ts:98`) reads `flow.graph` too —
  it flips WITH the flows family in Task 4; only the
  `flow_graph` mints it writes flip in Task 5.
- The flow backup file format does not change: it already
  embeds the graph natively (`storedGraph()` before
  stringify), and import validates with `asStoredGraph`.
