# Verification Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan
> task-by-task in the master session; dispatch a
> subagent (first line `Go to Medium Church!`) only for
> the two mechanical fan-outs Tasks 15 and 20 name. Steps
> use checkbox (`- [ ]`) syntax for tracking. Do not use
> git worktrees (AGENTS.md). Work on master.

**Goal:** Replace the parallel LLM-hunter browser run
with four verification tiers — pure logic, wiring
decisions, a deterministic CDP browser suite, and serial
exploration — bound by one rule: a browser observation
becomes a product change only after a red test.

**Architecture:** Extract the CDP transport and UI-login
helpers from `web-app/app/measure.ts` into two Node-only
modules; extract the client bundling from `build` into a
sourced `build-lib`; add `./test-browser`, which bundles
into `$TMPDIR` and runs `tests/browser/*.test.ts`
serially against an in-process origin on the memory
backend, one Chrome browser context per test. Fix the
E11 click-through regression from the first browser
test. Consolidate the `tests/` global stubs, mint fresh
operation ids, delete the slice seed, and rewrite
TEST-PLAN.md as the index of covenants.

**Tech Stack:** TypeScript ES2024 strict under
`node --strip-types` (Node 26), `node:test`, Node's
global `WebSocket` and `fetch`, Chrome DevTools Protocol
over `--headless=new`, esbuild (already a devDependency),
Bash. No new dependency.

**Spec:**
`docs/superpowers/specs/2026-08-28-verification-tiers-design.md`
(committed at `27b4cd26`).

## Global Constraints

- **Base:** master at `27b4cd26`. Work on master; never
  branch, never merge, never push. No worktrees.
- **One concern per commit.** Subject ≈50 chars,
  present-tense imperative, no body prose. Every commit
  message ends with exactly these two trailer lines:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01MM4FWXLexgJuhrzKSGCmA2`
- **Never move and change content in one commit.** An
  extraction commit moves code verbatim (adding `export`
  and the import lines is the move); behavior changes
  follow in their own commit.
- **`./validate` green before every commit** (tsc on the
  browser tsconfig, `./test` in two TZ passes, 78-char
  lint over code and the named scripts, the `org` ban,
  retired-vocabulary lint, root-doc line ceilings, the
  later-work single-home gate, SVG/API doc drift).
- **78-character lines, 4-space indent** in every file
  the lint covers. New scripts join the lint list.
- **`./test-browser` cannot run inside the Claude Code
  sandbox** (Chrome cannot `bind()` its ProcessSingleton
  socket there). At each checkpoint the plan names, the
  master asks the operator to run `! ./test-browser` and
  reads the output from the conversation. Everything
  else is verified in-sandbox.
- **No new dependency.** No Playwright, Puppeteer, jsdom.
- **Product changes:** only `web-app/app/drag-reorder.ts`
  (Task 6). Every other product-tree edit is a move or a
  seam the spec names (`tsconfig` excludes, `login`
  taking an email).
- **Frozen:** dated specs, plans, and mitigation stubs
  before this one.

---

## Phase A — Tier 2 foundation

### Task 1: Extract the CDP transport from measure

**Files:**
- Create: `web-app/app/cdp-client.ts`
- Modify: `web-app/app/measure.ts` (remove the moved
  definitions; import them)
- Modify: `web-app/app/tsconfig.json` (exclude the new
  module)

**Interfaces:**
- Produces (moved verbatim, now exported):
  `sleep(ms)`, `pollUntil<T>(label, timeoutMs, fn)`,
  `chromeBinary()`, `killProcessTree(child)`,
  `class CdpClient { static connect(url); send(method,
  params?); close() }`, `evaluateJson<T>(cdp,
  expression)`, `pageNavigate(cdp, url)`,
  `clickSelector(cdp, selector)`, `waitForSelector(cdp,
  selector, label, timeoutMs)`,
  `waitDevtoolsPort(userDataDir, timeoutMs)`,
  `pageWsUrl(debugPort)`, and the constants `POLL_MS`,
  `CHROME_READY_MS`.

- [ ] **Step 1: Create the module by moving code**

Create `web-app/app/cdp-client.ts` with this header,
then move — cut from `measure.ts`, paste unchanged
except for a leading `export` — these definitions in
this order: `CHROME_READY_MS`, `POLL_MS`, `sleep`,
`pollUntil`, `chromeBinary`, `killProcessTree`, the
`CdpMessage` type, `class CdpClient`, `evaluateJson`,
`pageNavigate`, `clickSelector`, `waitForSelector`,
`waitDevtoolsPort`, `pageWsUrl`.

```ts
// Node-only CDP transport, Chrome launch, and waits.
// Shared by ./measure and ./test-browser. Excluded from
// the browser tsc (Node APIs + global WebSocket), like
// measure.ts.

import { type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { platform } from 'node:os';
import { join } from 'node:path';
```

`measure.ts` keeps `freePort`, `tmpRoot`, `registryUrl`,
`queryOf`, and everything else. Replace the removed
block with:

```ts
import {
    CHROME_READY_MS,
    CdpClient,
    chromeBinary,
    clickSelector,
    evaluateJson,
    killProcessTree,
    pageNavigate,
    pageWsUrl,
    pollUntil,
    sleep,
    waitDevtoolsPort,
    waitForSelector,
} from './cdp-client.ts';
```

Remove `existsSync`, `readFileSync`, `join`, and
`platform` from measure's own imports only if measure
no longer uses them (`grep -n` each; `join` and
`platform` are still used by the history line and
`chromeDir`; `readFileSync` is used by `--visualize`
and the seed reveal — keep what is used).

- [ ] **Step 2: Exclude the module from the browser tsc**

In `web-app/app/tsconfig.json` add `"./cdp-client.ts"`
to `exclude` after `"./measure-viz.ts"`.

- [ ] **Step 3: Verify measure still loads**

Run: `./measure --help`
Expected: usage text, exit 0.

Run: `./validate`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add web-app/app/cdp-client.ts web-app/app/measure.ts \
    web-app/app/tsconfig.json
git commit -m "Extract the CDP transport from measure"
```

### Task 2: Sessions, events, a socket seam, and launch

**Files:**
- Modify: `web-app/app/cdp-client.ts`
- Modify: `web-app/app/measure.ts` (Chrome spawn →
  `launchChrome`)
- Test: `tests/cdp-client.test.ts`

**Interfaces:**
- Produces: `interface CdpSocket { addEventListener(
  'message', fn); send(data); close() }`,
  `CdpClient.fromSocket(ws)`, `send(method, params?,
  sessionId?)`, `on(method, listener): () => void`,
  `class CdpSession { constructor(client, sessionId);
  send(method, params?); evaluate<T>(expression) }`,
  `evaluateJson(cdp, expression, sessionId?)`,
  `pageNavigate(cdp, url, sessionId?)`,
  `clickSelector(cdp, selector, sessionId?)`,
  `waitForSelector(cdp, selector, label, timeoutMs,
  sessionId?)`, `launchChrome({ userDataDir,
  windowSize? }): ChildProcess`,
  `browserWsUrl(debugPort): Promise<string>`.

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    CdpClient,
    type CdpSocket,
} from '../web-app/app/cdp-client.ts';

class FakeSocket implements CdpSocket {
    readonly sent: string[] = [];
    private onMessage:
        ((ev: { data: unknown }) => void) | null = null;
    addEventListener(
        type: 'message',
        fn: (ev: { data: unknown }) => void,
    ): void {
        if (type === 'message') this.onMessage = fn;
    }
    send(data: string): void {
        this.sent.push(data);
    }
    close(): void {}
    receive(message: object): void {
        this.onMessage?.({
            data: JSON.stringify(message),
        });
    }
}

type Sent = {
    id: number;
    method: string;
    params?: unknown;
    sessionId?: string;
};

test('send carries the session id and resolves by id',
async () => {
    const ws = new FakeSocket();
    const cdp = CdpClient.fromSocket(ws);
    const reply = cdp.send(
        'Runtime.evaluate', { expression: '1' }, 'S1',
    );
    const sent = JSON.parse(ws.sent[0]!) as Sent;
    assert.equal(sent.method, 'Runtime.evaluate');
    assert.equal(sent.sessionId, 'S1');
    assert.deepEqual(sent.params, { expression: '1' });
    ws.receive({
        id: sent.id, sessionId: 'S1', result: { v: 1 },
    });
    assert.deepEqual(await reply, { v: 1 });
});

test('a send without a session omits the field',
async () => {
    const ws = new FakeSocket();
    const cdp = CdpClient.fromSocket(ws);
    const reply = cdp.send('Page.enable');
    const sent = JSON.parse(ws.sent[0]!) as Sent;
    assert.equal('sessionId' in sent, false);
    assert.equal('params' in sent, false);
    ws.receive({ id: sent.id, result: {} });
    assert.deepEqual(await reply, {});
});

test('an error reply rejects with the CDP message',
async () => {
    const ws = new FakeSocket();
    const cdp = CdpClient.fromSocket(ws);
    const reply = cdp.send('Nope.nope');
    const sent = JSON.parse(ws.sent[0]!) as Sent;
    ws.receive({
        id: sent.id,
        error: { message: 'no such method', code: -1 },
    });
    await assert.rejects(reply, /CDP no such method/);
});

test('events reach listeners by method with a session',
() => {
    const ws = new FakeSocket();
    const cdp = CdpClient.fromSocket(ws);
    const seen: Array<[unknown, string | undefined]> =
        [];
    const off = cdp.on(
        'Network.requestWillBeSent',
        (params, sessionId) => {
            seen.push([params, sessionId]);
        },
    );
    ws.receive({
        method: 'Network.requestWillBeSent',
        params: { requestId: 'r1' },
        sessionId: 'S1',
    });
    ws.receive({
        method: 'Page.loadEventFired',
        params: { timestamp: 1 },
    });
    off();
    ws.receive({
        method: 'Network.requestWillBeSent',
        params: { requestId: 'r2' },
    });
    assert.deepEqual(seen, [[{ requestId: 'r1' }, 'S1']]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts --test tests/cdp-client.test.ts`
Expected: FAIL — `CdpClient.fromSocket is not a function`.

- [ ] **Step 3: Implement**

In `cdp-client.ts`:

```ts
export interface CdpSocket {
    addEventListener(
        type: 'message',
        fn: (ev: { data: unknown }) => void,
    ): void;
    send(data: string): void;
    close(): void;
}

export type CdpEventListener = (
    params: unknown,
    sessionId: string | undefined,
) => void;
```

Change `CdpClient`:

- the field `private ws: CdpSocket;` and the private
  constructor take a `CdpSocket`;
- add `private listeners = new Map<string,
  Set<CdpEventListener>>();`
- add `static fromSocket(ws: CdpSocket): CdpClient {
  return new CdpClient(ws); }`
- `connect` is unchanged except it passes the
  `WebSocket` to the constructor as before;
- in `onMessage`, before the existing `if (msg.id ===
  undefined) return;`, dispatch events:

```ts
        if (msg.id === undefined) {
            if (msg.method === undefined) return;
            const set = this.listeners.get(msg.method);
            if (set === undefined) return;
            for (const fn of set) {
                fn(msg.params, msg.sessionId);
            }
            return;
        }
```

- `send(method, params?, sessionId?)` adds
  `if (sessionId !== undefined) payload.sessionId =
  sessionId;` after the params line;
- add:

```ts
    on(
        method: string,
        fn: CdpEventListener,
    ): () => void {
        let set = this.listeners.get(method);
        if (set === undefined) {
            set = new Set();
            this.listeners.set(method, set);
        }
        set.add(fn);
        return () => {
            set.delete(fn);
        };
    }
```

Add to the `CdpMessage` type: `sessionId?: string;`.

Thread an optional trailing `sessionId?: string` through
`evaluateJson`, `pageNavigate`, `clickSelector`, and
`waitForSelector`, passing it to `cdp.send`. Add:

```ts
export class CdpSession {
    constructor(
        readonly client: CdpClient,
        readonly sessionId: string,
    ) {}

    send(
        method: string,
        params?: Record<string, unknown>,
    ): Promise<unknown> {
        return this.client.send(
            method, params, this.sessionId,
        );
    }

    evaluate<T>(expression: string): Promise<T> {
        return evaluateJson<T>(
            this.client, expression, this.sessionId,
        );
    }
}

export function launchChrome(options: {
    readonly userDataDir: string;
    readonly windowSize?: string;
}): ChildProcess {
    const args = [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${options.userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-gpu',
    ];
    if (options.windowSize !== undefined) {
        args.push(`--window-size=${options.windowSize}`);
    }
    args.push('about:blank');
    const child = spawn(
        chromeBinary(), args,
        { stdio: 'ignore', detached: true },
    );
    child.unref();
    return child;
}

export async function browserWsUrl(
    debugPort: number,
): Promise<string> {
    const res = await fetch(
        `http://127.0.0.1:${debugPort}/json/version`,
    );
    if (!res.ok) {
        throw new Error(
            'Chrome /json/version answered ' + res.status,
        );
    }
    const info = await res.json() as {
        webSocketDebuggerUrl?: string;
    };
    if (info.webSocketDebuggerUrl === undefined) {
        throw new Error(
            'Chrome /json/version has no'
            + ' webSocketDebuggerUrl',
        );
    }
    return info.webSocketDebuggerUrl;
}
```

`spawn` joins the `node:child_process` import. In
`measure.ts` step 3 ("Launch Chrome"), replace the
inline `spawn(chromePath, [...])` + `unref()` with
`chromeProc = launchChrome({ userDataDir: chromeDir });`
and delete the now-unused `chromePath` variable and its
`chromeBinary()` call if nothing else reads it (the
usage text may still mention `CHROME`; keep that).

- [ ] **Step 4: Run to verify they pass**

Run: `TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts --test tests/cdp-client.test.ts`
Expected: 4 pass.

Run: `./measure --help` → exit 0. Run: `./validate` →
exit 0.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/cdp-client.ts web-app/app/measure.ts \
    tests/cdp-client.test.ts
git commit -m "Route CDP sessions and events in the client"
```

### Task 3: Extract the UI drive helpers from measure

**Files:**
- Create: `web-app/app/browser-drive.ts`
- Modify: `web-app/app/measure.ts`
- Modify: `web-app/app/tsconfig.json`

**Interfaces:**
- Produces (commit 1, moved verbatim):
  `LOGIN_TIMEOUT_MS`, `ELEMENT_TIMEOUT_MS`,
  `registryUrl(baseUrl, key, query?)`,
  `type ReadyHarvest`, `harvestReady(cdp)`,
  `waitPageReady(cdp, pageLabel, timeoutMs)`,
  `login(cdp, baseUrl, password)`.
- Produces (commit 2): `login(cdp, baseUrl, email,
  password, sessionId?)`, `harvestReady(cdp,
  sessionId?)`, `waitPageReady(cdp, pageLabel,
  timeoutMs, sessionId?)`.

- [ ] **Step 1: Move**

Create `web-app/app/browser-drive.ts`:

```ts
// Node-only product-aware driving on top of cdp-client:
// page URLs, page:ready, and the auth-page sign-in.
// Shared by ./measure and ./test-browser. Excluded from
// the browser tsc like measure.ts.

import { PAGE_REGISTRY } from './page-registry.ts';
import type { PageRun } from './measure-core.ts';
import type { ApiRequestHit } from
    './measure-profile-core.ts';
import {
    type CdpClient,
    clickSelector,
    evaluateJson,
    pageNavigate,
    pollUntil,
    waitForSelector,
} from './cdp-client.ts';
```

Then move, unchanged except `export`:
`LOGIN_TIMEOUT_MS`, `ELEMENT_TIMEOUT_MS`,
`registryUrl`, `ReadyHarvest`, `harvestReady`,
`waitPageReady`, `login`. `login` still reads
`MEASURE_DEMO_EMAIL`; import it from
`./measure-cli.ts` in this commit (the next commit
removes that coupling). In `measure.ts` import the
moved names from `./browser-drive.ts` and delete the
definitions. Add `"./browser-drive.ts"` to the
tsconfig `exclude`.

Run: `./measure --help` → exit 0. `./validate` → exit 0.

```bash
git add web-app/app/browser-drive.ts web-app/app/measure.ts \
    web-app/app/tsconfig.json
git commit -m "Extract the UI drive helpers from measure"
```

- [ ] **Step 2: Take the email and session as arguments**

Change the three signatures:

```ts
export async function harvestReady(
    cdp: CdpClient,
    sessionId?: string,
): Promise<ReadyHarvest | null>
```
(pass `sessionId` to `evaluateJson`);

```ts
export async function waitPageReady(
    cdp: CdpClient,
    pageLabel: string,
    timeoutMs: number,
    sessionId?: string,
): Promise<ReadyHarvest>
```
(pass it to `harvestReady`);

```ts
export async function login(
    cdp: CdpClient,
    baseUrl: string,
    email: string,
    password: string,
    sessionId?: string,
): Promise<void>
```
— replace `MEASURE_DEMO_EMAIL` inside with `email`,
drop the `measure-cli` import from browser-drive, and
pass `sessionId` to every `pageNavigate`,
`waitForSelector`, `evaluateJson`, `clickSelector`, and
`waitPageReady` call inside. In `measure.ts` the call
becomes `await login(cdp, baseUrl, MEASURE_DEMO_EMAIL,
password);`.

Run: `./measure --help` → exit 0. `./validate` → exit 0.

```bash
git add web-app/app/browser-drive.ts web-app/app/measure.ts
git commit -m "Take the sign-in email and session as arguments"
```

### Task 4: Extract the client bundle into build-lib

**Files:**
- Create: `build-lib`
- Modify: `build`
- Modify: `validate` (lint list)

**Interfaces:**
- Produces: Bash functions `emitted LABEL PATH` and
  `bundle_client DEST` (sourced; repo-root cwd).

- [ ] **Step 1: Create `build-lib` by moving**

```bash
#!/bin/bash
# Sourced by ./build and ./test-browser from the repo
# root. Not a command. bundle_client composes the pages
# and bundles the client into DEST; ./build owns the
# clean-tree gate, server.mjs, and the ZIP.

# Fail when the artifact is empty or absent; report its
# size otherwise — one voice for every emitted artifact.
emitted() {
    local label="$1" path="$2"
    local name
    name=$(basename "$path")
    if [ ! -s "$path" ]; then
        echo "ERROR: $name is empty or missing" >&2
        exit 1
    fi
    echo "$label: assets/$name" \
        "($(wc -c < "$path" | xargs) bytes)"
}

bundle_client() {
    local dest="$1"
    node --strip-types web-app/app/compose.ts "$dest"
    mkdir -p "$dest/assets"
    # ...the server-core, theme-init, root-redirect,
    # styles, pages-*.css, fonts, index.html, and
    # favicon steps, moved verbatim from ./build with
    # "$BUILD_DIR" replaced by "$dest"...
}
```

The body of `bundle_client` is the exact text of
`build` from `node --strip-types web-app/app/compose.ts
"$BUILD_DIR"` through `cp web-app/assets/mark.png
"$BUILD_DIR/assets/"`, with `emitted` moved out as
shown and `$BUILD_DIR` → `$dest`. `build` replaces that
whole region with `bundle_client "$BUILD_DIR"` and adds,
right after its argument parsing and before the
clean-tree gate:

```bash
# shellcheck source=build-lib
source "$(dirname "$0")/build-lib"
```

`chmod +x build-lib` is not needed (sourced), but keep
the shebang for the linter's sake.

- [ ] **Step 2: Lint the new script**

In `validate`, add `build-lib` after `build` in the
`awk "$AWK_LINT" build serve test …` list.

- [ ] **Step 3: Verify**

Run:
```bash
( source ./build-lib && bundle_client "$TMPDIR/bundle-check" ) \
    && ls "$TMPDIR/bundle-check/assets/app.js" \
       "$TMPDIR/bundle-check/dashboard/index.html"
```
Expected: both paths listed. Run `./build --help` →
usage, exit 0. Run `./validate` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add build-lib build validate
git commit -m "Extract the client bundle into build-lib"
```

### Task 5: test-browser, the fixtures, and sign-in

**Files:**
- Create: `test-browser`
- Create: `tests/browser/fixtures.ts`
- Create: `tests/browser/sign-in.test.ts`
- Create: `tests/browser-origin.test.ts`
- Modify: `validate` (lint list gains `test-browser`)
- Modify: `docs/superpowers/specs/2026-08-28-verification-tiers-design.md`
  (initial-suite table gains the `sign-in` row)

**Interfaces:**
- Produces (fixtures): `ADMIN_EMAIL`,
  `SECOND_EMAIL = 'sarah.chen@company.com'`,
  `VIEWPORT = { width: 1280, height: 800 }`,
  `type Origin = { baseUrl; db; credentials; close() }`,
  `startOrigin(): Promise<Origin>`,
  `passwordOf(credentials, email)`,
  `adminToken(): Promise<string>`,
  `class Browser { static launch(); newPage();
  newPageIn(contextId); close() }`,
  `class Page { session; evaluate<T>(expr);
  navigate(url); ready(label); waitFor(selector,
  timeoutMs?); until(expr, label, timeoutMs?);
  rect(selector, index?); center(selector, index?);
  click(selector); press(pt, modifiers?); move(pt,
  modifiers?); release(pt, modifiers?); drag(from, to,
  { steps, modifiers }); key(name, modifiers?);
  keyDown(name); keyUp(name); setViewport(width,
  height, mobile); emulateMedia(features); close() }`,
  `useBrowser(): { get(): Browser }`,
  `signIn(page, origin, email)`,
  `withAdminPage(browser, fn)`,
  `stays(page, expression, windowMs)`.

- [ ] **Step 1: Write the runner**

`test-browser`:

```bash
#!/bin/bash
set -euo pipefail

# Tier 2: deterministic browser tests. Bundles the
# client into $TMPDIR (any tree), then runs
# tests/browser/*.test.ts serially against an
# in-process origin on the memory backend. Needs
# Chrome: CHROME (binary) or CHROME_DEBUG_URL (a
# running Chrome's browser WebSocket URL).

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# shellcheck source=build-lib
source ./build-lib

if [ -z "${CHROME_DEBUG_URL:-}" ]; then
    CHROME="${CHROME:-/Applications/Google Chrome.app}"
    CHROME="${CHROME%/}"
    if [ -d "$CHROME" ]; then
        CHROME="$CHROME/Contents/MacOS/Google Chrome"
    fi
    if [ ! -x "$CHROME" ]; then
        echo "Error: Chrome not found; set CHROME to" \
            "the binary or CHROME_DEBUG_URL to a" \
            "running Chrome" >&2
        exit 1
    fi
    export CHROME
fi

export JWT_HMAC_SIGNING_KEY="${JWT_HMAC_SIGNING_KEY:-test-hmac-signing-key}"

BUNDLE="$(mktemp -d "${TMPDIR:-/tmp}/fusion-browser.XXXXXX")"
trap 'rm -rf "$BUNDLE"' EXIT
bundle_client "$BUNDLE" > /dev/null
export FUSION_ANGLE_STATIC_ROOT="$BUNDLE"

TZ=UTC node --strip-types \
    --import ./tests/hmac-test-key.ts \
    --test --test-concurrency=1 \
    tests/browser/*.test.ts
```

`chmod +x test-browser`. Add `test-browser` to the
`validate` lint list after `test-postgres`.

- [ ] **Step 2: Write the fixtures**

`tests/browser/fixtures.ts`:

```ts
// Tier 2 fixtures: an in-process origin on the memory
// backend, one Chrome per file, one browser context per
// test, compositor input, condition waits. Runs only
// under ./test-browser (FUSION_ANGLE_STATIC_ROOT).

import { after, before } from 'node:test';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../../api/db-memory.ts';
import {
    postMockDataLoad,
    type SeededCredentials,
} from '../../api/mock-data.ts';
import { buildMembers } from
    '../../api/mock-data/members.ts';
import { STARK_ORGANIZATION } from
    '../../api/mock-data/seed-constants.ts';
import { listenHttp } from
    '../../server/http-server.ts';
import { testHashPassword } from '../mock-seed.ts';
import { organizationToken } from
    '../token-fixtures.ts';
import {
    CHROME_READY_MS,
    CdpClient,
    CdpSession,
    browserWsUrl,
    killProcessTree,
    launchChrome,
    pollUntil,
    sleep,
    waitDevtoolsPort,
} from '../../web-app/app/cdp-client.ts';
import {
    ELEMENT_TIMEOUT_MS,
    LOGIN_TIMEOUT_MS,
    login,
    waitPageReady,
} from '../../web-app/app/browser-drive.ts';

export const ADMIN_EMAIL = 'demo@example.com';
export const SECOND_EMAIL = 'sarah.chen@company.com';
export const VIEWPORT = { width: 1280, height: 800 };
const CONDITION_TIMEOUT_MS = 10_000;
const DRAG_STEPS = 8;
const STAY_SAMPLE_MS = 50;

export type Origin = {
    readonly baseUrl: string;
    readonly db: MemoryDbAdapter;
    readonly credentials: SeededCredentials;
    close(): Promise<void>;
};

export async function startOrigin(): Promise<Origin> {
    const staticRoot =
        process.env['FUSION_ANGLE_STATIC_ROOT'];
    if (staticRoot === undefined || staticRoot === '') {
        throw new Error(
            'FUSION_ANGLE_STATIC_ROOT is required'
            + ' (run ./test-browser)',
        );
    }
    const db = memoryDbAdapter();
    const credentials = await postMockDataLoad(db, {
        hashPassword: testHashPassword,
    });
    const listener = await listenHttp({
        adapter: db,
        staticRoot,
        port: 0,
        host: '127.0.0.1',
    });
    return {
        baseUrl: `http://127.0.0.1:${listener.port}`,
        db,
        credentials,
        close: () => listener.close(),
    };
}

export function passwordOf(
    credentials: SeededCredentials,
    email: string,
): string {
    const row = credentials.identities.find(
        (i) => i.username === email,
    );
    if (row === undefined) {
        throw new Error(
            `no seeded credential for ${email}`,
        );
    }
    return row.password;
}

export async function adminToken(): Promise<string> {
    const admin = buildMembers().find(
        (m) => m.email === ADMIN_EMAIL,
    );
    if (admin === undefined) {
        throw new Error('mock seed has no demo admin');
    }
    return organizationToken(
        admin.id, STARK_ORGANIZATION,
    );
}

export type Point = { readonly x: number; readonly y: number };
export type Rect = Point & {
    readonly width: number;
    readonly height: number;
};

const KEY_CODES: Record<string, [string, number]> = {
    Tab: ['Tab', 9],
    Enter: ['Enter', 13],
    Escape: ['Escape', 27],
    Backspace: ['Backspace', 8],
    Delete: ['Delete', 46],
    ArrowUp: ['ArrowUp', 38],
    ArrowDown: ['ArrowDown', 40],
    Shift: ['ShiftLeft', 16],
    ' ': ['Space', 32],
};

export const SHIFT = 8;

export class Page {
    constructor(
        private readonly client: CdpClient,
        readonly session: CdpSession,
        readonly targetId: string,
        readonly contextId: string,
    ) {}

    evaluate<T>(expression: string): Promise<T> {
        return this.session.evaluate<T>(expression);
    }

    async navigate(url: string): Promise<void> {
        await this.session.send('Page.navigate', { url });
    }

    ready(label: string): Promise<unknown> {
        return waitPageReady(
            this.client, label, LOGIN_TIMEOUT_MS,
            this.session.sessionId,
        );
    }

    waitFor(
        selector: string,
        timeoutMs = ELEMENT_TIMEOUT_MS,
    ): Promise<boolean> {
        return this.until(
            `!!document.querySelector(${
                JSON.stringify(selector)})`,
            `selector ${selector}`, timeoutMs,
        );
    }

    until<T>(
        expression: string,
        label: string,
        timeoutMs = CONDITION_TIMEOUT_MS,
    ): Promise<T> {
        return pollUntil<T>(
            label, timeoutMs,
            () => this.evaluate<T | false | null>(
                expression,
            ),
        );
    }

    async rect(selector: string, index = 0): Promise<Rect> {
        const r = await this.evaluate<Rect | null>(
            `(() => {
                const el = [...document.querySelectorAll(${
                    JSON.stringify(selector)})][${index}];
                if (!el) return null;
                const b = el.getBoundingClientRect();
                return { x: b.x, y: b.y,
                    width: b.width, height: b.height };
            })()`,
        );
        if (r === null) {
            throw new Error(
                `no element ${selector}[${index}]`,
            );
        }
        return r;
    }

    async center(
        selector: string, index = 0,
    ): Promise<Point> {
        const r = await this.rect(selector, index);
        return {
            x: r.x + r.width / 2,
            y: r.y + r.height / 2,
        };
    }

    async click(selector: string): Promise<void> {
        const p = await this.center(selector);
        await this.press(p);
        await this.release(p);
    }

    press(pt: Point, modifiers = 0): Promise<unknown> {
        return this.session.send(
            'Input.dispatchMouseEvent', {
                type: 'mousePressed', x: pt.x, y: pt.y,
                button: 'left', clickCount: 1,
                modifiers,
            },
        );
    }

    move(pt: Point, modifiers = 0): Promise<unknown> {
        return this.session.send(
            'Input.dispatchMouseEvent', {
                type: 'mouseMoved', x: pt.x, y: pt.y,
                button: 'left', buttons: 1, modifiers,
            },
        );
    }

    release(pt: Point, modifiers = 0): Promise<unknown> {
        return this.session.send(
            'Input.dispatchMouseEvent', {
                type: 'mouseReleased', x: pt.x, y: pt.y,
                button: 'left', clickCount: 1,
                modifiers,
            },
        );
    }

    async drag(
        from: Point,
        to: Point,
        options: { steps?: number; modifiers?: number }
            = {},
    ): Promise<void> {
        const steps = options.steps ?? DRAG_STEPS;
        const modifiers = options.modifiers ?? 0;
        await this.press(from, modifiers);
        for (let i = 1; i <= steps; i += 1) {
            await this.move({
                x: from.x + (to.x - from.x) * i / steps,
                y: from.y + (to.y - from.y) * i / steps,
            }, modifiers);
        }
        await this.release(to, modifiers);
    }

    async keyDown(name: string, modifiers = 0):
    Promise<void> {
        const [code, vk] = keyCodeOf(name);
        const printable = name.length === 1;
        await this.session.send(
            'Input.dispatchKeyEvent', {
                type: printable ? 'keyDown' : 'rawKeyDown',
                key: name, code,
                windowsVirtualKeyCode: vk, modifiers,
                ...(printable ? { text: name } : {}),
            },
        );
    }

    async keyUp(name: string, modifiers = 0):
    Promise<void> {
        const [code, vk] = keyCodeOf(name);
        await this.session.send(
            'Input.dispatchKeyEvent', {
                type: 'keyUp', key: name, code,
                windowsVirtualKeyCode: vk, modifiers,
            },
        );
    }

    async key(name: string, modifiers = 0):
    Promise<void> {
        await this.keyDown(name, modifiers);
        await this.keyUp(name, modifiers);
    }

    setViewport(
        width: number, height: number, mobile: boolean,
    ): Promise<unknown> {
        return this.session.send(
            'Emulation.setDeviceMetricsOverride', {
                width, height, deviceScaleFactor: 1,
                mobile,
            },
        );
    }

    emulateMedia(
        features: ReadonlyArray<{
            name: string; value: string;
        }>,
    ): Promise<unknown> {
        return this.session.send(
            'Emulation.setEmulatedMedia', { features },
        );
    }

    async close(): Promise<void> {
        await this.client.send(
            'Target.closeTarget', { targetId: this.targetId },
        );
    }
}

function keyCodeOf(name: string): [string, number] {
    const entry = KEY_CODES[name];
    if (entry === undefined) {
        throw new Error(`no key code for ${name}`);
    }
    return entry;
}

export class Browser {
    private constructor(
        readonly client: CdpClient,
        private readonly chrome: ChildProcess | null,
        private readonly userDataDir: string | null,
    ) {}

    static async launch(): Promise<Browser> {
        const attach = process.env['CHROME_DEBUG_URL'];
        if (attach !== undefined && attach !== '') {
            return new Browser(
                await CdpClient.connect(attach), null, null,
            );
        }
        const userDataDir = mkdtempSync(join(
            process.env['TMPDIR'] ?? tmpdir(),
            'fusion-browser-',
        ));
        const chrome = launchChrome({
            userDataDir,
            windowSize:
                `${VIEWPORT.width},${VIEWPORT.height}`,
        });
        const port = await waitDevtoolsPort(
            userDataDir, CHROME_READY_MS,
        );
        const client = await CdpClient.connect(
            await browserWsUrl(port),
        );
        return new Browser(client, chrome, userDataDir);
    }

    async newPage(): Promise<Page> {
        const created = await this.client.send(
            'Target.createBrowserContext',
        ) as { browserContextId: string };
        return this.newPageIn(created.browserContextId);
    }

    async newPageIn(contextId: string): Promise<Page> {
        const target = await this.client.send(
            'Target.createTarget', {
                url: 'about:blank',
                browserContextId: contextId,
            },
        ) as { targetId: string };
        const attached = await this.client.send(
            'Target.attachToTarget', {
                targetId: target.targetId, flatten: true,
            },
        ) as { sessionId: string };
        const session = new CdpSession(
            this.client, attached.sessionId,
        );
        await session.send('Page.enable');
        await session.send('Runtime.enable');
        await session.send('Network.enable');
        await session.send(
            'Emulation.setDeviceMetricsOverride', {
                width: VIEWPORT.width,
                height: VIEWPORT.height,
                deviceScaleFactor: 1, mobile: false,
            },
        );
        await session.send(
            'Emulation.setFocusEmulationEnabled',
            { enabled: true },
        );
        await session.send('Page.bringToFront');
        return new Page(
            this.client, session, target.targetId,
            contextId,
        );
    }

    async disposeContext(contextId: string):
    Promise<void> {
        await this.client.send(
            'Target.disposeBrowserContext',
            { browserContextId: contextId },
        );
    }

    async close(): Promise<void> {
        this.client.close();
        killProcessTree(this.chrome);
        if (this.userDataDir !== null) {
            rmSync(this.userDataDir, {
                recursive: true, force: true,
            });
        }
    }
}

export function useBrowser(): { get(): Browser } {
    let browser: Browser | null = null;
    before(async () => {
        browser = await Browser.launch();
    });
    after(async () => {
        await browser?.close();
    });
    return {
        get: () => {
            if (browser === null) {
                throw new Error('browser not launched');
            }
            return browser;
        },
    };
}

export async function signIn(
    page: Page, origin: Origin, email: string,
): Promise<void> {
    await login(
        page.session.client, origin.baseUrl, email,
        passwordOf(origin.credentials, email),
        page.session.sessionId,
    );
}

export async function withAdminPage(
    browser: Browser,
    fn: (page: Page, origin: Origin) => Promise<void>,
): Promise<void> {
    const origin = await startOrigin();
    const page = await browser.newPage();
    try {
        await signIn(page, origin, ADMIN_EMAIL);
        await fn(page, origin);
    } finally {
        await page.close();
        await browser.disposeContext(page.contextId);
        await origin.close();
    }
}

// A bounded negative assertion: the expression keeps
// its first value for windowMs (a navigation would
// change it or kill the context).
export async function stays(
    page: Page, expression: string, windowMs: number,
): Promise<void> {
    const first = await page.evaluate<unknown>(expression);
    const deadline = Date.now() + windowMs;
    while (Date.now() < deadline) {
        await sleep(STAY_SAMPLE_MS);
        const now = await page.evaluate<unknown>(expression);
        if (now !== first) {
            throw new Error(
                `${expression} changed: ${String(first)}`
                + ` -> ${String(now)}`,
            );
        }
    }
}
```

`Page.close` plus `Browser.disposeContext` in
`withAdminPage`; `CdpSession.client` is the public
field Task 2 declared.

- [ ] **Step 3: Write the Tier-0 origin test**

`tests/browser-origin.test.ts` (runs under `./test`,
no Chrome, no bundle):

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    ADMIN_EMAIL,
    adminToken,
    passwordOf,
    startOrigin,
} from './browser/fixtures.ts';

test('the in-process origin serves the seeded API',
async () => {
    const staticRoot = mkdtempSync(join(
        process.env['TMPDIR'] ?? tmpdir(),
        'fusion-origin-',
    ));
    process.env['FUSION_ANGLE_STATIC_ROOT'] = staticRoot;
    const origin = await startOrigin();
    try {
        assert.ok(
            passwordOf(origin.credentials, ADMIN_EMAIL)
                .length > 0,
        );
        const anonymous = await fetch(
            origin.baseUrl + '/api/organizations/',
        );
        assert.equal(anonymous.status, 401);
        const bearer = await fetch(
            origin.baseUrl + '/api/organizations/',
            { headers: {
                Authorization: 'Bearer '
                    + await adminToken(),
            } },
        );
        assert.equal(bearer.status, 200);
        const rows = await bearer.json() as Array<{
            name: string;
        }>;
        assert.ok(rows.some(
            (r) => r.name === 'Stark Industries',
        ));
    } finally {
        await origin.close();
        rmSync(staticRoot, { recursive: true, force: true });
    }
});
```

If `/api/organizations/` is not the list route the API
exposes, use the route `tests/api-human-members.test.ts`
reads (`organizations/AjdvjuECVZEgZoFajaIEkg/members/`)
and assert a 200 with a non-empty array.

Run: `TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts --test tests/browser-origin.test.ts`
Expected: 1 pass.

- [ ] **Step 4: Write the sign-in browser test**

`tests/browser/sign-in.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    ADMIN_EMAIL,
    passwordOf,
    signIn,
    startOrigin,
    useBrowser,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();

test('sign-in lands on the dashboard as the seeded admin',
async () => {
    const origin = await startOrigin();
    const page = await browser.get().newPage();
    try {
        await signIn(page, origin, ADMIN_EMAIL);
        const path = await page.evaluate<string>(
            'location.pathname',
        );
        assert.ok(path.includes('/dashboard/'), path);
        const name = await page.until<string>(
            `document.querySelector('#sidebar-member-name')
                ?.textContent?.trim() || null`,
            'sidebar member name',
        );
        assert.equal(name, 'Tony Stark');
    } finally {
        await page.close();
        await browser.get().disposeContext(page.contextId);
        await origin.close();
    }
});

test('a wrong password stays on auth with the inline error',
async () => {
    const origin = await startOrigin();
    const page = await browser.get().newPage();
    try {
        await page.navigate(
            registryUrl(origin.baseUrl, 'auth'),
        );
        await page.waitFor('#email');
        const right = passwordOf(
            origin.credentials, ADMIN_EMAIL,
        );
        await page.evaluate(`(() => {
            const email = document.querySelector('#email');
            const password =
                document.querySelector('#password');
            email.value = ${JSON.stringify(ADMIN_EMAIL)};
            email.dispatchEvent(
                new Event('input', { bubbles: true }));
            password.value = ${JSON.stringify(
                right + 'x')};
            password.dispatchEvent(
                new Event('input', { bubbles: true }));
            return true;
        })()`);
        await page.click('#submit-btn');
        const error = await page.until<string>(
            `document.querySelector(
                '#password-error:not(.hidden)')
                ?.textContent?.trim() || null`,
            'password error',
        );
        assert.ok(error.length > 0);
        assert.ok((await page.evaluate<string>(
            'location.pathname',
        )).includes('/auth/'));
    } finally {
        await page.close();
        await browser.get().disposeContext(page.contextId);
        await origin.close();
    }
});
```

- [ ] **Step 5: Amend the spec's initial-suite table**

Add as the first row of the table in §3:
`| \`sign-in\` | the auth page signs the seeded admin in over the loopback origin; a wrong password stays with the inline error |`.

- [ ] **Step 6: Checkpoint — operator runs the suite**

`./validate` → exit 0 in-sandbox (the origin test runs
in `./test`). Then ask the operator:

> Please run `! ./test-browser` and paste nothing —
> the output lands here.

Expected: `tests/browser/sign-in.test.ts` 2 pass. Fix
fixture defects until it does (headless Chrome refusing
the `Secure` cookie on `127.0.0.1` → switch `baseUrl`
to `http://localhost:<port>` and `host` to
`'127.0.0.1'` stays; a missing `#sidebar-member-name`
→ read the selector from `component-sidebar.html`).

- [ ] **Step 7: Commit**

```bash
git add test-browser validate tests/browser/fixtures.ts \
    tests/browser/sign-in.test.ts \
    tests/browser-origin.test.ts \
    docs/superpowers/specs/2026-08-28-verification-tiers-design.md
git commit -m "Add test-browser with an in-process origin"
```

### Task 6: List reorder — the E11 red pin and the fix

**Files:**
- Create: `tests/browser/list-reorder.test.ts`
- Modify: `web-app/app/drag-reorder.ts:147-258`

**Interfaces:**
- Consumes: fixtures from Task 5; `registryUrl` from
  `browser-drive`.

- [ ] **Step 1: Write the failing browser test**

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    stays,
    useBrowser,
    withAdminPage,
    type Page,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const CARD = '[data-project-card]';
const HANDLE = '[data-project-card] .drag-handle';
const ORDER = `[...document.querySelectorAll('${CARD}')]`
    + `.map(c => c.getAttribute('data-project-card'))`;
const STAY_MS = 600;

async function openProjects(
    page: Page, baseUrl: string,
): Promise<string[]> {
    await page.navigate(registryUrl(baseUrl, 'projects'));
    await page.ready('projects');
    await page.waitFor(HANDLE);
    const order = await page.evaluate<string[]>(ORDER);
    assert.ok(order.length >= 3, 'three or more projects');
    return order;
}

function onProjects(path: string): boolean {
    return path.endsWith('/projects/index.html');
}

test('a captured drag reorders, persists, and stays put',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        const before = await openProjects(page, origin.baseUrl);
        const handle = await page.center(HANDLE);
        const second = await page.rect(CARD, 1);
        await page.drag(handle, {
            x: handle.x,
            y: second.y + second.height * 0.8,
        });
        await page.until(
            `(${ORDER})[1] === ${JSON.stringify(before[0])}`,
            'first card lands in the second slot',
        );
        await stays(page, 'location.pathname', STAY_MS);
        assert.ok(onProjects(
            await page.evaluate<string>('location.pathname'),
        ));
        const after = await openProjects(page, origin.baseUrl);
        assert.equal(after[0], before[1]);
        assert.equal(after[1], before[0]);
    });
});

test('a plain click on the reorder handle does not navigate',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openProjects(page, origin.baseUrl);
        await page.click(HANDLE);
        await stays(page, 'location.pathname', STAY_MS);
        assert.ok(onProjects(
            await page.evaluate<string>('location.pathname'),
        ));
    });
});

test('arrow keys on a focused handle move the card',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        const before = await openProjects(page, origin.baseUrl);
        await page.evaluate(
            `document.querySelector('${HANDLE}').focus()`,
        );
        await page.key('ArrowDown');
        await page.until(
            `(${ORDER})[1] === ${JSON.stringify(before[0])}`,
            'card moves down one slot',
        );
        const live = await page.evaluate<string>(
            `document.querySelector('[aria-live="polite"].sr-only')
                ?.textContent ?? ''`,
        );
        assert.ok(live.startsWith('Moved to position 2 of '), live);
    });
});
```

- [ ] **Step 2: Checkpoint — operator runs; expect red**

Ask for `! ./test-browser`. Expected: the first two
tests FAIL — `location.pathname` changes to
`/projects/detail.html` (the click-through). The
keyboard test passes. If the drag test fails for
another reason (order never changes), fix the gesture
geometry first: `second.y + second.height * 0.8` must
be past the second card's midpoint plus the 8px
hysteresis.

- [ ] **Step 3: Fix in the module that owns the capture**

In `web-app/app/drag-reorder.ts`, inside
`initDragReorder` after `let drag: DragState = …`:

```ts
    // A captured drag ends with a click the browser
    // targets at the card — the common ancestor of the
    // handle that took pointerdown and the card that
    // took the captured pointerup — so a page's
    // `.drag-handle` exclusion cannot see it. Consume
    // exactly that one click here, where the capture
    // lives. A new pointerdown clears a stale flag so
    // a click that never arrives cannot eat a later one.
    let suppressClick = false;
    container.addEventListener(
        'click',
        (e) => {
            if (!suppressClick) return;
            suppressClick = false;
            e.preventDefault();
            e.stopImmediatePropagation();
        },
        { capture: true },
    );
```

In the `pointerdown` listener, as its first statement:
`suppressClick = false;`. In the `pointerup` listener,
right after the `if (drag.kind !== 'active') return;`
guard: `suppressClick = true;`.

- [ ] **Step 4: Checkpoint — operator runs; expect green**

`./validate` → exit 0. Ask for `! ./test-browser`.
Expected: `list-reorder` 3 pass, `sign-in` 2 pass.

- [ ] **Step 5: Commit**

```bash
git add tests/browser/list-reorder.test.ts \
    web-app/app/drag-reorder.ts
git commit -m "Consume the click a captured drag leaves"
```

### Task 7: Canvas gestures

**Files:**
- Create: `tests/browser/canvas.ts` (shared canvas
  helpers)
- Create: `tests/browser/canvas-gestures.test.ts`

**Interfaces:**
- Produces (`canvas.ts`): `openFlow(page, origin,
  name): Promise<string>` (navigates to the designer,
  returns the flow id), `nodeIdNamed(page, name)`,
  `nodeCount(page)`, `edgeCount(page)`,
  `flowGraph(origin, flowId)` (reads the graph through
  the in-process API), `CANVAS = 'svg.flow-canvas'`,
  `WRAP = '.flow-canvas-wrap'`.

- [ ] **Step 1: Write the helpers**

```ts
import { GET } from '../../api/api.ts';
import { STARK_ORGANIZATION } from
    '../../api/mock-data/seed-constants.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';
import { adminToken, type Origin, type Page } from
    './fixtures.ts';

export const CANVAS = 'svg.flow-canvas';
export const WRAP = '.flow-canvas-wrap';
export const NODE = '.flow-node';
export const EDGE = '.flow-edge';
export const ONBOARDING = 'Customer Onboarding';

type FlowRow = { id: string; name: string };
export type GraphNode = {
    id: string; name: string;
    positionX: number; positionY: number;
};
type FlowGraph = {
    graph: { nodes: GraphNode[]; edges: unknown[] };
};

function flowsPath(): string {
    return `organizations/${STARK_ORGANIZATION}/flows/`;
}

export async function flowIdNamed(
    origin: Origin, name: string,
): Promise<string> {
    const rows = await GET<FlowRow[]>(
        origin.db, flowsPath(), await adminToken(),
    );
    const row = rows.find((r) => r.name === name);
    if (row === undefined) {
        throw new Error(`no seeded flow named ${name}`);
    }
    return row.id;
}

export async function flowGraph(
    origin: Origin, flowId: string,
): Promise<FlowGraph> {
    return GET<FlowGraph>(
        origin.db, flowsPath() + flowId, await adminToken(),
    );
}

export async function openFlow(
    page: Page, origin: Origin, name: string,
): Promise<string> {
    const id = await flowIdNamed(origin, name);
    await page.navigate(registryUrl(
        origin.baseUrl, 'flow-detail', `flowId=${id}`,
    ));
    await page.ready('flow-detail');
    await page.waitFor(NODE);
    return id;
}

export function nodeIdNamed(
    page: Page, name: string,
): Promise<string> {
    return page.until<string>(
        `(() => {
            const n = [...document.querySelectorAll('${NODE}')]
                .find(el => (el.textContent || '')
                    .includes(${JSON.stringify(name)}));
            return n ? n.getAttribute('data-node-id') : null;
        })()`,
        `node named ${name}`,
    );
}

export function nodeCount(page: Page): Promise<number> {
    return page.evaluate<number>(
        `document.querySelectorAll('${NODE}').length`,
    );
}

export function edgeCount(page: Page): Promise<number> {
    return page.evaluate<number>(
        `document.querySelectorAll('${EDGE}').length`,
    );
}

export function portSelector(nodeId: string): string {
    return `${NODE}[data-node-id="${nodeId}"]`
        + ' [data-connect-port]';
}

export function nodeSelector(nodeId: string): string {
    return `${NODE}[data-node-id="${nodeId}"]`;
}
```

If the flows list route is not org-nested (`GET
flows/` 404s), use the path `tests/adapters-flow-queries.test.ts`
reads.

- [ ] **Step 2: Write the tests**

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SHIFT, useBrowser, withAdminPage } from
    './fixtures.ts';
import {
    CANVAS, EDGE, NODE, ONBOARDING,
    edgeCount, flowGraph, nodeCount, nodeIdNamed,
    nodeSelector, openFlow, portSelector,
} from './canvas.ts';

const browser = useBrowser();

test('a port drag onto empty canvas adds a node and its edge',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, ONBOARDING);
        const nodes = await nodeCount(page);
        const edges = await edgeCount(page);
        const review = await nodeIdNamed(page, 'Review');
        const port = await page.center(portSelector(review));
        const svg = await page.rect(CANVAS);
        await page.drag(port, {
            x: svg.x + svg.width * 0.5,
            y: svg.y + svg.height * 0.92,
        });
        await page.until(
            `document.querySelectorAll('${NODE}').length`
            + ` === ${nodes + 1}`,
            'one more node',
        );
        assert.equal(await edgeCount(page), edges + 1);
    });
});

test('a shift drag from a port onto a node commits an edge',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, ONBOARDING);
        const nodes = await nodeCount(page);
        const edges = await edgeCount(page);
        const review = await nodeIdNamed(page, 'Review');
        const archive = await nodeIdNamed(page, 'Archive');
        const port = await page.center(portSelector(review));
        const target = await page.center(nodeSelector(archive));
        await page.keyDown('Shift');
        await page.drag(port, target, { modifiers: SHIFT });
        await page.keyUp('Shift');
        await page.until(
            `document.querySelectorAll('${EDGE}').length`
            + ` === ${edges + 1}`,
            'one more edge',
        );
        assert.equal(await nodeCount(page), nodes);
    });
});

test('a body drag moves the node and persists its position',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        const flowId = await openFlow(page, origin, ONBOARDING);
        const review = await nodeIdNamed(page, 'Review');
        const before = (await flowGraph(origin, flowId))
            .graph.nodes.find((n) => n.id === review);
        assert.ok(before);
        const from = await page.center(nodeSelector(review));
        await page.drag(from, { x: from.x + 60, y: from.y + 40 });
        let after = before;
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            after = (await flowGraph(origin, flowId))
                .graph.nodes.find((n) => n.id === review)!;
            if (after.positionX !== before.positionX
                || after.positionY !== before.positionY) break;
            await new Promise((r) => setTimeout(r, 100));
        }
        assert.notDeepEqual(
            [after.positionX, after.positionY],
            [before.positionX, before.positionY],
        );
    });
});

test('a marquee on empty canvas selects the nodes it encloses',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, ONBOARDING);
        const svg = await page.rect(CANVAS);
        await page.drag(
            { x: svg.x + 4, y: svg.y + 4 },
            { x: svg.x + svg.width - 4, y: svg.y + svg.height - 4 },
        );
        const selected = await page.until<number>(
            `(() => {
                const n = document.querySelectorAll(
                    '${NODE}[aria-current="true"]').length;
                return n >= 2 ? n : null;
            })()`,
            'two or more nodes selected',
        );
        assert.ok(selected >= 2);
    });
});
```

- [ ] **Step 3: Checkpoint**

Ask for `! ./test-browser`. Expected: 4 pass in
`canvas-gestures`. Geometry fixes are allowed; product
changes are not. A gesture that proves undriveable
headless is recorded in the test file as a comment
naming why and its case stays `exploratory` in Task 20.

- [ ] **Step 4: Commit**

```bash
git add tests/browser/canvas.ts tests/browser/canvas-gestures.test.ts
git commit -m "Pin the canvas gestures in the browser"
```

### Task 8: Canvas pan and keyboard

**Files:**
- Create: `tests/browser/canvas-pan.test.ts`
- Create: `tests/browser/canvas-keyboard.test.ts`

- [ ] **Step 1: Write the pan tests**

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { useBrowser, withAdminPage, type Page } from
    './fixtures.ts';
import { CANVAS, ONBOARDING, WRAP, openFlow } from
    './canvas.ts';

const browser = useBrowser();
const AUTO_FIT = '#flow-auto-fit-switch';
const PAN_ON =
    `document.querySelector('${WRAP}')`
    + `.classList.contains('flow-pan-cursor')`;
const AUTOFIT_TOAST = 'Disable Auto-Fit to change the view';

async function focusCanvas(page: Page): Promise<void> {
    await page.evaluate(
        `document.querySelector('${CANVAS}').focus()`,
    );
}

test('Space under Auto-Fit toasts and does not enter pan',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, ONBOARDING);
        await focusCanvas(page);
        await page.key(' ');
        await page.until(
            `[...document.querySelectorAll('.toast')]`
            + `.some(t => t.textContent.includes(`
            + `${JSON.stringify(AUTOFIT_TOAST)}))`,
            'auto-fit toast',
        );
        assert.equal(await page.evaluate<boolean>(PAN_ON), false);
    });
});

test('Space toggles pan mode and a drag pans the viewBox',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, ONBOARDING);
        await page.click(AUTO_FIT);
        await focusCanvas(page);
        await page.key(' ');
        await page.until(PAN_ON, 'pan cursor on');
        const before = await page.evaluate<string>(
            `document.querySelector('${CANVAS}')`
            + `.getAttribute('viewBox')`,
        );
        const svg = await page.rect(CANVAS);
        const from = { x: svg.x + svg.width - 20, y: svg.y + 20 };
        await page.drag(from, { x: from.x - 120, y: from.y + 60 });
        await page.until(
            `document.querySelector('${CANVAS}')`
            + `.getAttribute('viewBox') !== ${JSON.stringify(before)}`,
            'viewBox panned',
        );
        await focusCanvas(page);
        await page.key(' ');
        await page.until(`!(${PAN_ON})`, 'pan cursor off');
    });
});
```

- [ ] **Step 2: Write the keyboard tests**

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { useBrowser, withAdminPage } from './fixtures.ts';
import { CANVAS, NODE, ONBOARDING, openFlow } from
    './canvas.ts';

const browser = useBrowser();

test('Tab from the canvas enters the ring and marks the node',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, ONBOARDING);
        await page.evaluate(
            `document.querySelector('${CANVAS}').focus()`,
        );
        await page.key('Tab');
        const current = await page.until<string>(
            `(() => {
                const a = document.activeElement;
                if (!a || !a.classList.contains('flow-node'))
                    return null;
                return a.getAttribute('aria-current');
            })()`,
            'a focused node',
        );
        assert.equal(current, 'true');
        await page.key('Enter');
        await page.waitFor('#prop-node-name');
        const count = await page.evaluate<number>(
            `document.querySelectorAll('${NODE}[aria-current="true"]').length`,
        );
        assert.equal(count, 1);
    });
});
```

- [ ] **Step 3: Checkpoint, then commit**

Ask for `! ./test-browser`. Expected: green.

```bash
git add tests/browser/canvas-pan.test.ts \
    tests/browser/canvas-keyboard.test.ts
git commit -m "Pin canvas pan and keyboard in the browser"
```

### Task 9: Sidebar, toasts, viewport, reduced motion

**Files:**
- Create: `tests/browser/sidebar.test.ts`
- Create: `tests/browser/toasts.test.ts`
- Create: `tests/browser/viewport.test.ts`
- Create: `tests/browser/reduced-motion.test.ts`

- [ ] **Step 1: Sidebar**

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { useBrowser, withAdminPage } from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const WIDTH =
    `getComputedStyle(document.querySelector('#desktop-sidebar')).width`;

test('collapse and expand transition the sidebar width',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await page.navigate(registryUrl(origin.baseUrl, 'dashboard'));
        await page.ready('dashboard');
        assert.equal(await page.evaluate<string>(WIDTH), '256px');
        await page.click('#sidebar-toggle');
        await page.until(`${WIDTH} === '64px'`, 'collapsed to 4rem');
        assert.equal(await page.evaluate<boolean>(
            `document.documentElement.classList.contains('sidebar-collapsed')`,
        ), true);
        assert.equal(await page.evaluate<boolean>(
            `document.querySelector('.sidebar-nav-text').checkVisibility()`,
        ), false);
        await page.click('#sidebar-toggle');
        await page.until(`${WIDTH} === '256px'`, 'expanded to 16rem');
        assert.equal(await page.evaluate<boolean>(
            `document.querySelector('.sidebar-nav-text').checkVisibility()`,
        ), true);
    });
});
```

- [ ] **Step 2: Toasts**

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { useBrowser, withAdminPage, type Page } from
    './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const TOASTS = `document.querySelectorAll('.toast').length`;
const CLOSE_WINDOW_MS = 1500;
const MAX_TOASTS = 5;

async function blankInvite(page: Page): Promise<void> {
    await page.click('#invite-member-submit');
}

async function openInviteDialog(
    page: Page, baseUrl: string,
): Promise<void> {
    await page.navigate(registryUrl(baseUrl, 'members'));
    await page.ready('members');
    await page.click('[data-dialog-open="invite-member"]');
    await page.waitFor('#invite-member-dialog[open]');
}

test('the close button detaches a toast inside its fade',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openInviteDialog(page, origin.baseUrl);
        await blankInvite(page);
        await page.until(
            `[...document.querySelectorAll('.toast')]`
            + `.some(t => t.textContent.includes('Email is required'))`,
            'validation toast',
        );
        await page.click('.toast .toast-close');
        await page.until(`${TOASTS} === 0`, 'toast detached', CLOSE_WINDOW_MS);
    });
});

test('the stack caps at five toasts',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openInviteDialog(page, origin.baseUrl);
        for (let i = 0; i < MAX_TOASTS + 2; i += 1) {
            await blankInvite(page);
        }
        const count = await page.until<number>(
            `(() => { const n = ${TOASTS}; return n >= ${MAX_TOASTS} ? n : null; })()`,
            'stack filled',
        );
        assert.equal(count, MAX_TOASTS);
    });
});
```

If the dialog's open attribute is not reflected as
`[open]`, wait for `#invite-member-submit` instead.

- [ ] **Step 3: Viewport**

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { useBrowser, withAdminPage } from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const MOBILE = { width: 375, height: 800 };

test('below 768px the drawer replaces the desktop sidebar',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await page.setViewport(MOBILE.width, MOBILE.height, true);
        await page.navigate(registryUrl(origin.baseUrl, 'dashboard'));
        await page.ready('dashboard');
        assert.equal(await page.evaluate<boolean>(
            `document.querySelector('#desktop-sidebar').checkVisibility()`,
        ), false);
        assert.equal(await page.evaluate<boolean>(
            `document.querySelector('.mobile-header').checkVisibility()`,
        ), true);
        await page.setViewport(1280, 800, false);
        await page.until(
            `document.querySelector('#desktop-sidebar').checkVisibility()`,
            'desktop sidebar back',
        );
    });
});
```

- [ ] **Step 4: Reduced motion**

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { useBrowser, withAdminPage } from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const SIDEBAR_TRANSITION =
    `getComputedStyle(document.querySelector('#desktop-sidebar'))`
    + `.transitionDuration`;

function seconds(v: string): number {
    return v.endsWith('ms')
        ? Number(v.slice(0, -2)) / 1000
        : Number(v.slice(0, -1));
}

test('reduced motion clamps every transition to 0.01ms',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await page.navigate(registryUrl(origin.baseUrl, 'dashboard'));
        await page.ready('dashboard');
        assert.ok(seconds(await page.evaluate<string>(
            SIDEBAR_TRANSITION)) >= 0.1);
        await page.emulateMedia([
            { name: 'prefers-reduced-motion', value: 'reduce' },
        ]);
        await page.until(
            `matchMedia('(prefers-reduced-motion: reduce)').matches`,
            'media emulated',
        );
        assert.ok(seconds(await page.evaluate<string>(
            SIDEBAR_TRANSITION)) < 0.001);
    });
});
```

- [ ] **Step 5: Checkpoint, then commit**

Ask for `! ./test-browser`. Expected: green.

```bash
git add tests/browser/sidebar.test.ts tests/browser/toasts.test.ts \
    tests/browser/viewport.test.ts tests/browser/reduced-motion.test.ts
git commit -m "Pin sidebar, toasts, viewport, and motion"
```

### Task 10: Two jars, one origin

**Files:**
- Create: `tests/browser/two-jars.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { handleRequest } from '../../api/api.ts';
import { STARK_ORGANIZATION } from
    '../../api/mock-data/seed-constants.ts';
import { generateIdentifier } from
    '../../shared/identifier.ts';
import { apiRequest } from '../http-fixtures.ts';
import {
    ADMIN_EMAIL, SECOND_EMAIL, adminToken, signIn,
    startOrigin, useBrowser, type Origin,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const MEMBER_NAME =
    `document.querySelector('#sidebar-member-name')`
    + `?.textContent?.trim() || null`;

async function createIdea(
    origin: Origin, title: string,
): Promise<void> {
    const res = await handleRequest(origin.db, apiRequest({
        method: 'PUT',
        path: `/organizations/${STARK_ORGANIZATION}/ideas/`
            + generateIdentifier(),
        token: await adminToken(),
        body: {
            title,
            position: 1,
            problem_statement: 'p',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
            state: 'active',
        },
    }));
    assert.equal(res.status, 201);
}

test('two contexts hold two identities on one origin',
async () => {
    const origin = await startOrigin();
    const a = await browser.get().newPage();
    const b = await browser.get().newPage();
    try {
        await signIn(a, origin, ADMIN_EMAIL);
        await signIn(b, origin, SECOND_EMAIL);
        const nameA = await a.until<string>(MEMBER_NAME, 'chip A');
        const nameB = await b.until<string>(MEMBER_NAME, 'chip B');
        assert.notEqual(nameA, nameB);
        const title = 'Two jars ' + generateIdentifier();
        await createIdea(origin, title);
        await b.navigate(registryUrl(origin.baseUrl, 'ideas'));
        await b.ready('ideas');
        await b.until(
            `[...document.querySelectorAll('[data-idea-card]')]`
            + `.some(c => c.textContent.includes(${JSON.stringify(title)}))`,
            'idea visible to the second identity',
        );
    } finally {
        await a.close();
        await b.close();
        await browser.get().disposeContext(a.contextId);
        await browser.get().disposeContext(b.contextId);
        await origin.close();
    }
});

test('two tabs share the cookie; sign-out in one bounces the other',
async () => {
    const origin = await startOrigin();
    const a = await browser.get().newPage();
    const b = await browser.get().newPageIn(a.contextId);
    try {
        await signIn(a, origin, ADMIN_EMAIL);
        await b.navigate(registryUrl(origin.baseUrl, 'dashboard'));
        await b.ready('dashboard');
        assert.equal(await b.until<string>(MEMBER_NAME, 'chip'), 'Tony Stark');
        await a.click('[data-signout]');
        await a.until(`location.pathname.includes('/auth/')`, 'A on auth');
        await b.navigate(registryUrl(origin.baseUrl, 'dashboard'));
        await b.until(`location.pathname.includes('/auth/')`, 'B bounced');
    } finally {
        await a.close();
        await b.close();
        await browser.get().disposeContext(a.contextId);
        await origin.close();
    }
});
```

- [ ] **Step 2: Checkpoint, then commit**

Ask for `! ./test-browser`. Expected: green.

```bash
git add tests/browser/two-jars.test.ts
git commit -m "Pin two jars on one origin in the browser"
```

### Task 11: Crank runs the browser suite; AGENTS.md commands

**Files:**
- Modify: `crank` (after `./test-postgres`)
- Modify: `AGENTS.md` (command list, Gates)

- [ ] **Step 1: Crank**

After the `./test-postgres` line in `crank` add
`./test-browser`. Crank's `--help` text is unchanged
here (Task 18 edits it).

- [ ] **Step 2: AGENTS.md**

In the command block add, after the `./test` line:
`./test-browser         # Tier 2: headless Chrome vs an in-process origin`.
In `## Gates`, after the `./validate` paragraph:

> `./test-browser` needs Chrome (`CHROME` or
> `CHROME_DEBUG_URL`); it bundles into `$TMPDIR` on any
> tree and runs `tests/browser/*.test.ts` serially. It
> is not part of `./validate`; `./crank` runs it after
> `./test-postgres`.

- [ ] **Step 3: Verify and commit**

`./validate` → exit 0 (AGENTS.md ≤ 300 lines).

```bash
git add crank AGENTS.md
git commit -m "Run test-browser from crank"
```

## Phase B — Tier 0 fixtures

### Task 12: One stub preamble

**Files:**
- Create: `tests/browser-globals.ts`
- Modify: every `tests/*.test.ts` whose top-level
  preamble assigns `globalThis.localStorage`,
  `globalThis.window`, or `globalThis.document` before
  its imports (the list is
  `grep -l 'globalThis\.document = \|globalThis\.window = \|globalThis\.localStorage = ' tests/*.test.ts`
  filtered to top-level assignments).

- [ ] **Step 1: Write the module**

```ts
// The one stub preamble for page-module tests. state.ts
// and its importers read localStorage, window, and
// document at module evaluation, which Node lacks.
// Import this module FIRST; static imports evaluate in
// source order, so every later import sees the stubs.
// A test with a unique need keeps that one stub local.

const g = globalThis as Record<string, unknown>;

class FakeStorage {
    private readonly map = new Map<string, string>();
    getItem(k: string): string | null {
        return this.map.get(k) ?? null;
    }
    setItem(k: string, v: string): void {
        this.map.set(k, v);
    }
    removeItem(k: string): void {
        this.map.delete(k);
    }
}

class FakeInput {
    readonly type: string;
    constructor(type: string) {
        this.type = type;
    }
}
class FakeTextArea {}
class FakeSelect {}
class FakeSvgElement {}

if (g['localStorage'] === undefined) {
    g['localStorage'] = new FakeStorage();
}
if (g['sessionStorage'] === undefined) {
    g['sessionStorage'] = new FakeStorage();
}
if (g['window'] === undefined) {
    g['window'] = {
        matchMedia: () => ({
            matches: false,
            addEventListener: () => {},
            removeEventListener: () => {},
        }),
        addEventListener: () => {},
        removeEventListener: () => {},
    };
}
if (g['document'] === undefined) {
    g['document'] = {
        addEventListener: () => {},
        removeEventListener: () => {},
    };
}
if (g['HTMLInputElement'] === undefined) {
    g['HTMLInputElement'] = FakeInput;
}
if (g['HTMLTextAreaElement'] === undefined) {
    g['HTMLTextAreaElement'] = FakeTextArea;
}
if (g['HTMLSelectElement'] === undefined) {
    g['HTMLSelectElement'] = FakeSelect;
}
if (g['SVGElement'] === undefined) {
    g['SVGElement'] = FakeSvgElement;
}
```

- [ ] **Step 2: Convert three files by hand**

`tests/flows-detail-shortcuts.test.ts`,
`tests/flows-detail-canvas-focus.test.ts`,
`tests/members-detail-reduce.test.ts`: delete the
preamble, add `import './browser-globals.ts';` as the
first line, turn the `const { … } = await import(…)`
into a static `import { … } from …`. Any stub the
preamble installed that the shared module does not
(a richer `matchMedia`, a `document.activeElement`)
stays in the file, after the import.

Run `./test`. Expected: green.

- [ ] **Step 3: Dispatch the fan-out for the rest**

Prompt (first line literal):

```
Go to Medium Church!

Then read /Users/tmornini/code/fusion-angle/AGENTS.md.

Task: in /Users/tmornini/code/fusion-angle, convert every
tests/*.test.ts whose TOP-LEVEL preamble assigns
globalThis.localStorage / window / document /
HTMLInputElement / SVGElement (before or between its
imports) to import './browser-globals.ts' as its first
line instead, following the three already converted:
tests/flows-detail-shortcuts.test.ts,
tests/flows-detail-canvas-focus.test.ts,
tests/members-detail-reduce.test.ts. Read
tests/browser-globals.ts first. Rules: delete only
stubs the shared module installs; keep any stub with
behavior the shared one lacks, placed after the import;
turn `await import(...)` that existed only to order
the stubs into a static import; do not touch tests that
install stubs inside a test body or in a helper called
per test; 78-char lines, 4-space indent; run
`./test` and report the list of files changed and any
file you left alone with the reason. Do not commit.
```

Review the diff; run `./validate`.

- [ ] **Step 4: Commit**

```bash
git add tests/browser-globals.ts tests/*.test.ts
git commit -m "Share one stub preamble across page tests"
```

### Task 13: Fresh operation ids

**Files:**
- Modify: `tests/http-fixtures.ts` (comment on
  `TEST_OPERATION_ID`)
- Modify: every `tests/*.test.ts` `req()` helper that
  passes `operationId: TEST_OPERATION_ID`

- [ ] **Step 1: Find the deliberate replays**

Run: `grep -ln 'replay\|dedupe\|request_hash\|idempot' tests/*.test.ts`
and read each hit's use of `TEST_OPERATION_ID`. A test
that sends the same bytes twice on purpose keeps an
explicit id: replace its helper's `operationId:
TEST_OPERATION_ID` with a local
`const REPLAY_OPERATION_ID = '0123456789ABCDEFGHIJKw';`
and a one-line comment naming the replay.

- [ ] **Step 2: Drop the pin everywhere else**

```bash
grep -l 'operationId: TEST_OPERATION_ID,' tests/*.test.ts \
    | xargs sed -i '' '/^ *operationId: TEST_OPERATION_ID,$/d'
```

Then remove `TEST_OPERATION_ID` from the import list
of every file that no longer references it:

```bash
for f in $(grep -l 'TEST_OPERATION_ID' tests/*.test.ts); do
    if [ "$(grep -c 'TEST_OPERATION_ID' "$f")" = "1" ]; then
        echo "$f"
    fi
done
```

— each printed file imports it and never uses it; edit
the import by hand (the import may be single-line
`import { apiRequest, TEST_OPERATION_ID } from` or
multi-line).

- [ ] **Step 3: Run and triage**

Run `./test`. Every red is one of:
- a replay test missed in Step 1 → give it its explicit
  id;
- a false green revealed → the second request now lands
  and an assertion fails. Fix the CODE the test names,
  never the assertion; record the finding in this
  plan's Task 13 notes and in TODO.md's bullet that
  named the hazard (the bullet leaves TODO.md in
  Task 19).

- [ ] **Step 4: Scope the constant**

In `tests/http-fixtures.ts` the comment above
`TEST_OPERATION_ID` becomes:

```ts
// Fixed 22-char id for below-gate pair fixtures that do
// not ride a public write (seed/tests) and for a test
// that replays a request on purpose. Public writes in
// tests mint a fresh id (apiRequest with no
// operationId): appendMessagePair dedupes on
// request_hash, so a shared id can pass a test against
// unfixed code.
```

`./validate` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add tests/http-fixtures.ts tests/*.test.ts
git commit -m "Mint fresh operation ids in API tests"
```

## Phase C — Retire the parallel apparatus

### Task 14: Re-base the two tests that borrow the slice seed

**Files:**
- Modify: `tests/api-authentication-token.test.ts:14`
  (imports `postTestPlanSlices, sliceEntityId`)
- Modify: `tests/pg-seed.test.ts:32, :101-102, :548`
- Modify: `tests/api-transition-legacy-cut.test.ts:76`
  (the named exception)

- [ ] **Step 1: Read what each borrows**

`api-authentication-token.test.ts` uses the slice seed
as a fixture with known identities. Re-base those tests
on `seededMockDb()` from `tests/mock-seed.ts` and the
demo admin (`buildMembers().find(m => m.email ===
'demo@example.com')`) or on `seedAdminSchema` +
`seedOrganizationMember` from
`tests/root-admin-fixture.ts`, keeping every assertion.
`pg-seed.test.ts`: delete the `parseSeedArgv(['--test-plan-slices'])`
case and the `'test-plan-slices'` seed case; keep the
bootstrap and mock-data cases.
`api-transition-legacy-cut.test.ts`: remove the
`'api/test-plan-slices.ts'` line and the comment
sentence naming it.

- [ ] **Step 2: Run and commit**

`./validate` → exit 0.

```bash
git add tests/api-authentication-token.test.ts tests/pg-seed.test.ts \
    tests/api-transition-legacy-cut.test.ts
git commit -m "Unhook the token and seed tests from the slices"
```

### Task 15: Remove the slice seed mode

**Files:**
- Modify: `server/seed.ts` (`SEED_TEST_PLAN_SLICES_FLAG`,
  `SeedMode`, `parseSeedArgv`, the two `test-plan-slices`
  branches, `SLICE_REVEAL_FIELDS`,
  `formatTestPlanSliceCredentials`, the import)
- Modify: `server/postgres-seed.ts:38-39` (usage)
- Modify: `postgres-seed` (usage, flag parsing, MODE)
- Modify: `crank` (usage, flag parsing, MODE)
- Modify: `AGENTS.md:14-22`, `SCHEMA.md:94`

- [ ] **Step 1: Edit**

`SeedMode` becomes `'bootstrap' | 'mock-data'`;
`SEED_EXCLUSIVE_FLAGS` lists two; `seedEmptyDatabase`
and `seedPostgres` lose their slice branches;
`postgres-seed` and `crank` usage read
`--bootstrap|--mock-data`; AGENTS.md's command lines
and SCHEMA.md line 94 drop the flag.

- [ ] **Step 2: Verify and commit**

`./validate` → exit 0. `./crank --help` and
`./postgres-seed --help` show two modes.

```bash
git add server/seed.ts server/postgres-seed.ts postgres-seed crank \
    AGENTS.md SCHEMA.md
git commit -m "Retire the test-plan-slices seed mode"
```

### Task 16: Delete the slice seeder and its pins

**Files:**
- Delete: `api/test-plan-slices.ts`,
  `tests/test-plan-slices.test.ts`,
  `tests/slices-acl-projection.test.ts`,
  `tests/slices-flow-readiness.test.ts`,
  `tests/slices-flow-stats.test.ts`,
  `tests/slices-idea-positions.test.ts`,
  `tests/slices-invitation-lifecycle.test.ts`,
  `tests/slices-layout-test.test.ts`,
  `tests/slices-page-boot.test.ts`,
  `tests/slices-portfolio-scores.test.ts`,
  `tests/slices-record-binding.test.ts`,
  `tests/slices-review-queue.test.ts`,
  `tests/slices-workbox-action-screen.test.ts`

- [ ] **Step 1: Delete and verify nothing imports them**

```bash
git rm -q api/test-plan-slices.ts tests/test-plan-slices.test.ts \
    tests/slices-*.test.ts
grep -rn 'test-plan-slices' --include='*.ts' api server shared web-app tests
```
Expected: no output. `./validate` → exit 0.

- [ ] **Step 2: Commit**

```bash
git commit -m "Delete the test-plan slice seeder"
```

## Phase D — The index of covenants and the documents

### Task 17: Generate the index skeleton

**Files:**
- Create (scratch, not committed):
  `$TMPDIR/test-plan-index.tsv`

- [ ] **Step 1: Extract every case**

```bash
python3 - <<'EOF' > "$TMPDIR/test-plan-index.tsv"
import re
section = ''
text = open('TEST-PLAN.md', encoding='utf-8').read().split('\n')
i = 0
while i < len(text):
    line = text[i]
    m = re.match(r'^## ([A-Z0-9]+)\. ', line)
    if m:
        section = m.group(1)
    m = re.match(r'^- \[ \] \*\*([A-Za-z0-9-]+)\*\*\s*(.*)$', line)
    if m:
        body = [m.group(2)]
        j = i + 1
        while j < len(text) and text[j].startswith('  '):
            body.append(text[j].strip())
            j += 1
        first = ' '.join(body)
        first = re.split(r'(?<=[.!?])\s', first)[0]
        print(f"{section}\t{m.group(1)}\t{first[:140]}")
    i += 1
EOF
wc -l "$TMPDIR/test-plan-index.tsv"
```

Expected: about 371 lines, three tab-separated columns
(section, id, first sentence). K's `**K17.**`-style
lines are not `- [ ]` cases; add them by a second pass
over `^\*\*(K[0-9]+)\.\*\*` lines in the K section.

### Task 18: Map every case to its pin

**Files:**
- Create (scratch): `$TMPDIR/pins/<SECTION>.tsv`

- [ ] **Step 1: Dispatch one Explore subagent per section**

Sections: AT, A, AA, B, C, D, E, F, F2, FS, G, H, I, J,
K, R, SV. Prompt (first line literal; `{SECTION}` and
the pasted rows substituted):

```
Go to Medium Church!

Then read /Users/tmornini/code/fusion-angle/AGENTS.md.

You are mapping TEST-PLAN.md section {SECTION} to its
test pins in /Users/tmornini/code/fusion-angle. For
each row below (id<TAB>covenant), find the ONE test
that pins that covenant: a `tests/<file>.test.ts`
whose test name and assertions cover it (cite
file:line of the test() call), or a
`tests/browser/<file>.test.ts` (same), or the word
`exploratory` when no honest pin exists. Never point a
case at a neighbor's test. Search with grep over
tests/ for the feature's nouns (selectors, function
names, route paths, toast text). Output ONLY tab-
separated lines: id<TAB>pin<TAB>evidence, where pin is
the path or `exploratory` and evidence is the test
name or "no test asserts <what>". Rows:

{rows}
```

Write each agent's output to
`$TMPDIR/pins/{SECTION}.tsv`. Spot-check five rows per
section against the cited test; a wrong citation
becomes `exploratory`.

### Task 19: Write TEST-PLAN.md as the index

**Files:**
- Rewrite: `TEST-PLAN.md`

- [ ] **Step 1: Assemble**

The new file, in this order:

```markdown
# Fusion Angle — Test Plan

The index of covenants. Every case below names what the
product promises and where that promise is pinned:
`tests/<file>.test.ts` (Tier 0 pure logic, Tier 1
wiring decisions — `./test`), `tests/browser/<file>.test.ts`
(Tier 2, `./test-browser`), or `exploratory` (Tier 3,
below). Spec:
`docs/superpowers/specs/2026-08-28-verification-tiers-design.md`.

## The rule

A browser observation becomes a product change only
after a red test at the lowest tier that can express
it. The ruling is not evidence; the red test is.

## Tiers

| Tier | Command | Needs | Gate |
|---|---|---|---|
| 0 pure logic, 1 wiring decisions | `./test` (in `./validate`) | nothing | yes |
| 2 browser | `./test-browser` | Chrome | `./crank` |
| Postgres | `./test-postgres` | Postgres | `./crank` |
| 3 exploration | this document | `./crank --mock-data 8080` | no |

## Exploration protocol

One explorer, serial, one visible tab, the
`--mock-data` origin from `./crank`. The explorer reads
this index and drives what is marked `exploratory` or
what the operator names. A finding is a mitigation
stub under `docs/superpowers/test-plan-mitigations/`
with the template below; its `Reproduced by` line names
the red test before any product commit. Hunters never
run in parallel against one Chrome and are never a
gate.

## Index
```

then, per section in the old document order, a `##`
heading with the old title and one line per case:

```markdown
- **F47** Space on the focused canvas enters pan mode
  and paints the grab cursor — `tests/browser/canvas-pan.test.ts`
```

(id, the covenant phrase from `test-plan-index.tsv`
trimmed to one clause, an em dash, the pin), and
finally:

```markdown
## Mitigation stub

File name: `YYYY-MM-DD-{section}-{first-case}.md`.

    # TEST-PLAN mitigation — {section}

    - Section: {id}
    - Cases: {comma-separated ids}
    - Expected: {from the case line}
    - Observed: {explorer note}
    - Suspected layer: UI | adapter | API | seed | driver
    - Reproduced by: tests/… (red at SHA) | not yet

    ## Next

No product commit lands while `Reproduced by` says
`not yet`.
```

- [ ] **Step 2: Verify the criteria**

```bash
grep -c '\.localhost' TEST-PLAN.md      # 0
grep -c 'activate_tab\|drain_events\|mac-approve' TEST-PLAN.md   # 0
grep -c '^- \*\*' TEST-PLAN.md          # ≈ 371 + the K lines
grep -v '—' TEST-PLAN.md | grep '^- \*\*' # empty: every line has a pin
```

`./validate` → exit 0.

- [ ] **Step 3: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Rewrite TEST-PLAN as the index of covenants"
```

### Task 20: The remaining documents

**Files:**
- Modify: `AGENTS.md` (router row: `| TEST-PLAN.md |
  index of covenants, exploration protocol |`; the
  Subagents section's hunter sentences reduced to the
  scroll policy)
- Modify: `README.md:61` (`| TEST-PLAN.md | index of
  covenants |`)
- Modify: `AUDIT.md:57, :101, :309` ("Browser truth
  belongs to `./test-browser` and TEST-PLAN.md's
  exploration protocol"; "the abort rule is
  `./crank`'s"; "pointed at TEST-PLAN.md's index")
- Modify: `TODO.md` (item 5 removed; 6–12 → 5–11;
  Sequencing `8 → 6` becomes `7 → 5`, `4 → 10`
  becomes `4 → 9`, "Consumes item 4" under the old 10
  stays true as the new 9; the `api/test-plan-slices.ts`
  bullets inside the old item 9 and in Later work are
  deleted; the shared-operation-id bullet is deleted;
  the "Investigate `docker compose up -d --wait`
  postgres only" bullet stays)

- [ ] **Step 1: Edit, verify, commit**

`./validate` → exit 0 (line ceilings; `## Critical
path` once; no deferral prose outside TODO.md).

```bash
git add AGENTS.md README.md AUDIT.md TODO.md
git commit -m "Point the documents at the verification tiers"
```

### Task 21: Final checkpoint

- [ ] `./validate` → exit 0.
- [ ] Operator runs `! ./test-browser` → every file
  green.
- [ ] `git status` clean; `git log --oneline 27b4cd26..HEAD`
  reads as one mind in sequence.
- [ ] Report: commits, the E11 fix, any false green
  Task 13 revealed, any case left `exploratory` with
  its reason.
