# Four Entry-and-Notify Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Every dispatched subagent prompt MUST begin
> with `Go to Medium Church!` (CLAUDE.md scroll policy).
> Do not use git worktrees. Wrap lines at 78 characters.
> 4-space indent. Present-tense imperative commits with
> `Co-Authored-By: Grok 4.6 <grok@x.ai>`. TDD: failing
> test first, watch it fail, then minimal code.

**Goal:** Four production bugs: `/` shows landing when
unsigned and dashboard when the refresh cookie is live;
retired `snapshots` never appears as `?return=`; a
browser document hit never paints raw
`{ "error": "invalid_token" }`; same-origin windows
refresh after a sibling write.

**Architecture:** Apex `/` stays a blank `index.html` plus
`root-redirect.js`. The script probes the existing
`POST /authentication/token` refresh grant (cookie
`Path=/authentication` is not sent to `/`, so the probe
must hit that path) and `putLocation`s
`dashboard/index.html` or `landing/index.html`. Landing
itself does not hop. Unknown `data-page` values bounce to
`not-found` before the auth gate; `redirectToLogin`
encodes only gated registry pages. GET navigations
(`Sec-Fetch-Mode: navigate`) to non-static,
non-authentication paths serve `not-found/index.html`
instead of JSON 401. `UnauthorizedError` during page
init bounces to login instead of painting the reason.
`createSubscriptionChannel.notify()` posts a scoped
BroadcastChannel event so other same-origin windows
hear the write.

**Tech Stack:** Vanilla TypeScript ES2024, `node:test`
via `./test` / `./validate`, memory backend in unit
tests. No new HTTP route. No cookie-path change.

**Bugs:**

1. `GET /` always hops to auth (`root-redirect.ts`).
   Unsigned visitors must see landing. A live refresh
   cookie must hop to dashboard. Landing (`/landing/`)
   still stays until a click (TEST-PLAN B1).
2. Cached or retired `data-page="snapshots"` HTML is
   treated as auth-gated (`requiresAuth !== false` on a
   missing registry entry), so `redirectToLogin` lands
   on `auth/index.html?return=snapshots`.
3. Switching `fusionangle.com` ↔ `fusionangle.ai` (or
   visiting a leftover `/snapshots` path) hits a
   non-static URL. The API gate returns JSON
   `{ "error": "invalid_token" }`. In-app, a 401 after
   boot paints that reason via `handlePageLoadError`.
4. `ideaChanges.notify()` (and siblings) is local-only.
   `postNotificationEvent` is never called from
   production. Other windows of the same browser stay
   stale. TEST-PLAN K29 already expects the channel to
   fire within ~1s.

---

## Do not touch

- Refresh cookie `Path=/authentication` (do not widen)
- No new `/authentication/continue` or session-oracle
  route — the refresh grant is the probe
- Landing must not hop to dashboard (B1 /
  `tests/landing-stay.test.ts`)
- `/ideas/` without `Sec-Fetch-Mode: navigate` stays
  401 JSON (`tests/http-static-directory-index.test.ts`)
- 401-before-404 for API `fetch()` (no bearer, any
  non-exempt path, including retired names)
- Server `pg_notify` / no LISTEN / no SSE (SV10: a
  second *browser* staying stale is still PASS)
- Token-claim snapshots, flow-graph snapshots,
  `presenter.snapshot()` (name homonyms)
- `measurements/history.jsonl`

---

## File map

### Create

- `web-app/app/apex-destination.ts` — pure apex
  decision + refresh probe (no IIFE, no
  `putLocation` on import)
- `tests/apex-destination.test.ts`
- `tests/auth-redirect-login.test.ts` — DOM-stubbed
  `redirectToLogin` for unknown / retired pages
- `tests/page-load-error.test.ts`

### Modify

- `web-app/app/root-redirect.ts` — IIFE calls
  `resolveApexLocation(probeRefreshSession)`
- `tests/root-redirect.test.ts` — source pins: landing
  + dashboard, never auth, never snapshots
- `web-app/app/page-registry.ts` — add `pageAuthMode`
- `tests/page-registry.test.ts` — mode pins
- `web-app/app/auth-redirect.ts` — encode return only
  for gated pages
- `tests/auth-redirect-url.test.ts` — decode
  `snapshots` → default
- `web-app/app/app-boot.ts` — missing page →
  `not-found` before the auth gate
- `web-app/app/page-loader.ts` —
  `UnauthorizedError` → `redirectToLogin`
- `server/http-server.ts` — GET +
  `Sec-Fetch-Mode: navigate` serves
  `not-found/index.html` when that file exists
- `tests/http-static-directory-index.test.ts` — navigate
  vs fetch pins
- `web-app/app/channels.ts` — `notify()` posts
- `tests/channels.test.ts` — second
  `BroadcastChannel` receives the post
- `TEST-PLAN.md` — B0 apex; SV2 wording; same-window
  refresh case
- `CLAUDE.md` — other-tabs gotcha (same-browser
  windows update; other browsers stay the residual)

---

### Task 1: Apex destination (unsigned landing, signed dashboard)

**Files:**
- Create: `web-app/app/apex-destination.ts`
- Create: `tests/apex-destination.test.ts`
- Modify: `web-app/app/root-redirect.ts`
- Modify: `tests/root-redirect.test.ts`

- [ ] **Step 1: Write the failing destination tests**

Create `tests/apex-destination.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    APEX_SIGNED_IN,
    APEX_SIGNED_OUT,
    resolveApexLocation,
} from '../web-app/app/apex-destination.ts';

test('a live session hops to dashboard', async () => {
    assert.equal(
        await resolveApexLocation(async () => true),
        APEX_SIGNED_IN,
    );
    assert.equal(
        APEX_SIGNED_IN,
        'dashboard/index.html',
    );
});

test('a dead session hops to landing', async () => {
    assert.equal(
        await resolveApexLocation(async () => false),
        APEX_SIGNED_OUT,
    );
    assert.equal(
        APEX_SIGNED_OUT,
        'landing/index.html',
    );
});

test('a probe fault hops to landing', async () => {
    assert.equal(
        await resolveApexLocation(async () => {
            throw new Error('network');
        }),
        APEX_SIGNED_OUT,
    );
});
```

Rewrite `tests/root-redirect.test.ts` so the source
scan matches the new hop (this will fail until
Task 1 Step 5):

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
    fileURLToPath(
        new URL(
            '../web-app/app/root-redirect.ts',
            import.meta.url,
        ),
    ),
    'utf8',
);

test('apex hops via the destination helper', () => {
    assert.match(src, /resolveApexLocation/);
    assert.match(src, /probeRefreshSession/);
    assert.equal(
        src.includes('auth/index.html'),
        false,
    );
    assert.equal(
        src.includes('snapshots/index.html'),
        false,
    );
    assert.equal(
        src.includes('getSchemaPresent'),
        false,
    );
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
    node --strip-types \
    --import ./tests/hmac-test-key.ts \
    --test tests/apex-destination.test.ts \
           tests/root-redirect.test.ts
```

Expected: FAIL — `apex-destination.ts` is missing;
root-redirect source still names `auth/index.html`.

- [ ] **Step 3: Implement the destination module**

Create `web-app/app/apex-destination.ts`:

```typescript
// Apex `/` destination. The refresh cookie is
// Path=/authentication, so GET `/` cannot see it.
// The existing refresh grant is the probe — not a
// new door.

export const APEX_SIGNED_IN = 'dashboard/index.html';
export const APEX_SIGNED_OUT = 'landing/index.html';

export async function resolveApexLocation(
    sessionLive: () => Promise<boolean>,
): Promise<string> {
    try {
        if (await sessionLive()) {
            return APEX_SIGNED_IN;
        }
    } catch {
        // a probe fault is unsigned
    }
    return APEX_SIGNED_OUT;
}

export async function probeRefreshSession(
): Promise<boolean> {
    const response = await fetch(
        '/authentication/token',
        {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                grant_type: 'refresh',
            }),
        },
    );
    return response.ok;
}
```

Replace `web-app/app/root-redirect.ts` so the IIFE
is the only side effect (tests import
`apex-destination.ts`, never this file):

```typescript
// Root-page redirect script. Probes the refresh
// grant, then hops to dashboard (live) or landing
// (unsigned). No schema branch. Extracted from the
// inline body script in web-app/index.html so a
// strict Content-Security-Policy (script-src 'self')
// can forbid inline scripts. esbuild bundles this
// into a self-contained IIFE per ./build.

import { putLocation } from './adapters/location.ts';
import {
    probeRefreshSession,
    resolveApexLocation,
} from './apex-destination.ts';

void (async function redirectRoot(): Promise<void> {
    const dest = await resolveApexLocation(
        probeRefreshSession,
    );
    putLocation(dest);
})();
```

Do not change `web-app/landing/index.ts`. B1 stays:
landing does not shove to dashboard.

- [ ] **Step 4: Run tests to verify they pass**

```bash
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
    node --strip-types \
    --import ./tests/hmac-test-key.ts \
    --test tests/apex-destination.test.ts \
           tests/root-redirect.test.ts \
           tests/landing-stay.test.ts
```

Expected: PASS. `landing-stay` still forbids
`dashboard/index.html` inside landing.

- [ ] **Step 5: Commit**

```bash
git add \
    web-app/app/apex-destination.ts \
    web-app/app/root-redirect.ts \
    tests/apex-destination.test.ts \
    tests/root-redirect.test.ts
git commit -m "Hop unsigned / to landing, signed to dashboard

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task 2: Stop encoding retired pages as `?return=`

**Files:**
- Modify: `web-app/app/page-registry.ts`
- Modify: `tests/page-registry.test.ts`
- Modify: `web-app/app/auth-redirect.ts`
- Modify: `tests/auth-redirect-url.test.ts`
- Create: `tests/auth-redirect-login.test.ts`
- Modify: `web-app/app/app-boot.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/page-registry.test.ts`:

```typescript
import { pageAuthMode } from
    '../web-app/app/page-registry.ts';

test('retired snapshots is a missing page', () => {
    assert.equal(
        pageAuthMode('snapshots'), 'missing',
    );
});

test('dashboard is gated and landing is public',
() => {
    assert.equal(pageAuthMode('dashboard'), 'gated');
    assert.equal(pageAuthMode('landing'), 'public');
});
```

Append to `tests/auth-redirect-url.test.ts`:

```typescript
test('a retired snapshots return falls to default',
() => {
    assert.deepEqual(
        decodeReturnTarget('snapshots'),
        {
            page: DEFAULT_POST_LOGIN_PAGE,
            params: {},
        },
    );
});
```

Create `tests/auth-redirect-login.test.ts` (DOM stubs
so `redirectToLogin` can run under Node):

```typescript
// @ts-expect-error — Node global stub
globalThis.window = { location: { href: '', search: '' } };

let pageName = 'snapshots';
// @ts-expect-error — Node global stub
globalThis.document = {
    documentElement: {
        getAttribute: () => pageName,
    },
};

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { redirectToLogin } from
    '../web-app/app/auth-redirect.ts';

test('an unknown page bounces to auth with no return',
() => {
    pageName = 'snapshots';
    window.location.href = '';
    redirectToLogin();
    assert.match(
        window.location.href,
        /auth\/index\.html$/,
    );
    assert.equal(
        window.location.href.includes('return='),
        false,
    );
});

test('a gated page still carries return', () => {
    pageName = 'dashboard';
    window.location.href = '';
    redirectToLogin();
    assert.match(
        window.location.href,
        /auth.*return=dashboard/,
    );
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
    node --strip-types \
    --import ./tests/hmac-test-key.ts \
    --test tests/page-registry.test.ts \
           tests/auth-redirect-url.test.ts \
           tests/auth-redirect-login.test.ts
```

Expected: FAIL — `pageAuthMode` is missing;
`redirectToLogin` still encodes `return=snapshots`.
The decode test may already PASS (`isGatedPage`
rejects unknown keys). Keep it as a pin.

- [ ] **Step 3: Implement**

Add after `PAGE_REGISTRY` in
`web-app/app/page-registry.ts`:

```typescript
export type PageAuthMode =
    | 'missing'
    | 'gated'
    | 'public';

export function pageAuthMode(
    pageName: string,
): PageAuthMode {
    const entry = PAGE_REGISTRY[pageName];
    if (entry === undefined) return 'missing';
    if (entry.requiresAuth === false) return 'public';
    return 'gated';
}
```

Change `redirectToLogin` in
`web-app/app/auth-redirect.ts`:

```typescript
export function redirectToLogin(): void {
    const page = getPageName();
    const mode = pageAuthMode(page);
    if (mode === 'public') {
        return;
    }
    if (mode !== 'gated') {
        navigateTo('auth');
        return;
    }
    navigateTo('auth', {
        return: encodeReturnTarget(page, getUrlParams()),
    });
}
```

Add the `pageAuthMode` import from `./page-registry.ts`.
`isGatedPage` can stay for `decodeReturnTarget`.

In `web-app/app/app-boot.ts`, immediately after
`const pageName = getPageName();`:

```typescript
    if (pageAuthMode(pageName) === 'missing') {
        bounceTo('not-found');
        return;
    }
```

Import `pageAuthMode` from `./page-registry.ts`.
Cached `data-page="snapshots"` HTML now hops to
`not-found`, never `auth?return=snapshots`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
    node --strip-types \
    --import ./tests/hmac-test-key.ts \
    --test tests/page-registry.test.ts \
           tests/auth-redirect-url.test.ts \
           tests/auth-redirect-login.test.ts \
           tests/adapters-shared-recovery.test.ts
```

Expected: PASS. Shared-recovery still lands on
`auth.*return=dashboard` for a gated page.

- [ ] **Step 5: Commit**

```bash
git add \
    web-app/app/page-registry.ts \
    web-app/app/auth-redirect.ts \
    web-app/app/app-boot.ts \
    tests/page-registry.test.ts \
    tests/auth-redirect-url.test.ts \
    tests/auth-redirect-login.test.ts
git commit -m "Drop unknown pages from login return

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task 3: Stop painting `invalid_token` at humans

**Files:**
- Create: `tests/page-load-error.test.ts`
- Modify: `web-app/app/page-loader.ts`
- Modify: `tests/http-static-directory-index.test.ts`
- Modify: `server/http-server.ts`

Two seams, one concern: a human never sees the JSON
(or HTML) `invalid_token` body.

- [ ] **Step 1: Write the failing tests**

Create `tests/page-load-error.test.ts`:

```typescript
// @ts-expect-error — Node global stub
globalThis.window = { location: { href: '', search: '' } };
// @ts-expect-error — Node global stub
globalThis.document = {
    documentElement: {
        getAttribute: () => 'dashboard',
    },
    getElementById: () => null,
};

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { UnauthorizedError } from
    '../api/http-errors.ts';
import { handlePageLoadError } from
    '../web-app/app/page-loader.ts';

test('UnauthorizedError bounces to login', () => {
    window.location.href = '';
    handlePageLoadError(
        'dashboard',
        new UnauthorizedError('invalid_token'),
    );
    assert.match(
        window.location.href,
        /auth.*return=dashboard/,
    );
});
```

Append to `tests/http-static-directory-index.test.ts`:

```typescript
test('a document navigation to a retired path'
    + ' serves not-found HTML',
async () => {
    await withServer({
        'not-found/index.html': '<p>gone</p>',
    }, undefined, async (base) => {
        const res = await fetch(
            base + '/snapshots',
            {
                headers: {
                    'sec-fetch-mode': 'navigate',
                },
            },
        );
        assert.equal(res.status, 200);
        assert.match(
            res.headers.get('content-type') ?? '',
            /text\/html/,
        );
        assert.equal(await res.text(), '<p>gone</p>');
    });
});

test('a fetch to a retired path stays 401 JSON',
async () => {
    await withServer({
        'not-found/index.html': '<p>gone</p>',
    }, undefined, async (base) => {
        const res = await fetch(base + '/snapshots');
        assert.equal(res.status, HTTP_UNAUTHORIZED);
        assert.match(
            res.headers.get('content-type') ?? '',
            /application\/json/,
        );
        const body = await res.json() as {
            error: string;
        };
        assert.equal(body.error, 'invalid_token');
    });
});
```

Keep the existing `/ideas/` test unchanged — no
`Sec-Fetch-Mode`, still 401 JSON.

- [ ] **Step 2: Run tests to verify they fail**

```bash
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
    node --strip-types \
    --import ./tests/hmac-test-key.ts \
    --test tests/page-load-error.test.ts \
           tests/http-static-directory-index.test.ts
```

Expected: FAIL — `handlePageLoadError` does not
navigate; `/snapshots` + navigate is 401 JSON.

- [ ] **Step 3: Implement**

In `web-app/app/page-loader.ts`, import
`UnauthorizedError` from `../../api/http-errors.ts`
and `redirectToLogin` from `./auth-redirect.ts`.
At the top of `handlePageLoadError`:

```typescript
    if (err instanceof UnauthorizedError) {
        redirectToLogin();
        return;
    }
```

In `server/http-server.ts`, after the
`/api-documentation` static block and before the
API `requestPathname` construction, add a document-
navigation arm. Add this helper near
`staticExtensionOf`:

```typescript
function isDocumentNavigation(
    req: IncomingMessage,
): boolean {
    return (req.method ?? 'GET') === 'GET'
        && headerLine(
            req.headers['sec-fetch-mode'],
        ) === 'navigate';
}

function isAuthenticationPath(
    pathname: string,
): boolean {
    return pathname === '/authentication'
        || pathname.startsWith('/authentication/');
}

async function existingStaticFile(
    root: string,
    urlPath: string,
): Promise<string | undefined> {
    const filePath = safeStaticPath(root, urlPath);
    if (filePath === undefined) return undefined;
    try {
        const info = await stat(filePath);
        if (info.isFile()) return filePath;
    } catch {
        return undefined;
    }
    return undefined;
}
```

In `dispatch`, after the api-documentation block:

```typescript
        if (
            isDocumentNavigation(req)
            && !isAuthenticationPath(pathname)
        ) {
            const notFound = await existingStaticFile(
                options.staticRoot,
                '/not-found/index.html',
            );
            if (notFound !== undefined) {
                status = await serveStatic(
                    req, res, notFound,
                );
                return;
            }
        }
```

Authentication grant paths still reach the API.
`fetch()` without `Sec-Fetch-Mode: navigate` still
401s. Missing `not-found/index.html` in a test
fixture falls through to the API (existing 401).

- [ ] **Step 4: Run tests to verify they pass**

```bash
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
    node --strip-types \
    --import ./tests/hmac-test-key.ts \
    --test tests/page-load-error.test.ts \
           tests/http-static-directory-index.test.ts \
           tests/http-server.test.ts \
           tests/api-unauthenticated-route-ordering.test.ts
```

Expected: PASS. Unsigned API fetches still 401
before 404.

- [ ] **Step 5: Commit**

```bash
git add \
    web-app/app/page-loader.ts \
    server/http-server.ts \
    tests/page-load-error.test.ts \
    tests/http-static-directory-index.test.ts
git commit -m "Serve HTML, not token JSON, to browsers

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task 4: Other same-origin windows hear writes

**Files:**
- Modify: `web-app/app/channels.ts`
- Modify: `tests/channels.test.ts`

Root cause: `postNotificationEvent` is only referenced
from tests. Server `postNotification` is wired to
`() => {}` in `server/boot.ts` (pg_notify on the
backend is unused by the browser). The writer tab
updates via local `notify()`. Other windows never get
a BroadcastChannel message.

Do not add LISTEN or SSE. Same-browser, same-origin
only. SV10 (other *browsers*) stays the named residual.

- [ ] **Step 1: Write the failing tests**

Append to `tests/channels.test.ts` (the file already
stubs `window` and defines `CHANNEL_NAME` /
`deliver`):

```typescript
test('notify posts a scoped event other tabs hear',
async () => {
    putSessionToken(
        await organizationToken('current', '1'),
    );
    const seen: unknown[] = [];
    const listener = new BroadcastChannel(
        CHANNEL_NAME,
    );
    listener.addEventListener('message', (event) => {
        seen.push(event.data);
    });
    const ch = createSubscriptionChannel();
    let local = 0;
    ch.subscribe(() => {
        local += 1;
    });
    ch.notify();
    await deliver();
    listener.close();
    assert.equal(local, 1);
    assert.deepEqual(seen, [{
        kind: 'scoped',
        organizationIds: ['1'],
        identityIds: ['current'],
    }]);
});

test('notify on a flat session names reachable orgs',
async () => {
    putSessionToken(
        await reachableToken('current', ['1', '2']),
    );
    const seen: unknown[] = [];
    const listener = new BroadcastChannel(
        CHANNEL_NAME,
    );
    listener.addEventListener('message', (event) => {
        seen.push(event.data);
    });
    createSubscriptionChannel().notify();
    await deliver();
    listener.close();
    assert.deepEqual(seen, [{
        kind: 'scoped',
        organizationIds: ['1', '2'],
        identityIds: ['current'],
    }]);
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
    node --strip-types \
    --import ./tests/hmac-test-key.ts \
    --test tests/channels.test.ts
```

Expected: FAIL — `seen` is `[]` because `notify()`
does not post.

- [ ] **Step 3: Implement**

In `web-app/app/channels.ts`, import
`postNotificationEvent` from
`./adapters/broadcast-channel.ts` and
`NotificationEvent` from `../../api/notifications.ts`.

Add:

```typescript
function eventForThisTab(): NotificationEvent {
    if (!sessionTokenIsSeeded()) {
        return { kind: 'full' };
    }
    const principal =
        principalFromToken(getSessionToken());
    const organizationIds =
        principal.organization !== undefined
            ? [principal.organization]
            : [...(principal.organizations ?? [])];
    const identityIds = sessionIsAuthenticated()
        ? [principal.id]
        : [];
    return {
        kind: 'scoped',
        organizationIds,
        identityIds,
    };
}
```

Change the returned `notify`:

```typescript
        notify: () => {
            channel.send();
            postNotificationEvent(eventForThisTab());
        },
```

BroadcastChannel does not echo to the poster, so
this tab does not double-refresh. Other tabs' existing
`subscribeNotificationEvents` matcher fires every
subscription channel that matches the org/identity —
the same path K29 already describes.

- [ ] **Step 4: Run tests to verify they pass**

```bash
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
    node --strip-types \
    --import ./tests/hmac-test-key.ts \
    --test tests/channels.test.ts \
           tests/broadcast-channel.test.ts
```

Expected: PASS. Inert-without-window tests still
no-op under Node when `window` is absent
(`broadcast-channel.test.ts` does not stub it).

- [ ] **Step 5: Commit**

```bash
git add \
    web-app/app/channels.ts \
    tests/channels.test.ts
git commit -m "Post writes to sibling windows

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task 5: Scripture and the test plan

**Files:**
- Modify: `TEST-PLAN.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update TEST-PLAN entry cases**

In `TEST-PLAN.md` § B (before B1), add:

```markdown
### Apex (`/`)

- [ ] **B0** With site data deleted and no
  `refresh_token` cookie, open `/`. PASS: lands on
  `landing/index.html` (one hop from the blank root
  document). Does not open `auth/` and does not open
  `snapshots/`.
- [ ] **B0b** After signing in, open `/` in the same
  cookie jar. PASS: lands on `dashboard/index.html`.
  Landing (`/landing/index.html`) still stays until
  a click (B1).
```

Change SV2 from "or follow the root hop to auth" to
"or follow the unsigned root hop to landing, then
Sign In".

After SV8 (two tabs share the cookie), add:

```markdown
- [ ] **SV8b** Two windows of the same profile, both
  on `ideas/`. Create an idea in window A. PASS:
  window B's list gains the card without a reload
  (BroadcastChannel `fusion-ai:data`).
```

SV10 stays: a *second browser* staying stale is
still PASS.

K29 already requires the channel; no wording change
beyond confirming it is no longer aspirational.

- [ ] **Step 2: Update the CLAUDE.md gotcha**

Replace the "Same-tab refresh; other tabs stale
until navigation." bullet with:

```markdown
- **Same-tab refresh; other browsers stale until
  navigation.** A successful write in this tab
  notifies via module pub-sub
  (`ideaChanges.notify()` and siblings) and posts
  a scoped BroadcastChannel event
  (`fusion-ai:data`) so other same-origin windows
  of this browser refresh. Writes
  `pg_notify('fusion_events', …)` on the server;
  there is no LISTEN and no SSE client. A second
  browser stays stale until navigation.
  Theme/sidebar still sync over `StorageEvent`
  (they stay in localStorage).
```

Wrap at 78 characters to match the file.

- [ ] **Step 3: Commit**

```bash
git add TEST-PLAN.md CLAUDE.md
git commit -m "Document apex hops and window notify

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task 6: Full gate

- [ ] **Step 1: Run `./validate`**

```bash
./validate
```

Expected: type-check, both test TZ passes, 78-char
line lint, no `org` abbreviation, schema SVG and API
docs check all green.

If a line-length or identifier lint fails, fix in
the file that grew, do not weaken the test.

- [ ] **Step 2: Browser check when `./serve` is
  available**

Needs `POSTGRES_URL` and `JWT_HMAC_SIGNING_KEY`.
Not a `./validate` substitute — confirm the four
symptoms:

1. Cleared site data, open `/` → landing. Sign in.
   Open `/` → dashboard. Open `/landing/` → stays.
2. `auth/index.html?return=snapshots` after login →
   dashboard (decode pin). A `data-page="snapshots"`
   document (if you still have one) → not-found,
   not `?return=snapshots`.
3. Address-bar `GET /snapshots` → 404 page HTML, not
   `{ "error": "invalid_token" }`. `fetch('/ideas/')`
   from DevTools still 401 JSON.
4. Two windows, same origin, ideas list: create in
   A, B updates without reload.

- [ ] **Step 3: Do not run `./build` on a dirty
  tree.** If validate is green and the working tree
  is the four commits above, stop. `./build` is a
  later operator step.

---

## Self-review

**Spec coverage**

| Report | Task |
|---|---|
| `/` is not landing (unsigned) | Task 1 |
| `/` should be dashboard when logged in | Task 1 |
| `?return=snapshots` leftover | Task 2 |
| Ugly token JSON / error page | Task 3 |
| Side-by-side windows stale | Task 4 |
| Scripture / manual cases | Task 5 |
| Gate | Task 6 |

**Landing does not hop.** B1 and
`tests/landing-stay.test.ts` stay red-line. Only
`/` is session-aware.

**No new door.** Probe is
`POST /authentication/token` `grant_type=refresh`.

**No cookie-path change.** Probe URL is under
`/authentication`.

**API covenant.** `fetch()` without navigate mode
still 401 JSON on unsigned non-exempt paths.

**Placeholder scan.** None.

**Type consistency.** `pageAuthMode` returns
`'missing' | 'gated' | 'public'`. `resolveApexLocation`
takes `() => Promise<boolean>` and returns
`APEX_SIGNED_IN` / `APEX_SIGNED_OUT`.
`eventForThisTab` returns `NotificationEvent`.
