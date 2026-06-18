# Close the http-message named deferrals

*Reliability (I), Security (II), Uniformity (III),
Immutability (VI), Simplicity (VIII), Generality (IX); the
Articles "we choose platform primitives," "we validate at
every edge," and "insulation through adapters" (the divorce
point). The faithful tension: closing a deferral is Premature
Generalization (IX) for application code — but http-message
is a LIBRARY whose stated contract is a full HTTP message
transform, so its completeness is measured against the RFCs,
not against a single live caller. The caller chose to pre-
stock the complete primitive; each speculative piece is
named as such. Commits carry no plan tag — plain present-
tense imperative subjects.*

This is the approved, self-contained design of record for
closing the four named deferrals in `api/http-message/`,
plus the deliberate RFC 8941 → 9651 structured-field bump.

This is **Arc 1 of two**. Arc 1 (this spec) completes the
library as a fully-tested, gate-green BUFFERED primitive.
Arc 2 — the streaming/async I/O model for heavy server-tier
request/response handling (streaming wire serialize, async
incremental parse, content-coding as `TransformStream`s, a
materialized-vs-streaming proxy body union) — is a SEPARATE
spec, sequenced after Arc 1 lands green, built on this
stable base. The streaming reach is recorded in § Sequel so
Arc 1's surfaces are chosen not to paint Arc 2 into a corner.

The library stays UN-WIRED by deliberate choice: its real
callers arrive with the Postgres server tier. Re-derive every
code anchor by SYMBOL search at execution — line numbers
drift, symbols do not.

## Context

`api/http-message/` is a complete, adversarially reviewed,
gate-green HTTP message library — a tri-directional transform
(TS ↔ wire ↔ JSON) with deterministic inline+queryable JSON
bodies, a chainable decode API, dotted-key queries with RFC
8941 structured fields, and immutable `with*` modification.
It is imported ONLY by `tests/` — no production code path
uses it, and none will until the server tier lands. That
un-wired status is intentional and is NOT changed here.

Four capabilities were deferred "until a caller needs them,"
each carrying a comment that records the deferral:

- gzip/br content-decoders behind the `contentDecoded()`
  seam (`body.ts`)
- the two obsolete HTTP-date formats, RFC 850 and asctime
  (`http-date.ts`)
- non-JSON body codecs (`media-registry.ts`)
- structured-field inner-lists and byte-sequences
  (`structured-fields.ts`)

The caller has elected to close all four now, treating the
library as a complete HTTP primitive rather than a YAGNI-
minimal one, and accepting the Generality (IX) cost
knowingly. This spec records what "complete" means for each,
and the one required hardening each completion drags behind
it.

The caller has additionally elected to bump the structured-
field contract from RFC 8941 to its successor, RFC 9651
(which obsoletes 8941), adding the two value types 9651
introduced — Dates (`@int`) and Display Strings (`%"…"`).
These are NOT codebase deferrals (no stub, no comment names
them); they are a deliberate spec-version upgrade folded into
deferral 4 because they widen the same `readBareItem` switch.
This expansion is named here so the diff still matches a
single, coherent story.

## Principle

A library's completeness contract differs from application
code's. Application code earns each generalization by the
third duplication (IX). A library that declares itself "a
full HTTP message transform" is contracted against the
specification: a date parser that accepts one of three
mandated formats is INCOMPLETE, not minimal; a content-
decoding seam that throws on every real coding is a stub,
not a primitive.

We still honor the platform-primitives Article: gzip and
deflate decode through the platform `DecompressionStream`;
form bodies through `URLSearchParams`; byte-sequences reuse
the existing `Octets` base64 vessel. Where the platform has
NO primitive (Brotli), we do not vendor and we do not hand-
roll — we expose the divorce-point seam and let a caller
inject its own adapter. The thinnest adapter is the divorce
point, not ceremony.

## Approved design decisions

1. **Async content-decode seam, sync paths untouched.**
   `DecompressionStream` is a `TransformStream` — inherently
   async — while the library's decode chain is synchronous.
   The governing principle (set with the caller for both
   arcs): async lives at REAL I/O edges; pure in-memory
   computation stays synchronous, because wrapping pure CPU
   work in a `Promise` is ceremony that fights Clarity (V)
   and Simplicity (VIII). Content-decoding is async because
   it is genuine stream I/O — not because async is uniform.
   So we add async siblings and leave the pure sync paths
   exactly as the security review left them: still throwing
   loudly on an encoded body. (Arc 2 adds the streaming
   `TransformStream` content-coding variant; Arc 1 ships the
   buffered async decode only.)

2. **Brotli (`br`) is an injectable seam, not a built-in.**
   `new DecompressionStream('br')` throws on the platform
   (verified, Node v26). Zero-dep + platform-primitives
   doctrine forbids vendoring a Brotli library or hand-
   rolling inflate. The content-coding registry is pluggable
   and injected; the default ships gzip + deflate only; a
   server with its own Brotli adapter registers `br`.

3. **form/text codecs join `defaultBodyRegistry()`.** The
   library is now HTTP-complete, so `withBody('text/plain',
   …)` and form bodies work without configuration (Office of
   the Interface: no configuration before first use). JSON
   inline behavior is unchanged because the inline
   discriminator becomes JSON-SPECIFIC (decision 5).

4. **RFC 850 two-digit year uses an injected reference.**
   RFC 9110 §5.6.7 mandates a sliding 50-year window, which
   is inherently relative to "now." `parseHttpDate` gains an
   optional `reference: Date = new Date()`. The default reads
   now (spec-correct); tests pass a fixed reference
   (deterministic). The instant is still computed in UTC via
   `Date.UTC` — the 2-digit-year resolution is RFC semantics,
   not a localtime sin (Office of Time preserved).

5. **The JSON inline discriminator becomes JSON-specific.**
   `json-codec.ts` currently decides inline-vs-base64 via a
   helper that finds ANY codec for the content-type and then
   assumes it is JSON. With form/text codecs in the registry
   that assumption is false. A `kind: 'json'` marker on
   `BodyCodec` (the platform-honest discriminator) makes the
   inline path test JSON-ness specifically; non-JSON bodies
   stay base64 in the JSON form. This is required to close
   deferral 3 correctly — not gold-plating.

6. **Adopt RFC 9651 for structured fields.** The parser is
   re-cited from RFC 8941 to its successor RFC 9651, gaining
   the two value types 9651 added: Dates (`@int` → a `Date`
   leaf, reusing `FieldValue.toDate()`) and Display Strings
   (`%"…"` → a percent-decoded UTF-8 `string` leaf). These
   fold into the same `readBareItem` switch the byte-sequence
   work widens. Not codebase deferrals — a deliberate,
   caller-approved contract bump (see Context).

7. **Two arcs; this spec is the buffered base.** Arc 1
   (this spec) keeps the value model immutable and pure-
   synchronous (Commandment VI: values are free of time; a
   `ReadableStream` is not a value). Arc 2 puts streaming at
   the I/O EDGES (serialize/parse), never in the value core,
   and is specified separately. Arc 1 chooses its surfaces
   (the `ContentCodec` interface, the body accessors) so Arc
   2 extends rather than rewrites them — but builds no
   streaming machinery speculatively (IX).

## Deferral 1 — RFC 850 + asctime dates

`http-date.ts` parses only IMF-fixdate. Add two explicit
parsers, tried in order after IMF-fixdate, each resolved to
an absolute instant via `Date.UTC` (the existing tz-safe
pattern):

| Format      | Example                          | Note          |
| ----------- | -------------------------------- | ------------- |
| IMF-fixdate | `Sun, 06 Nov 1994 08:49:37 GMT`  | have          |
| RFC 850     | `Sunday, 06-Nov-94 08:49:37 GMT` | 2-digit year  |
| asctime     | `Sun Nov  6 08:49:37 1994`       | padded day    |

- RFC 850: full weekday name, `DD-Mon-YY`, trailing `GMT`.
  Two-digit year resolved by the §5.6.7 sliding 50-year
  window against `reference`.
- asctime: `Wdy Mon DD HH:MM:SS YYYY`, day space-padded
  (single-digit days carry a leading space → two spaces
  before the day), no timezone token (implicitly GMT).
- Unrecognized input still throws `HttpMessageError` — the
  parse gate stays a loud, expected rejection.

`parseHttpDate(text, reference?: Date)` — `reference`
defaults to `new Date()`; only RFC 850 consults it. The
caller in `field-value.ts` (`toDate()`) passes no reference,
so it reads now.

## Deferral 2 — gzip/deflate decode + br seam

A pluggable `ContentCodingRegistry`, mirroring `BodyRegistry`
(immutable, injected at construction, carried across `with*`
modification). A `ContentCodec` exposes
`handles(coding: string): boolean` and
`decode(body: Octets): Promise<Octets>`.

- `gzipContentCodec` / `deflateContentCodec` drive
  `DecompressionStream('gzip' | 'deflate')`, reading the
  decompressed stream fully into `Octets` (async — runs
  OUTSIDE any IDB transaction by the auto-commit constraint;
  not a concern while un-wired, recorded for the server
  tier).
- `defaultContentCodingRegistry()` ships gzip + deflate.
  `br` is absent — injectable by a caller.

`Body` (`body.ts`) gains:

```
contentDecoded(): Body                  // unchanged: identity
                                        // only; throws on real
                                        // codings
async contentDecodedAsync(): Promise<Body>   // strip gzip /
                                             // deflate via the
                                             // coding registry
async decodedAsync(): Promise<Decoded>       // async-strip then
                                             // codec-decode
```

`HttpMessage` carries the content-coding registry alongside
the body registry, defaulting to
`defaultContentCodingRegistry()`, and threads it through
`#derive`. An unknown coding (e.g. `br` with the default
registry) throws `HttpMessageError` loudly — the seam refuses
to pass still-encoded octets downstream, exactly as the sync
path does today.

## Deferral 3 — non-JSON body codecs

Add two codecs on platform primitives, export them, register
them in `defaultBodyRegistry()`:

- `formBodyCodec` — `application/x-www-form-urlencoded`;
  decode via `URLSearchParams` to a plain object
  (last-value-wins on duplicate keys, the platform default,
  documented), encode an object/iterable back to the wire
  form.
- `textBodyCodec` — `text/plain`; decode to a UTF-8 string,
  encode a string to octets.

`BodyCodec` gains `kind: 'json' | 'other'` (or equivalent
marker). `json-codec.ts`'s inline helper consults the marker:
inline only when a JSON codec handles the content-type AND
the body decodes to a non-string value; everything else stays
base64. JSON round-trips are unchanged; a form/text body is
base64 in the JSON form and the type-based parse rule
reconstructs it.

## Deferral 4 — SF 8941 completion + 9651 adoption

The highest-ripple change: the structured-field value model
widens through three files. Four new bare/member shapes —
two completing RFC 8941, two adopting RFC 9651:

`structured-fields.ts` — `readBareItem` grows a switch arm
per new leading sigil; the bare-value union becomes
`number | string | boolean | Octets | Date`:

- **Byte-sequences** (8941) — `:aGVsbG8=:` → `Octets.fromBase64`
  (standard padded base64; bare `:` pair with invalid base64
  is a parse error).
- **Inner-lists** (8941) — `rejectInnerList` is replaced by
  `readInnerList`: `( item item );p=1` parses to
  `SfInnerList { items: readonly SfItem[]; params }`. A
  List/Dictionary member's value becomes `BareValue |
  SfInnerList`.
- **Dates** (9651) — `@1659578233` → `new Date(seconds*1000)`;
  optional leading `-`, integer only (no fraction), ≤15
  digits per the sf-integer bound.
- **Display Strings** (9651) — `%"caf%c3%a9"` → percent-decode
  the `%xx` bytes, UTF-8 decode to a `string`. Lowercase hex
  required; a bare `%` or non-hex digit is a parse error;
  `\` is NOT special (unlike `sf-string`).

`query.ts` — `navigateList` recurses one level into an
inner-list member (`query('field.0.1')` indexes the inner
list); byte-sequence and Date values reach `FieldValue` as
their typed leaves; a Display String reaches it as a plain
string (indistinguishable from `sf-string` at the leaf — the
distinction is syntactic, not semantic).

`field-value.ts` — `Leaf` widens to `string | number |
boolean | Octets | Date`. `FieldValue` gains `toBytes()` /
`toBase64()` for `Octets`; `toDate()` returns an `Octets`-
free `Date` leaf directly (and still HTTP-date-parses a
string leaf). Mismatched conversions (`toNumber()` on bytes,
`toText()` on a Date) throw honestly (Design by Contract),
never coerce.

`field-registry.ts` / `structured-fields.ts` header comments
are re-cited RFC 8941 → 9651.

No `any`: the unions are explicit; navigation switches on
shape. Existing SF queries (item / list / dict / parameter)
are behavior-preserved.

## Scope inventory

Files changed:

- `api/http-message/http-date.ts` — two date parsers +
  `reference`.
- `api/http-message/body.ts` — async content-decode siblings;
  carry the coding registry.
- `api/http-message/content-coding.ts` — NEW: `ContentCodec`,
  `ContentCodingRegistry`, gzip/deflate codecs,
  `defaultContentCodingRegistry()`.
- `api/http-message/http-message.ts` — carry + thread the
  content-coding registry; default it.
- `api/http-message/media-registry.ts` — `kind` marker;
  form/text codecs; register them in the default.
- `api/http-message/json-codec.ts` — JSON-specific inline
  discriminator via the `kind` marker.
- `api/http-message/structured-fields.ts` — byte-sequences,
  inner-lists, sf-date, Display Strings; widened value model;
  re-cited 9651.
- `api/http-message/field-registry.ts` — re-cited 9651
  (comment only; the allowlist is unchanged).
- `api/http-message/query.ts` — inner-list recursion;
  byte-sequence / Date / Display-String leaves.
- `api/http-message/field-value.ts` — `Leaf` widened to admit
  `Octets` and `Date`; byte + date conversions.

Tests added/extended (Office of Verification — behavior at
the seam):

- `tests/tz/http-date.test.ts` — RFC 850 (incl. the 50-year
  window against a fixed reference) + asctime + rejection.
- `tests/http-content-encoding.test.ts` — NEW: gzip/deflate
  round-trip (compress in-test via `CompressionStream`,
  async-decode back); `br` registry-miss throws; an injected
  `br` codec succeeds.
- `tests/http-body.test.ts` / `tests/http-body-value.test.ts`
  — form + text decode; `withBody` round-trip; JSON-inline
  regression unchanged.
- `tests/http-query.test.ts` / `tests/http-field-value.test.ts`
  — inner-list indexing; byte-sequence leaf + base64/bytes
  conversions; sf-date leaf (`@int` → `Date`); Display-String
  leaf (`%"…"` → UTF-8 string) + malformed-percent rejection;
  existing SF cases stay green.

## Critical files (re-derive anchors by symbol)

- `parseHttpDate`, `IMF_FIXDATE`, `MONTHS` — `http-date.ts`.
- `Body`, `contentDecoded`, `decoded`, `#contentEncodings`,
  `IDENTITY` — `body.ts`.
- `BodyCodec`, `BodyRegistry`, `jsonBodyCodec`,
  `defaultBodyRegistry` — `media-registry.ts`.
- `parseJsonBody`, `bodyToJson`, `jsonCodecFor` — the inline
  discriminator — `json-codec.ts`.
- `readBareItem`, `rejectInnerList`, `readItem`,
  `readNumber`, `readString`, `BareValue`, `SfItem` —
  `structured-fields.ts`.
- `kindOf`, `KINDS` — `field-registry.ts`.
- `navigateItem`, `navigateList`, `navigateDictionary`,
  `parameter` — `query.ts`.
- `FieldValue`, `Leaf`, `present`, `toText`, `toDate` —
  `field-value.ts`.

## Sequencing — tiny commits, green each

One deferral at a time, ordered by ascending ripple so the
type-model change lands last on a stable base. Each step is
test-first and leaves `./validate` gate-green; never mix a
rename with a content change in one commit.

1. RFC 850 + asctime dates (+ `reference`).
2. `kind` marker + form/text codecs + JSON-specific inline
   discriminator (the marker first, then the codecs, then
   the default registry — separate commits).
3. `ContentCodingRegistry` + gzip/deflate + async `Body`
   siblings + thread through `HttpMessage`.
4. SF, ascending ripple, each its own commit on the prior
   green: byte-sequences (`Octets` leaf), then sf-date
   (`Date` leaf), then Display Strings (string leaf +
   percent-decoder), then inner-lists + the `query.ts` /
   `field-value.ts` consumers, then the 9651 re-citation.

## Test strategy

Highest level possible (Office of Verification): assert the
input→output contract, never the sausage. Compression tests
generate their fixtures with the platform `CompressionStream`
so the round-trip is self-contained and dependency-free.
Date tests pin a fixed `reference` so the 50-year window is
deterministic; the timezone suite (`tests/tz/`) keeps
`TZ=Pacific/Honolulu` to prove the instant never depends on
host time. Structured-field tests assert each new leaf as a
pure parse→query input→output (a known field value in, the
typed leaf out) plus the rejection cases (bad base64, bare
`%`, uppercase percent-hex, unterminated inner-list).

## Verification

`./validate` is the gate: `tsc --noEmit`, the full
`node --test` suite (UTC + the tz suite), the 78-char line
lint, and the schema-svg gate. Green before every commit;
green at the end.

## Out of scope / non-goals (Arc 1)

- Wiring the library into any production code path. It stays
  un-wired by deliberate choice (server-tier work).
- The streaming/async I/O model — streaming wire serialize,
  async incremental parse, `TransformStream` content-coding,
  the proxy body union. That is Arc 2 (see § Sequel). Arc 1's
  ONLY async surfaces are the buffered content-decode
  siblings; every pure path stays synchronous.
- Vendoring or hand-rolling Brotli. `br` is a seam (both arcs).
- Any change to wire-codec framing, the canonical sort, or
  the number-preservation path — untouched in Arc 1 (Arc 2
  extends framing for streaming serialize/parse).
- RFC 9651 features beyond the value types named in decision
  6 — e.g. there is no SF *serialization* path; the library
  parses-for-query only, and modification stays raw-string
  via `withFieldPut`. Raw (non-allowlisted) fields stay raw.

## Sequel — Arc 2 (separate spec, sequenced next)

Recorded here so Arc 1 chooses forward-compatible surfaces;
NO Arc 2 machinery is built in Arc 1 (Generality IX).

- **Streaming serialize** — `toWireStream(): ReadableStream
  <Uint8Array>`: start-line + fields first, then the body
  (materialized `Octets` as one chunk, or a streaming body
  piped through), optionally through a `CompressionStream`,
  with chunked framing when length is unknown. Delivers
  "bytes to the wire ASAP."
- **Streaming parse** — incremental head state-machine, body
  exposed as a stream, chunked de-framing on the fly;
  `fromWireStream(stream): Promise<HttpMessage>`.
- **`TransformStream` content-coding** — each `ContentCodec`
  gains a streaming variant; the buffered Arc 1 `decode`
  becomes stream-and-collect over the same transform.
- **Proxy body union** — body becomes materialized `Octets`
  (queryable, comparable, JSON-able) OR a streaming source
  (pass-through only; `query`/`toJson` on it throw loudly).
  The value core stays immutable; streaming lives at the
  edge (Commandment VI).
- **Forward-compat anchors Arc 1 must respect:** keep the
  `ContentCodec` interface narrow enough to add a stream
  method without breaking callers; keep body access behind
  `Body` so the union is introduced in one place.
