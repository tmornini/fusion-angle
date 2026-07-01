# Literature references for the two-table HTTP-message storage design

A cited literature review situating the
`go-to-church-magical-yeti.md` design (append-only,
content-addressed `requests`/`responses` tables; HTTP
message as storage truth; reads as derivations) in the
published record.

Sourced via a 6-angle deep-research pass: 28 sources
fetched, 134 claims extracted, top 25 adversarially
verified (3-vote, 2/3-refute-to-kill), 0 killed, synthesized
to 7 high/medium-confidence findings.

## Bottom line

Every *ingredient* is well-trodden and has canonical
sources. The *specific combination* — a content-addressed,
append-only log of the HTTP request/response messages
themselves as a SQL system of record, URI-as-primary-key,
with request<->response hash binding and reads-as-derivation
— is not found verbatim in any surveyed source. The design
is a novel synthesis, not a novel primitive.

## Axis 1 — Log as system of record, state as derivation

The design's spine ("latest message per URI key = current
state", append-only tables) is the event-sourcing / CQRS /
log-as-truth lineage. **Closest, well-trodden.**

- **Jay Kreps, "The Log: What every software engineer should
  know about real-time data's unifying abstraction"** (2013,
  LinkedIn Engineering).
  https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying
  — "A log is an append-only, totally-ordered sequence of
  records ordered by time"; State Machine Replication
  Principle (deterministic replay reproduces state).
- **Martin Kleppmann, "Turning the Database Inside Out"**
  (2015).
  https://martin.kleppmann.com/2015/03/04/turning-the-database-inside-out.html
  — "structure all of your data as immutable facts"; "A
  materialized view is just a cached subset of the log, and
  you could rebuild it from the log at any time." This IS the
  reads-as-derivation thesis.
- **Kleppmann, Beresford, Svingen, "Online Event Processing
  (OLEP)"**, CACM May 2019.
  https://martin.kleppmann.com/papers/olep-cacm.pdf
  — names/defines the append-only-event-log programming model
  as a peer to ACID transactions.
- Supporting: AWS Event Sourcing pattern,
  https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/event-sourcing.html

## Axis 2 — Immutable / accumulate-only databases

The "append-only is the storage substrate; deletion is a new
fact; one sanctioned hard-delete escape hatch" model.
**Direct production realization.**

- **Datomic** (Rich Hickey / Cognitect).
  https://docs.datomic.com/datomic-overview.html — "Datomic
  transactions atomically add a set of datoms... they never
  update or remove anything"; "Where update-in-place
  databases would delete, Datomic instead adds a new
  retraction"; "The log... is an integral part of Datomic's
  information model." Datomic's **excision** is the single
  sanctioned permanent-removal escape hatch — a direct
  parallel to the design's **PII-erasure-only hard DELETE**.
- **Rich Hickey, "The Database as a Value" / "Are We There
  Yet?"** (slides:
  https://www.cs.ox.ac.uk/ralf.hinze/WG2.8/31/slides/rich2.pdf)
  — identity = a succession of states; state = the value of
  an identity at a moment; the DB as an expanding immutable
  value. The philosophical root of the whole approach.

## Axis 3 — Content-addressed storage as the row identity

`message_hash = SHA-256(canonical message)`; integrity by
re-canonicalize-and-re-hash; state as a reduction over a log
of hashed mutation blobs. **Direct analogue.**

- **Perkeep (formerly Camlistore)**, Brad Fitzpatrick.
  https://github.com/perkeep/perkeep ,
  https://perkeep.org/doc/schema/permanode — "every type of
  content... is represented using content-addressable blobs
  (even metadata), it's impossible to overwrite things";
  "The current state of an object is just the application of
  all mutation blobs up until that point in time"; "The state
  of a permanode is the result of combining all
  attribute-modifying claims which reference it, in order."
  This is content-addressed + append-only + reduction-as-read
  — the same three moves the design makes.
- **Content-addressable storage** (general).
  https://en.wikipedia.org/wiki/Content-addressable_storage
  — and the unsurveyed-but-canonical cousins: Git's object
  model and IPFS (named in the research question; not
  independently verified this pass).

## Axis 4 — Tamper-evident / verifiable append-only logs

The per-row hash, request<->response hash binding, walkable
"lifeline", and the deferred whole-log hash-chain.
**Well-trodden cryptographic-ledger territory.**

- **immudb** (Codenotary). https://github.com/codenotary/immudb
  — "You can add new versions of existing records, but never
  change or delete records"; architecture is a "Cryptographic
  commit log with parallel Merkle Tree"; "Data stored in
  immudb is cryptographically coherent and verifiable" without
  trusting the DB. Mirrors verify-by-re-hash and the
  anticipated whole-log Merkle/hash-chain. (Caveat: immudb's
  Merkle inclusion/consistency proofs are richer than a single
  per-row hash; v1.2+ added GDPR logical delete.)
- **RFC 6962, Certificate Transparency** (named; a source but
  not in the final verified set).
  https://www.rfc-editor.org/rfc/rfc6962.html — the canonical
  Merkle-tree append-only verifiable log.
- **Russ Cox, "Transparent Logs for Skeptical Clients"**
  (a fetched source). https://research.swtch.com/tlog —
  approachable treatment of tamper-evident log proofs.
- **Amazon QLDB** (named; fetched, not finally verified) —
  immutable journal + cryptographic verification, the
  commercial ledger-DB reference.

## Axis 5 — HTTP message / representation as the persisted unit

The premise that the HTTP message IS the unit of stored and
transferred state. **Conceptually grounded; the wire-message
nuance is the design's own.**

- **Roy Fielding, REST dissertation** (2000), §5.2.1.2.
  https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm
  — "A representation is a sequence of bytes, plus
  representation metadata... less precise names... include:
  document, file, and HTTP message entity, instance, or
  variant."
- **RFC 9110 (HTTP Semantics)** §3.2.
  https://www.rfc-editor.org/rfc/rfc9110.html — "A
  representation is information that is intended to reflect a
  past, current, or desired state of a given resource";
  HTTP "information hiding... with respect to a transferable
  representation of the resource state, rather than
  transferring the resource itself."
  *Caveat:* RFC 9110/Fielding scope a representation to the
  entity/payload (metadata + body), which is **narrower** than
  the full wire message (start-/status-line, hop headers) the
  design persists. Storing the wire message captures the
  representation plus its envelope — a deliberate superset.
- **WARC / ISO 28500 (Web ARChive format)** — the **most
  literal prior art for the message-as-storage axis**, now
  verified against WARC 1.1.
  https://iipc.github.io/warc-specifications/specifications/warc-format/warc-1.1/
  WARC persists HTTP `request` and `response` records as the
  archival unit of record, and rhymes with this design more
  closely than any other surveyed source:
  - **Distinct record types** (§5.4): `WARC-Type: request`
    and `WARC-Type: response` — the same two-table request /
    response split.
  - **Stores the FULL wire message including headers**
    (§6.3.2 response, §6.5.2 request): "a 'response' record
    block should contain the full HTTP response received over
    the network, including headers"; Content-Type
    `application/http;msgtype=response|request`. This is the
    envelope-inclusive whole-message persistence the design
    chooses — and a *better* lineage to cite than RFC 9110's
    narrower "representation."
  - **Two-digest split = your message_hash vs ETag.**
    `WARC-Block-Digest` (§5.9) digests "the full block of the
    record" (whole message incl. headers) ≈ **`message_hash`**;
    `WARC-Payload-Digest` (§5.10) digests "the payload"
    (entity-body only) ≈ the body-only **`ETag`**. The
    whole-vs-body two-hash distinction has direct archival
    precedent.
  - **Request<->response linkage** via `WARC-Concurrent-To`
    (§5.7): "the WARC-Record-ID of any records created as part
    of the same capture event." This is an **ID reference**,
    analogous to the design's `req -> resp` id-link — but
    weaker than the design's content-strong `Request-Hash`
    binding.

  **Where WARC stops (the design's novelty boundary,
  sharpened):** WARC is **NOT content-addressed** — records
  are identified by an assigned `WARC-Record-ID` URI (§5.2),
  and the block/payload digests are *optional metadata, not
  the addressing mechanism*. WARC is also an archival/replay
  format, not a live API's mutable system-of-record: no
  URI-as-primary-key, no derivation-as-read, no OCC. So WARC
  *computes* the same digests this design does but *addresses
  by assigned ID*; the design addresses by content + URI and
  promotes the whole pattern to a live system-of-record.

## Axis 6 — HTTP conditional requests (OCC) and idempotency

ETag/If-Match optimistic concurrency, the `If-Response-ID`
head-token -> 412, and the `Idempotency-Key`. **Standard.**

- **RFC 9110** §8.8.3 (ETag), §13.1.1 (If-Match), §15.5.13
  (412 Precondition Failed); **RFC 7232** (the prior standalone
  conditional-requests RFC). https://www.rfc-editor.org/rfc/rfc7232
  — If-Match + ETag is the canonical optimistic-concurrency /
  lost-update mechanism; the design's `If-Response-ID`/412 is a
  domain-specific echo of it. (Note: RFC 9110 doesn't itself use
  the phrase "lost update"; that label is W3C/MDN.)
- **Idempotency keys** — Stripe, "Designing robust and
  predictable APIs with idempotency,"
  https://stripe.com/blog/idempotency ; IETF
  **draft-ietf-httpapi-idempotency-key-header**,
  https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header
  ; Brandur Leach, "Implementing Stripe-like Idempotency Keys
  in Postgres," https://brandur.org/idempotency-keys .
  Verified against the IETF draft: the `Idempotency-Key`
  header makes non-idempotent methods (POST/PATCH)
  fault-tolerant (Abstract); on a retry after the original
  completes, "the resource SHOULD respond with the result of
  the previously completed operation" (§2.6) — i.e. the server
  stores the prior response and returns it. On a retry while
  the original is still in flight: 409 Conflict (§2.6/§2.7).

  **Design divergence (now precise).** The draft keeps the
  key and the payload as **two separate concepts**: the
  `Idempotency-Key` (client nonce) and an optional
  **"Idempotency Fingerprint"** derived from the payload
  (§2.4), used *together* — "the idempotency key MUST be
  unique and MUST NOT be reused with another request with a
  different request payload" (§2.2), and reusing a key with a
  different payload SHOULD return **422** (§2.7). This design
  instead **folds the `Idempotency-Key` into `message_hash`**,
  collapsing key + fingerprint into one value: "same key,
  different body" becomes simply a *different hash / new event*
  rather than a detectable misuse. The trade is conscious —
  the design buys simplicity (one hash, no separate key store)
  and gives up the draft's 422 key-misuse detection. Worth
  stating explicitly in the design doc.

## What is novel vs. well-trodden

**Well-trodden (each has canonical sources above):**
- Append-only log as system of record; state as derivation.
- Immutable DB with retraction-not-delete + one excision
  escape hatch (Datomic ≈ PII-erasure-only delete).
- Content-addressed rows + reduction-as-read (Perkeep).
- Cryptographic append-only ledger + Merkle/hash-chain
  (immudb, CT, QLDB).
- HTTP representation as transferable state (Fielding,
  RFC 9110).
- ETag/If-Match OCC + idempotency keys (RFC 9110/7232,
  Stripe, IETF draft).

**Apparently novel (no surveyed source matches verbatim):**
- Persisting the **raw HTTP request/response messages
  themselves** as a content-addressed, append-only **SQL**
  system of record. WARC is the nearest (and stores the full
  request/response messages with the same whole-vs-body digest
  split), but it is archival, ID-addressed, and not a live API
  system-of-record — see Axis 5 for the sharpened boundary.
- **URI (uri_prefix + uri_id) as the literal primary key**
  over the message log, exact-equality for both entity and
  collection reads. (WARC addresses by assigned
  `WARC-Record-ID`, not by URI or content.)
- The **request<->response pair binding via a `Request-Hash`
  header** as keyless per-pair tamper-evidence — stronger
  than WARC's `WARC-Concurrent-To` (an ID reference, not a
  content-hash binding), and distinct from a generic whole-log
  Merkle chain.
- Folding the **`Idempotency-Key` into the content hash**
  rather than the IETF draft's separate key + payload
  "fingerprint" — a verified divergence that trades away the
  draft's 422 key-misuse detection (see Axis 6).
- The closest single prefiguration of the *read path* —
  HTTP-addressable point-in-time reads over an immutable log
  — is Datomic's (now-deprecated) REST API
  (https://docs.datomic.com/reference/rest.html), but it
  addresses datoms, not stored HTTP messages.

## Verification caveats (from the research pass)

- **WARC (WARC 1.1 spec) and the IETF idempotency-key draft
  were verified in a targeted follow-up** (direct primary-
  source fetch) and are now confirmed findings — see Axes 5
  and 6. The follow-up also *corrected* two earlier
  assertions: WARC is NOT content-addressed (it computes
  digests but addresses by assigned `WARC-Record-ID`), and the
  IETF draft keeps key + payload-fingerprint *separate* (not
  one opaque key), making the design's fold-into-hash a real
  divergence.
- CT (RFC 6962), QLDB, bitemporal DBs, Git object model, and
  IPFS were **named/fetched but not in the final
  adversarially-verified set** (25-claim budget). Treat them
  as strong leads with solid provenance, not as this pass's
  confirmed claims.
- Link rot: the LinkedIn "The Log" and CACM OLEP URLs
  returned 404/403 to direct fetch; quotes corroborated via
  mirrors/search. Datomic REST API is deprecated; immudb
  softened "never delete" post-v1.2.
- Vendor docs (Datomic, immudb, Perkeep) are first-party,
  appropriate for architecture description, not peer-reviewed.

## Suggested follow-up (if you want deeper grounding)

1. ~~Read the WARC spec~~ — DONE (Axis 5): WARC 1.1 record
   model verified and mapped field-by-field to the design.
2. ~~Confirm the idempotency-key axis~~ — DONE (Axis 6): IETF
   draft verified; the fold-into-hash divergence is now
   precise.
3. Pull **RFC 6962** + Russ Cox's tlog
   (https://research.swtch.com/tlog) for the whole-log
   hash-chain you've deferred — they are the design template
   for the lifeline upgrade. (Still a lead, not yet verified
   this pass.)
