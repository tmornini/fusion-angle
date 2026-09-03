# Test plan: score the walk so FAIL can reach zero

Date: 2026-09-02. Status: drafted from the second 09-02
walk RCA; awaiting review. Does not supersede
`2026-08-29-test-plan-three-layers-design.md` (the
layers, the serial walk, the stub, the red-test rule
stand). Does not reopen
`2026-09-02-test-plan-remediation.md` (that plan
shipped: Space-steal, zero-delta click, Shift BLOCKED
notes, R13 bind-first text). This spec is the leftover
the first remediation did not generalize.

## Problem

The walk cannot reach zero FAILs, and the product is
not why.

Layer 1 and Layer 2 on the second 09-02 walk (build
`e4753f4`, 2026-09-02T20:56:37Z) were green: AT1–AT3
PASS, AT4 52/52, AT5 29/29. The explorer returned 17
FAIL, 13 BLOCKED, 14 DEFERRED. Every FAIL stub says
`Reproduced by: not reproduced`. Doctrine already
forbids a product commit from those stubs. Chasing
them as product defects is the loop that has run
since 08-25.

The 08-29 three-layers spec allowed BLOCKED for a
driver limit — "an honest BLOCKED costs nothing and a
dishonest FAIL costs a day." That sentence is still in
`TEST-PLAN.md`. Explorers still emit FAIL, because the
FAIL row still reads:

> the PASS line could not be observed as driven

That definition is the unobserved PASS line. It
overlaps BLOCKED completely. Without a *named* driving
note, the explorer follows FAIL. The first 09-02
remediation named Shift (AA32/F19–F23) and the hidden
tab (F37b). Those became BLOCKED this walk. The
unnamed compositor gestures, the leftover Space case,
and the serial garden became the new 17 FAILs.

FAIL counts across the parallel era then the serial
era never converged, because the scoring machine
mints a new set each time. The first 09-02 walk had
10 FAILs; remediating those 10 produced 17 different
ones. That is the hydra.

## Goals

- Narrow FAIL so it cannot be used when a green
  Layer 1/2 pin already decides the covenant, or when
  the step was not driven.
- Put that rule in the explorer prompt, not only in
  `### Scoring`, so the next explorer cannot miss it.
- Generalize the Shift lesson to every compositor
  gesture the driver cannot deliver: double-click on
  one node id, body-drag, port-drag, list-drag,
  slider-drag.
- Rewrite the case text that contradicts shipped
  product (F57a vs FLOW-CANVAS), names the wrong
  observation surface (D32a), or treats a mutated
  garden as seed (R14, R16, F17, F70).
- Decide AA9 and WB11 with Layer 2 characterization
  pins — the only two FAILs that might still be
  product, and only a red test may say so.
- Next walk: FAIL = 0. BLOCKED, DEFERRED, and DRIFT
  may be non-zero. Those are honest.

## Non-goals

- Product changes except behind a red Layer 1/2 test
  that AA9 or WB11 characterization produces. The
  other fifteen FAILs are document or driver.
- Editing dated mitigation stubs
  (`docs/superpowers/test-plan-mitigations/2026-09-02-*.md`
  from either walk). They stay frozen. Implementation
  is tracked in TODO.md.
- A second Customer Profile instance. WB19a's restore
  footnote already failed; the cheaper fix is to stop
  requiring the genesis Company Name after WB19a.
- Rewriting FLOW-CANVAS.md. The Space/Enter covenant
  shipped in `12f0f29c`. Only F57a lagged.
- Splitting the 401-case walk, adding Playwright, or
  changing Layer 1/2 runners.
- Running the next walk as a criterion of *this*
  spec. The operator's walk is the later plan's
  closing checkpoint.

## Locked choices

1. **FAIL is an observed product disagreement with no
   green pin covering that observation.** Unobserved
   PASS is BLOCKED (not driven / driver) or DEFERRED
   (prerequisite), never FAIL. A green pin for the
   unobserved half makes FAIL dishonest.
2. **No second seed instance.** R14/R16 accept the
   live Company Name (`Acme Corp` or `Walk Co B`).
   Delete WB19a's restore-or-FAIL footnote.
3. **Rewrite F57a to Enter-opens.** Do not delete the
   case. Space-on-focused-node is F12's Layer 2 pin.
4. **D32a names `.idea-actions-slot`.** Closed
   `<dialog>` buttons are not the header.
   `IdeaEditPresenter.#buildActionButtons` is already
   only Cancel / Save.
5. **R13 claim-on-load is the product working.** R14
   binds a WO the current member already claimed.
   Do not invent an open-without-claim path.
6. **AA9 and WB11 get Layer 2 characterization
   tests.** Green closes the walk FAIL. Red is a
   product bug for a separate commit. No product
   commit before that pin is red.

## Design

### 1. Scoring

Replace the FAIL row and add the pin rule. The table
becomes:

| Outcome | Meaning |
|---|---|
| PASS | the PASS line was observed |
| FAIL | the step was driven and the product disagreed with the PASS line, and no green Layer 1/2 pin already decides that observation — a finding, not a verdict |
| BLOCKED | a step could not be performed (driver or environment), or the compositor did not deliver the gesture a green pin already decides; the reason is the note |
| DEFERRED | a prerequisite case did not produce what this case needs |
| DRIFT | passes in substance; the document or the UI text disagrees — the document changes |

Keep the paragraph that BLOCKED costs nothing and a
dishonest FAIL costs a day. Add one sentence after
the table:

> A case whose `Pin:` names a Layer 1 or Layer 2 test
> for the unobserved half scores BLOCKED or DEFERRED,
> never FAIL. FAIL is only for an *exploratory* half
> the explorer actually drove, or for a pin that is
> itself red. The walk still gates nothing; this rule
> exists so FAIL can reach zero without lying.

Walk-specific scoring notes (keep F23/AA33/AA34, add):

- F12's double-click miss after a pan-drag, F17
  off-canvas body-drag, F37b port-drag (hidden tab
  or otherwise), D36/D37/K6 list-drag, K13–K15
  slider-drag: BLOCKED when the gesture was not
  delivered. Layer 1/2 pins decide the math.
- F70 without an Industry row: DEFERRED on F69.
- K14/K15 when K13 did not dirty a slider: DEFERRED
  on K13.
- R21 Wayne halves not driven: BLOCKED naming
  throttle or time, not FAIL. The Stark default-ACL
  half may still PASS.
- R16 leftover `Walk Co B`: PASS (the instance is
  present). Missing Instances section: FAIL of the
  exploratory half (no Layer 1 pin renders the live
  Customer Profile list).

The stub template is unchanged. `Reproduced by: not
reproduced` remains legal; it just should become
rare, because those observations score BLOCKED.

### 2. Explorer prompt

Insert into the verbatim explorer prompt in
`## The walk`, after "Do not retry the plan.":

```
Score from ### Scoring. FAIL only when you drove the
step and the product disagreed, and the disagree is
not already decided by a green Pin. A missed
compositor gesture, a hidden tab, a missing
prerequisite, or a green pin for the unobserved half
is BLOCKED or DEFERRED — never FAIL. DRIFT when the
product matches a pin and the document is wrong.
```

The prompt already tells the explorer to read from
`## The walk` to the end. The insert is the belt; the
table is the suspenders. The first 09-02 walk proved
the table alone is not read as a constraint.

### 3. Driving notes

Keep every existing note (Shift, F37b hidden tab,
B21, WB16, first-click-after-reload, …). Add a
general compositor rule, then the named leftovers:

- Compositor gestures (double-click as two
  pointerdowns on one element id inside
  `DBLCLICK_MS`, body-drag, port-drag, `.drag-handle`
  pointer capture, `input[type=range]` drag): if the
  driver does not deliver the gesture, record BLOCKED
  naming that. Do not FAIL. Layer 1 and Layer 2 pins
  decide the covenant. E11 (projects list-drag)
  PASSed on the second 09-02 walk — the driver *can*
  drag lists; a miss on D36 or K6 is still BLOCKED
  this walk, not a missing product.
- F12: after the pan-mode node drag, Space toggles
  pan off (Layer 2 pin). The double-click half
  retargets the same node id; landing on Archive or
  missing `#prop-node-name` is BLOCKED targeting, not
  FAIL. Create/Archive panels have no
  `#prop-node-name`.
- F17: F12/F14 leave Auto Fit off and the camera
  elsewhere. Create is min-x. If Create's
  `transform` is outside the viewBox, Auto Fit on or
  pan until it is inside, then drag. Dragging an
  off-canvas node is BLOCKED, not FAIL.
- F57a: Enter opens the focused node's panel; Space
  toggles pan. Do not score F57a FAIL for Space
  toggling pan — that is F12's covenant.
- D32a: assert `.idea-actions-slot` only. Buttons
  inside a closed `dialog` (including
  `data-idea-action="send-back-confirm"`) are not the
  header.
- K13: drag `.baseline-slider` *inside* the
  `.project-objective-row` whose name cell is the
  objective. Do not query a bare
  `input[type=range]` — at 1280×800 the rows are a
  140/110/1fr grid; identical y means the same
  element was hit twice.
- F70: if the Industry row is not in the open
  panel, DEFERRED on F69.
- R14: bind `#gate0001` to any existing Customer
  Profile instance in the picker (never mint). The
  label may read `Walk Co B` after WB19a. R13's
  open claimed the WO; bind while claimed by the
  current member is expected.
- R16: PASS if the Instances section lists at least
  one instance with id + readable values. `Acme Corp`
  and `Walk Co B` are both this walk's instance.
- R21: four identity/org halves. Auth is 5 per 60 s.
  If Wayne halves are not driven, BLOCKED, not FAIL.

### 4. Case text (DRIFT cluster)

These are document commits. No tests. One concern per
commit or one cluster commit if the later plan treats
them as one scoring-and-text concern — the later plan
picks the grain; this spec names the text.

**F57a** (~3509). Replace the PASS line and pin:

```
- [ ] **F57a** Tab to a regular node (not Create or
  Archive — those panels have no `#prop-node-name`).
  Tap Enter. PASS: the node's panel opens
  (`#prop-node-name` exists); pan mode stays off.
  Space on a focused node toggles pan and does not
  open the panel — that is F12, not this case.
  Pin: tests/browser/canvas-keyboard.test.ts
       'Tab from the canvas enters the ring and
       marks the node' (drives Tab then Enter and
       waits for `#prop-node-name`);
       tests/flow-fsm-reduce.test.ts
       'canvas-key-activate on a node single-selects
       it, opens the panel, and requests an update'
       (decides Enter's activation path);
       tests/browser/canvas-pan.test.ts
       'Space on a focused node toggles pan off
       and does not open the panel (F12)'
```

**D32a** (~2046). Name the slot:

```
- [ ] **D32a** On an in_review idea, click "Edit".
  PASS: `.idea-actions-slot` contains only Cancel /
  Save — no Send Back, Approve, Submit, or Convert
  *in that slot*. Buttons inside a closed
  `<dialog>` in `.idea-dialogs-slot` (including
  `data-idea-action="send-back-confirm"`) are the
  confirm dialog, not the header. Click Cancel: the
  read header (Send Back / Approve / Edit in
  `.idea-actions-slot`) returns.
```

Keep the exploratory pin; add that no CLI test
renders the slot, which is why this case exists.

**F17** (~2592). After "Drag the start node by its
body", insert: if Create is off-canvas, Auto Fit on
or pan until its `transform` is inside the viewBox,
then drag. Off-canvas drag is BLOCKED.

**F70** (~3695). After "Continuing from F69": if the
Industry row is absent, DEFERRED on F69.

**K13** (~6060). After the objective names: drive
each slider as
`.project-objective-row` (name cell matches) →
`.baseline-slider`. A bare `input[type=range]`
selector is the first row twice.

**R14** (~6510). Replace "Company Name Acme Corp"
with "an existing Customer Profile instance in the
picker (label may be Acme Corp or Walk Co B after
WB19a)". Drop any implication that the WO is
unclaimed.

**R16** (~6557). Replace the Acme-or-hygiene
sentence:

```
PASS: an Instances section lists at least one
instance (id + readable values) and a "New instance"
control. The genesis Company Name is "Acme Corp";
WB19a may have renamed it to "Walk Co B". Either
name is this walk's instance, not a missing seed.
```

**WB19a** (~4186). Delete the restore-to-Acme-Corp
instruction and the sentence that R14/R16 read that
value. WB19a ends at the 412 recovery PASS line.

**R21** (~6624). Add: if the Wayne halves are not
driven, BLOCKED naming throttle or time. Do not FAIL
a half that was not opened.

### 5. AA9 and WB11 — Layer 2 decides

These two are the only FAILs whose exploratory half
is a real UI path with no Layer 2 pin. The API pins
are green and do not drive the chips or the inbox
navigation.

**AA9.** Recurred 08-27, 08-28, 09-02. The Layer 1
pin `'a strengths PUT replaces the list — the
toggled-on id persists'` PUTs the identity document
directly; it never clicks `.strength-chip`.
`members/detail.ts` `onClick` toggles
`state.draft.strengths` and `rerender()`s;
`humanMemberPatchFromDraft` includes `strengths`.

Characterization (Layer 2, extend an existing
members browser file or add
`tests/browser/member-strengths.test.ts` in the
idiom of `tests/browser/list-reorder.test.ts`):

1. `withAdminPage`; open the current user's member
   detail.
2. Click Edit. Click `[data-strength="Data Analysis"]`
   (on → off). Click `[data-strength="Agile Methods"]`
   (off → on). Click Save. Wait for the "Member saved"
   toast and read mode.
3. Reload. Assert `#member-strengths .pill-tag-strength`
   text is exactly Strategic Planning, Stakeholder
   Management, Agile Methods (order as rendered).

Green → AA9's walk FAIL was a chip-click miss;
driving note: BLOCKED if the chips do not toggle.
Red → product bug; fix red→green in that task
before any TEST-PLAN recode that would hide it.

**WB11.** On success `web-app/workbox/detail.ts`
toasts "Transition complete" and `navigateTo('workbox')`.
Staying on `workbox/detail.html` means submit did not
succeed (unbound, empty required, 412, fault) or
navigation did not run. The API pin checks 201, not
the inbox.

Characterization (Layer 2,
`tests/browser/workbox-transition.test.ts` or
extend an existing workbox browser file if one
exists by then):

1. `withAdminPage`; open an unbound Active work
   order on Customer Onboarding (or the seeded
   bound WO01 if that is simpler and still Active
   under the memory seed the harness uses).
2. Bind if needed, fill Company Name and Contact
   Email, click the submit-to-Review control.
3. Assert `location.pathname` ends with
   `/workbox/index.html` (or the inbox registry
   path) and the toast fired.

Green → walk FAIL was bind/fill/submit miss;
BLOCKED if bind cannot be driven. Red → product
bug; fix red→green before recoding.

Do not write product code against either stub. The
stubs say `not reproduced`.

### 6. What the 17 become

| Case | After this spec | Product? |
|---|---|---|
| F57a | DRIFT → rewritten to Enter | no — FLOW-CANVAS already shipped |
| D32a | DRIFT → `.idea-actions-slot` | no — presenter is Cancel/Save |
| R16 | PASS on Walk Co B | no |
| R14 | bind any existing instance; claimed is expected | no |
| R21 | BLOCKED if Wayne halves undriven | no |
| F12 | BLOCKED targeting on double-click miss | no — Space half is Layer 2 green |
| F17 | BLOCKED if off-canvas; else fit then drag | no |
| F37b | BLOCKED (existing hidden-tab note, Layer 2 green) | no |
| D36, D37 | BLOCKED compositor list-drag | no — E11 PASSed the same module |
| K6 | BLOCKED compositor list-drag | no |
| K13–K15 | BLOCKED miss / DEFERRED cascade | no — CSS is a grid above 768px |
| F70 | DEFERRED on F69 | no |
| AA9 | Layer 2 pin decides | only if that pin is red |
| WB11 | Layer 2 pin decides | only if that pin is red |

The 13 BLOCKEDs this walk already scored (Shift,
B21, WB16, I22, SV two-jar) stay BLOCKED. The 14
DEFERREDs stay DEFERRED.

### 7. Documents

- **TEST-PLAN.md:** scoring table, explorer prompt,
  driving notes, the case-text cluster in §4.
- **TODO.md:** one Later-work bullet that AA9/WB11
  Layer 2 pins (or their product fixes) closed the
  second 09-02 walk's only maybe-product FAILs; drop
  any leftover that this spec recodes as BLOCKED.
  Do not append a novel. The first 09-02 triage
  (`825d7a8a`) already listed compositor leftovers.
- **AGENTS.md:** no change. The red-test rule and
  the three layers are already there. Scoring lives
  in TEST-PLAN.md.
- **FLOW-CANVAS.md:** no change.
- Dated specs, plans, stubs: byte-identical.

## File structure

| File | Responsibility |
|---|---|
| `TEST-PLAN.md` | scoring, prompt, driving notes, case text |
| `tests/browser/member-strengths.test.ts` (or the existing members browser file) | AA9 characterization |
| `tests/browser/workbox-transition.test.ts` (or the existing workbox browser file) | WB11 characterization |
| `TODO.md` | close the recoded leftovers |
| `docs/superpowers/specs/2026-09-02-test-plan-zero-fails-design.md` | this spec |

Never edit `docs/superpowers/test-plan-mitigations/2026-09-02-*.md`.

## Commit sequence

One concern per commit; `./validate` green after
each. Layer 2 tests need `./test-browser` on the
operator's machine before merge; `./crank` will
enforce it on the next walk.

1. This spec.
2. TEST-PLAN.md scoring table + explorer prompt +
   generalized compositor driving note. No case
   edits. **This commit is the protocol change.**
3. Case-text cluster (F57a, D32a, F17, F70, K13,
   R14, R16, WB19a, R21) — one commit if treated as
   one scoring-and-text concern, else one per case.
   Markdown only.
4. AA9 Layer 2 characterization. Green → driving
   note. Red → product fix in the next commit, then
   the note.
5. WB11 Layer 2 characterization. Same grain as 4.
6. TODO.md triage.

Then the closing checkpoint: the operator runs one
walk. FAIL = 0 is the success criterion of *that*
walk, not of this spec's commits. BLOCKED/DEFERRED/
DRIFT may be non-zero.

## Success criteria

- FAIL's definition no longer matches "PASS line
  unobserved."
- The explorer prompt contains the FAIL/BLOCKED
  sentence in §2.
- Driving notes name the compositor generalization
  and the leftovers in §3.
- F57a PASS line is Enter, not Space-activates.
- D32a names `.idea-actions-slot`.
- R16 accepts `Walk Co B`; WB19a does not restore.
- AA9 and WB11 each have a Layer 2 pin, or a
  product fix behind a red one.
- Dated 2026-09-02 stubs are byte-identical.
- `./validate` green after every commit;
  `./test-all` green before a walk.

## Risks

- **Over-BLOCKED hiding a real UI bug.** AA9 and
  WB11 are the residual. Characterization before
  any recode that would hide them. The other
  fifteen have green pins or contradict shipped
  text.
- **The explorer ignores the prompt insert.** Same
  failure mode as the table-only rule. The insert
  is short, in the prompt they are told to follow
  verbatim, and the named leftovers repeat it
  beside the cases. If a third walk still FAILs
  green-pinned gestures, the scoring machine is
  not the remaining cause — the explorer is.
- **E11 PASSed and D36 FAILed.** Recoding D36 as
  BLOCKED is correct for *this* walk (the gesture
  was not delivered). A later Layer 2 pin on the
  ideas list (TODO.md already names it) is
  optional and not required to reach FAIL = 0.
- **R13 claim-on-load surprises a future explorer.**
  The R14 note says claimed-by-current-member is
  expected. Do not add an unclaim step; that would
  couple R14 to a new gesture.
- **Layer 2 characterization needs Chrome.** Not
  part of `./validate`. The later plan runs
  `./test-browser` on those two files before
  merging.

## Relationship to the first 09-02 walk

The first walk (SHA `04372ead`, 10 FAILs) produced
`2026-09-02-test-plan-walk-analysis.md` and the
remediation that shipped Space-steal, zero-delta
click, Shift BLOCKED, F37b hidden-tab, R13
bind-first. That work was correct and incomplete.
It named instances of the compositor limit instead
of the scoring rule that mints them. This spec is
the rule.

Do not re-derive the first walk's two product
defects. They are in `flow-interactions.ts` (Enter
only on `canvas-key-activate`) and
`flow-fsm-reduce.ts` (zero-delta `onPointerUp`
emits no `move-nodes`). AT5 already carries the
F12 Space pin.
