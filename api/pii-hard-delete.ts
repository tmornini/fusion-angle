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
// deletes a stored pair — grep-provable; keep it that way. The
// address is CHAINLESS by construction:
// `identities/:id/pii` is retired from `DOCUMENT_CLASS_ROUTE_
// PATTERNS` (message-pair.ts), so the gate's own head-read never
// runs for it and every /pii pair forms with neither Supersedes
// nor Follows — a stored provenance pointer at a removed pair
// would be a stored lie.
//
// Runs INSIDE the caller's own transaction — both callers
// (`postIdentityPiiDocumentOp`'s PUT, the `identities/:id/pii`
// DELETE closure, api/routes.ts) open
// `MESSAGE_TABLES` (Phase Final Task 2 stripped the
// identity_pii ROW half). Formed pre-tx — crypto, hashing,
// and timers never run inside an open transaction
// (CLAUDE.md § Transaction bodies await only row ops) —
// `pair` arrives fully formed, all crypto done pre-tx
// (message-pair.ts).
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
    uriCollection: string,
    pair: MessagePair,
): Promise<void> {
    const prior = await view.pairs.getAllWhere(
        'uri_collection', uriCollection,
    );
    for (const row of prior) {
        await view.pairs.delete(row.id);
    }
    await appendMessagePair(view, pair);
}
