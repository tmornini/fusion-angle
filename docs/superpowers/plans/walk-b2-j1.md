# Walk B2 and J1 (930f43cd) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this worktree. Do not create one. Do
> not land, push, merge, force-push, or delete a branch.
> Never `./deploy --render`. One worker.

> **For the dispatching orchestrator:** every subagent
> prompt MUST begin with the literal phrase
> `Go to Medium Church!`, then push down: present-tense
> imperative ~50-char commit subjects with no body
> beyond the `Co-Authored-By` trailer; one concern per
> commit; the commandments and abominations named
> below. Every task edits `TEST-PLAN.md` only. Task 1
> and Task 6 belong to the orchestrator alone.

**Goal:** A fresh walk scores B2 PASS against the empty
`PILOT_SCHEDULING_URL`, and J1 PASS through the harness
stop alone, with no product change.

**Architecture:** Both items are walk-document
corrections. B2's prose names a scheduling URL the
product has never had. J1 failed because A3 was
launched in a way that detached `./deploy` from the
harness task. The trap and `compose down` are correct
under a stop that reaches deploy's `sleep`. So the walk
launches deploy as the harness's own task, K8 restarts
through owned deploy tasks, and J1 stops the last one.

**Tech Stack:** Markdown only. `./test validate` is the
commit gate. A fresh walk of A3, B2, K8, and J1–J3 is
the acceptance check.

**Spec:** No design doc. This plan argues from the walk
at `930f43cd` (worktree
`.worktrees/test-plan-walk-2026-10-22`), checkpoint
`/tmp/fusion-angle-walk-930f43cd.txt`, summary
`/tmp/fusion-angle-walk-930f43cd-summary.md`, the walk's
`/tmp/fusion-angle-walk-930f43cd-*` logs, and the
probes recorded under Evidence.

**Worktree:** `.worktrees/walk-b2-j1`, branch
`walk-b2-j1`, cut from `next-release` at
`930f43cd427233dcabce8fd4218dce8070bdcc53`, the walk's
own SHA, so next-release has not moved since the walk.
Cites are at that SHA. Re-find any cite that has moved
by its quoted text. If the quoted text is gone, stop.

## Verdicts

| Case | Walk | Class | Product change | Task |
|---|---|---|---|---|
| B2 | DRIFT | the doc names a URL the product never had | none | 2 |
| J1 | FAIL | the walk's launch detached deploy | none | 3, 4, 5 |

These are not interchangeable. B2's product matches its
pin, so the prose moves. J1 is a real failure of the
walk's own procedure. It is fixed by changing how the
walk launches and stops deploy. It is never fixed by
renaming a shell SIGTERM a harness stop.

## Evidence

**B2.** `web-app/landing/index.ts:15` is
`export const PILOT_SCHEDULING_URL = '';`, and the four
anchors render `href="${PILOT_SCHEDULING_URL}"` (`:106`).
The pin, `tests/browser/landing.test.ts` 'unsigned
landing stays, books, and signs in', asserts that exactly
four `[data-book-pilot]` exist and that each
`getAttribute('href')` strict-equals the constant.
`docs/superpowers/plans/2026-09-16-landing-pilot.md:37`–`40`
leaves the URL empty "until the operator names it"; a
real URL arrives with its own pin. The pin does not
cover the `#how-it-works` scroll; the walk does.

**J1: why the harness lost deploy.** The walk's
artifacts show that A3 backgrounded deploy *inside*
the harness command:
`/tmp/fusion-angle-walk-930f43cd-deploy.pid` (`94646`)
was written at launch (14:35:51), and stdout went to
`…-deploy.log`. That launch shape was reproduced on
2026-10-22 in Claude Code with a scratch copy of
deploy's park (`set -euo pipefail`, a `TERM` trap, and
`while true; do sleep 3600; done`):

| Launch | Harness stop | Script | Trap |
|---|---|---|---|
| `script > log 2>&1 & echo $! > pid` | "not running (status: completed)" at once | reparented, `ppid=1`, still parked | — |
| `kill -TERM <pid>` on that orphan | — | alive after 2 s | deferred |
| `TERM` to the orphan's `sleep` child | — | exited | ran; the log shows `Terminated: 15` |
| the script as the task's whole command | "Successfully stopped task" | gone | ran in < 1 s, `Terminated: 15` |

The launch's `&` ends the harness task as soon as the
wrapper shell returns. Deploy outlives it under
launchd, so the stop finds an exited task. That matches
the walk's "already-exited" for `01a1658a-…`. Bash
defers a trapped signal until its foreground child
returns: a leader-only TERM waited 8 s for `sleep 8` on
this host's `/bin/bash` 3.2.57, and would wait up to
3600 s in deploy. That is why the direct SIGTERM to
94646 did nothing. A process-group TERM reaches
`sleep`, and the trap ran. The trap, `compose_down_once`
(`bin/compose-lib`), and `compose down --remove-orphans`
are already right.

**J1: why the order went wrong.** K8 (`TEST-PLAN.md`
`:6707`) begins "stop the A3 process" and restarts by
hand (`./fusion-angle serve`, `crank`, `./serve`). The
walk did that stop first, scored it as J1, brought up a
hand-built compose stack (`…-k8-up.log`), then downed
that stack by hand for J2 (`…-j2.log`). So J2 inspected
a teardown that J1 never performed.

## Decision

Change the walk's launch and stop instructions. Do not
change `deploy`. Ownership is the cause, and an owned
launch passes under this harness's stop. The only
condition that would justify a deploy change is the
one Task 1 gates on.

## Global Constraints

- `TEST-PLAN.md` is the only file the commits edit. No
  product, test, or script file changes.
- `PILOT_SCHEDULING_URL` stays `''`. The B2 pin stays
  byte-identical.
- B2 keeps the literal `.navbar-logo`, which
  `tests/test-plan-apple-menu.test.ts` 'B2 B3 and C5
  name the Apple-menu miss' requires.
- No shell `kill`, `pkill`, or process-group signal
  appears anywhere in the walk's stop path.
- Wrap edited prose to match its neighbors. The
  78-char lint skips `.md`, but the case blocks wrap
  near 55 columns.
- Commandments touched: Reliability (a stop that
  verifiably runs the trap), Clarity, Logic (DRIFT is
  not FAIL). Abominations to avoid: Test Weakening (the
  pin), Swallowed Failures (a J1 FAIL must not let J2
  pass anyway).

## Review Focus

1. A driver reads the `a.href` *property*, which
   resolves `''` to the page URL. B2 must name
   `getAttribute('href')`, or the walk scores a false
   FAIL (Task 2).
2. A harness backgrounds a long command after a
   yield timeout. The stop would then find an exited
   task even with a clean launch. Task 1 detects this.
3. The harness stop sends SIGKILL. No trap can ever
   run, and no wording fixes that. Task 1 detects it
   and stops.
4. The harness stop signals only the leader. The task
   ends, but the trap waits up to 3600 s. Task 1
   detects it and stops for a ruling.
5. K8 launches the next deploy before the previous
   stop's `compose down` has freed 8080 and 5432.
   Compose up then fails. Task 4 waits for the
   `Network … Removed` line before relaunching.

---

### Task 1: Probe the walk's harness stop (orchestrator; no commit)

Run this on the harness that will run the fresh walk.
The Evidence table covers Claude Code. The walk's
`kill_command_or_subagent` harness may differ.

- [ ] **Step 1:** Write `$TMPDIR/probe.sh`: a copy of
  deploy's park, with `set -euo pipefail`,
  `trap 'echo "trap-ran $(date +%s)"; exit 143' TERM`,
  `echo "pid=$$ ppid=$PPID"`, and
  `while true; do sleep 3600; done`.
- [ ] **Step 2:** Launch it as the harness's background
  task. The command is the script path alone. Then stop
  it with the harness-native task stop.
  Expected: the harness reports the task stopped, not
  already-exited, and the output shows `trap-ran`
  within 2 s.
- [ ] **Step 3:** Any other outcome is a stop. Report it
  to the operator with the observed output, and do not
  start Task 3. Leader-only TERM (stopped, but no
  `trap-ran` until the sleep ends) is the one case a
  deploy change could fix. Measured here, a park of
  `sleep 3600 & wait $!` runs the trap at 0 s. That
  change stays the operator's call, because ownership
  held.

### Task 2: Describe B2's empty scheduling href

**Files:** Modify `TEST-PLAN.md:1478`–`1487` (B2).

- [ ] **Step 1:** Replace "whose `href` is the
  scheduling URL" and its PASS with prose that says
  this. The anchors carry `data-book-pilot`. Their
  `href` attribute is `PILOT_SCHEDULING_URL` from
  `web-app/landing/index.ts`, which is the empty string
  until the operator names a scheduling URL. Read it
  with `getAttribute('href')`, because the `href`
  property resolves `''` to the page's own URL.
  PASS: four anchors, each `getAttribute('href')` is
  `''`, and "See how it works" scrolls to
  `#how-it-works`. Keep the do-not-click sentence, the
  `.navbar-logo` sentence, and the Pin line unchanged.
- [ ] **Step 2:** Run `./test validate`. Expected: exit
  0, with `B2 B3 and C5 name the Apple-menu miss` among
  the passes.
- [ ] **Step 3:** Commit `Describe B2's empty scheduling href`.

### Task 3: Launch the A3 deploy as an owned task

**Files:** Modify `TEST-PLAN.md:49`–`57`
(`### The master's steps`, step 2) and `:577`–`600` (A3).

- [ ] **Step 1:** In step 2, say this. Launch A3 as the
  harness's own background task. The task's command is
  `./deploy --local 8080 --postgres mock-data` and
  nothing else: no `&`, `nohup`, `setsid`, `disown`, pid
  file, or wrapper that returns before deploy does.
  Read the seed reveal from the task's output. Record
  the task id in the master's notes. Then add one
  sentence of why: a launch that backgrounds deploy
  ends the harness task at once, leaves deploy
  reparented and parked, and leaves J1 nothing to stop.
- [ ] **Step 2:** In A3, add to PASS that the harness
  lists the A3 task as running after the listen.
  Change the Pin's exploratory clause to name that too.
- [ ] **Step 3:** Run `./test validate`. Expected: exit 0.
- [ ] **Step 4:** Commit `Launch the A3 deploy as an owned task`.

### Task 4: Restart K8 through owned deploy tasks

**Files:** Modify `TEST-PLAN.md:6707`–`6726` (K8) and
`:72`–`73` (step 5).

- [ ] **Step 1:** Rewrite K8's procedure as follows.
  Stop the A3 task with the harness-native task stop.
  Wait for its output to show the server, postgres, and
  network `Removed`. Launch
  `./deploy --local 8080 --postgres bootstrap` as a new
  owned task under Task 3's rules. Sign in with the one
  admin line from its seed reveal and open Organization.
  The PASS copy is unchanged.
  Restore: harness-stop that task, wait for `Removed`
  in the same way, then launch
  `./deploy --local 8080 --postgres mock-data` as the
  next owned task, and record its id.
  Delete the `./postgres-wipe`, `./postgres-seed`,
  `./fusion-angle serve`, `crank`, and `./serve`
  sentences. Those hand restarts do not run on macOS
  (the ZIP's binary is a Linux ELF, per
  `…-k8-serve.log`), and they need secrets the master
  never holds.
  A K8 stop that reports already-exited is J1's
  failure arriving early. Score J1 FAIL then, and do
  not continue K8 by hand.
- [ ] **Step 2:** In step 5, say that J1 stops the
  `./deploy` task K8's restore launched.
- [ ] **Step 3:** Run `./test validate`. Expected: exit 0.
- [ ] **Step 4:** Commit `Restart K8 through owned deploy tasks`.

### Task 5: Stop the live deploy task in J1

**Files:** Modify `TEST-PLAN.md:7515`–`7533` (J intro,
J1, J2).

- [ ] **Step 1:** J1 stops the live `./deploy` task
  (K8's restore, or A3's when K8 did not run) with the
  harness-native task stop. No `kill` and no
  shell-sent signal. PASS: the harness reports the task
  stopped, not already-exited, and its output ends
  with `Terminated: 15`, then server, postgres, and
  network `Removed`. Keep the sandbox-EPERM sentence.
  Add: "already-exited" is FAIL, and its cause is a
  detached launch (A3).
- [ ] **Step 2:** In J2, keep "After J1 PASS". Replace
  the DEFERRED clause: when J1 is not PASS, J2 is
  DEFERRED. The master tears the stack down out of band
  and records that in J1's FAIL detail. J2 is never
  scored against a hand teardown.
- [ ] **Step 3:** Run `./test validate`. Expected: exit 0.
- [ ] **Step 4:** Commit `Stop the live deploy task in J1`.

### Task 6: Verify (orchestrator; no commit)

- [ ] **Step 1:** `./test validate` on the branch tip.
  It covers `deno check`, both TZ passes of `./test`
  (including the two TEST-PLAN readers,
  `tests/test-plan-apple-menu.test.ts` and
  `tests/fusion-angle-live-name.test.ts`), lint (not
  `.md`), and the schema and api-docs checks. It does
  not check walk wording, and it does not run the B2
  pin. That is Layer 2, which `./deploy --local` runs
  in AT5.
- [ ] **Step 2:** A fresh walk of A1, A3, B2, K8, and J1–J3
  on the branch tip, under the harness Task 1 probed.
  It must show the following.
  - **A3:** the harness lists the deploy task as running.
  - **B2:** an explorer reads four `[data-book-pilot]`,
    each `getAttribute('href') === ''`, and
    `#how-it-works` scrolls. Score PASS, not DRIFT.
  - **K8:** each stop reports stopped and shows
    `Removed`, and each relaunch is an owned task.
  - **J1:** the harness stop reports stopped. The task
    output ends with `Terminated: 15` and the three
    `Removed` lines. No `kill` appears in the master's
    transcript. Score PASS.
  - **J2:** `docker compose ls` shows no project for
    the walk worktree, `docker ps -a` shows no walk
    containers, and there is no `.env`.
  - **J3:** the ZIP is on `~/Desktop`.
- [ ] **Step 3:** Stop here. Report the four SHAs and
  the walk lines. Landing is the operator's.

## Out of scope

- A real scheduling URL, and the pin that would come
  with it.
- `deploy`'s foreground `sleep 3600` park. It defers a
  leader-only SIGTERM, such as an operator's
  `kill <pid>`, by up to an hour. That is measured
  above, and the change is gated in Task 1, not planned.
