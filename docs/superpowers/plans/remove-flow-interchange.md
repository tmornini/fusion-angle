# Remove Flow Interchange Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Remove flow import, flow export, and Mermaid
generation and parsing from the product, and remove every
live doc and comment that describes them.

**Architecture:** Flow interchange is browser-only. It has
four app modules (`flow-export.ts`, `mermaid-generate.ts`,
`mermaid-parse.ts`, `zip.ts`), two single-use browser
adapters, one client verb (`postFlowImport`), two pages'
UI, and three test files. No API route, server handler,
schema column, or seed row exists for it. An imported flow
was written through the same `POST …/flows` that
`postFlowCreation` uses, so no data migration is needed.
Remove the callers first and the modules after them, so
every commit type-checks.

**Tech Stack:** Deno 2.9.8, TypeScript (`noUnusedLocals`,
`noUnusedParameters` on, so `deno check` flags any import
a removal orphans inside a file).

**Spec:** none. The operator's request and the scope
decisions below take its place.

## Scope decisions (operator, 2026-11-06)

- Leave dated history in `docs/superpowers/plans/` and
  `docs/superpowers/specs/` as written. Delete only the two
  live mitigation stubs about removed cases:
  `docs/superpowers/test-plan-mitigations/2026-08-27-F-F41.md`
  and `…/2026-08-30-F-F42.md`.
- Keep the ```` ```mermaid ```` diagram fences in docs.
  They use Mermaid as a doc diagram format, not as product
  code.
- Keep TEST-PLAN case ids as they are (no renumbering).
  Walk history and the mitigation stubs cite F7, F45, and
  the others by id. F4–F6 and F41–F44 become gaps.
- Keep the `a.hasAttribute('download')` early return in
  `web-app/flows/detail.ts`'s leave-page click guard. It
  came with "Await in-flight flow save before leaving",
  not with export, and it is correct for any download
  link.

## Global Constraints

- `export DENO_DIR="$TMPDIR/deno-dir"` before any `deno`,
  `./test`, or `./deploy` command (sandbox only).
- Every commit passes `./test validate --syntax`.
- 78-character lines in linted files, 4-space indent.
- Commit subjects: one line, about 50 chars, present-tense
  imperative, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never move or rename and change content in one commit.
- Delete files with `git rm`. Do not leave stubs,
  re-exports, or "removed" comments behind.
- Out of scope: any symbol not listed here. Keep
  `getProjectFlowEntities`, `runLayoutFromInputs`,
  `LayoutInput`, `flowGraphOf`, `getRenderableFlowGraph`,
  `buildStartAndCompleteNodes`, `asStoredGraph`, and
  `iconUpload`. Each still has another caller.

## Review Focus

1. **Flows list header with one child.** With Import Flow
   gone, `.page-header` on `flows/index.html` holds only
   the title block. Expect the title to stay left-aligned
   with no empty gap. Task 2 Step 4 checks it in the
   browser.
2. **Designer toolbar spacing.** Removing the Copy/Export
   group would leave two `.flow-toolbar-spacer` divs side
   by side. Expect one spacer between the zoom group and
   the delete group. Task 1 Step 2 removes one spacer with
   the group.
3. **Flows list still live.** `bindImport()` sits at the
   end of the list page's boot. Expect the list to render
   and to re-render on `subscribeFlowChanges`. The suite
   and Task 2 Step 4 cover it.
4. **Flows made by the old import.** Their rows look like
   any POST-created flow. Expect them to open in the
   designer unchanged. No code reads an import marker, so
   no task touches data.
5. **Stray references.** A test, browser test, measure
   journey, or doc could still name a removed id, file,
   or verb. Expect none. Task 5 Step 1 is the sweep that
   pins this.

---

### Task 1: Drop Copy Mermaid and Export ZIP from the designer

**Files:**
- Modify: `web-app/app/presenters/flow-designer-view.ts:421-436`
  (the `copy-mermaid` / `export-zip` group, plus one of
  the two `flow-toolbar-spacer` divs around it; the
  `iconCopy` / `iconDownload` imports)
- Modify: `web-app/flows/detail.ts` (the `copy-mermaid` and
  `export-zip` branches at `:1159-1166`; `handleCopyMermaid`
  and `handleExportZip` at `:1177-1252`; the imports of
  `getFlowMermaid`, `getFlowZip`, `postClipboardCopy`,
  `postBlobDownload`)
- Modify: `web-app/app/icons.ts` (delete `iconDownload` at
  `:521` and `iconCopy` at `:563`)
- Delete: `web-app/app/adapters/clipboard.ts`,
  `web-app/app/adapters/blob-download.ts`
- Modify: `tests/presenter-misc.test.ts:1057-1060`

**Interfaces:**
- Consumes: none.
- Produces: `buildToolbar` keeps its signature, minus the
  two buttons. After this task nothing in `web-app/flows/`
  imports `flow-export.ts` except `web-app/flows/index.ts`.

- [ ] **Step 1: Retire the toolbar covenant in the test**

In `'buildToolbar leaves undo, redo, and delete enabled
when their actions are available'`, delete the two
`assertMatch` calls on `copy-mermaid` and `export-zip`.
Keep `assertStrictEquals(/disabled/.test(out), false)`.
Those assertions guarded a feature that is going away, so
this deletes a wrong covenant. It does not weaken a live
one.

- [ ] **Step 2: Remove the buttons, handlers, icons, adapters**

Edit the files listed above. The toolbar keeps this order:
the undo/redo group, the zoom group, one spacer, then the
delete group.

- [ ] **Step 3: Gate**

Run: `./test validate --syntax && ./test`
Expected: both exit 0. No TS6133 (unused import) errors.

- [ ] **Step 4: Commit**

```bash
git add -A web-app tests
git commit -m "Drop Mermaid copy and ZIP export from designer"
```

### Task 2: Drop Import Flow from the flows list

**Files:**
- Modify: `web-app/flows/index.html:10-19` (the
  `#import-flow-btn` button and `#import-flow-input`) and
  `:22-80` (the whole `#import-flow-dialog`)
- Modify: `web-app/flows/index.ts`. Delete `ImportState`,
  `ImportStore`, `importStore`, `bindImport` and its call
  in the boot, `openImportDialog`, `handleFileSelect`,
  `handleBackupZip`, `configureResolutionDialog`,
  `resetImportDialog`, `clearPending`, `handleOverwrite`,
  `handleCreateNew`, `handleCreate`, the `flow-export.ts`
  imports, and any import those deletions orphan (for
  example `openDialog`, `closeDialog`, `handleDialogClick`,
  `putFlow`, `getProjects`, `generateIdentifier`,
  `extractErrorMessage`, `$select`, `createElement`,
  `log`, `showToast`; `deno check` lists them)

**Interfaces:**
- Consumes: Task 1 (`detail.ts` no longer imports
  `flow-export.ts`).
- Produces: no module outside `web-app/app/flow-export.ts`
  and its tests imports `flow-export.ts`,
  `mermaid-*.ts`, or `zip.ts`.

- [ ] **Step 1: Remove the markup and the page logic**

Edit the two files. The boot keeps `rerenderFlowList` and
its `subscribeFlowChanges` subscription.

- [ ] **Step 2: Gate**

Run: `./test validate --syntax && ./test`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add -A web-app
git commit -m "Drop Import Flow from the flows list"
```

- [ ] **Step 4: Browser check of the two touched pages**

Run: `./deploy --local 8080 --postgres mock-data`, sign in
with a printed seeded account, then open
`/flows/index.html` and a flow's designer with the HTTP
cache disabled.
Expected: the flows header shows only the title and
subtitle, the list renders, and the toolbar reads
undo/redo, zoom, spacer, delete with no Copy or Download
icon. Stop the deploy with SIGTERM when done. This step
gates nothing (Layer 3). Record anything odd as a red test
or a note, not as a product change.

### Task 3: Delete the interchange modules and their tests

**Files:**
- Delete: `web-app/app/flow-export.ts`,
  `web-app/app/mermaid-generate.ts`,
  `web-app/app/mermaid-parse.ts`, `web-app/app/zip.ts`
- Delete: `tests/adapters-flow-export.test.ts`,
  `tests/mermaid.test.ts`, `tests/zip-guards.test.ts`
- Modify: `client/flow-mutations.ts:130-178` (delete the
  "A flow built outside the canvas…" comment,
  `FlowImportInput`, and `postFlowImport`)
- Modify: `shared/json-assert.ts:5` (delete
  `parseOrThrow`; `flow-export.ts` was its only caller)

**Interfaces:**
- Consumes: Task 2.
- Produces: none.

- [ ] **Step 1: Delete and trim**

Run `git rm` on the seven files, then edit the two
modified files.

- [ ] **Step 2: Gate**

Run: `./test validate --syntax && ./test`
Expected: both exit 0. The suite has three fewer files.

- [ ] **Step 3: Commit**

```bash
git add -A client shared
git commit -m "Delete flow export, Mermaid, and ZIP modules"
```

### Task 4: Scrub code comments and the lint script

**Files:**
- Modify: `shared/types.ts:1191-1192`. Change "(SCHEMA.md
  documents it; old rows and exported backups carry it)"
  to "(SCHEMA.md documents it; old rows carry it)".
- Modify: `api/flow-graph-relations.ts:103-104`. Change
  "the canvas, stats, mermaid, and hazard readers" to
  "the canvas, stats, and hazard readers".
- Modify: `test:123`. Delete the line
  "`` # `in-browser ZIP` is the live flow export (zip.ts). ``".
  Keep the `browser[ -]ZIP` term in `PATTERN`: it bans
  retired vocabulary, which this removal adds to.

- [ ] **Step 1: Edit the three comments**

- [ ] **Step 2: Gate**

Run: `./test validate --syntax && ./test lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts api/flow-graph-relations.ts test
git commit -m "Scrub flow interchange from code comments"
```

### Task 5: Scrub the live docs

**Files:**
- Modify: `AGENTS.md:422-425`. "Dropping the quote anchor
  adds nine more non-specifier hits" becomes "eight", and
  "`flow-operations.ts` (×3), `mermaid-generate.ts`, and
  `api/types.ts`" becomes "`flow-operations.ts` (×3) and
  `api/types.ts`". Keep the line wrap within 78 columns.
- Modify: `ARCHITECTURE.md:505-507`. End the named
  non-void list at "`postOrganizationSessionExchange` →
  `string`." and delete the `postFlowFrom…` clause.
- Modify: `FLOW-CANVAS.md`:
  - `:25-27`: delete the `mermaid-{generate,parse}.ts`,
    `zip.ts`, and `adapters/flow-export.ts` bullets.
  - `:144-147`: "The flow renderer, the stats renderer,
    and the properties panel header all read `node.name`
    and emit it verbatim".
  - `:151-155`: delete the sentence that starts "The
    mermaid parser does not translate either".
  - `:255-257`: "shared by `getFlowGraph` and the
    designer's `applyAutoLayout`."
- Modify: `TEST-PLAN.md`:
  - `:1228`, `:2880-2881`: delete "Copy Mermaid, Export
    ZIP," from both toolbar lists.
  - `:2891-2894`: the presenter-misc Pin's parenthetical
    becomes "(decides nothing on the toolbar is disabled
    when every action is available)".
  - `:2802-2870`: delete the whole `### Flow Import`
    section (the intro plus F4, F5, F6).
  - `:3838-3920`: delete F41, F42, F43, F44.
  - `:3921-3922`: F45 opens "**F45** Open Layout Test. The
    11-step walk is required, not optional."
- Modify: `TODO.md`:
  - `:720-721`: delete the clause "F6's ZIP import not
    rebinding `flow_records` (TEST-PLAN F6);".
  - `:1965`: delete "Copy Mermaid, Export ZIP," from the
    AA26 list.
  - `:2137-2144`: delete the F4 import-dialog bullet and
    the ZIP-resolution-dialog bullet.
  - `:2208-2220`: delete the F41 clipboard-toast bullet
    and the archive-round-trip bullet.
- Delete: `docs/superpowers/test-plan-mitigations/2026-08-27-F-F41.md`,
  `docs/superpowers/test-plan-mitigations/2026-08-30-F-F42.md`

- [ ] **Step 1: Write the sweep, run it, see it list hits**

```bash
git grep -nIiE 'mermaid|\.mmd\b|flow-export|getFlowZip|getFlowMermaid|postFlowFrom|postFlowImport|FlowImportInput|getBackupFromZip|computeFlowBackupResolution|buildZip|getZipEntries|ZIP_LIMITS|zip-guards|copy-mermaid|export-zip|import-flow|Import Flow|Export ZIP|ZIP (import|resolution)|archive round trip|flow\.(json|txt)|postClipboardCopy|postBlobDownload|iconCopy|iconDownload|parseOrThrow' \
    -- ':!docs/superpowers/plans' ':!docs/superpowers/specs' \
       ':!deno.lock'
```

Expected now: hits in the five docs and two stubs above,
and nowhere else. A hit anywhere else is a missed file.
Add it to this task before you edit.

- [ ] **Step 2: Edit the docs and delete the two stubs**

- [ ] **Step 3: Re-run the sweep**

Expected: no output, exit 1.

- [ ] **Step 4: Re-verify the AGENTS.md counts**

```bash
grep -rnE "['\"]node:|\bprocess\b" web-app/app/*.ts \
    server/ api/ shared/ | wc -l
grep -rnE "node:|\bprocess\b" web-app/app/*.ts \
    server/ api/ shared/ | wc -l
```

Expected: `12`, then `20`. That is twelve, plus the eight
the doc now names: `flow-graph.ts` ×3,
`flow-operations.ts` ×3, `api/types.ts`, and
`server/scrypt-hash.ts:2`.

- [ ] **Step 5: Gate**

Run: `./test validate --syntax && ./test lint`
Expected: both exit 0 (`./test lint` also runs the
TODO.md / ARCHITECTURE.md heading-count checks).

- [ ] **Step 6: Commit**

```bash
git add -A AGENTS.md ARCHITECTURE.md FLOW-CANVAS.md \
    TEST-PLAN.md TODO.md docs/superpowers/test-plan-mitigations
git commit -m "Scrub flow interchange from the docs"
```

### Task 6: Squash and run Layer 1

- [ ] **Step 1: Rebase onto current master**

Run: `git rebase master`
Expected: clean.

- [ ] **Step 2: Squash to one commit per feature**

Squash the plan commit and Tasks 1–5 into one commit
(`git reset --soft master`, then commit) with the subject
`Remove flow import, export, and Mermaid`.

- [ ] **Step 3: Layer 1**

Run: `./test validate`
Expected: exit 0.

- [ ] **Step 4: Report**

Report the branch name `remove-flow-interchange` as a
squashed, Layer-1-green unit. Do not merge: the operator
starts the merge. Before any build, deploy, or walk, the
operator runs `./test validate browser` (Layer 2).
