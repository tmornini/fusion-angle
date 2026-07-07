import type { DbAdapter } from './db.ts';
import type { MessagePair } from './message-pair.ts';
import { appendMessagePair } from './message-pair.ts';

// THE /pii HARD-DELETE ZONE (Phase 10 Task 3, gate 4). The
// shadow ledger is append-only everywhere else it is read
// (Commandment VI) — `identities/:id/pii` is the ONE sanctioned
// exception: a single-slot register where every write (PUT or
// DELETE) physically REMOVES whatever pair occupies the slot
// before appending its own, so the slot always holds exactly
// ONE pair — a PUT pair (the PII document) or a DELETE pair (the
// bodyless erasure tombstone: evidence of erasure without
// erased content). Supersession and erasure are the SAME
// mechanism here. `replacePiiSlot` is THE ONLY code path that
// deletes rows from `requests` or `responses` — grep-provable;
// keep it that way. The address is CHAINLESS by construction:
// `identities/:id/pii` is retired from `DOCUMENT_CLASS_ROUTE_
// PATTERNS` (message-pair.ts), so the gate's own head-read never
// runs for it and every /pii pair forms with neither Supersedes
// nor Follows — a stored provenance pointer at a removed pair
// would be a stored lie.
//
// THE SINGLE-AUTHORITATIVE-ID-SET RULE (a binding verification
// finding): the pairs occupying the slot are enumerated by ONE
// scan — `requests.getAllWhere('uri_prefix', ...)` — and THAT
// id-set alone is deleted from BOTH tables. `responses` is NEVER
// re-scanned independently and trusted to agree: two independent
// scans could disagree (a pre-existing torn pair, a mid-flight
// anomaly), and reconciling them defensively would be Internal
// Defense over a covenant this function alone must keep. Deriving
// both deletions from ONE id-set structurally preserves the
// orphan-pair balance (`requests.length === responses.length`,
// asserted throughout the shadow-ledger suite) and guarantees
// this zone never MANUFACTURES a torn pair — a pre-existing one
// still surfaces on its own terms, via `storedResponseFor`'s
// `responses.getById` throwing `EntityNotFoundError` rather than
// silently reading as a missing replay (message-pair.ts).
//
// Runs INSIDE the caller's own transaction — both callers
// (`postIdentityPiiDocumentOp`'s PUT, the `identities/:id/pii`
// DELETE closure, api/routes.ts) already open
// `['identity_pii', 'requests', 'responses']`; row ops only, per
// the IndexedDB auto-commit constraint (a transaction body may
// await only row ops, never crypto or a timer) — `pair` arrives
// fully formed, all crypto done pre-tx (message-pair.ts).
//
// Cross-tab note: the localStorage demo tier flushes a
// transaction's touched keys as a multi-key buffer, not a single
// atomic write — the accepted B4 last-writer-wins class this
// codebase already carries for that tier. Real IndexedDB
// serializes overlapping-scope readwrite transactions, so two
// tabs racing the SAME /pii address there still resolve to
// exactly one genuine winner — the single-slot invariant holds
// for real, not merely by convention.
//
// Concurrency note: under a genuinely concurrent byte-identical
// PUT/PUT (or DELETE/DELETE) race at one /pii address, the
// second writer's slot replacement removes the first writer's
// pair before appendMessagePair's in-tx hash-dedup could see
// it, so the duplicate appends FRESH instead of folding into
// the surviving row — the single-slot invariant still holds
// (exactly one pair survives); only the ordinary-address fold
// behavior differs, confined to genuine concurrency.
export async function replacePiiSlot(
    view: DbAdapter,
    uriPrefix: string,
    pair: MessagePair,
): Promise<void> {
    const prior = await view.requests
        .getAllWhere('uri_prefix', uriPrefix);
    for (const row of prior) {
        await view.requests.delete(row.id);
        await view.responses.delete(row.id);
    }
    await appendMessagePair(view, pair);
}
