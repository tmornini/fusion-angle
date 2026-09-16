# Caught unload toast — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax.
> Ride this spec's worktree (AGENTS.md § Worktrees).

**Goal:** Stop a caught navigation-abort from
overwriting a success toast via `reportFault`.

**Architecture:** Hoist the pagehide latch to
module scope. `reportFault` returns without
log or toast when `shouldSurfaceFault` is
false. Same covenant as the global error
floor.

**Tech Stack:** Deno 2.9.6, `Deno.test` +
`@std/assert`, Chrome CDP under
`./test browser`.

**Spec:**
`docs/superpowers/specs/2026-09-16-caught-unload-toast-design.md`

**Worktree:**
`.worktrees/2026-09-16-caught-unload-toast`

## Task 1: Layer 1 pins, then the latch

**Files:**
- Modify: `tests/error-helpers.test.ts`
- Modify: `web-app/app/error-helpers.ts`
- Modify: `TODO.md` (after Layer 2 green)

- [ ] **Step 1:** Write failing tests in
  `tests/error-helpers.test.ts`: after
  `initErrorSurfacing` + `pagehide`,
  `reportFault` with
  `TypeError('Failed to fetch')` paints no
  `.toast`; without `pagehide`, it does.
  Watch them fail.
- [ ] **Step 2:** Hoist `pageUnloading` to
  module scope. `reportFault` returns when
  `!shouldSurfaceFault(err, pageUnloading)`.
  `initErrorSurfacing` writes the same flag.
- [ ] **Step 3:** `./test validate`. Then
  `./test browser` (WB11 pin). Drop the
  TODO.md WB11 later-work bullet.
- [ ] **Step 4:** Commit.
