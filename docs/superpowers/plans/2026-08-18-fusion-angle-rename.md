# Fusion Angle Product Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Every dispatched subagent prompt MUST begin
> with `Go to Medium Church!` (CLAUDE.md scroll policy).
> Do not use git worktrees. Work on this checkout's
> `master` (linear history; this house does not branch
> for a rename). Wrap lines at 78 characters. 4-space
> indent. Present-tense imperative commits with
> `Co-Authored-By: Grok 4.6 <grok@x.ai>`. TDD: failing
> test first, watch it fail, then minimal code.

**Goal:** Rename the live product from Fusion AI /
`fusion-ai` to Fusion Angle / `fusion-angle`, replace
the orbital atom mark with a derived form of
`~/Desktop/favicon.png`, then point GitHub and Render
at the renamed repository.

**Architecture:** One concern per commit, in the spec
order: visible name, live identifiers, mock-data labels,
mark assets, current docs, then a repo-wide live-name
pin. JWT audience becomes `fusion-angle` (not
`fusion-angle-web`). Storage keys and BroadcastChannel
names change with no migration. The mark is one
white-on-transparent PNG plus CSS `invert(1)` in light
theme. Dated files under `docs/superpowers/specs/` and
`docs/superpowers/plans/` stay as written.

**Tech Stack:** Vanilla TypeScript ES2024, `node:test`
via `./test` / `./validate`, Swift/AppKit (macOS
platform primitive) to derive PNG/ICO, no new npm
dependency. Chrome via `./serve` for browser
verification. `gh` + Render CLI for the post-validate
operator steps.

**Spec:**
`docs/superpowers/specs/2026-08-18-fusion-angle-rename-design.md`

---

## Do not touch

- `docs/superpowers/specs/` and
  `docs/superpowers/plans/` (including this plan and
  the design spec)
- Seed pair id `fSe02FusionFl0w0aActiv`
- `./wipe-render-postgres` script name
- Postgres database `fusion_9hc2` / user `fusion`
- Render service slug `fusion-ai-f740` and
  `https://fusion-ai-f740.onrender.com`
- Render team / project / **Fusion Angle Server** /
  **Fusion Angle Postgres** display names
- A new Render service, a new onrender slug, or a
  Render deploy
- Migration of old `fusion-ai:…` localStorage keys
- Acceptance of old JWT audience `fusion-ai-web`
- Inventing `fusion-angle-web` or
  `fusion-angle-browser` / a SHA'd browser ZIP
- Tracing the mark to vector paths
- Shipping `~/Desktop/favicon.png` (opaque black tile)
  as the in-app logo
- `REFRESH_LOCK = 'fusion-refresh'` (not a `fusion-ai`
  identifier)
- Taglines that say "AI platform" / "intelligent
  automation" without the product name
- Unrelated refactors, formatting-only diffs, extra
  helpers

## File map

**Visible name (Task 1)**

- Modify: `web-app/index.html`
- Modify: `web-app/landing/index.html`
- Modify: `web-app/landing/index.ts`
- Modify: `web-app/auth/index.html`
- Modify: `web-app/auth/index.ts`
- Modify: `web-app/not-found/index.html`
- Modify: `web-app/app/components-layout.html`
- Modify: `web-app/app/component-sidebar.html`
- Modify: `web-app/app/component-mobile-header.html`
- Modify: `web-app/app/component-mobile-sidebar.html`
- Modify: `web-app/design-system/index.ts`
- Create: `tests/fusion-angle-display.test.ts`

**Live identifiers (Task 2)**

- Modify: `api/access-token.ts`
- Modify: `web-app/app/storage-keys.ts`
- Modify: `web-app/app/adapters/broadcast-channel.ts`
- Modify: `web-app/app/adapters/session-refresh-mutex.ts`
- Modify: `web-app/identities/detail.html`
- Modify: `build`
- Modify: `package-lock.json` (top-level `name` only)
- Modify: `tests/server-zip-metafile.test.ts`
- Modify: `tests/page-performance.test.ts`
- Modify: `tests/adapters-preferences.test.ts`
- Modify: `tests/channels.test.ts`
- Modify: `tests/adapters-refresh-mutex.test.ts`
- Modify: `tests/access-token.test.ts`
- Modify: `tests/adapters-client-registration.test.ts`
- Modify: `tests/api-client-registration.test.ts`
- Modify: `tests/client-assertion.test.ts`
- Modify: `tests/derive-client-registration.test.ts`
- Modify: `tests/presenter-identity-detail.test.ts`
- Modify: `tests/api-authentication-token.test.ts`
- Modify: `tests/api-shadow-ledger-auth.test.ts`
- Modify: `tests/api-shadow-ledger-tokens.test.ts`
- Create: `tests/fusion-angle-identifiers.test.ts`

**Mock-data labels (Task 3)**

- Modify: `api/mock-data/flows.ts`
- Modify: `api/mock-data/records.ts`
- Modify: `api/mock-data.ts`
- Modify: `tests/drift-work-orders.test.ts`
- Modify: `tests/mock-data-flow-relations.test.ts`

**Mark (Task 4)**

- Create: `web-app/assets/mark.png`
- Modify: `web-app/assets/favicon.svg`
- Modify: `web-app/assets/favicon.ico`
- Modify: `web-app/app/icons.ts` (`iconLogo`)
- Modify: `web-app/app/styles/components-brand.css`
- Modify: `web-app/app/component-sidebar.html`
- Modify: `web-app/app/component-mobile-sidebar.html`
- Create: `tests/fusion-angle-mark.test.ts`

**Current docs (Task 5)**

- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `TEST-PLAN.md`
- Modify: `ARCHITECTURE.md`
- Modify: `DESIGN-SYSTEM.md`
- Modify: `SCHEMA.md`
- Modify: `API.md`
- Modify: `AUDIT.md`

**Live-name pin (Task 6)**

- Create: `tests/fusion-angle-live-name.test.ts`

**Browser (Task 7)** — orchestrator, no commit

**GitHub / Render / checkout (Task 8)** — operator,
after Task 6 is on `master` and `./validate` is green.
Do not `mv` the checkout from inside a live session.

## Subagent dispatch

Controller: one implementer at a time (same files
collide). After each task: spec-compliance review,
then code-quality review. Do not start quality review
before spec review is green.

Every implementer / reviewer prompt begins with:

```
Go to Medium Church!
```

Then push down: 78-char lines, 4-space indent, no
inline `style=`, present-tense ≈50-char commits,
`Co-Authored-By: Grok 4.6 <grok@x.ai>`. Commandments
touched: III Uniformity, V Clarity, VIII Simplicity.
Abominations to refuse: unbidden helpers, premature
generalization, test weakening, foreign tongues,
swallowed failures. Match existing pin-test voice
(`tests/server-zip-metafile.test.ts`).

Paste the full task text. Do not tell the subagent to
read this plan file.

---

### Task 1: Visible product name

**Files:** listed in the File map (Visible name).

Replace every live `Fusion AI` chrome string with
`Fusion Angle`. Also rename the design-system heading
`Fusion Card` → `Fusion Angle Card`. Do not touch
identifiers, mock-data flow names, the orbital SVG, or
docs.

- [ ] **Step 1: Write the failing display pin**

Create `tests/fusion-angle-display.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FILES = [
    'web-app/index.html',
    'web-app/landing/index.html',
    'web-app/landing/index.ts',
    'web-app/auth/index.html',
    'web-app/auth/index.ts',
    'web-app/not-found/index.html',
    'web-app/app/components-layout.html',
    'web-app/app/component-sidebar.html',
    'web-app/app/component-mobile-header.html',
    'web-app/app/component-mobile-sidebar.html',
    'web-app/design-system/index.ts',
] as const;

test('product chrome says Fusion Angle', () => {
    for (const path of FILES) {
        const src = readFileSync(path, 'utf8');
        assert.match(
            src,
            /Fusion Angle/,
            path + ' must say Fusion Angle',
        );
        assert.doesNotMatch(
            src,
            /Fusion AI/,
            path + ' must not say Fusion AI',
        );
    }
});

test('design-system card heading is Fusion Angle Card',
() => {
    const src = readFileSync(
        'web-app/design-system/index.ts',
        'utf8',
    );
    assert.match(src, /Fusion Angle Card/);
    assert.doesNotMatch(src, /Fusion Card/);
});
```

- [ ] **Step 2: Run the pin and watch it fail**

Run:

```bash
node --test --strip-types \
    tests/fusion-angle-display.test.ts
```

Expected: FAIL — files still say `Fusion AI` /
`Fusion Card`.

- [ ] **Step 3: Replace the visible strings**

Exact substitutions (leave surrounding markup):

| File | From | To |
|---|---|---|
| `web-app/index.html` | `<title>Fusion AI</title>` | `<title>Fusion Angle</title>` |
| `web-app/landing/index.html` | `Fusion AI — Human-Intelligence First` | `Fusion Angle — Human-Intelligence First` |
| `web-app/landing/index.html` | `content="Fusion AI - Human-Intelligence` | `content="Fusion Angle - Human-Intelligence` |
| `web-app/auth/index.html` | `Sign In \| Fusion AI` | `Sign In \| Fusion Angle` |
| `web-app/auth/index.html` | `content="Fusion AI - Human-Intelligence` | `content="Fusion Angle - Human-Intelligence` |
| `web-app/not-found/index.html` | `404 \| Fusion AI` | `404 \| Fusion Angle` |
| `web-app/not-found/index.html` | `content="Fusion AI - Page not found."` | `content="Fusion Angle - Page not found."` |
| `web-app/app/components-layout.html` | `{{PAGE_TITLE}} \| Fusion AI` | `{{PAGE_TITLE}} \| Fusion Angle` |
| `web-app/app/components-layout.html` | `content="Fusion AI - Human-Intelligence` | `content="Fusion Angle - Human-Intelligence` |
| `web-app/app/component-sidebar.html` | `>Fusion AI</span>` | `>Fusion Angle</span>` |
| `web-app/app/component-mobile-header.html` | `>Fusion AI</span>` | `>Fusion Angle</span>` |
| `web-app/app/component-mobile-sidebar.html` | `>Fusion AI</span>` | `>Fusion Angle</span>` |
| `web-app/landing/index.ts` | `">Fusion AI</span>` (navbar + footer) | `">Fusion Angle</span>` |
| `web-app/landing/index.ts` | `'Fusion AI puts humans'` | `'Fusion Angle puts humans'` |
| `web-app/landing/index.ts` | `' who use Fusion AI to'` | `' who use Fusion Angle to'` |
| `web-app/landing/index.ts` | `'Fusion AI.'` | `'Fusion Angle.'` |
| `web-app/auth/index.ts` | `">Fusion AI</span>` (desktop + mobile) | `">Fusion Angle</span>` |
| `web-app/auth/index.ts` | `' Fusion AI to'` | `' Fusion Angle to'` |
| `web-app/design-system/index.ts` | `Fusion AI Design System` | `Fusion Angle Design System` |
| `web-app/design-system/index.ts` | `'Primary brand colors for Fusion AI'` | `'Primary brand colors for Fusion Angle'` |
| `web-app/design-system/index.ts` | `>Fusion Card</h3>` | `>Fusion Angle Card</h3>` |

Keep 78-character lines. If a replacement overflows,
split the string the way the file already splits
hero / CTA copy.

Do not change the orbital SVG in the sidebars.

- [ ] **Step 4: Re-run the pin**

```bash
node --test --strip-types \
    tests/fusion-angle-display.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/fusion-angle-display.test.ts \
    web-app/index.html \
    web-app/landing/index.html \
    web-app/landing/index.ts \
    web-app/auth/index.html \
    web-app/auth/index.ts \
    web-app/not-found/index.html \
    web-app/app/components-layout.html \
    web-app/app/component-sidebar.html \
    web-app/app/component-mobile-header.html \
    web-app/app/component-mobile-sidebar.html \
    web-app/design-system/index.ts
git commit -m "$(cat <<'EOF'
Rename the visible product to Fusion Angle
Co-Authored-By: Grok 4.6 <grok@x.ai>
EOF
)"
```

---

### Task 2: Live identifiers

**Files:** listed in the File map (Live identifiers).

Every live `fusion-ai` identifier becomes
`fusion-angle`. JWT audience is `fusion-angle`, not
`fusion-angle-web`. No migration. Keep the
`fusion-ai-browser` forbidden-name pin (still
absent). Add a `fusion-angle-browser` absence pin.

- [ ] **Step 1: Write the failing identifier pin**

Create `tests/fusion-angle-identifiers.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOKEN_AUDIENCE } from
    '../api/access-token.ts';
import {
    STORAGE_KEY_AUTHORIZATION,
    STORAGE_KEY_ACTIVE_ORGANIZATION_ID,
    STORAGE_KEY_THEME,
    STORAGE_KEY_SIDEBAR,
    STORAGE_KEY_LOG_LEVEL,
} from '../web-app/app/storage-keys.ts';

test('JWT audience is fusion-angle', () => {
    assert.equal(TOKEN_AUDIENCE, 'fusion-angle');
    assert.notEqual(
        TOKEN_AUDIENCE,
        'fusion-angle-web',
    );
});

test('storage keys use the fusion-angle prefix',
() => {
    assert.equal(
        STORAGE_KEY_AUTHORIZATION,
        'fusion-angle:authorization',
    );
    assert.equal(
        STORAGE_KEY_ACTIVE_ORGANIZATION_ID,
        'fusion-angle:active-organization-id',
    );
    assert.equal(
        STORAGE_KEY_THEME,
        'fusion-angle:theme',
    );
    assert.equal(
        STORAGE_KEY_SIDEBAR,
        'fusion-angle:sidebar-collapsed',
    );
    assert.equal(
        STORAGE_KEY_LOG_LEVEL,
        'fusion-angle:log-level',
    );
});
```

In `tests/server-zip-metafile.test.ts`, change the ZIP
assertion and add the new absence pin:

```ts
    assert.match(
        BUILD_SCRIPT,
        /fusion-angle-server-\$\{SHA\}\.zip/,
    );
    assert.doesNotMatch(
        BUILD_SCRIPT,
        /fusion-ai-browser/,
    );
    assert.doesNotMatch(
        BUILD_SCRIPT,
        /fusion-angle-browser/,
    );
```

Replace every remaining hardcoded `fusion-ai-web` with
`fusion-angle` in:

- `tests/access-token.test.ts` (forged / decode
  fixtures at the `aud:` fields)
- `tests/adapters-client-registration.test.ts`
  (`FIELDS.aud`)
- `tests/api-client-registration.test.ts`
  (`REGISTRATION.aud`)
- `tests/client-assertion.test.ts` (`AUDIENCE`)
- `tests/derive-client-registration.test.ts`
  (`REGISTRATION.aud`)
- `tests/presenter-identity-detail.test.ts`
  (registration fixture `aud`)
- `tests/api-authentication-token.test.ts`
  (`activeClient.aud` and every `aud:` in
  `signedClientSetup` / later assertions)
- `tests/api-shadow-ledger-auth.test.ts`
- `tests/api-shadow-ledger-tokens.test.ts`

Replace fixture / channel strings:

- `tests/page-performance.test.ts`:
  `'fusion-ai:log-level'` → `'fusion-angle:log-level'`
- `tests/adapters-preferences.test.ts`: every
  `'fusion-ai:…'` test key → `'fusion-angle:…'`
  (`demo`, `color`, `a`, `b`, `empty`)
- `tests/channels.test.ts`:
  `const CHANNEL_NAME = 'fusion-angle:data';`
- `tests/adapters-refresh-mutex.test.ts`:
  `new BroadcastChannel('fusion-angle:refresh')`

Do not invent `fusion-angle-web`.

- [ ] **Step 2: Run the identifier tests and watch them fail**

```bash
node --test --strip-types \
    tests/fusion-angle-identifiers.test.ts \
    tests/server-zip-metafile.test.ts
```

Expected: FAIL — `TOKEN_AUDIENCE` is still
`fusion-ai-web`; `build` still names
`fusion-ai-server-${SHA}.zip`.

- [ ] **Step 3: Change production identifiers**

`api/access-token.ts`:

```ts
export const TOKEN_AUDIENCE = 'fusion-angle';
```

`web-app/app/storage-keys.ts` — update the comment
and the five keys:

```ts
// Client-side localStorage keys. All share the
// fusion-angle: prefix. deleteSchema only removes
// TABLE_NAMES keys, so these UI/session keys
// survive a schema wipe.

export const STORAGE_KEY_AUTHORIZATION =
    'fusion-angle:authorization';

export const STORAGE_KEY_ACTIVE_ORGANIZATION_ID =
    'fusion-angle:active-organization-id';

export const STORAGE_KEY_THEME = 'fusion-angle:theme';

export const STORAGE_KEY_SIDEBAR =
    'fusion-angle:sidebar-collapsed';

export const STORAGE_KEY_LOG_LEVEL =
    'fusion-angle:log-level';
```

Drop the stale `(fusion-ai:requests|responses)`
parenthetical — those keys are not live. Do not
invent new table-backend keys.

`web-app/app/adapters/broadcast-channel.ts`:

```ts
const CHANNEL_NAME = 'fusion-angle:data';
```

`web-app/app/adapters/session-refresh-mutex.ts`:

```ts
const REFRESH_CHANNEL = 'fusion-angle:refresh';
```

Leave `REFRESH_LOCK = 'fusion-refresh'` alone.

`web-app/identities/detail.html`:

```html
            <input class="input" id="reg-aud"
                placeholder="fusion-angle" />
```

`build` line that names the ZIP:

```bash
    SERVER_ZIP="${DEST_DIR}fusion-angle-server-${SHA}.zip"
```

`package-lock.json` top-level only:

```json
  "name": "fusion-angle",
```

Do not add a `name` field to `package.json`.

- [ ] **Step 4: Re-run identifier tests**

```bash
node --test --strip-types \
    tests/fusion-angle-identifiers.test.ts \
    tests/server-zip-metafile.test.ts \
    tests/access-token.test.ts \
    tests/adapters-client-registration.test.ts \
    tests/api-client-registration.test.ts \
    tests/client-assertion.test.ts \
    tests/derive-client-registration.test.ts \
    tests/presenter-identity-detail.test.ts \
    tests/api-authentication-token.test.ts \
    tests/page-performance.test.ts \
    tests/adapters-preferences.test.ts \
    tests/channels.test.ts \
    tests/adapters-refresh-mutex.test.ts
```

Expected: PASS. If a shadow-ledger file fails on
audience, it still has a leftover `fusion-ai-web`.

- [ ] **Step 5: Commit**

```bash
git add api/access-token.ts \
    web-app/app/storage-keys.ts \
    web-app/app/adapters/broadcast-channel.ts \
    web-app/app/adapters/session-refresh-mutex.ts \
    web-app/identities/detail.html \
    build package-lock.json \
    tests/fusion-angle-identifiers.test.ts \
    tests/server-zip-metafile.test.ts \
    tests/page-performance.test.ts \
    tests/adapters-preferences.test.ts \
    tests/channels.test.ts \
    tests/adapters-refresh-mutex.test.ts \
    tests/access-token.test.ts \
    tests/adapters-client-registration.test.ts \
    tests/api-client-registration.test.ts \
    tests/client-assertion.test.ts \
    tests/derive-client-registration.test.ts \
    tests/presenter-identity-detail.test.ts \
    tests/api-authentication-token.test.ts \
    tests/api-shadow-ledger-auth.test.ts \
    tests/api-shadow-ledger-tokens.test.ts
git commit -m "$(cat <<'EOF'
Rename live identifiers to fusion-angle
Co-Authored-By: Grok 4.6 <grok@x.ai>
EOF
)"
```

---

### Task 3: Mock-data labels

**Files:** listed in the File map (Mock-data labels).

Seeded flow **Fusion Flow** becomes **Fusion Angle
Flow**. Mentions follow. Seed id
`fSe02FusionFl0w0aActiv` stays. Pair count 1448
stays.

- [ ] **Step 1: Write the failing name pin**

Append to `tests/mock-data-flow-relations.test.ts`:

```ts
test('Fusion Angle Flow keeps its seed id', () => {
    const flow = buildFlows().find(
        (row) => row.name === 'Fusion Angle Flow',
    );
    assert.ok(flow, 'Fusion Angle Flow must exist');
    assert.equal(
        flow!.id,
        'E2BnBlZyrriqsQYkmS4usb',
    );
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --test --strip-types \
    tests/mock-data-flow-relations.test.ts
```

Expected: FAIL — `buildFlows()` still names
`Fusion Flow`.

- [ ] **Step 3: Rename the seed label and mentions**

`api/mock-data/flows.ts` (the row whose `id` is
`'E2BnBlZyrriqsQYkmS4usb'`):

```ts
            name: 'Fusion Angle Flow',
```

`api/mock-data/records.ts` Project Brief description:

```ts
                + ' the Fusion Angle Flow.',
```

`api/mock-data.ts` comment:

```ts
    // attributes referenced by Fusion Angle Flow's
```

`tests/drift-work-orders.test.ts` comment:

```ts
// (Fusion Angle Flow) carries none, the empty case
```

Do not change `fSe02FusionFl0w0aActiv`.

- [ ] **Step 4: Re-run the flow-relations pin**

```bash
node --test --strip-types \
    tests/mock-data-flow-relations.test.ts
```

Expected: PASS. Do not run the full mock-data pair
count unless this pin fails for an unexpected
reason; the pair count must remain 1448.

- [ ] **Step 5: Commit**

```bash
git add api/mock-data/flows.ts \
    api/mock-data/records.ts \
    api/mock-data.ts \
    tests/drift-work-orders.test.ts \
    tests/mock-data-flow-relations.test.ts
git commit -m "$(cat <<'EOF'
Rename Fusion Flow to Fusion Angle Flow
Co-Authored-By: Grok 4.6 <grok@x.ai>
EOF
)"
```

---

### Task 4: Mark and favicons

**Files:** listed in the File map (Mark).

Source: `~/Desktop/favicon.png` (1088×972, white
line art on opaque black, Display P3). Derive one
white-on-transparent PNG. Do not commit the black
tile. Light theme inverts via CSS. `favicon.svg` is
primary and inverts under `prefers-color-scheme:
light`. `favicon.ico` is a square, padded, dark-ink
transparent raster.

- [ ] **Step 1: Write the failing mark pin**

Create `tests/fusion-angle-mark.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    existsSync,
    readFileSync,
} from 'node:fs';

test('mark.png is committed under assets', () => {
    assert.equal(
        existsSync('web-app/assets/mark.png'),
        true,
    );
});

test('iconLogo is the PNG mark, not the atom',
() => {
    const src = readFileSync(
        'web-app/app/icons.ts',
        'utf8',
    );
    assert.match(src, /mark\.png/);
    assert.match(src, /brand-mark/);
    assert.doesNotMatch(src, /logo-orbital/);
    assert.doesNotMatch(src, /logo-nucleus/);
});

test('sidebars use the PNG mark', () => {
    for (const path of [
        'web-app/app/component-sidebar.html',
        'web-app/app/component-mobile-sidebar.html',
    ] as const) {
        const src = readFileSync(path, 'utf8');
        assert.match(src, /mark\.png/);
        assert.match(src, /brand-mark/);
        assert.doesNotMatch(src, /logo-orbital/);
        assert.doesNotMatch(src, /logo-nucleus/);
    }
});

test('brand CSS inverts the mark in light theme',
() => {
    const src = readFileSync(
        'web-app/app/styles/components-brand.css',
        'utf8',
    );
    assert.match(src, /\.brand-mark/);
    assert.match(src, /invert\(1\)/);
    assert.doesNotMatch(src, /logo-orbital/);
    assert.doesNotMatch(src, /logo-nucleus/);
});

test('favicon.svg embeds the PNG and inverts in light',
() => {
    const src = readFileSync(
        'web-app/assets/favicon.svg',
        'utf8',
    );
    assert.match(src, /mark\.png/);
    assert.match(
        src,
        /prefers-color-scheme:\s*light/,
    );
    assert.match(src, /invert\(1\)/);
    assert.doesNotMatch(src, /logo-orbital/);
    assert.doesNotMatch(src, /orbital/);
    assert.doesNotMatch(src, /nucleus/);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --test --strip-types \
    tests/fusion-angle-mark.test.ts
```

Expected: FAIL — `mark.png` missing; `iconLogo`
still draws orbitals.

- [ ] **Step 3: Derive `mark.png` and `favicon.ico`**

`~/Desktop/favicon.png` must exist. Do not add
Pillow, ImageMagick, or an in-repo derivation
script. Write a throwaway Swift file under `/tmp`
and run it from the repo root.

`/tmp/derive-fusion-angle-mark.swift`:

```swift
import AppKit
import Foundation

let srcPath = NSString(
    string: "~/Desktop/favicon.png"
).expandingTildeInPath
guard let srcImage = NSImage(
        contentsOf: URL(fileURLWithPath: srcPath)
    ),
    let cg = srcImage.cgImage(
        forProposedRect: nil,
        context: nil,
        hints: nil
    )
else {
    fputs("missing ~/Desktop/favicon.png\n",
        stderr)
    exit(1)
}

let width = cg.width
let height = cg.height
let stride = width * 4
var pixels = [UInt8](
    repeating: 0,
    count: height * stride
)
let space = CGColorSpaceCreateDeviceRGB()
let info = CGBitmapInfo.byteOrder32Big.rawValue
    | CGImageAlphaInfo.premultipliedLast.rawValue
guard let ctx = CGContext(
    data: &pixels,
    width: width,
    height: height,
    bitsPerComponent: 8,
    bytesPerRow: stride,
    space: space,
    bitmapInfo: info
) else { exit(2) }
ctx.draw(
    cg,
    in: CGRect(
        x: 0, y: 0,
        width: width, height: height
    )
)

for i in stride(from: 0, to: pixels.count, by: 4) {
    let luma = (
        UInt16(pixels[i])
        + UInt16(pixels[i + 1])
        + UInt16(pixels[i + 2])
    ) / 3
    if luma < 16 {
        pixels[i] = 0
        pixels[i + 1] = 0
        pixels[i + 2] = 0
        pixels[i + 3] = 0
    } else {
        pixels[i] = 255
        pixels[i + 1] = 255
        pixels[i + 2] = 255
        pixels[i + 3] = UInt8(luma)
    }
}

func png(
    pixels: [UInt8],
    width: Int,
    height: Int
) -> Data? {
    var pix = pixels
    let space = CGColorSpaceCreateDeviceRGB()
    let info = CGBitmapInfo.byteOrder32Big.rawValue
        | CGImageAlphaInfo.premultipliedLast
            .rawValue
    guard let image = CGContext(
        data: &pix,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: space,
        bitmapInfo: info
    )?.makeImage() else { return nil }
    let rep = NSBitmapImageRep(cgImage: image)
    return rep.representation(
        using: .png,
        properties: [:]
    )
}

guard let mark = png(
    pixels: pixels,
    width: width,
    height: height
) else { exit(3) }
try mark.write(
    to: URL(fileURLWithPath: "web-app/assets/mark.png")
)

let side = max(width, height)
let padX = (side - width) / 2
let padY = (side - height) / 2
var square = [UInt8](
    repeating: 0,
    count: side * side * 4
)
for y in 0..<height {
    for x in 0..<width {
        let s = (y * width + x) * 4
        let d = ((y + padY) * side + (x + padX)) * 4
        square[d] = 255 - pixels[s]
        square[d + 1] = 255 - pixels[s + 1]
        square[d + 2] = 255 - pixels[s + 2]
        square[d + 3] = pixels[s + 3]
    }
}

guard let ink = png(
    pixels: square,
    width: side,
    height: side
) else { exit(4) }
guard let inkImage = NSImage(data: ink) else {
    exit(5)
}
let box = NSSize(width: 32, height: 32)
let scaled = NSImage(size: box)
scaled.lockFocus()
inkImage.draw(
    in: NSRect(origin: .zero, size: box),
    from: .zero,
    operation: .copy,
    fraction: 1
)
scaled.unlockFocus()
guard let tiff = scaled.tiffRepresentation,
    let rep = NSBitmapImageRep(data: tiff),
    let smallPng = rep.representation(
        using: .png,
        properties: [:]
    )
else { exit(6) }

func ico(png: Data) -> Data {
    var data = Data()
    data.append(contentsOf: [0, 0, 1, 0, 1, 0])
    data.append(32)
    data.append(32)
    data.append(0)
    data.append(0)
    data.append(contentsOf: [1, 0])
    data.append(contentsOf: [32, 0])
    var size = UInt32(png.count).littleEndian
    var offset = UInt32(22).littleEndian
    withUnsafeBytes(of: &size) { data.append(contentsOf: $0) }
    withUnsafeBytes(of: &offset) { data.append(contentsOf: $0) }
    data.append(png)
    return data
}

try ico(png: smallPng).write(
    to: URL(fileURLWithPath:
        "web-app/assets/favicon.ico")
)
```

Run:

```bash
swift /tmp/derive-fusion-angle-mark.swift
```

Expected: `web-app/assets/mark.png` and a rewritten
`web-app/assets/favicon.ico`. Delete the `/tmp`
script after. Do not add it to the repo.

- [ ] **Step 4: Rewrite `favicon.svg`**

Replace `web-app/assets/favicon.svg` in full:

```svg
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 32 32" width="32" height="32">
  <!--
    Standalone favicon: sibling mark.png, outside the
    app CSS cascade. Light OS chrome inverts the
    white-on-transparent mark to dark ink.
  -->
  <style>
    @media (prefers-color-scheme: light) {
      image { filter: invert(1); }
    }
  </style>
  <image href="mark.png" width="32" height="32"
         preserveAspectRatio="xMidYMid meet"/>
</svg>
```

- [ ] **Step 5: Replace `iconLogo` and brand CSS**

`web-app/app/icons.ts` — replace only `iconLogo`:

```ts
export function iconLogo(size: IconSize, cssClass: string) {
    const extra = cssClass === ''
        ? ''
        : ' ' + cssClass;
    return new SafeHtml(
        '<img src="../assets/mark.png"'
        + ` width="${size}" height="${size}"`
        + ` class="brand-mark${extra}"`
        + ' alt="" />',
    );
}
```

Replace `web-app/app/styles/components-brand.css` in
full (this file is already concatenated into
`styles.css` via `components-*.css`):

```css
/* Product mark: white-on-transparent PNG.
   Light theme (no data-theme=dark) inverts to ink. */
.brand-mark {
    display: block;
    object-fit: contain;
}

html:not([data-theme="dark"]) .brand-mark {
    filter: invert(1);
}
```

Do not use inline `style=`. Theme-init only sets
`data-theme="dark"` when dark, so light / system-light
have no attribute — `:not([data-theme="dark"])` is
the light path.

In `web-app/app/component-sidebar.html` and
`web-app/app/component-mobile-sidebar.html`, replace
the inner `<svg>…</svg>` (orbitals + nucleus) with:

```html
<img
    src="../assets/mark.png"
    width="28"
    height="28"
    class="brand-mark"
    alt=""
/>
```

Keep the wrapping `sidebar-logo-icon` div. Wordmark
text is already Fusion Angle from Task 1.

Landing and auth already call `iconLogo` — they pick
up the PNG without further edits.

- [ ] **Step 6: Re-run the mark pin**

```bash
node --test --strip-types \
    tests/fusion-angle-mark.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web-app/assets/mark.png \
    web-app/assets/favicon.svg \
    web-app/assets/favicon.ico \
    web-app/app/icons.ts \
    web-app/app/styles/components-brand.css \
    web-app/app/component-sidebar.html \
    web-app/app/component-mobile-sidebar.html \
    tests/fusion-angle-mark.test.ts
git commit -m "$(cat <<'EOF'
Replace the orbital mark with the angle
Co-Authored-By: Grok 4.6 <grok@x.ai>
EOF
)"
```

---

### Task 5: Current docs

**Files:** listed in the File map (Current docs).

Update live documentation only. Do not rewrite
`docs/superpowers/specs/` or
`docs/superpowers/plans/`. TEST-PLAN.md is exempt
from the 78-character gate; the other root `.md`
files are not.

- [ ] **Step 1: List remaining live doc hits**

```bash
rg -n 'Fusion AI|fusion-ai' \
    README.md CLAUDE.md TEST-PLAN.md \
    ARCHITECTURE.md DESIGN-SYSTEM.md \
    SCHEMA.md API.md AUDIT.md
```

Expected: hits only in those eight files (plus none
in the Task 1–4 product files). Dated specs/plans
will also match if you widen the search — leave
them.

- [ ] **Step 2: Apply the substitutions**

`README.md`:

- `# Fusion AI` → `# Fusion Angle`
- `` `fusion-ai-server-${SHA}.zip` `` →
  `` `fusion-angle-server-${SHA}.zip` ``
- `cd fusion-ai` → `cd fusion-angle`

`CLAUDE.md`:

- `` `fusion-ai-server-${SHA}.zip` `` (Architecture
  and Build sections) →
  `` `fusion-angle-server-${SHA}.zip` ``
- `` (`fusion-ai:data`) `` →
  `` (`fusion-angle:data`) ``

`DESIGN-SYSTEM.md`:

- `# Fusion AI Design System` →
  `# Fusion Angle Design System`

`ARCHITECTURE.md`:

- `fusion-ai-server-${SHA}.zip` (both mentions) →
  `fusion-angle-server-${SHA}.zip`
- `` `fusion-ai:active-organization-id` `` →
  `` `fusion-angle:active-organization-id` ``

`SCHEMA.md`:

- `` `fusion-ai` database `` →
  `` `fusion-angle` database ``
- `` `fusion-ai:tableName` `` →
  `` `fusion-angle:tableName` ``

`API.md`:

- `` `fusion-ai:authorization` `` →
  `` `fusion-angle:authorization` ``

`AUDIT.md`:

- `You audit the fusion-ai repository` →
  `You audit the fusion-angle repository`

`TEST-PLAN.md` (long lines stay long):

- `# Fusion AI — Test Plan` →
  `# Fusion Angle — Test Plan`
- `/Users/tmornini/code/fusion-ai/CLAUDE.md` →
  `/Users/tmornini/code/fusion-angle/CLAUDE.md`
- every `fusion-ai-server-${SHA}.zip` →
  `fusion-angle-server-${SHA}.zip`
- `fusion-ai:authorization` →
  `fusion-angle:authorization`
- `fusion-ai:active-organization-id` →
  `fusion-angle:active-organization-id`
- `` `fusion-ai` IDB connections `` →
  `` `fusion-angle` IDB connections ``
  (historical IDB sentence in a current doc;
  the spec still updates the identifier)
- `fusion-ai-web` in G47 → `fusion-angle`
- `fusion-ai:theme` → `fusion-angle:theme`
- `fusion-ai:sidebar-collapsed` →
  `fusion-angle:sidebar-collapsed`
- `fusion-ai:data` → `fusion-angle:data`

Do not change `fSe02FusionFl0w0aActiv` if it appears.
Do not enable a new browser ZIP.

- [ ] **Step 3: Re-scan the eight files**

```bash
rg -n 'Fusion AI|fusion-ai-web|fusion-ai-server' \
    README.md CLAUDE.md TEST-PLAN.md \
    ARCHITECTURE.md DESIGN-SYSTEM.md \
    SCHEMA.md API.md AUDIT.md
```

Expected: no matches. A search for `fusion-ai`
in those files must also be empty except any
remaining historical phrase you intentionally
updated above.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md TEST-PLAN.md \
    ARCHITECTURE.md DESIGN-SYSTEM.md \
    SCHEMA.md API.md AUDIT.md
git commit -m "$(cat <<'EOF'
Update current docs to Fusion Angle
Co-Authored-By: Grok 4.6 <grok@x.ai>
EOF
)"
```

---

### Task 6: Live-name sweep pin and validate

**Files:** Create
`tests/fusion-angle-live-name.test.ts`.

This is the spec's "search after the sweep." It
walks live trees only. It must not read
`docs/superpowers/specs/` or
`docs/superpowers/plans/`.

- [ ] **Step 1: Write the sweep test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    readdirSync,
    readFileSync,
    statSync,
} from 'node:fs';
import { join } from 'node:path';

const SKIP_DIRS = new Set([
    'node_modules',
    '.git',
]);

const ROOT_FILES = [
    'README.md',
    'CLAUDE.md',
    'TEST-PLAN.md',
    'ARCHITECTURE.md',
    'DESIGN-SYSTEM.md',
    'SCHEMA.md',
    'API.md',
    'AUDIT.md',
    'build',
    'serve',
    'validate',
    'test',
    'measure',
    'package-lock.json',
    'wipe-render-postgres',
    'generate-schema-svg',
    'generate-api-documentation',
] as const;

const TREES = [
    'api',
    'web-app',
    'tests',
    'shared',
    'server',
] as const;

function walk(dir: string, out: string[]): void {
    for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) {
            continue;
        }
        const path = join(dir, name);
        const st = statSync(path);
        if (st.isDirectory()) {
            walk(path, out);
        } else {
            out.push(path);
        }
    }
}

function hitsIn(path: string): string[] {
    // Pin files name the old strings as the
    // forbidden covenant. They are not live
    // product identifiers.
    if (path.includes('tests/fusion-angle-')) {
        return [];
    }
    const buf = readFileSync(path);
    if (buf.includes(0)) {
        return [];
    }
    const src = buf.toString('utf8').replaceAll(
        'fusion-ai-browser',
        '',
    );
    const hits: string[] = [];
    if (src.includes('Fusion AI')) {
        hits.push(path + ': Fusion AI');
    }
    if (src.includes('fusion-ai')) {
        hits.push(path + ': fusion-ai');
    }
    return hits;
}

test('no live Fusion AI or fusion-ai remains',
() => {
    const files = [...ROOT_FILES];
    for (const tree of TREES) {
        walk(tree, files);
    }
    const hits = files.flatMap(hitsIn);
    assert.deepEqual(hits, []);
});
```

Binary skip (`buf.includes(0)`) keeps
`mark.png` / `favicon.ico` / fonts out of the
string hunt. `fusion-ai-browser` is stripped so
the ZIP pin may keep that forbidden name.

- [ ] **Step 2: Run the sweep**

```bash
node --test --strip-types \
    tests/fusion-angle-live-name.test.ts
```

Expected: PASS. If it fails, the leftover is a
Task 1–5 miss — fix it in this task only if it
is a live `Fusion AI` / `fusion-ai` the earlier
tasks named. Do not "fix" dated specs or the
seed id.

- [ ] **Step 3: Run `./validate`**

```bash
./validate
```

Expected: type-check, both test passes, 78-char
lint, no `org` abbreviation hits, schema SVG
check, API docs check — all green.

- [ ] **Step 4: Commit the pin**

```bash
git add tests/fusion-angle-live-name.test.ts
git commit -m "$(cat <<'EOF'
Pin the Fusion Angle live-name sweep
Co-Authored-By: Grok 4.6 <grok@x.ai>
EOF
)"
```

If Step 2 forced extra production fixes, include
those files in this commit only when they are
leftover live-name hits. Prefer amending the
owning task's commit if it has not been pushed.

- [ ] **Step 5: Re-run `./validate` on the clean tree**

```bash
./validate
```

Expected: PASS.

---

### Task 7: Browser verification (orchestrator)

No commit. Requires `POSTGRES_URL` and
`JWT_HMAC_SIGNING_KEY`. `./serve` requires a
clean tree (Tasks 1–6 committed).

- [ ] **Step 1: Serve**

```bash
export POSTGRES_URL=…
export JWT_HMAC_SIGNING_KEY=…
./serve 8080
```

If the database is empty, stop and start
`node server.mjs --seed-mock-data` from the
`--no-zip` build dir instead (same env). Open
`http://localhost:8080/landing/index.html`.

If the env is absent, stop and report what
could not be verified. Do not invent
credentials.

- [ ] **Step 2: Landing**

Confirm the tab title is Fusion Angle, the
navbar and footer wordmarks say Fusion Angle,
and the mark is the triangle (not orbitals).

- [ ] **Step 3: Auth**

Open the sign-in page. Wordmark Fusion Angle.
Mark present on the blue panel and the mobile
logo.

- [ ] **Step 4: App chrome**

Sign in. Sidebar wordmark Fusion Angle. Open a
titled app page (Dashboard). Document title
ends with `| Fusion Angle`. Mobile header says
Fusion Angle.

- [ ] **Step 5: Theme invert**

Set light theme: the mark is dark ink. Set dark
theme: the mark is white. No invert in dark.
Reload: theme persists under
`localStorage['fusion-angle:theme']`. Confirm
`fusion-ai:theme` is not written.

- [ ] **Step 6: Favicon**

Tab icon follows `favicon.svg`. Flip the OS
color scheme if the browser tools allow it:
light OS inverts the SVG mark; dark OS does
not.

- [ ] **Step 7: Hunt regressions**

Landing CTA / hero still read Fusion Angle.
Design-system page heading is Fusion Angle
Design System; the sample card is Fusion Angle
Card. Client-registration audience placeholder
is `fusion-angle`.

If any of this fails, dispatch a fix implementer
against the owning task. Re-verify.

---

### Task 8: GitHub, Render, local checkout

Do this only after Tasks 1–6 are on local
`master` and `./validate` is green. Do not
redeploy Render. Do not create a new service.

- [ ] **Step 1: Rename the GitHub repository**

```bash
gh repo rename fusion-angle --yes
```

Expected: GitHub path is
`tmornini/fusion-angle`. GitHub serves a
redirect from `tmornini/fusion-ai`.

- [ ] **Step 2: Point origin at the new URL**

```bash
git remote set-url origin \
    git@github.com:tmornini/fusion-angle.git
git remote -v
```

Expected: fetch and push both show
`tmornini/fusion-angle.git`.

- [ ] **Step 3: Push master**

```bash
git push origin master
```

Expected: fast-forward. Do not force-push.

- [ ] **Step 4: Point Render at the new repo**

```bash
render services update srv-da0vkntbedkc73bn3i70 \
    --repo https://github.com/tmornini/fusion-angle \
    --output json --confirm
```

Then:

```bash
render services
```

Expected: that service's repo is
`https://github.com/tmornini/fusion-angle`.
No deploy starts as part of this step. Auto-deploy
stays off. Keep
`https://fusion-ai-f740.onrender.com`. Custom
domains `fusionangle.ai` and `fusionangle.com`
stay.

- [ ] **Step 5: Rename the local checkout (human)**

Do **not** `mv` the workspace from inside a live
agent session. After the session ends:

```bash
mv /Users/tmornini/code/fusion-ai \
    /Users/tmornini/code/fusion-angle
cd /Users/tmornini/code/fusion-angle
```

The next human deploy builds the renamed repo
and serves Fusion Angle at the custom domains.
`JWT_HMAC_SIGNING_KEY` and `POSTGRES_URL` stay.

---

## Self-review (author)

**Spec coverage**

| Spec requirement | Task |
|---|---|
| Visible Fusion AI → Fusion Angle | 1 |
| Fusion Card → Fusion Angle Card | 1 |
| Storage keys `fusion-angle:…` | 2 |
| Channels `fusion-angle:data` / `:refresh` | 2 |
| JWT audience `fusion-angle` | 2 |
| ZIP `fusion-angle-server-${SHA}.zip` | 2 |
| `package-lock.json` name | 2 |
| No `fusion-angle-web` / browser ZIP | 2, 6 |
| `fusion-ai-browser` pin stays absent | 2, 6 |
| Fusion Angle Flow; seed id stays | 3 |
| One transparent PNG + CSS invert | 4 |
| `favicon.svg` + dark-ink ICO | 4 |
| Remove orbitals / nucleus | 4 |
| Current docs; dated specs stay | 5 |
| Sweep finds no live old name | 6 |
| `./validate` | 6 |
| Browser landing / auth / sidebar / theme | 7 |
| GitHub, origin, Render, checkout | 8 |
| No migration; no deploy; keep onrender | 8 + Do not touch |

**Placeholder scan:** no TBD, no "handle edge
cases", no "similar to Task N" without the
code, no untyped steps.

**Name consistency:** audience `fusion-angle`,
prefix `fusion-angle:`, ZIP
`fusion-angle-server-${SHA}.zip`, asset
`mark.png`, class `brand-mark`.
