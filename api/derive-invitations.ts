import type { DbAdapter } from './db.ts';
import type { Id, InvitationState } from './types.ts';
import { pickString } from './validators.ts';
import { canonicalUriCollection } from './message-pair.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
} from './derive-documents.ts';

// The invitation family's own reduction over the message
// ledger — the roster phase's LAST derivation before the
// readers flip (Task 8). The invitation ROW comes from the
// grant's document head at the flat '/invitations/' address
// (ONE keyed getAllWhere read per store — deriveDocumentsAt);
// its STATE comes from a SEPARATE reduction this module owns,
// since an invitation's lifecycle never rides the document
// address (Decision 6 would require a trio the wire body has
// no room for — the invitations side channel forms its
// operation pairs at 'invitations/:id/acceptance' etc,
// api/invitations-domain.ts's formInvitationOpPair).
//
// E13 FULL-SCAN NAMED CLASS: no index can serve "every pair
// whose uri_collection has the shape /invitations/<id>/<op>/"
// for an arbitrary id, so invitationOpStates below reads
// db.pairs.getAll() — ONE full table scan, regardless of how
// many invitations exist. Grown alongside every future
// full-ledger scan; its measured cost is recorded at the
// Task 9 CLI leg, not here.
//
// Mutual exclusivity of the three op states is the domain
// gate's own covenant (grantInvitation/acceptInvitation/
// declineInvitation/revokeInvitation each require 'pending' to
// succeed; a conflict appends nothing), never re-derived here —
// an id can accumulate repeat pairs of only ONE op kind.

const INVITATIONS_PREFIX = canonicalUriCollection(
    undefined, '/invitations/',
);

const OP_STATES: Readonly<Record<string, InvitationState>> = {
    acceptance: 'accepted',
    decline: 'declined',
    revocation: 'revoked',
};

const OP_ADDRESS_PATTERN =
    /^\/invitations\/([^/]+)\/(acceptance|decline|revocation)\/$/;

const INVITATION_OP_KINDS = [
    'acceptance', 'decline', 'revocation',
] as const;

export interface DerivedInvitationRow {
    readonly id: Id;
    readonly organization_id: Id;
    readonly identity_id: Id;
    readonly at: string;
    readonly state: InvitationState;
}

// The E13 full-scan: every invitation id that has EVER reached
// a terminal/answering op, mapped to the state that op proves.
// 409s append nothing (the domain gate's own guard), so scanning
// pairs — never a status filter — is sound: every pair found
// here IS a genuine 2xx.
async function invitationOpStates(
    db: DbAdapter,
): Promise<Map<Id, InvitationState>> {
    const states = new Map<Id, InvitationState>();
    for (const pair of await db.pairs.getAll()) {
        const match = OP_ADDRESS_PATTERN.exec(
            pair.uri_collection,
        );
        if (match === null) continue;
        const state = OP_STATES[match[2]!];
        if (state === undefined) continue;
        states.set(match[1]!, state);
    }
    return states;
}

// ENTITY-SCOPED sibling of invitationOpStates above (Phase 14
// Task 1): the SAME OP_STATES mutual-exclusivity covenant,
// restricted to ONE known invitation id via three INDEXED
// getAllWhere('uri_collection', ...) reads (one per op kind) rather
// than the whole-ledger db.pairs.getAll() invitationOpStates
// needs to DISCOVER every invitation's own op prefix out of an
// unknown set of ids. dbOrView-shaped and opens no nested
// transaction — callable from WITHIN an already-open write-gate
// transaction (currentInvitationState's own accept/decline/
// revoke in-tx reads, api/invitations-domain.ts — a LATER task
// wires the call site; this task lands the core alone).
// undefined means no terminal op has landed yet — the invitation
// is still 'pending' (or the id names no invitation at all), a
// distinction only a caller that already knows the id is genuine
// can resolve.
export async function invitationOpStateFor(
    dbOrView: DbAdapter,
    id: Id,
): Promise<InvitationState | undefined> {
    for (const op of INVITATION_OP_KINDS) {
        const prefix = canonicalUriCollection(
            undefined, '/invitations/' + id + '/' + op + '/',
        );
        const rows = await dbOrView.pairs.getAllWhere(
            'uri_collection', prefix,
        );
        if (rows.length > 0) return OP_STATES[op];
    }
    return undefined;
}

// Reads db.pairs ONLY. invitationsForInvitee and
// sentInvitations derive their rows + state through this; the
// enrichment joins (organization/pii) stay old-plane reads.
export async function deriveInvitations(
    db: DbAdapter,
): Promise<DerivedInvitationRow[]> {
    const pairs = await db.pairs.getAllWhere(
        'uri_collection', INVITATIONS_PREFIX,
    );
    const documents = deriveDocumentsAt(
        pairs, INVITATIONS_PREFIX,
    );
    const opStates = await invitationOpStates(db);
    const rows: DerivedInvitationRow[] = [];
    for (const [id, document] of documents) {
        rows.push({
            id,
            organization_id: pickString(
                document.body, 'organization_id',
            ),
            identity_id: pickString(
                document.body, 'identity_id',
            ),
            at: pickString(document.body, 'at'),
            state: opStates.get(id) ?? 'pending',
        });
    }
    return rows.sort(byIdAscending);
}
