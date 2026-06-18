# Close the http-message named deferrals — Arc 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four named deferrals in `api/http-message/` (RFC 850 +
asctime dates, gzip/deflate content-decode with a `br` seam, form/text body
codecs, structured-field byte-sequences + inner-lists) and fold in the RFC
8941→9651 bump (sf-date + Display Strings), completing the library as a
fully-tested, gate-green **buffered** HTTP primitive.

**Architecture:** Vanilla TypeScript, zero runtime dependencies, platform
primitives only. The library stays **un-wired** into any production code path
(its real callers arrive with the Postgres server tier). Async appears at
exactly one place — the buffered content-decode siblings — because
`DecompressionStream` is genuine stream I/O; every pure path (query, decode,
canonical-JSON, date parse) stays synchronous. The existing hardened sync API
and its tests are behavior-preserved.

**Tech Stack:** TypeScript ES2024 (strict, `noUncheckedIndexedAccess`),
`node:test` + `node:assert` via `node --test --strip-types`, platform
`DecompressionStream`/`CompressionStream`/`URLSearchParams`/`TextDecoder`.

## Context

`api/http-message/` is a complete, adversarially-reviewed, gate-green HTTP
message library — a tri-directional transform (TS ↔ wire ↔ JSON) imported
**only** by `tests/`. Four capabilities were deferred "until a caller needs
them," each carrying a deferral comment. The caller has elected to close all
four now, treating the library as a complete HTTP primitive measured against
the RFCs rather than against a single live caller — a deliberate, approved
exception to the premature-generalization rule (a library's completeness
contract is the specification, not one consumer). Folded into deferral 4 is a
deliberate spec-version upgrade: RFC 8941 → its successor RFC 9651, adding
sf-date (`@int`) and Display Strings (`%"…"`).

This is **Arc 1 of two**. The streaming/async I/O model (`toWireStream`,
incremental `fromWireStream`, `TransformStream` content-coding, the
materialized-vs-streaming proxy body union) is **Arc 2** — a separate later
spec, explicitly out of scope. Arc 1 only chooses forward-compatible surfaces;
it builds **no** streaming machinery.

Design of record (committed on `master` as `57803063`):
`docs/superpowers/specs/2026-06-17-http-message-deferrals-design.md`.

> **Plan-mode / commit note.** This plan was authored under plan mode, which
> permits writing only this file. On approval, persist this plan verbatim to
> `docs/superpowers/plans/2026-06-17-http-message-deferrals.md` and commit it
> (`Add the http-message Arc 1 implementation plan`) before execution begins.

## Global Constraints

Every task implicitly includes these. Values are copied verbatim from the spec
and CLAUDE.md.

- **Library stays un-wired.** Do not import `api/http-message/` from any
  production code path. Tests are the only consumers.
- **Async only at the content-decode edge.** Add async *siblings*; leave every
  existing sync path exactly as the security review left it (still throwing
  loudly on an encoded body). No `Promise` wrapping of pure CPU work.
- **`br` is an injectable seam, never built in.** `new
  DecompressionStream('br')` throws on the platform. Default ships gzip +
  deflate only; a caller injects `br`. Do **not** vendor or hand-roll Brotli.
- **Re-derive anchors by SYMBOL, never line number.** Another session commits
  to `master` concurrently. Locate every edit by symbol name; re-check `HEAD`
  before each commit.
- **Voice.** 78-char max line length (`.ts` enforced by `./validate`); 4-space
  indent; no untyped `any` at boundaries (narrow with explicit guards);
  snake_case storage / camelCase domain; validate at the gate, trust within
  the walls; HTTP-verb adapter naming. All parse/contract violations throw
  `HttpMessageError` (from `./types.ts`).
- **Gate.** `./validate` (= `tsc --noEmit` + the full `node --test` suite, UTC
  + the `tests/tz/` Honolulu suite + the 78-char lint + the schema-svg check)
  is green before AND after every commit. In the sandbox, prefix runs with
  `TMPDIR=/tmp/claude`.
- **Commits.** One concern each; present-tense imperative subject ≈50 chars; no
  prose body; **no plan tag in the subject** (the spec carries none). Trailer
  on every commit:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
  Never mix a rename/extraction with a content change in one commit. Linear
  history — rebase and fast-forward, never merge.

## Sequencing (one deferral at a time, ascending ripple)

The type-model change lands last on a stable base. 12 tasks, each its own
commit, green at every step:

| # | Deferral | Task(s) |
| - | -------- | ------- |
| 1 | RFC 850 + asctime dates (+ `reference`) | Task 1 |
| 2 | `kind` marker → form/text codecs → register | Tasks 2, 3, 4 |
| 3 | content-coding registry + async `Body` siblings | Tasks 5, 6, 7 |
| 4 | SF byte-seq → sf-date → display-string → inner-list → re-cite | Tasks 8–12 |

## File Structure

Files **created**:

- `api/http-message/content-coding.ts` — `ContentCodec`,
  `ContentCodingRegistry`, gzip/deflate codecs,
  `defaultContentCodingRegistry()`. One responsibility: content-coding
  (`Content-Encoding`) decode, mirroring `media-registry.ts`'s shape.
- `tests/http-content-encoding.test.ts` — gzip/deflate round-trip (compress
  in-test via `CompressionStream`), `br` registry-miss, injected `br`, and the
  async `Body` decode integration.

Files **modified** (each by symbol anchor):

- `api/http-message/http-date.ts` — three-format parse + `reference`.
- `api/http-message/media-registry.ts` — `kind` marker; form/text codecs;
  register them.
- `api/http-message/json-codec.ts` — JSON-specific inline discriminator.
- `api/http-message/body.ts` — extract `#decodeByType`; carry the coding
  registry; async decode siblings.
- `api/http-message/http-message.ts` — carry + thread the coding registry.
- `api/http-message/structured-fields.ts` — byte-seq, sf-date, display
  strings, inner-lists; widened `BareValue`/`SfItem.value`; re-cite 9651.
- `api/http-message/field-value.ts` — widen `Leaf`; `toBytes`/`toBase64`;
  Date leaf in `toDate`; `toText` guard.
- `api/http-message/query.ts` — `leaf()` projection; inner-list indexing.
- `api/http-message/field-registry.ts` — re-cite 9651 (comment only).
- `tests/tz/http-date.test.ts`, `tests/http-body.test.ts`,
  `tests/http-query.test.ts`, `tests/http-field-value.test.ts` — extended.

Reusable primitives already present (do **not** re-create):
`Octets.fromBase64`/`toBase64`/`fromLatin1`/`toLatin1`/`fromBytes`/`asBytes`
(`octets.ts`); `decodeUtf8`/`encodeUtf8` module helpers (`media-registry.ts`);
the `new Blob([bytes]).stream().pipeThrough(new DecompressionStream(...))` →
`new Response(stream)` collect idiom (`api/backend-localstorage.ts:38-41`);
`Cursor` with `peek`/`next`/`expect`/`skipOws`/`atEnd` and the
`isDigit`/`isAlpha`/`isLcAlpha` predicates (`structured-fields.ts`).

---

### Task 1: RFC 850 + asctime HTTP-date parsing

**Files:**
- Modify: `api/http-message/http-date.ts` (`parseHttpDate`, `IMF_FIXDATE`,
  `MONTHS`)
- Test: `tests/tz/http-date.test.ts` (runs under `TZ=Pacific/Honolulu`)

**Interfaces:**
- Produces: `parseHttpDate(text: string, reference?: Date): Date` — `reference`
  defaults to `new Date()`; only the RFC 850 two-digit year consults it.
  `FieldValue.toDate()` calls `parseHttpDate(value)` with no reference
  (reads now) — unchanged.

- [ ] **Step 1: Write the failing tests.** Add to `tests/tz/http-date.test.ts`
  (extend the imports with `parseHttpDate` and `HttpMessageError`):

```typescript
import { parseHttpDate } from '../../api/http-message/http-date.ts';
import { HttpMessageError } from '../../api/http-message/types.ts';

test('parses an RFC 850 date with the 50-year window', () => {
    const reference = new Date(Date.UTC(2026, 0, 1));
    const date = parseHttpDate(
        'Sunday, 06-Nov-94 08:49:37 GMT', reference,
    );
    assert.equal(
        date.getTime(), Date.UTC(1994, 10, 6, 8, 49, 37),
    );
});

test('RFC 850 two-digit year resolves into this century', () => {
    const reference = new Date(Date.UTC(2026, 0, 1));
    const date = parseHttpDate(
        'Tuesday, 06-Nov-29 00:00:00 GMT', reference,
    );
    assert.equal(date.getUTCFullYear(), 2029);
});

test('parses an asctime date with a space-padded day', () => {
    const date = parseHttpDate('Sun Nov  6 08:49:37 1994');
    assert.equal(
        date.getTime(), Date.UTC(1994, 10, 6, 8, 49, 37),
    );
});

test('rejects a non-HTTP-date', () => {
    assert.throws(
        () => parseHttpDate('not a date'),
        HttpMessageError,
    );
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `TZ=Pacific/Honolulu node --test --strip-types tests/tz/http-date.test.ts`
Expected: FAIL — RFC 850 / asctime inputs throw `not an HTTP-date` (only
IMF-fixdate is parsed today); the `reference` arg is also a type error.

- [ ] **Step 3: Implement the three-format parser.** Replace the deferral
  comment + `parseHttpDate` in `http-date.ts`. Add `RFC850_DATE`,
  `ASCTIME_DATE`, and the `fromParts` / `resolveTwoDigitYear` helpers (the
  three-format trigger is exactly what licenses extracting `fromParts` — three
  is pattern, Generality IX):

```typescript
const IMF_FIXDATE = new RegExp(
    '^[A-Za-z]{3}, (\\d{2}) ([A-Za-z]{3}) (\\d{4}) '
    + '(\\d{2}):(\\d{2}):(\\d{2}) GMT$',
);

const RFC850_DATE = new RegExp(
    '^[A-Za-z]+, (\\d{2})-([A-Za-z]{3})-(\\d{2}) '
    + '(\\d{2}):(\\d{2}):(\\d{2}) GMT$',
);

const ASCTIME_DATE = new RegExp(
    '^[A-Za-z]{3} ([A-Za-z]{3}) ([ \\d]\\d) '
    + '(\\d{2}):(\\d{2}):(\\d{2}) (\\d{4})$',
);

// Three HTTP-date formats (RFC 9110 §5.6.7): IMF-fixdate (the
// only one a sender may generate) plus the two obsolete formats
// a recipient must accept. Each resolves to an absolute instant
// via Date.UTC, so the result never depends on host timezone.
// Only the RFC 850 two-digit year is relative to a reference.
export function parseHttpDate(
    text: string,
    reference: Date = new Date(),
): Date {
    const imf = IMF_FIXDATE.exec(text);
    if (imf !== null) {
        return fromParts(
            imf[3]!, imf[2]!, imf[1]!,
            imf[4]!, imf[5]!, imf[6]!,
        );
    }
    const rfc850 = RFC850_DATE.exec(text);
    if (rfc850 !== null) {
        const year = resolveTwoDigitYear(rfc850[3]!, reference);
        return fromParts(
            String(year), rfc850[2]!, rfc850[1]!,
            rfc850[4]!, rfc850[5]!, rfc850[6]!,
        );
    }
    const asc = ASCTIME_DATE.exec(text);
    if (asc !== null) {
        return fromParts(
            asc[6]!, asc[1]!, asc[2]!,
            asc[3]!, asc[4]!, asc[5]!,
        );
    }
    throw new HttpMessageError('not an HTTP-date: ' + text);
}

function fromParts(
    year: string, monthName: string, day: string,
    hour: string, minute: string, second: string,
): Date {
    const month = MONTHS[monthName];
    if (month === undefined) {
        throw new HttpMessageError('invalid month: ' + monthName);
    }
    return new Date(Date.UTC(
        Number(year), month, Number(day),
        Number(hour), Number(minute), Number(second),
    ));
}

// A 2-digit year more than 50 years ahead of the reference is
// the most recent past year with those digits (RFC 9110 §5.6.7).
function resolveTwoDigitYear(
    yy: string, reference: Date,
): number {
    const base =
        Math.floor(reference.getUTCFullYear() / 100) * 100;
    const year = base + Number(yy);
    return year > reference.getUTCFullYear() + 50
        ? year - 100
        : year;
}
```

`MONTHS` is unchanged. `Number(' 6')` yields `6`, so the space-padded asctime
day needs no trimming.

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `TZ=Pacific/Honolulu node --test --strip-types tests/tz/http-date.test.ts`
Expected: PASS (all four new tests + the existing IMF-fixdate test).

- [ ] **Step 5: Gate.**

Run: `TMPDIR=/tmp/claude ./validate`
Expected: green.

- [ ] **Step 6: Commit** (re-check `HEAD` first).

```bash
git add api/http-message/http-date.ts tests/tz/http-date.test.ts
git commit -m "Parse RFC 850 and asctime HTTP-dates"
```

---

### Task 2: JSON-specific inline discriminator (the `kind` marker)

**Files:**
- Modify: `api/http-message/media-registry.ts` (`BodyCodec`, `jsonBodyCodec`)
- Modify: `api/http-message/json-codec.ts` (`jsonCodecFor`)
- Test: `tests/http-body.test.ts`

**Interfaces:**
- Produces: `BodyCodec.kind: 'json' | 'other'` — every codec declares whether
  it is the JSON codec. `jsonCodecFor` now returns a codec only when
  `codec.kind === 'json'`, so the inline-vs-base64 discriminator is
  JSON-specific. Consumed by Tasks 3 (codecs declare `kind`) and 4.

- [ ] **Step 1: Add the `kind` field (setup the deliverable needs).** In
  `media-registry.ts`, add the field to the interface and the JSON codec:

```typescript
export interface BodyCodec {
    readonly kind: 'json' | 'other';
    handles(mediaType: string): boolean;
    decode(body: Octets): unknown;
    encode(value: unknown): Octets;
}
```

In `jsonBodyCodec`, add `kind: 'json',` as the first member.

- [ ] **Step 2: Write the failing test.** Add to `tests/http-body.test.ts`
  (import `BodyRegistry` alongside the existing imports). This proves the
  discriminator is JSON-specific by registering a non-JSON codec over bytes
  that *happen* to be valid JSON:

```typescript
import { BodyRegistry } from '../api/http-message/media-registry.ts';

const thingCodec = {
    kind: 'other' as const,
    handles: (t: string) => t === 'application/x-thing',
    decode: (b: Octets): unknown => b.toLatin1(),
    encode: (v: unknown): Octets =>
        Octets.fromLatin1(String(v)),
};

test('a non-JSON codec body is not inlined as JSON', () => {
    const registry = new BodyRegistry([thingCodec]);
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'content-type: application/x-thing\r\n\r\n{"a":1}',
        registry,
    );
    const body = JSON.parse(message.toJson()).body;
    assert.equal(typeof body, 'string');
});
```

(Import `Octets` from `../api/http-message/octets.ts` if not already imported.)

- [ ] **Step 3: Run it to verify it fails.**

Run: `TZ=UTC node --test --strip-types tests/http-body.test.ts`
Expected: FAIL — today `jsonCodecFor` finds the `x-thing` codec (kind ignored),
JSON-parses `{"a":1}` to a non-string value, and **inlines** it, so `body` is
an object, not a string.

- [ ] **Step 4: Make `jsonCodecFor` JSON-specific.** In `json-codec.ts`:

```typescript
function jsonCodecFor(
    fields: readonly FieldLine[],
    registry: BodyRegistry,
): BodyCodec | undefined {
    const type = fields.find(
        (field) => field.name === 'content-type',
    );
    if (type === undefined) return undefined;
    const codec = registry.codecFor(type.value);
    return codec !== undefined && codec.kind === 'json'
        ? codec
        : undefined;
}
```

- [ ] **Step 5: Run tests to verify they pass.**

Run: `TZ=UTC node --test --strip-types tests/http-body.test.ts`
Then: `TZ=UTC node --test --strip-types tests/http-json-body.test.ts`
Expected: PASS (the new test + all existing JSON-inline regressions unchanged —
only the JSON codec is registered by default, so behavior is preserved).

- [ ] **Step 6: Gate + commit** (re-check `HEAD`).

```bash
TMPDIR=/tmp/claude ./validate
git add api/http-message/media-registry.ts \
        api/http-message/json-codec.ts tests/http-body.test.ts
git commit -m "Make the inline body discriminator JSON-specific"
```

---

### Task 3: form-urlencoded + text/plain body codecs

**Files:**
- Modify: `api/http-message/media-registry.ts` (add `formBodyCodec`,
  `textBodyCodec`, `toFormParams`; export the codecs)
- Test: `tests/http-body.test.ts`

**Interfaces:**
- Produces: `formBodyCodec: BodyCodec` (`application/x-www-form-urlencoded`,
  `kind: 'other'`) and `textBodyCodec: BodyCodec` (`text/plain`,
  `kind: 'other'`). Not yet registered (Task 4 registers them). Reuses the
  existing module helpers `decodeUtf8` / `encodeUtf8`.

- [ ] **Step 1: Write the failing tests.** Add to `tests/http-body.test.ts`
  (import `formBodyCodec`, `textBodyCodec` from media-registry):

```typescript
test('form codec decodes urlencoded to an object', () => {
    assert.deepEqual(
        formBodyCodec.decode(Octets.fromLatin1('a=1&b=two')),
        { a: '1', b: 'two' },
    );
});

test('form codec keeps the last value on duplicate keys', () => {
    assert.deepEqual(
        formBodyCodec.decode(Octets.fromLatin1('a=1&a=2')),
        { a: '2' },
    );
});

test('form codec encodes an object to urlencoded', () => {
    const octets = formBodyCodec.encode({ a: '1', b: 'two' });
    assert.equal(octets.toLatin1(), 'a=1&b=two');
});

test('form codec rejects a non-string field', () => {
    assert.throws(
        () => formBodyCodec.encode({ a: 1 }),
        HttpMessageError,
    );
});

test('text codec round-trips UTF-8', () => {
    const octets = textBodyCodec.encode('café');
    assert.equal(textBodyCodec.decode(octets), 'café');
});
```

(`HttpMessageError` is already imported in this file.)

- [ ] **Step 2: Run to verify they fail.**

Run: `TZ=UTC node --test --strip-types tests/http-body.test.ts`
Expected: FAIL — `formBodyCodec` / `textBodyCodec` are not exported.

- [ ] **Step 3: Implement the codecs.** Add to `media-registry.ts` (before
  `defaultBodyRegistry`). Reuse the existing `decodeUtf8` / `encodeUtf8`
  helpers already defined at the bottom of the file:

```typescript
// application/x-www-form-urlencoded. URLSearchParams is the
// platform primitive; Object.fromEntries collapses duplicate
// keys last-value-wins (the platform default).
export const formBodyCodec: BodyCodec = {
    kind: 'other',
    handles(mediaType: string): boolean {
        const base = mediaType.split(';')[0]!.trim()
            .toLowerCase();
        return base === 'application/x-www-form-urlencoded';
    },
    decode(body: Octets): unknown {
        return Object.fromEntries(
            new URLSearchParams(decodeUtf8(body)),
        );
    },
    encode(value: unknown): Octets {
        return encodeUtf8(toFormParams(value).toString());
    },
};

export const textBodyCodec: BodyCodec = {
    kind: 'other',
    handles(mediaType: string): boolean {
        const base = mediaType.split(';')[0]!.trim()
            .toLowerCase();
        return base === 'text/plain';
    },
    decode(body: Octets): unknown {
        return decodeUtf8(body);
    },
    encode(value: unknown): Octets {
        if (typeof value !== 'string') {
            throw new HttpMessageError(
                'text/plain body must be a string',
            );
        }
        return encodeUtf8(value);
    },
};

// Validate at the gate: a form body encodes from an object of
// string values, never any/coerced data.
function toFormParams(value: unknown): URLSearchParams {
    if (typeof value !== 'object' || value === null) {
        throw new HttpMessageError(
            'form body must encode from an object',
        );
    }
    const params = new URLSearchParams();
    for (const [key, raw] of Object.entries(value)) {
        if (typeof raw !== 'string') {
            throw new HttpMessageError(
                'form field is not a string: ' + key,
            );
        }
        params.append(key, raw);
    }
    return params;
}
```

- [ ] **Step 4: Run to verify they pass.**

Run: `TZ=UTC node --test --strip-types tests/http-body.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit** (re-check `HEAD`).

```bash
TMPDIR=/tmp/claude ./validate
git add api/http-message/media-registry.ts tests/http-body.test.ts
git commit -m "Add form-urlencoded and text body codecs"
```

---

### Task 4: register form/text in the default registry

**Files:**
- Modify: `api/http-message/media-registry.ts` (`defaultBodyRegistry`)
- Modify: `tests/http-body.test.ts` (correct the stale "unregistered" fixture)

**Interfaces:**
- Produces: `defaultBodyRegistry()` now carries `[jsonBodyCodec, formBodyCodec,
  textBodyCodec]`, so `withBody('text/plain', …)` and form bodies work with no
  configuration (Office of the Interface).

- [ ] **Step 1: Correct the stale-premise test.** The existing test
  `withBody throws for an unregistered media type` uses `text/plain` as its
  example of an *unknown* type — which this task makes known. Preserve the
  covenant, correct the example: change `text/plain` → `application/xml` (a
  type still absent from the registry). This is a fixture correction, not a
  test weakening — the assertion (`assert.throws(…, HttpMessageError)`) and the
  covenant ("an unknown media type throws") are unchanged.

- [ ] **Step 2: Write the failing tests.** Add to `tests/http-body.test.ts`:

```typescript
test('withBody round-trips a text/plain body', () => {
    const message = HttpMessage
        .fromWire('POST /x HTTP/1.1\r\n\r\n')
        .withBody('text/plain', 'hello');
    assert.equal(message.body().decoded().toText(), 'hello');
});

test('withBody round-trips a form body by field', () => {
    const message = HttpMessage
        .fromWire('POST /x HTTP/1.1\r\n\r\n')
        .withBody(
            'application/x-www-form-urlencoded',
            { a: '1', b: 'two' },
        );
    assert.equal(message.query('body.a').toText(), '1');
    assert.equal(message.query('body.b').toText(), 'two');
});

test('a text/plain body is base64 in the JSON form', () => {
    const message = HttpMessage
        .fromWire('POST /x HTTP/1.1\r\n\r\n')
        .withBody('text/plain', 'hi');
    const body = JSON.parse(message.toJson()).body;
    assert.equal(typeof body, 'string');
});
```

- [ ] **Step 3: Run to verify they fail.**

Run: `TZ=UTC node --test --strip-types tests/http-body.test.ts`
Expected: FAIL — `withBody('text/plain', …)` throws "no body codec for media
type" because the default registry is JSON-only.

- [ ] **Step 4: Register the codecs.** In `media-registry.ts`:

```typescript
export function defaultBodyRegistry(): BodyRegistry {
    return new BodyRegistry([
        jsonBodyCodec,
        formBodyCodec,
        textBodyCodec,
    ]);
}
```

- [ ] **Step 5: Run the full suite — watch for other stale "unregistered"
  fixtures.**

Run: `TMPDIR=/tmp/claude ./validate`
Expected: green. If any *other* test used `text/plain` or
`application/x-www-form-urlencoded` as a stand-in for "unregistered," correct
its fixture to a still-unknown type the same way (covenant preserved, example
corrected). The JSON-inline regressions stay green because `jsonCodecFor` is
JSON-specific (Task 2).

- [ ] **Step 6: Commit** (re-check `HEAD`).

```bash
git add api/http-message/media-registry.ts tests/http-body.test.ts
git commit -m "Register form and text codecs by default"
```

---

### Task 5: content-coding registry (gzip/deflate + br seam)

**Files:**
- Create: `api/http-message/content-coding.ts`
- Create: `tests/http-content-encoding.test.ts`

**Interfaces:**
- Produces:
  - `interface ContentCodec { handles(coding: string): boolean;
    decode(body: Octets): Promise<Octets>; }`
  - `class ContentCodingRegistry` with `codecFor(coding): ContentCodec |
    undefined` (immutable, injected — mirrors `BodyRegistry`).
  - `gzipContentCodec`, `deflateContentCodec: ContentCodec`.
  - `defaultContentCodingRegistry(): ContentCodingRegistry` — gzip + deflate
    only; `br` absent.
- Consumed by Task 7 (Body/HttpMessage thread the registry).

- [ ] **Step 1: Write the failing tests.** Create
  `tests/http-content-encoding.test.ts`:

```typescript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Octets } from '../api/http-message/octets.ts';
import {
    ContentCodingRegistry,
    defaultContentCodingRegistry,
    gzipContentCodec,
    deflateContentCodec,
    type ContentCodec,
} from '../api/http-message/content-coding.ts';

async function deflate(
    coding: 'gzip' | 'deflate', text: string,
): Promise<Octets> {
    const stream = new Blob([new TextEncoder().encode(text)])
        .stream()
        .pipeThrough(new CompressionStream(coding));
    const buffer = await new Response(stream).arrayBuffer();
    return Octets.fromBytes(new Uint8Array(buffer));
}

test('gzip codec round-trips compressed octets', async () => {
    const decoded = await gzipContentCodec.decode(
        await deflate('gzip', 'hello, world'),
    );
    assert.equal(
        new TextDecoder().decode(decoded.asBytes()),
        'hello, world',
    );
});

test('deflate codec round-trips compressed octets', async () => {
    const decoded = await deflateContentCodec.decode(
        await deflate('deflate', 'hello, world'),
    );
    assert.equal(
        new TextDecoder().decode(decoded.asBytes()),
        'hello, world',
    );
});

test('the default registry has no br codec', () => {
    assert.equal(
        defaultContentCodingRegistry().codecFor('br'),
        undefined,
    );
});

test('an injected br codec is found', () => {
    const br: ContentCodec = {
        handles: (coding) => coding === 'br',
        decode: (body) => Promise.resolve(body),
    };
    assert.equal(
        new ContentCodingRegistry([br]).codecFor('br'), br,
    );
});
```

- [ ] **Step 2: Run to verify they fail.**

Run: `TZ=UTC node --test --strip-types tests/http-content-encoding.test.ts`
Expected: FAIL — `content-coding.ts` does not exist.

- [ ] **Step 3: Implement `content-coding.ts`.** Match the house collect idiom
  from `api/backend-localstorage.ts:38-41` (`new Blob([bytes]).stream()
  .pipeThrough(new DecompressionStream(...))` → `new Response(stream)`):

```typescript
import { Octets } from './octets.ts';

// RFC 9110 §8.4.1 content codings. gzip and deflate decode
// through the platform DecompressionStream — zero runtime deps,
// genuine stream I/O (so the API is async). Brotli (br) has no
// platform primitive; it is NOT built in. A caller with its own
// adapter registers it — the divorce-point seam. The registry is
// immutable and injected, mirroring BodyRegistry.

export interface ContentCodec {
    handles(coding: string): boolean;
    decode(body: Octets): Promise<Octets>;
}

export class ContentCodingRegistry {
    readonly #codecs: readonly ContentCodec[];

    constructor(codecs: readonly ContentCodec[]) {
        this.#codecs = [...codecs];
    }

    codecFor(coding: string): ContentCodec | undefined {
        return this.#codecs.find(
            (codec) => codec.handles(coding),
        );
    }
}

async function inflate(
    coding: 'gzip' | 'deflate', body: Octets,
): Promise<Octets> {
    const stream = new Blob([body.asBytes()]).stream()
        .pipeThrough(new DecompressionStream(coding));
    const buffer = await new Response(stream).arrayBuffer();
    return Octets.fromBytes(new Uint8Array(buffer));
}

export const gzipContentCodec: ContentCodec = {
    handles(coding: string): boolean {
        return coding === 'gzip';
    },
    decode(body: Octets): Promise<Octets> {
        return inflate('gzip', body);
    },
};

export const deflateContentCodec: ContentCodec = {
    handles(coding: string): boolean {
        return coding === 'deflate';
    },
    decode(body: Octets): Promise<Octets> {
        return inflate('deflate', body);
    },
};

export function defaultContentCodingRegistry():
    ContentCodingRegistry {
    return new ContentCodingRegistry([
        gzipContentCodec,
        deflateContentCodec,
    ]);
}
```

If `tsc` rejects `new Blob([body.asBytes()])`, cast the part to a fresh array
(`new Blob([new Uint8Array(body.asBytes())])`); `backend-localstorage.ts`
compiles cast-free, so prefer no cast.

- [ ] **Step 4: Run to verify they pass.**

Run: `TZ=UTC node --test --strip-types tests/http-content-encoding.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit** (re-check `HEAD`).

```bash
TMPDIR=/tmp/claude ./validate
git add api/http-message/content-coding.ts \
        tests/http-content-encoding.test.ts
git commit -m "Add the content-coding registry with gzip and deflate"
```

---

### Task 6: extract `Body.#decodeByType` (pure refactor)

**Files:**
- Modify: `api/http-message/body.ts` (`decoded`)

**Interfaces:**
- Produces: private `#decodeByType(): Decoded` — the codec-lookup-and-decode
  tail of `decoded()`, so Task 7's `decodedAsync` can reuse it on a
  content-decoded `Body`. No behavior change; no new test.

- [ ] **Step 1: Extract the method.** Replace `decoded()` in `body.ts`:

```typescript
decoded(): Decoded {
    return this.contentDecoded().#decodeByType();
}

#decodeByType(): Decoded {
    const octets = this.#require();
    const type = this.#fields.find(
        (field) => field.name === CONTENT_TYPE,
    );
    if (type === undefined) {
        throw new HttpMessageError(
            'body has no content-type to decode',
        );
    }
    const codec = this.#registry.codecFor(type.value);
    if (codec === undefined) {
        throw new HttpMessageError(
            'no body codec for ' + type.value,
        );
    }
    return Decoded.of(codec.decode(octets));
}
```

(`#decodeByType` runs on the receiver, which `decoded()` has already
content-decoded — identical to the prior inline `source` logic.)

- [ ] **Step 2: Run the existing body tests to verify NO behavior change.**

Run: `TZ=UTC node --test --strip-types tests/http-body.test.ts`
Expected: PASS (unchanged).

- [ ] **Step 3: Gate + commit** (re-check `HEAD`; this commit is a pure
  extraction — no content change rides with it).

```bash
TMPDIR=/tmp/claude ./validate
git add api/http-message/body.ts
git commit -m "Extract Body content-type decode into a helper"
```

---

### Task 7: async content-decode siblings + thread the coding registry

**Files:**
- Modify: `api/http-message/body.ts` (constructor, `fromModel`,
  `base64Decoded`, add `contentDecodedAsync` / `decodedAsync`, carry
  `#codingRegistry`)
- Modify: `api/http-message/http-message.ts` (carry + thread `#codingRegistry`
  through the constructor, `fromModel`/`fromWire`/`fromJson`, `#derive`,
  `body()`)
- Test: `tests/http-content-encoding.test.ts`

**Interfaces:**
- Produces:
  - `Body.fromModel(model, registry, codingRegistry)` — third arg added.
  - `Body.contentDecodedAsync(): Promise<Body>` — strips gzip/deflate via the
    coding registry, returning a Body whose `content-encoding` field is
    removed; identity (or `identity`-only) returns `this`; an unknown coding
    (e.g. `br` with the default registry) throws `HttpMessageError`.
  - `Body.decodedAsync(): Promise<Decoded>` — async-strip then `#decodeByType`.
  - `HttpMessage` carries a `ContentCodingRegistry` alongside the body
    registry, defaulting to `defaultContentCodingRegistry()`, threaded through
    every construction site exactly as `#bodyRegistry` is.

- [ ] **Step 1: Write the failing tests.** Append to
  `tests/http-content-encoding.test.ts` (extend imports with `Body`,
  `defaultBodyRegistry`, `HttpMessageError`; reuse the `deflate` helper):

```typescript
import { Body } from '../api/http-message/body.ts';
import {
    defaultBodyRegistry,
} from '../api/http-message/media-registry.ts';
import {
    HttpMessageError,
} from '../api/http-message/types.ts';

const RESPONSE_LINE = {
    kind: 'response' as const,
    version: 'HTTP/1.1', status: 200, reason: 'OK',
};

test('decodedAsync strips gzip then decodes JSON', async () => {
    const body = Body.fromModel(
        {
            startLine: RESPONSE_LINE,
            fields: [
                { name: 'content-encoding', value: 'gzip' },
                {
                    name: 'content-type',
                    value: 'application/json',
                },
            ],
            body: await deflate('gzip', '{"ok":true}'),
            trailer: undefined,
        },
        defaultBodyRegistry(),
        defaultContentCodingRegistry(),
    );
    const decoded = await body.decodedAsync();
    assert.equal(decoded.query('ok').toBoolean(), true);
});

test('contentDecodedAsync rejects br by default', async () => {
    const body = Body.fromModel(
        {
            startLine: RESPONSE_LINE,
            fields: [{ name: 'content-encoding', value: 'br' }],
            body: Octets.fromLatin1('x'),
            trailer: undefined,
        },
        defaultBodyRegistry(),
        defaultContentCodingRegistry(),
    );
    await assert.rejects(
        body.contentDecodedAsync(), HttpMessageError,
    );
});
```

- [ ] **Step 2: Run to verify they fail.**

Run: `TZ=UTC node --test --strip-types tests/http-content-encoding.test.ts`
Expected: FAIL — `Body.fromModel` takes two args; `decodedAsync` /
`contentDecodedAsync` do not exist.

- [ ] **Step 3: Thread the registry through `Body`.** In `body.ts`: add
  `import type { ContentCodingRegistry } from './content-coding.ts';`, a
  `readonly #codingRegistry: ContentCodingRegistry;` field, the constructor
  param, and update `fromModel` + `base64Decoded` to carry it:

```typescript
private constructor(
    octets: Octets | undefined,
    fields: readonly FieldLine[],
    registry: BodyRegistry,
    codingRegistry: ContentCodingRegistry,
) {
    this.#octets = octets;
    this.#fields = fields;
    this.#registry = registry;
    this.#codingRegistry = codingRegistry;
}

static fromModel(
    model: MessageModel,
    registry: BodyRegistry,
    codingRegistry: ContentCodingRegistry,
): Body {
    return new Body(
        model.body, model.fields, registry, codingRegistry,
    );
}
```

In `base64Decoded`, pass `this.#codingRegistry` as the fourth `new Body(...)`
argument.

- [ ] **Step 4: Add the async siblings.** In `body.ts`, beside
  `contentDecoded` / `decoded`:

```typescript
// Async sibling of contentDecoded: strip gzip/deflate via the
// coding registry, returning a Body with the content-encoding
// field removed (it is identity-coded now). An unknown coding
// throws — the seam refuses to pass still-encoded octets on,
// exactly as the sync path does.
async contentDecodedAsync(): Promise<Body> {
    this.#require();
    const codings = this.#contentEncodings();
    if (codings.every((coding) => coding === IDENTITY)) {
        return this;
    }
    let octets = this.#require();
    for (const coding of [...codings].reverse()) {
        if (coding === IDENTITY) continue;
        const codec = this.#codingRegistry.codecFor(coding);
        if (codec === undefined) {
            throw new HttpMessageError(
                'unsupported content-encoding: ' + coding,
            );
        }
        octets = await codec.decode(octets);
    }
    const fields = this.#fields.filter(
        (line) => line.name !== CONTENT_ENCODING,
    );
    return new Body(
        octets, fields, this.#registry, this.#codingRegistry,
    );
}

async decodedAsync(): Promise<Decoded> {
    const source = await this.contentDecodedAsync();
    return source.#decodeByType();
}
```

(`CONTENT_ENCODING` and `IDENTITY` constants already exist in the file.)

- [ ] **Step 5: Thread the registry through `HttpMessage`.** In
  `http-message.ts`: import `ContentCodingRegistry` +
  `defaultContentCodingRegistry` from `./content-coding.ts`; add a
  `readonly #codingRegistry: ContentCodingRegistry;` field; add the param to
  the constructor and to `fromModel` / `fromWire` / `fromJson` (defaulting
  `codingRegistry: ContentCodingRegistry = defaultContentCodingRegistry()`,
  mirroring `bodyRegistry`); pass `this.#codingRegistry` in `#derive`; and pass
  it from `body()`:

```typescript
body(): Body {
    return Body.fromModel(
        this.#model, this.#bodyRegistry, this.#codingRegistry,
    );
}

#derive(model: MessageModel): HttpMessage {
    return new HttpMessage(
        model, this.#bodyRegistry, this.#codingRegistry,
    );
}
```

Every `new HttpMessage(...)` and every static factory must pass the coding
registry — `tsc` flags any missed site (the constructor gains a required
param).

- [ ] **Step 6: Run to verify they pass.**

Run: `TZ=UTC node --test --strip-types tests/http-content-encoding.test.ts`
Expected: PASS.

- [ ] **Step 7: Gate + commit** (re-check `HEAD`).

```bash
TMPDIR=/tmp/claude ./validate
git add api/http-message/body.ts api/http-message/http-message.ts \
        tests/http-content-encoding.test.ts
git commit -m "Add async content-decode siblings to the message"
```

---

### Task 8: structured-field byte-sequences (`:b64:` → Octets)

**Files:**
- Modify: `api/http-message/structured-fields.ts` (`BareValue`,
  `readBareItem`, add `readByteSequence`)
- Modify: `api/http-message/field-value.ts` (`Leaf`, add `toBytes`/`toBase64`,
  guard `toText`)
- Test: `tests/http-field-value.test.ts`

**Interfaces:**
- Produces: `BareValue` widens to `number | string | boolean | Octets`;
  `Leaf` widens to match; `FieldValue.toBytes(): Uint8Array` and
  `FieldValue.toBase64(): string` (both throw on a non-Octets leaf);
  `toText()` throws on an Octets leaf rather than coercing.

- [ ] **Step 1: Write the failing tests.** Add to
  `tests/http-field-value.test.ts`. A byte-sequence reaches the leaf through a
  list query (re-using a known structured field — `content-encoding` is a
  list; pick any list field whose member is a byte sequence). The cleanest is
  a direct structured-field parse via a `content-type`-style item, but byte
  sequences appear as parameters and members; assert through `HttpMessage`:

```typescript
import { HttpMessage } from '../api/http-message/http-message.ts';

test('a byte-sequence list member decodes to base64', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'accept-encoding: :aGVsbG8=:\r\n\r\n',
    );
    assert.equal(
        message.query('header.accept-encoding.0').toBase64(),
        'aGVsbG8=',
    );
});

test('toText on a byte-sequence leaf throws', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'accept-encoding: :aGVsbG8=:\r\n\r\n',
    );
    assert.throws(
        () => message.query('header.accept-encoding.0').toText(),
        HttpMessageError,
    );
});
```

(`accept-encoding` is a `list` field in `field-registry.ts`, so member `.0`
routes through `navigateList`.)

- [ ] **Step 2: Run to verify they fail.**

Run: `TZ=UTC node --test --strip-types tests/http-field-value.test.ts`
Expected: FAIL — `:` is an "unexpected bare item"; `toBase64` does not exist
on `FieldValue`.

- [ ] **Step 3: Add the byte-sequence reader.** In `structured-fields.ts`:
  add `import { Octets } from './octets.ts';`; widen the union; add the reader;
  add the dispatch arm:

```typescript
export type BareValue = number | string | boolean | Octets;
```

```typescript
function readByteSequence(cursor: Cursor): Octets {
    cursor.expect(':');
    let b64 = '';
    while (cursor.peek() !== ':') {
        b64 += cursor.next();
    }
    cursor.next();
    return Octets.fromBase64(b64);
}
```

In `readBareItem`, add after the boolean arm (before the token arm):

```typescript
if (ch === ':') return readByteSequence(cursor);
```

(An unterminated `:…` hits `cursor.next()` at end → throws; invalid base64
throws via `Octets.fromBase64`; `::` is a valid empty sequence.)

- [ ] **Step 4: Widen `Leaf` and add the byte conversions.** In
  `field-value.ts`: add `import { Octets } from './octets.ts';`; widen `Leaf`;
  guard `toText`; add `toBytes` / `toBase64`:

```typescript
type Leaf = string | number | boolean | Octets;
```

```typescript
toText(): string {
    const value = this.#require();
    if (value instanceof Octets) {
        throw new HttpMessageError('value is bytes, not text');
    }
    return String(value);
}

toBytes(): Uint8Array {
    const value = this.#require();
    if (value instanceof Octets) return value.asBytes();
    throw new HttpMessageError('value is not bytes');
}

toBase64(): string {
    const value = this.#require();
    if (value instanceof Octets) return value.toBase64();
    throw new HttpMessageError('value is not bytes');
}
```

`toNumber` / `toBoolean` already throw on a non-matching leaf (an Octets value
falls through to their existing throws — no change). `query.ts` needs no change
this task: `BareValue ⊆ Leaf`, so `FieldValue.present(member.value)` still
type-checks.

- [ ] **Step 5: Run to verify they pass.**

Run: `TZ=UTC node --test --strip-types tests/http-field-value.test.ts`
Then: `TZ=UTC node --test --strip-types tests/http-query.test.ts`
Expected: PASS (existing SF queries unaffected).

- [ ] **Step 6: Gate + commit** (re-check `HEAD`).

```bash
TMPDIR=/tmp/claude ./validate
git add api/http-message/structured-fields.ts \
        api/http-message/field-value.ts \
        tests/http-field-value.test.ts
git commit -m "Parse structured-field byte sequences"
```

---

### Task 9: sf-date (`@1659578233` → Date)

**Files:**
- Modify: `api/http-message/structured-fields.ts` (`BareValue`,
  `readBareItem`, add `readDate`)
- Modify: `api/http-message/field-value.ts` (`Leaf`, `toDate`)
- Test: `tests/http-field-value.test.ts`

**Interfaces:**
- Produces: `BareValue`/`Leaf` widen to include `Date`; an `@int` value parses
  to `new Date(seconds * 1000)`; `FieldValue.toDate()` returns a `Date` leaf
  directly (and still HTTP-date-parses a string leaf). RFC 9651 sf-integer
  bound: optional leading `-`, integer only (no fraction), ≤15 digits.

- [ ] **Step 1: Write the failing tests.** Add to
  `tests/http-field-value.test.ts`:

```typescript
test('an sf-date member resolves to a Date', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'accept-encoding: @1659578233\r\n\r\n',
    );
    assert.equal(
        message.query('header.accept-encoding.0')
            .toDate().getTime(),
        1659578233 * 1000,
    );
});

test('toText on an sf-date leaf throws', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'accept-encoding: @1659578233\r\n\r\n',
    );
    assert.throws(
        () => message.query('header.accept-encoding.0').toText(),
        HttpMessageError,
    );
});
```

(The ≤15-digit sf-integer bound is enforced in the reader below per spec
decision 6. It can't be TDD'd as failing-first through the query layer — an
over-long `@int` makes the whole field fall back to raw text, observationally
identical to the pre-task "unsupported `@`" fallback — so it lives in the
implementation as validate-at-the-gate parsing, not as a comfort-object test.)

- [ ] **Step 2: Run to verify they fail.**

Run: `TZ=UTC node --test --strip-types tests/http-field-value.test.ts`
Expected: FAIL — before this task `@` is an "unexpected bare item", so the
field falls back to raw: `.toDate()` reads no Date, and `.toText()` returns the
raw string `@1659578233` without throwing.

- [ ] **Step 3: Add the date reader.** In `structured-fields.ts`: widen the
  union and add the reader + dispatch:

```typescript
export type BareValue =
    number | string | boolean | Octets | Date;
```

```typescript
function readDate(cursor: Cursor): Date {
    cursor.expect('@');
    let text = '';
    if (cursor.peek() === '-') text += cursor.next();
    if (!isDigit(cursor.peek())) {
        throw new HttpMessageError('expected a date integer');
    }
    while (isDigit(cursor.peek())) text += cursor.next();
    if (text.replace('-', '').length > 15) {
        throw new HttpMessageError('sf-date exceeds 15 digits');
    }
    return new Date(Number(text) * 1000);
}
```

In `readBareItem`, add (beside the `:` arm):

```typescript
if (ch === '@') return readDate(cursor);
```

(No `.` consumed — fractions are not sf-dates.)

- [ ] **Step 4: Widen `Leaf` and make `toDate` accept a Date leaf.** In
  `field-value.ts`:

```typescript
type Leaf = string | number | boolean | Octets | Date;
```

```typescript
toText(): string {
    const value = this.#require();
    if (value instanceof Octets || value instanceof Date) {
        throw new HttpMessageError(
            'value is not text',
        );
    }
    return String(value);
}

toDate(): Date {
    const value = this.#require();
    if (value instanceof Date) return value;
    if (typeof value === 'string') return parseHttpDate(value);
    throw new HttpMessageError(
        'value is not a date: ' + String(value),
    );
}
```

- [ ] **Step 5: Run to verify they pass.**

Run: `TZ=UTC node --test --strip-types tests/http-field-value.test.ts`
Expected: PASS (existing string-leaf `toDate` regressions unchanged).

- [ ] **Step 6: Gate + commit** (re-check `HEAD`).

```bash
TMPDIR=/tmp/claude ./validate
git add api/http-message/structured-fields.ts \
        api/http-message/field-value.ts \
        tests/http-field-value.test.ts
git commit -m "Parse structured-field sf-date values"
```

---

### Task 10: Display Strings (`%"caf%c3%a9"` → string)

**Files:**
- Modify: `api/http-message/structured-fields.ts` (`readBareItem`, add
  `readDisplayString`, `isLowerHex`)
- Test: `tests/http-field-value.test.ts`

**Interfaces:**
- Produces: a Display String value parses to a percent-decoded, UTF-8 `string`
  leaf (indistinguishable from `sf-string` at the leaf — the distinction is
  syntactic). Lowercase hex required; a bare `%` or non-lower-hex digit is a
  parse error; `\` is NOT special.

- [ ] **Step 1: Write the failing tests.** Add to
  `tests/http-field-value.test.ts`:

```typescript
test('a display string percent-decodes to UTF-8', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'accept-encoding: %"caf%c3%a9"\r\n\r\n',
    );
    assert.equal(
        message.query('header.accept-encoding.0').toText(),
        'café',
    );
});

test('a display string with no escapes decodes verbatim', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'accept-encoding: %"hello"\r\n\r\n',
    );
    assert.equal(
        message.query('header.accept-encoding.0').toText(),
        'hello',
    );
});
```

(The reader requires lowercase percent-hex and rejects a bare `%` per spec
decision 6. Like the byte-sequence and sf-date rejections, malformed content
makes the field fall back to raw text — observationally identical to the
pre-task "unsupported `%`" fallback — so the rejection rules live in the reader
as validate-at-the-gate parsing, exercised by the positive decode's contrast
rather than a non-failing-first comfort-object test.)

- [ ] **Step 2: Run to verify they fail.**

Run: `TZ=UTC node --test --strip-types tests/http-field-value.test.ts`
Expected: FAIL — before this task `%` is an "unexpected bare item", so the
field falls back to raw and `.toText()` returns the literal `%"caf%c3%a9"` /
`%"hello"` text rather than the decoded string.

- [ ] **Step 3: Add the display-string reader.** In `structured-fields.ts`:

```typescript
function readDisplayString(cursor: Cursor): string {
    cursor.expect('%');
    cursor.expect('"');
    const bytes: number[] = [];
    for (;;) {
        const ch = cursor.next();
        if (ch === '"') {
            return new TextDecoder().decode(
                Uint8Array.from(bytes),
            );
        }
        if (ch === '%') {
            const hi = cursor.next();
            const lo = cursor.next();
            if (!isLowerHex(hi) || !isLowerHex(lo)) {
                throw new HttpMessageError(
                    'invalid display-string escape',
                );
            }
            bytes.push(Number.parseInt(hi + lo, 16));
        } else {
            bytes.push(ch.charCodeAt(0));
        }
    }
}

function isLowerHex(ch: string): boolean {
    return isDigit(ch) || (ch >= 'a' && ch <= 'f');
}
```

In `readBareItem`, add (beside the `@` arm):

```typescript
if (ch === '%') return readDisplayString(cursor);
```

(A `%` not followed by `"` fails `expect('"')` — a bare `%` is a parse error.
`\` is pushed as a literal byte, never special.)

- [ ] **Step 4: Run to verify they pass.**

Run: `TZ=UTC node --test --strip-types tests/http-field-value.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit** (re-check `HEAD`).

```bash
TMPDIR=/tmp/claude ./validate
git add api/http-message/structured-fields.ts \
        tests/http-field-value.test.ts
git commit -m "Parse structured-field display strings"
```

---

### Task 11: inner-lists (`(a b);p=1`) + query indexing

**Files:**
- Modify: `api/http-message/structured-fields.ts` (`SfItem.value`, add
  `SfInnerList`, `readInnerList`, `readMember`; replace `rejectInnerList` in
  `parseList` / `parseDictionary`; delete `rejectInnerList`)
- Modify: `api/http-message/query.ts` (add `isInnerList` + `leaf`; route every
  member projection through `leaf`; add `navigateInnerList`)
- Test: `tests/http-query.test.ts`

**Interfaces:**
- Produces: `interface SfInnerList { items: readonly SfItem[]; params:
  ReadonlyMap<string, BareValue>; }`; `SfItem.value` widens to `BareValue |
  SfInnerList`; `query('field.0.1')` indexes member 0's inner list at item 1.
  An inner list has no scalar leaf, so `query('field.0')` on an inner-list
  member is absent.

- [ ] **Step 1: Write the failing tests.** Add to `tests/http-query.test.ts`:

```typescript
test('indexes into an inner-list member', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'accept-encoding: (gzip deflate), br\r\n\r\n',
    );
    assert.equal(
        message.query('header.accept-encoding.0.1').toText(),
        'deflate',
    );
    assert.equal(
        message.query('header.accept-encoding.1').toText(),
        'br',
    );
});

test('an inner-list member has no scalar leaf', () => {
    const message = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n' +
        'accept-encoding: (gzip deflate), br\r\n\r\n',
    );
    assert.equal(
        message.query('header.accept-encoding.0').exists(),
        false,
    );
});
```

- [ ] **Step 2: Run to verify they fail.**

Run: `TZ=UTC node --test --strip-types tests/http-query.test.ts`
Expected: FAIL — today `parseList` calls `rejectInnerList`, so `(gzip
deflate)` throws and the list falls back to raw; `.0.1` is absent.

- [ ] **Step 3: Widen the member model + read inner lists.** In
  `structured-fields.ts`:

```typescript
export interface SfItem {
    readonly value: BareValue | SfInnerList;
    readonly params: ReadonlyMap<string, BareValue>;
}

export interface SfInnerList {
    readonly items: readonly SfItem[];
    readonly params: ReadonlyMap<string, BareValue>;
}

const NO_PARAMS: ReadonlyMap<string, BareValue> = new Map();
```

Add the readers; a member is an inner list or a bare item:

```typescript
function readInnerList(cursor: Cursor): SfInnerList {
    cursor.expect('(');
    const items: SfItem[] = [];
    for (;;) {
        cursor.skipOws();
        if (cursor.peek() === ')') {
            cursor.next();
            break;
        }
        items.push(readItem(cursor));
        const next = cursor.peek();
        if (next !== ' ' && next !== '\t' && next !== ')') {
            throw new HttpMessageError(
                'expected SP or ) in inner list',
            );
        }
    }
    const params = readParameters(cursor);
    return { items, params };
}

function readMember(cursor: Cursor): SfItem {
    if (cursor.peek() === '(') {
        return {
            value: readInnerList(cursor),
            params: NO_PARAMS,
        };
    }
    return readItem(cursor);
}
```

In `parseList`, replace the loop body's first two lines
(`rejectInnerList(cursor); members.push(readItem(cursor));`) with:

```typescript
members.push(readMember(cursor));
```

In `parseDictionary`, replace the key/value block with a member read that
supports inner lists and the bare-key (`true`) case:

```typescript
const key = readKey(cursor);
let member: SfItem;
if (cursor.peek() === '=') {
    cursor.next();
    member = readMember(cursor);
} else {
    member = { value: true, params: readParameters(cursor) };
}
dict.set(key, member);
```

Delete the now-unused `rejectInnerList` function.

- [ ] **Step 4: Project members through `leaf` and index inner lists.** In
  `query.ts`: extend the structured-fields import with `type BareValue,
  type SfInnerList`; add the helpers; route every member projection through
  `leaf`; add the inner-list branch:

```typescript
function isInnerList(
    value: BareValue | SfInnerList,
): value is SfInnerList {
    return typeof value === 'object'
        && value !== null
        && 'items' in value;
}

// An inner list has no scalar leaf; a bare value presents.
function leaf(value: BareValue | SfInnerList): FieldValue {
    return isInnerList(value)
        ? FieldValue.absent()
        : FieldValue.present(value);
}

function navigateInnerList(
    inner: SfInnerList,
    rest: readonly string[],
): FieldValue {
    const index = Number(rest[0]);
    if (
        !Number.isInteger(index)
        || index < 0
        || index >= inner.items.length
    ) {
        return FieldValue.absent();
    }
    const item = inner.items[index]!;
    if (rest.length === 1) return leaf(item.value);
    return parameter(item, rest.slice(1));
}
```

In `navigateItem`, change `return FieldValue.present(item.value);` to
`return leaf(item.value);`. In `navigateDictionary`, change the final
`return FieldValue.present(member.value);` to `return leaf(member.value);`.
In `navigateList`, replace the member tail (`if (rest.length === 1) return
FieldValue.present(member.value); return parameter(member, rest.slice(1));`)
with:

```typescript
if (rest.length === 1) return leaf(member.value);
if (isInnerList(member.value)) {
    return navigateInnerList(member.value, rest.slice(1));
}
return parameter(member, rest.slice(1));
```

(`parameter` is unchanged — parameter values are `BareValue`, never inner
lists.)

- [ ] **Step 5: Run to verify they pass.**

Run: `TZ=UTC node --test --strip-types tests/http-query.test.ts`
Then: `TZ=UTC node --test --strip-types tests/http-field-value.test.ts`
Expected: PASS (item / list / dict / parameter queries behavior-preserved).

- [ ] **Step 6: Gate + commit** (re-check `HEAD`).

```bash
TMPDIR=/tmp/claude ./validate
git add api/http-message/structured-fields.ts \
        api/http-message/query.ts tests/http-query.test.ts
git commit -m "Parse and index structured-field inner lists"
```

---

### Task 12: re-cite RFC 8941 → RFC 9651 (comment only)

**Files:**
- Modify: `api/http-message/structured-fields.ts` (header comment)
- Modify: `api/http-message/field-registry.ts` (header comment)

**Interfaces:** none — documentation only. The allowlist in `field-registry.ts`
is unchanged.

- [ ] **Step 1: Update the citations.** In `structured-fields.ts`, replace the
  header comment's first sentence so it cites RFC 9651 and names the now-closed
  capabilities:

```typescript
// RFC 9651 Structured Field Values (obsoletes RFC 8941) — the
// general grammar for Item / List / Dictionary plus parameters,
// including inner lists, byte sequences, Dates, and Display
// Strings. One parser drives every registered field; it knows
// nothing about WHICH field is which (that is the registry's
// job).
```

In `field-registry.ts`, replace `RFC 8941` with `RFC 9651` in the header
comment's first line; the rest of the comment and the `KINDS` map are
unchanged.

- [ ] **Step 2: Gate.** (No behavior change; the full suite still proves it.)

Run: `TMPDIR=/tmp/claude ./validate`
Expected: green.

- [ ] **Step 3: Commit** (re-check `HEAD`).

```bash
git add api/http-message/structured-fields.ts \
        api/http-message/field-registry.ts
git commit -m "Re-cite structured fields to RFC 9651"
```

---

## Self-Review

**Spec coverage** — every spec section maps to a task:

| Spec item | Task(s) |
| --------- | ------- |
| Deferral 1 — RFC 850 + asctime + `reference` (decision 4) | 1 |
| Deferral 3 — form/text codecs (decision 3) | 3, 4 |
| Decision 5 — JSON-specific inline discriminator (`kind`) | 2 |
| Deferral 2 — gzip/deflate + `br` seam (decisions 1, 2) | 5, 7 |
| Async siblings, sync paths untouched (decision 1) | 6, 7 |
| Deferral 4 — byte-sequences | 8 |
| Decision 6 — sf-date | 9 |
| Decision 6 — Display Strings | 10 |
| Deferral 4 — inner-lists + `query.ts` / `field-value.ts` | 8–11 |
| RFC 8941 → 9651 re-citation | 12 |

**Type consistency** — names checked across tasks: `parseHttpDate(text,
reference?)` (1); `BodyCodec.kind` (2) consumed by codecs (3) and `jsonCodecFor`
(2); `defaultBodyRegistry` carries form/text (4); `ContentCodec.decode →
Promise<Octets>` and `defaultContentCodingRegistry()` (5) consumed by
`Body.fromModel(model, registry, codingRegistry)` (7); `#decodeByType` (6)
reused by `decodedAsync` (7); `BareValue`/`Leaf` widened in lockstep (8, 9);
`SfItem.value: BareValue | SfInnerList` (11) drives the `leaf()` projection in
every `query.ts` navigator (11). `FieldValue.toBytes`/`toBase64`/`toDate`
signatures are stable from their introducing task onward.

**Placeholder scan** — every code step contains complete, real code; no "TBD",
no "add error handling," no "similar to Task N." Test bodies are spelled out.

## Verification

- **Per task:** the named `node --test --strip-types <file>` run (TZ-pinned —
  `TZ=Pacific/Honolulu` for `tests/tz/`, `TZ=UTC` otherwise) goes red before
  the implementation and green after, then `TMPDIR=/tmp/claude ./validate`
  passes before the commit.
- **End-to-end gate:** `TMPDIR=/tmp/claude ./validate` — `tsc --noEmit` (no
  `any` at the new boundaries; the widened unions are explicit), the full
  `node --test` suite (UTC + the Honolulu tz suite), the 78-char line lint
  across the changed `.ts` files, and the schema-svg check. Green is the
  release condition; a single red `./validate` aborts the run.
- **No production wiring touched:** confirm `api/http-message/` is still
  imported only by `tests/` — `grep -rl "http-message" --include=*.ts | grep
  -v '^tests/' | grep -v '^api/http-message/'` returns nothing.
- **Concurrency:** another session may be committing to `master`; re-check
  `HEAD` (and rebase if needed) before each of the 12 commits. History stays
  linear — rebase and fast-forward, never merge.

## Out of scope (Arc 1)

No streaming/async I/O model (`toWireStream`, incremental `fromWireStream`,
`TransformStream` content-coding, the proxy body union) — that is Arc 2. No
vendored or hand-rolled Brotli. No change to wire-codec framing, the canonical
sort, the number-preservation path, or SF *serialization* (modification stays
raw-string via `withFieldPut`; raw fields stay raw). The only async surfaces
are `contentDecodedAsync` / `decodedAsync`.

## Execution Handoff

After this plan is persisted to
`docs/superpowers/plans/2026-06-17-http-message-deferrals.md` and committed,
execute task-by-task. Two options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task (each
   proselytized `Go to Medium Church!` per CLAUDE.md), two-stage review between
   tasks.
2. **Inline Execution** — batch execution in one session with checkpoints via
   `superpowers:executing-plans`.

Either way, `./validate` is the gate after every task; a red gate stops the run.
